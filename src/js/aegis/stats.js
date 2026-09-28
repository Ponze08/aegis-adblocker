/*******************************************************************************

    Aegis — live blocking statistics

    Builds per-tab and all-time statistics from the rule matches reported by
    the browser (`declarativeNetRequest.onRuleMatchedDebug`, available to
    extensions loaded unpacked with the `declarativeNetRequestFeedback`
    permission). When live matches are not available, the browser's own
    blocked-request counter is used for the toolbar badge instead.

    Rule kinds are resolved with the compact indexes generated at build time
    in /rulesets/aegis/ (see scripts/build.mjs), so the large rulesets never
    have to be loaded in the service worker.

*******************************************************************************/

import {
    browser, runtime,
    localRead, localWrite,
    sessionRead, sessionWrite,
} from '../ext.js';

import { dnr } from '../ext-compat.js';
import { rulesetConfig } from '../config.js';

/******************************************************************************/

export const LIVE = typeof dnr.onRuleMatchedDebug?.addListener === 'function';

export const CATEGORIES = [ 'ads', 'trackers', 'malware', 'annoyances' ];

const LOG_SIZE = 500;
const MAX_DAYS = 90;
const MAX_TOP_ENTRIES = 400;
const TAB_DOMAINS_MAX = 200;
const PRIVATE_CONTEXT = runtime.inIncognitoContext === true;

const noop = ( ) => { };

const emptyCats = ( ) => ({ ads: 0, trackers: 0, malware: 0, annoyances: 0 });

const dayKey = (t = Date.now()) => {
    const d = new Date(t);
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
};

const hostnameFromURL = url => {
    try { return new URL(url).hostname; } catch { return ''; }
};

// Good enough registrable domain, for grouping purposes only.
const reSecondLevel = /^(?:co|com|net|org|gov|edu|ac|or|ne|go|gv|mil|nic|ltd|plc|sch)\.[a-z]{2}$/;

export const domainFromHostname = hn => {
    if ( hn === '' || /^[\d.]+$/.test(hn) || hn.includes(':') ) { return hn; }
    const labels = hn.split('.');
    if ( labels.length <= 2 ) { return hn; }
    const lastTwo = labels.slice(-2).join('.');
    return reSecondLevel.test(lastTwo) ? labels.slice(-3).join('.') : lastTwo;
};

/******************************************************************************/

// Rule kinds: block, redirect (neutered resource), clean (URL cleaned of
// tracking parameters), strictblock (dangerous page intercepted), allow,
// modifyHeaders, upgradeScheme.

const staticKinds = new Map();

function loadStaticKinds(rulesetId) {
    let promise = staticKinds.get(rulesetId);
    if ( promise !== undefined ) { return promise; }
    promise = fetch(`/rulesets/aegis/${rulesetId}.json`).then(r => r.json()).then(index => {
        const map = new Map();
        for ( const [ kind, ids ] of Object.entries(index) ) {
            const normalized = kind === 'allowAllRequests' ? 'allow' : kind;
            for ( const id of ids ) { map.set(id, normalized); }
        }
        return map;
    }).catch(( ) => new Map());
    staticKinds.set(rulesetId, promise);
    return promise;
}

const kindFromRule = rule => {
    const type = rule?.action?.type;
    switch ( type ) {
    case 'block':
        return 'block';
    case 'redirect': {
        const redirect = rule.action.redirect ?? {};
        if ( redirect.extensionPath ) { return 'redirect'; }
        if ( redirect.regexSubstitution?.includes('/strictblock.') ) { return 'strictblock'; }
        if ( redirect.url?.includes('/strictblock.') ) { return 'strictblock'; }
        return 'clean';
    }
    case 'allow':
    case 'allowAllRequests':
        return 'allow';
    default:
        return type || 'block';
    }
};

const DYNAMIC_RULESET_ID = dnr.DYNAMIC_RULESET_ID ?? '_dynamic';
const SESSION_RULESET_ID = dnr.SESSION_RULESET_ID ?? '_session';

