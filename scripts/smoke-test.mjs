#!/usr/bin/env node
/*******************************************************************************

    Aegis — end-to-end smoke test

    Loads dist/aegis into a throw-away headless Chrome (or Edge) profile and
    checks the main flows against real websites: blocking, per-site off
    switch, pause/resume, custom filters, filter lists, dangerous-site
    warning, statistics.

    Usage:
      node scripts/smoke-test.mjs            (Chrome)
      node scripts/smoke-test.mjs --edge     (Microsoft Edge)

    Branded Chrome ignores --load-extension since v137: the extension is
    loaded with the DevTools protocol (Extensions.loadUnpacked), which is
    only available over --remote-debugging-pipe.

*******************************************************************************/

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(ROOT, 'dist', 'aegis');
const EDGE = process.argv.includes('--edge');

const BROWSERS = EDGE ? [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/microsoft-edge',
] : [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
].filter(Boolean);

const TEST_SITE = 'https://www.speedtest.net/';
const TEST_HOST = 'www.speedtest.net';
// Listed in "uBlock filters – Badware risks": must show the warning page
const BADWARE_SITE = 'https://10mintimer.com/';
// Simple page used for the deterministic blocking probe
const PROBE_PAGE = 'https://example.com/';
const PROBE_HOST = 'example.com';
// Marked as trusted before pausing, to check that site settings survive
const TRUSTED_HOST = 'example.org';

const sleep = ms => new Promise(r => setTimeout(r, ms));

const BLOCKING_KINDS = new Set([ 'block', 'redirect', 'strictblock' ]);

async function waitFor(fn, timeout = 7000) {
    const deadline = Date.now() + timeout;
    waitFor.lastError = undefined;
    do {
        try {
            if ( await fn() ) { return true; }
        } catch (reason) {
            // Navigations briefly have no JavaScript execution context.
            waitFor.lastError = reason;
        }
        await sleep(100);
    } while ( Date.now() < deadline );
    return false;
}

async function filesUnder(dir, prefix = '') {
    const files = [];
    for ( const entry of await fs.readdir(dir, { withFileTypes: true }) ) {
        const relative = path.join(prefix, entry.name);
        if ( entry.isDirectory() ) {
            files.push(...await filesUnder(path.join(dir, entry.name), relative));
        } else {
            files.push(relative);
        }
    }
    return files;
}

async function assertOverlayIsBuilt() {
    const source = path.join(ROOT, 'src');
    for ( const relative of await filesUnder(source) ) {
        if ( relative === 'manifest.json' || relative.startsWith(`_locales${path.sep}`) ) {
            continue;
        }
        const [ before, after ] = await Promise.all([
            fs.readFile(path.join(source, relative)),
            fs.readFile(path.join(EXT, relative)).catch(( ) => undefined),
        ]);
        if ( after === undefined || before.equals(after) === false ) {
            throw new Error(`dist/aegis is stale (${relative}); run the build first`);
        }
    }
}

/******************************************************************************/

async function findBrowser() {
    for ( const p of BROWSERS ) {
        try { await fs.access(p); return p; } catch { }
    }
    throw new Error(`${EDGE ? 'Edge' : 'Chrome'} not found`);
}