const runtimeRules = {
    [DYNAMIC_RULESET_ID]: { map: new Map(), fetchedAt: 0, fetch: ( ) => dnr.getDynamicRules() },
    [SESSION_RULESET_ID]: { map: new Map(), fetchedAt: 0, fetch: ( ) => dnr.getSessionRules() },
};

// The engine rebuilds its dynamic and session rules when settings change,
// reusing rule ids: cached copies must be dropped then. The engine announces
// most changes on its broadcast channel; the time limit covers the others.
const RUNTIME_RULES_TTL = 30000;

function invalidateRuntimeRules(rulesetId) {
    const entries = rulesetId === undefined
        ? Object.values(runtimeRules)
        : [ runtimeRules[rulesetId] ];
    for ( const entry of entries ) {
        if ( entry === undefined ) { continue; }
        entry.map = new Map();
        entry.fetchedAt = 0;
    }
}

// This module is evaluated before the engine. Watching the two mutation APIs
// here ensures that reused rule ids can never be resolved through an old
// cache, including user-filter and strict-block changes which do not broadcast.
function watchRuleUpdates(method, rulesetId) {
    const native = dnr[method]?.bind(dnr);
    if ( native === undefined ) { return; }
    const wrapped = async (...args) => {
        try {
            return await native(...args);
        } finally {
            invalidateRuntimeRules(rulesetId);
        }
    };
    try {
        dnr[method] = wrapped;
    } catch {
    }
}

watchRuleUpdates('updateDynamicRules', DYNAMIC_RULESET_ID);
watchRuleUpdates('updateSessionRules', SESSION_RULESET_ID);

// Keep the channel referenced for the service worker's lifetime. It catches
// settings changes initiated by another extension context; the TTL remains a
// final backstop for browser-side changes.
const rulesChangeChannel = new BroadcastChannel('uBOL');
rulesChangeChannel.onmessage = ( ) => invalidateRuntimeRules();

async function ruleKind(rulesetId, ruleId) {
    const runtime = runtimeRules[rulesetId];
    if ( runtime === undefined ) {
        const map = await loadStaticKinds(rulesetId);
        return map.get(ruleId) ?? 'block';
    }
    // Session ids are aggressively reused when strict-block lists/settings
    // change. These matches are rare (normally one top-level navigation), so
    // resolving them from the browser every time is cheap and removes the
    // final cross-browser cache race.
    if ( rulesetId === SESSION_RULESET_ID ) {
        const rules = await runtime.fetch().catch(( ) => []);
        return kindFromRule(rules.find(rule => rule.id === ruleId));
    }
    const age = Date.now() - runtime.fetchedAt;
    if ( age > RUNTIME_RULES_TTL ) {
        runtime.map = new Map();
    }
    let rule = runtime.map.get(ruleId);
    if ( rule === undefined && age > 2000 ) {
        runtime.fetchedAt = Date.now();
        const rules = await runtime.fetch().catch(( ) => []);
        runtime.map = new Map(rules.map(r => [ r.id, r ]));
        rule = runtime.map.get(ruleId);
    }
    return kindFromRule(rule);
}

/******************************************************************************/

let rulesetGroups = new Map();
let trackerHostnames = new Set();

const loadRulesetGroups = ( ) =>
    fetch('/rulesets/ruleset-details.json').then(r => r.json()).then(details => {
        rulesetGroups = new Map(details.map(a => [ a.id, a.group ]));
    }).catch(noop);

const loadTrackers = ( ) =>
    fetch('/rulesets/aegis/trackers.json').then(r => r.json()).then(list => {
        trackerHostnames = new Set(list);
    }).catch(noop);

const isTracker = hn => {
    for (;;) {
        if ( trackerHostnames.has(hn) ) { return true; }
        const pos = hn.indexOf('.');
        if ( pos === -1 ) { return false; }
        hn = hn.slice(pos + 1);
    }
};