function pipeTransport(child, browserName) {
    const out = child.stdio[3];
    let buffer = '';
    let id = 0;
    const pending = new Map();
    let stderr = '';

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
        stderr = `${stderr}${chunk}`.slice(-8000);
    });

    const rejectPending = reason => {
        for ( const { reject, timer } of pending.values() ) {
            clearTimeout(timer);
            reject(reason);
        }
        pending.clear();
    };

    child.once('error', reason => rejectPending(reason));
    child.once('exit', (code, signal) => {
        const detail = stderr.trim();
        const suffix = detail === '' ? '' : `\n${detail}`;
        rejectPending(new Error(
            `${browserName} exited before the smoke test finished ` +
            `(code ${code ?? 'none'}, signal ${signal ?? 'none'}).${suffix}`
        ));
    });

    child.stdio[4].on('data', chunk => {
        buffer += chunk.toString('utf8');
        let pos;
        while ( (pos = buffer.indexOf('\0')) !== -1 ) {
            const raw = buffer.slice(0, pos);
            buffer = buffer.slice(pos + 1);
            let msg;
            try {
                msg = JSON.parse(raw);
            } catch (reason) {
                rejectPending(new Error(`Invalid DevTools response: ${reason}`));
                continue;
            }
            const p = pending.get(msg.id);
            if ( p === undefined ) { continue; }
            pending.delete(msg.id);
            clearTimeout(p.timer);
            msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
        }
    });
    return (method, params = {}, sessionId) => new Promise((resolve, reject) => {
        const requestId = ++id;
        const timer = setTimeout(( ) => {
            pending.delete(requestId);
            reject(new Error(`${browserName} did not answer ${method} within 30 seconds`));
        }, 30000);
        pending.set(requestId, { resolve, reject, timer });
        out.write(JSON.stringify({ id: requestId, method, params, sessionId }) + '\0', reason => {
            if ( reason === null || reason === undefined ) { return; }
            const request = pending.get(requestId);
            if ( request === undefined ) { return; }
            pending.delete(requestId);
            clearTimeout(request.timer);
            request.reject(reason);
        });
    });
}

async function launch() {
    const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aegis-smoke-'));
    const profile = path.join(testRoot, 'profile');
    const testExtension = path.join(testRoot, 'extension');
    await Promise.all([
        fs.mkdir(profile),
        fs.cp(EXT, testExtension, { recursive: true }),
    ]);
    const browserName = EDGE ? 'Edge' : 'Chrome';
    let child;
    const close = async ( ) => {
        if ( child && child.exitCode === null && child.signalCode === null ) {
            child.kill();
            await Promise.race([
                new Promise(resolve => child.once('exit', resolve)),
                sleep(2000),
            ]);
        }
        await fs.rm(testRoot, {
            recursive: true,
            force: true,
            maxRetries: 5,
            retryDelay: 200,
        }).catch(( ) => { });
    };
    try {
        child = spawn(await findBrowser(), [
            '--headless=new',
            '--disable-gpu',
            '--remote-debugging-pipe',
            '--enable-unsafe-extension-debugging',
            `--user-data-dir=${profile}`,
            '--no-first-run',
            '--no-default-browser-check',
            '--no-proxy-server',
            'about:blank',
        ], { stdio: [ 'ignore', 'ignore', 'pipe', 'pipe', 'pipe' ] });
        const send = pipeTransport(child, browserName);
        const { id: extensionId } = await send('Extensions.loadUnpacked', { path: testExtension });
        return { send, extensionId, close };
    } catch (reason) {
        await close();
        throw reason;
    }
}

async function openTab(browser, url) {
    const { targetId } = await browser.send('Target.createTarget', { url });
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
    const tab = {
        send: (method, params) => browser.send(method, params, sessionId),
        eval: async expression => {
            const r = await browser.send('Runtime.evaluate', {
                expression, awaitPromise: true, returnByValue: true,
            }, sessionId);
            if ( r.exceptionDetails ) {
                throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
            }
            return r.result.value;
        },
    };
    await tab.send('Page.enable');
    return tab;
}

/******************************************************************************/

let failures = 0;
const check = (condition, label) => {
    if ( condition !== true ) { failures += 1; }
    console.log(`  ${condition === true ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'} ${label}`);
    return condition === true;
};