function categorize(kind, rulesetId, hostname) {
    if ( kind === 'strictblock' ) { return 'malware'; }
    const group = rulesetGroups.get(rulesetId);
    if ( group === 'malware' ) { return 'malware'; }
    if ( group === 'annoyances' ) { return 'annoyances'; }
    if ( group === 'privacy' || isTracker(hostname) ) { return 'trackers'; }
    return 'ads';
}

/******************************************************************************/

// Persistent state

let stats = null;       // all-time, storage.local
const tabs = new Map(); // per tab, storage.session
let log = [];           // recent matches, storage.session
let logSeq = 0;

const newStats = ( ) => ({
    v: 1,
    since: Date.now(),
    total: 0,
    cleaned: 0,
    cats: emptyCats(),
    days: {},
    domains: {},
    sites: {},
});

const newTabStats = (url = '') => ({
    url,
    hostname: hostnameFromURL(url),
    blocked: 0,
    cleaned: 0,
    cats: emptyCats(),
    domains: {},
});

const pruneTop = (obj, max) => {
    const entries = Object.entries(obj);
    if ( entries.length <= max * 1.5 ) { return obj; }
    entries.sort((a, b) => b[1] - a[1]);
    return Object.fromEntries(entries.slice(0, max));
};

const pruneDays = days => {
    const keys = Object.keys(days).sort();
    for ( const key of keys.slice(0, Math.max(0, keys.length - MAX_DAYS)) ) {
        delete days[key];
    }
};

const saver = (fn, delay) => {
    let timer;
    return ( ) => {
        if ( timer !== undefined ) { return; }
        timer = setTimeout(( ) => { timer = undefined; fn(); }, delay);
    };
};

const saveStats = saver(( ) => {
    stats.domains = pruneTop(stats.domains, MAX_TOP_ENTRIES);
    stats.sites = pruneTop(stats.sites, MAX_TOP_ENTRIES);
    pruneDays(stats.days);
    if ( PRIVATE_CONTEXT ) { return; }
    localWrite('aegis.stats', stats);
}, 3000);

const saveTabs = saver(( ) => {
    if ( PRIVATE_CONTEXT ) { return; }
    sessionWrite('aegis.tabs', Object.fromEntries(tabs));
}, 1000);

const saveLog = saver(( ) => {
    if ( PRIVATE_CONTEXT ) { return; }
    sessionWrite('aegis.log', { seq: logSeq, entries: log });
}, 1500);

/******************************************************************************/

// Toolbar badge

const badgeQueue = new Set();
let badgeTimer;

const compactCount = n => {
    if ( n < 1000 ) { return `${n}`; }
    if ( n < 10000 ) { return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`; }
    if ( n < 1000000 ) { return `${Math.floor(n / 1000)}k`; }
    return `${Math.floor(n / 1000000)}M`;
};

function renderBadge(tabId) {
    const n = tabs.get(tabId)?.blocked ?? 0;
    const text = rulesetConfig.showBlockedCount && n !== 0 ? compactCount(n) : '';
    browser.action.setBadgeText({ tabId, text }).catch(noop);
}

function queueBadge(tabId) {
    if ( ownBadge === false ) { return; }
    badgeQueue.add(tabId);
    if ( badgeTimer !== undefined ) { return; }
    badgeTimer = setTimeout(( ) => {
        badgeTimer = undefined;
        for ( const id of badgeQueue ) { renderBadge(id); }
        badgeQueue.clear();
    }, 250);
}

export function refreshAllBadges() {
    for ( const tabId of tabs.keys() ) { queueBadge(tabId); }
}

// uBO Lite asks the browser to display its native blocked-request counter.
// With live statistics, Aegis draws the badge itself (same count as the
// popup), so the native counter is kept off.
let ownBadge = false;

if ( LIVE && typeof dnr.setExtensionActionOptions === 'function' ) {
    const nativeSetOptions = dnr.setExtensionActionOptions.bind(dnr);
    const patched = (options = {}) => {
        if ( 'displayActionCountAsBadgeText' in options ) {
            options = { ...options, displayActionCountAsBadgeText: false };
            refreshAllBadges();
        }
        return nativeSetOptions(options);
    };
    try {
        dnr.setExtensionActionOptions = patched;
        ownBadge = dnr.setExtensionActionOptions === patched;
    } catch {
    }
    if ( ownBadge ) {
        nativeSetOptions({ displayActionCountAsBadgeText: false }).catch(noop);
    }
}

browser.action.setBadgeBackgroundColor({ color: '#0B9B72' }).catch(noop);
browser.action.setBadgeTextColor?.({ color: '#FFFFFF' })?.catch?.(noop);

/******************************************************************************/

async function processMatch(info) {
    const { request, rule } = info;
    const kind = await ruleKind(rule.rulesetId, rule.ruleId);
    const hostname = hostnameFromURL(request.url);
    const counted = kind === 'block' || kind === 'redirect' || kind === 'strictblock';
    const category = counted || kind === 'clean'
        ? categorize(kind, rule.rulesetId, hostname)
        : '';

    log.push({
        seq: ++logSeq,
        t: Date.now(),
        tabId: request.tabId,
        type: request.type,
        url: request.url,
        kind,
        category,
        rulesetId: rule.rulesetId,
        ruleId: rule.ruleId,
    });
    if ( log.length > LOG_SIZE ) { log.splice(0, log.length - LOG_SIZE); }
    saveLog();

    if ( counted === false && kind !== 'clean' ) { return; }

    let tab;
    if ( request.tabId >= 0 ) {
        // Unknown tab (e.g. service worker restarted): best guess of the page
        // from the top frame
        const pageURL = request.type === 'main_frame'
            ? request.url
            : request.frameId === 0 ? request.initiator ?? '' : '';
        tab = tabs.get(request.tabId);
        if ( tab === undefined ) {
            tab = newTabStats(pageURL);
            tabs.set(request.tabId, tab);
        } else if ( tab.hostname === '' && pageURL !== '' ) {
            tab.hostname = hostnameFromURL(pageURL);
        }
    }

    if ( kind === 'clean' ) {
        stats.cleaned += 1;
        if ( tab ) { tab.cleaned += 1; saveTabs(); }
        saveStats();
        return;
    }

    const domain = domainFromHostname(hostname);
    stats.total += 1;
    stats.cats[category] += 1;
    const day = stats.days[dayKey()] ??= emptyCats();
    day[category] += 1;
    if ( domain ) {
        stats.domains[domain] = (stats.domains[domain] ?? 0) + 1;
    }
    if ( tab ) {
        tab.blocked += 1;
        tab.cats[category] += 1;
        if ( domain ) {
            const entry = tab.domains[domain];
            if ( entry !== undefined ) {
                entry[0] += 1;
            } else if ( Object.keys(tab.domains).length < TAB_DOMAINS_MAX ) {
                tab.domains[domain] = [ 1, category ];
            }
        }
        const site = domainFromHostname(tab.hostname);
        if ( site ) {
            stats.sites[site] = (stats.sites[site] ?? 0) + 1;
        }
        saveTabs();
        queueBadge(request.tabId);
    }
    saveStats();
}

/******************************************************************************/

const pendingMatches = [];

const ready = Promise.all([
    PRIVATE_CONTEXT ? undefined : localRead('aegis.stats'),
    PRIVATE_CONTEXT ? undefined : sessionRead('aegis.tabs'),
    PRIVATE_CONTEXT ? undefined : sessionRead('aegis.log'),
    loadRulesetGroups(),
    loadTrackers(),
]).then(([ storedStats, storedTabs, storedLog ]) => {
    stats = storedStats?.v === 1 ? storedStats : newStats();
    if ( storedStats === undefined && PRIVATE_CONTEXT === false ) {
        localWrite('aegis.stats', stats);
    }
    for ( const [ tabId, tab ] of Object.entries(storedTabs ?? {}) ) {
        tabs.set(Number(tabId), tab);
    }
    if ( Array.isArray(storedLog?.entries) ) {
        log = storedLog.entries;
        logSeq = storedLog.seq ?? 0;
    }
}).catch(( ) => {
    stats ??= newStats();
});

// Serialize processing so that matches are accounted in order
let processing = Promise.resolve();

function onRuleMatched(info) {
    pendingMatches.push(info);
    if ( pendingMatches.length !== 1 ) { return; }
    processing = processing.then(( ) => ready).then(async ( ) => {
        while ( pendingMatches.length !== 0 ) {
            const batch = pendingMatches.splice(0);
            for ( const match of batch ) {
                await processMatch(match).catch(noop);
            }
        }
    });
}

if ( LIVE ) {
    dnr.onRuleMatchedDebug.addListener(onRuleMatched);
}

/******************************************************************************/

// A new document in the top frame of a tab: start counting from zero

browser.webNavigation?.onCommitted.addListener(details => {
    if ( details.frameId !== 0 ) { return; }
    if ( details.documentLifecycle === 'prerender' ) { return; }
    ready.then(( ) => {
        tabs.set(details.tabId, newTabStats(details.url));
        saveTabs();
        queueBadge(details.tabId);
    });
});

browser.tabs.onRemoved.addListener(tabId => {
    ready.then(( ) => {
        if ( tabs.delete(tabId) ) { saveTabs(); }
    });
});

browser.tabs.onReplaced?.addListener((addedTabId, removedTabId) => {
    ready.then(( ) => {
        if ( tabs.delete(removedTabId) ) { saveTabs(); }
    });
});

/******************************************************************************/

// Fallback when live matches are not available: count matched rules

async function tabStatsFromMatchedRules(tabId) {
    const out = newTabStats();
    if ( typeof dnr.getMatchedRules !== 'function' ) { return out; }
    const details = await dnr.getMatchedRules({ tabId }).catch(( ) => undefined);
    for ( const { rule } of details?.rulesMatchedInfo ?? [] ) {
        const kind = await ruleKind(rule.rulesetId, rule.ruleId);
        if ( kind === 'clean' ) { out.cleaned += 1; continue; }
        if ( kind !== 'block' && kind !== 'redirect' && kind !== 'strictblock' ) { continue; }
        out.blocked += 1;
        out.cats[categorize(kind, rule.rulesetId, '')] += 1;
    }
    return out;
}

/******************************************************************************/

export async function getTabStats(tabId) {
    await ready;
    await processing;
    const tab = LIVE ? tabs.get(tabId) ?? newTabStats() : await tabStatsFromMatchedRules(tabId);
    const domains = Object.entries(tab.domains)
        .map(([ domain, [ count, category ] ]) => ({ domain, count, category }))
        .sort((a, b) => b.count - a.count);
    return {
        live: LIVE,
        blocked: tab.blocked,
        cleaned: tab.cleaned,
        cats: tab.cats,
        domains,
    };
}

export async function getGlobalStats() {
    await ready;
    await processing;
    const today = stats.days[dayKey()] ?? emptyCats();
    return {
        live: LIVE,
        since: stats.since,
        total: stats.total,
        cleaned: stats.cleaned,
        cats: stats.cats,
        days: stats.days,
        today: Object.values(today).reduce((a, b) => a + b, 0),
        domains: Object.entries(stats.domains).sort((a, b) => b[1] - a[1]).slice(0, 50),
        sites: Object.entries(stats.sites).sort((a, b) => b[1] - a[1]).slice(0, 50),
    };
}

export async function resetGlobalStats() {
    await ready;
    stats = newStats();
    if ( PRIVATE_CONTEXT === false ) {
        await localWrite('aegis.stats', stats);
    }
}

export async function getLog(after = 0) {
    await ready;
    await processing;
    return {
        live: LIVE,
        seq: logSeq,
        entries: log.filter(a => a.seq > after),
    };
}

export async function clearLog() {
    await ready;
    log = [];
    saveLog();
}