// A generic EasyList path filter, turned into an address on example.com: a
// deterministic way to check blocking, independent of what a live website
// happens to load (and of Edge's own Tracking Prevention).
async function findProbePath() {
    const rules = JSON.parse(await fs.readFile(path.join(EXT, 'rulesets', 'main', 'easylist.json'), 'utf8'));
    for ( const { action, condition: c } of rules ) {
        if ( action.type !== 'block' ) { continue; }
        if ( c.requestDomains || c.initiatorDomains || c.excludedRequestDomains ) { continue; }
        if ( c.excludedInitiatorDomains || c.regexFilter || c.domainType || c.tabIds ) { continue; }
        if ( c.resourceTypes && c.resourceTypes.includes('xmlhttprequest') === false ) { continue; }
        if ( c.excludedResourceTypes?.includes('xmlhttprequest') ) { continue; }
        if ( /^\/[a-z0-9_./-]+[._/-]$/i.test(c.urlFilter ?? '') === false ) { continue; }
        return c.urlFilter;
    }
    throw new Error('No generic EasyList filter found for the blocking probe');
}

async function main() {
    await fs.access(path.join(EXT, 'manifest.json')).catch(( ) => {
        throw new Error('dist/aegis not found, run the build first');
    });
    await assertOverlayIsBuilt();
    const probePath = await findProbePath();
    console.log(`Aegis smoke test (${EDGE ? 'Edge' : 'Chrome'})`);
    const browser = await launch();
    try {
        await sleep(3000);
        const ext = await openTab(browser, `chrome-extension://${browser.extensionId}/popup.html`);
        await sleep(1000);
        const msg = (what, extra = {}) =>
            ext.eval(`chrome.runtime.sendMessage(${JSON.stringify({ what, ...extra })})`);
        const tabIdOf = needle =>
            ext.eval(`chrome.tabs.query({}).then(ts => ts.find(t => (t.url || '').includes('${needle}'))?.id)`);

        // The browser's own record of the rules it applied to a tab, used to
        // verify that every match reached Aegis. Returns the number of
        // blocking matches.
        const verifyReported = async (tabId, since, label) => {
            const applied = await ext.eval(`chrome.declarativeNetRequest.getMatchedRules({ tabId: ${tabId}, minTimeStamp: ${since} })
                .then(r => r.rulesMatchedInfo.map(m => m.rule.rulesetId + '#' + m.rule.ruleId))`);
            const log = await msg('aegis:log');
            const kinds = new Map(log.entries
                .filter(e => e.t >= since - 1000)
                .map(e => [ `${e.rulesetId}#${e.ruleId}`, e.kind ]));
            const missing = applied.filter(id => kinds.has(id) === false);
            check(missing.length === 0, `${label}: Aegis saw all ${applied.length} rule(s) the browser applied`);
            if ( missing.length !== 0 ) {
                console.log(`    diagnostic: not reported to Aegis: ${JSON.stringify(missing.slice(0, 10))}`);
            }
            return applied.filter(id => BLOCKING_KINDS.has(kinds.get(id))).length;
        };

        console.log('Real website');
        await openTab(browser, TEST_SITE);
        await sleep(7000);
        const siteTabId = await tabIdOf(TEST_HOST);
        const siteStats = await msg('aegis:tabStats', { tabId: siteTabId });
        const siteBlocking = await verifyReported(siteTabId, 0, TEST_HOST);
        const badge = await ext.eval(`chrome.action.getBadgeText({ tabId: ${siteTabId} })`);
        // What a live site loads varies (and Edge's Tracking Prevention blocks
        // some trackers first): the count must match the browser's record.
        check(siteStats.blocked === siteBlocking,
            `${siteStats.blocked} blocked, as recorded by the browser (${siteBlocking}), badge "${badge}"`);
        check(siteStats.live === true, 'live statistics available');

        const page = await openTab(browser, PROBE_PAGE);
        // Probes must run in the loaded page: a fetch from a not yet
        // navigated blank document would fail for unrelated (CORS) reasons.
        // The marker tells a fresh document from the previous one.
        const pageReady = ( ) => waitFor(async ( ) =>
            await page.eval(`location.href === '${PROBE_PAGE}' &&
                document.readyState === 'complete' &&
                self.aegisProbeMarker === undefined`),
        15000);
        if ( await pageReady() === false ) {
            throw new Error(`${PROBE_PAGE} did not load (${waitFor.lastError?.message ?? 'not ready'})`);
        }
        const pageTabId = await tabIdOf(`//${PROBE_HOST}/`);
        const probeURL = `${PROBE_PAGE.slice(0, -1)}${probePath}aegis-probe.js`;
        const probe = ( ) => page.eval(`fetch('${probeURL}', { cache: 'no-store' })
            .then(( ) => 'loaded', ( ) => 'blocked')`);
        // What Aegis and the browser saw for the probe, when a probe check fails
        const probeDiagnostic = async ( ) => {
            const log = await msg('aegis:log');
            const seen = log.entries.filter(e => e.url === probeURL).slice(-3)
                .map(e => `${e.kind}:${e.rulesetId}#${e.ruleId}@tab${e.tabId}`);
            const mode = await msg('getFilteringMode', { hostname: PROBE_HOST });
            const pause = await msg('aegis:pauseState');
            const allow = await ext.eval(`chrome.declarativeNetRequest.getDynamicRules()
                .then(rs => rs.filter(r => r.action.type === 'allowAllRequests').map(r => JSON.stringify(r.condition)))`);
            console.log(`    diagnostic: mode=${mode} paused=${pause?.paused} page=${await page.eval('location.href')} tab=${pageTabId}`);
            console.log(`    diagnostic: last probe matches=${JSON.stringify(seen)}`);
            const recent = log.entries.filter(e => e.tabId === pageTabId).slice(-6)
                .map(e => `${e.kind}:${e.type}:${e.url.slice(0, 50)}`);
            console.log(`    diagnostic: recent matches on the tab=${JSON.stringify(recent)}`);
            const recorded = await ext.eval(`chrome.declarativeNetRequest.getMatchedRules({ tabId: ${pageTabId} })
                .then(r => r.rulesMatchedInfo.slice(-6).map(m => m.rule.rulesetId + '#' + m.rule.ruleId))`);
            console.log(`    diagnostic: browser's own record for the tab=${JSON.stringify(recorded)}`);
            console.log(`    diagnostic: allowAllRequests rules=${JSON.stringify(allow)}`);
        };
        const reloadPage = async ( ) => {
            // DNR update promises can resolve just before Edge activates the
            // new rules. A short settle avoids racing the following reload.
            await sleep(EDGE ? 1200 : 300);
            await page.eval('self.aegisProbeMarker = true');
            await page.send('Page.reload');
            if ( await pageReady() === false ) {
                throw new Error(`${PROBE_PAGE} did not reload (${waitFor.lastError?.message ?? 'not ready'})`);
            }
        };

        console.log('Blocking');
        check(await probe() === 'blocked', `request matching the EasyList filter "${probePath}" blocked`);
        await sleep(500);
        const probeStats = await msg('aegis:tabStats', { tabId: pageTabId });
        check(probeStats.blocked >= 1, `counted on ${PROBE_HOST}: ${probeStats.blocked} blocked`);

        console.log('Protection off for a site');
        await msg('setFilteringMode', { hostname: PROBE_HOST, level: 0 });
        await reloadPage();
        if ( check(await probe() === 'loaded', 'request allowed while protection is off') === false ) {
            await probeDiagnostic();
        }
        await msg('setFilteringMode', { hostname: PROBE_HOST, level: 2 });
        await reloadPage();
        check(await probe() === 'blocked', 'request blocked again when back on');

        console.log('Pause everywhere');
        await msg('setFilteringMode', { hostname: TRUSTED_HOST, level: 0 });
        const paused = await msg('aegis:pause', { minutes: 30 });
        check(paused?.paused === true && paused.until > Date.now(), 'paused for 30 minutes');
        await reloadPage();
        if ( check(await probe() === 'loaded', 'request allowed while paused') === false ) {
            await probeDiagnostic();
        }
        const resumed = await msg('aegis:resume');
        const modes = await msg('getFilteringModeDetails');
        check(resumed?.paused === false && modes.none.includes(TRUSTED_HOST), 'resumed, site settings kept');
        await reloadPage();
        check(await probe() === 'blocked', 'request blocked again after resuming');
        await msg('setFilteringMode', { hostname: TRUSTED_HOST, level: 2 });

        console.log('Custom filters');
        await msg('setSandboxFilters', { text: '||aegis-smoke-test.example^' });
        await sleep(1500);
        const rules = await ext.eval('chrome.declarativeNetRequest.getDynamicRules()');
        check(rules.some(r => JSON.stringify(r.condition).includes('aegis-smoke-test')), 'network filter compiled to a browser rule');
        await msg('setSandboxFilters', { text: '' });

        console.log('Filter lists');
        const before = await msg('getEnabledRulesets');
        await msg('applyRulesets', { enabledRulesets: [ ...before, 'annoyances-cookies' ] });
        const after = await ext.eval('chrome.declarativeNetRequest.getEnabledRulesets()');
        check(after.includes('annoyances-cookies'), 'list enabled in the browser');
        await msg('applyRulesets', { enabledRulesets: before });

        console.log('Dangerous sites');
        const threatSince = Date.now();
        const beforeThreatLog = await msg('aegis:log');
        const bad = await openTab(browser, BADWARE_SITE);
        const intercepted = await waitFor(async ( ) =>
            (await bad.eval('location.pathname')) === '/strictblock.html'
        );
        check(intercepted, 'warning page shown instead of the site');
        let latestThreatEntries = [];
        const classified = await waitFor(async ( ) => {
            const threatLog = await msg('aegis:log', { after: beforeThreatLog.seq });
            latestThreatEntries = threatLog.entries;
            return latestThreatEntries.some(entry =>
                entry.kind === 'strictblock' && entry.category === 'malware'
            );
        });
        // Edge sometimes shows the warning for a navigation without recording
        // a rule match: Aegis can only report what the browser reports.
        const threatTabId = await tabIdOf('/strictblock.html');
        const threatRecorded = threatTabId === undefined ? 0 : await ext.eval(
            `chrome.declarativeNetRequest.getMatchedRules({ tabId: ${threatTabId}, minTimeStamp: ${threatSince} }).then(r => r.rulesMatchedInfo.length)`
        );
        if ( threatRecorded === 0 && classified === false ) {
            console.log('  \x1b[33mSKIP\x1b[0m threat classification: the browser recorded no rule match for this warning');
        } else {
            check(classified, 'warning classified as a threat in the activity log');
            if ( classified === false ) {
                console.log(`    diagnostic: new log entries=${JSON.stringify(latestThreatEntries)}`);
            }
        }

        console.log('Statistics');
        const g = await msg('aegis:stats');
        const minimumTotal = siteBlocking + probeStats.blocked + (classified ? 1 : 0);
        check(g.total >= minimumTotal && g.cats.malware >= (classified ? 1 : 0),
            `${g.total} blocked in total, ${g.cats.malware} threat(s)`);

        // The engine keeps its recent errors: show them when something failed
        if ( failures !== 0 ) {
            const engineErrors = await msg('getConsoleOutput');
            if ( Array.isArray(engineErrors) && engineErrors.length !== 0 ) {
                console.log('\nEngine errors:');
                for ( const line of engineErrors ) { console.log(`  ${line}`); }
            }
        }
    } finally {
        await browser.close();
    }
    console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
    process.exit(failures === 0 ? 0 : 1);
}

main().catch(reason => {
    console.error('Smoke test error:', reason?.message ?? reason);
    process.exit(1);
});
