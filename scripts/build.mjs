#!/usr/bin/env node
/*******************************************************************************

    Aegis — build script

    Assembles the extension from two sources:
      1. The uBlock Origin Lite engine, taken from the local uBO repository
         (filter compiler, DNR ruleset manager, cosmetic filtering, scriptlets,
         element picker/zapper, strict-block page).
      2. The Aegis UI and extras from ./src (popup, dashboard, welcome page,
         live statistics, global pause), which override engine files with the
         same path.

    Usage:
      node scripts/build.mjs             full build (compiles filter lists)
      node scripts/build.mjs --ui        re-copy ./src only, reuse rulesets
      node scripts/build.mjs --fresh     full build, re-download filter lists

    Environment:
      UBO_DIR   path to the uBlock repository (default: ../uBlock)

    uBlock Origin / uBO Lite are GPLv3 (c) Raymond Hill, and so is this build.

*******************************************************************************/

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UBO = path.resolve(process.env.UBO_DIR || path.join(ROOT, '..', 'uBlock'));
const MV3 = path.join(UBO, 'platform', 'mv3');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(DIST, 'aegis');
const TMP = path.join(DIST, '.engine-build');
const CACHE = path.join(DIST, 'mv3-data'); // make-rulesets.js: `${output}/../mv3-data`
const GENERATED = path.join(DIST, 'generated-manifest.json');

const args = new Set(process.argv.slice(2));
const UI_ONLY = args.has('--ui');
const FRESH = args.has('--fresh');

/******************************************************************************/

const log = (...a) => console.log('\x1b[36m[aegis]\x1b[0m', ...a);

const exists = p => fs.access(p).then(( ) => true, ( ) => false);

async function copy(from, to) {
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.cp(from, to, { recursive: true, force: true });
}

// Copy every file of a directory into another, keeping relative paths.
async function copyDirContents(fromDir, toDir, filter = ( ) => true) {
    if ( await exists(fromDir) === false ) { return; }
    for ( const entry of await fs.readdir(fromDir, { withFileTypes: true }) ) {
        const from = path.join(fromDir, entry.name);
        if ( filter(from, entry) === false ) { continue; }
        await copy(from, path.join(toDir, entry.name));
    }
}

async function readJSON(p) {
    return JSON.parse(await fs.readFile(p, 'utf8'));
}

async function writeJSON(p, data, indent = 2) {
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, JSON.stringify(data, null, indent) + '\n');
}

function run(cmd, argv, cwd) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, argv, { cwd, stdio: 'inherit' });
        child.on('error', reject);
        child.on('exit', code => {
            if ( code === 0 ) { return resolve(); }
            reject(new Error(`${cmd} ${argv.join(' ')} exited with code ${code}`));
        });
    });
}

/******************************************************************************/

// Same file selection as uBO's tools/make-mv3.sh (extension part)

async function copyEngine() {
    log(`Copying uBO Lite engine from ${UBO}`);
    const S = p => path.join(UBO, p);
    const O = p => path.join(OUT, p);

    await copy(S('src/css/fonts/Inter'), O('css/fonts/Inter'));
    await copy(S('src/css/themes/default.css'), O('css/default.css'));
    await copy(S('src/css/common.css'), O('css/common.css'));
    await copy(S('src/css/dashboard-common.css'), O('css/dashboard-common.css'));
    await copy(S('src/css/fa-icons.css'), O('css/fa-icons.css'));

    for ( const f of [
        'arglist-parser.js', 'dom.js', 'fa-icons.js', 'i18n.js', 'jsonpath.js',
        'redirect-resources.js', 'trusted-tokens.js', 'static-filtering-parser.js',
        'urlskip.js',
    ] ) {
        await copy(S(`src/js/${f}`), O(`js/${f}`));
    }
    await copy(S('src/js/resources'), O('js/resources'));
    await copy(S('src/js/regex-analyzer.js'), O('js/offscreen/regex-analyzer.js'));
    await copy(S('src/lib/punycode.js'), O('js/punycode.js'));
    await copy(S('src/lib/regexanalyzer'), O('lib/regexanalyzer'));
    await copy(S('src/lib/csstree'), O('lib/csstree'));
    // The s14e-serializer git submodule is a copy of this file
    await copy(S('src/js/s14e-serializer.js'), O('lib/s14e-serializer.js'));
    await copy(S('src/img/flags-of-the-world'), O('img/flags-of-the-world'));
    await copy(S('LICENSE.txt'), O('LICENSE.txt'));

    const E = p => path.join(MV3, 'extension', p);
    await copyDirContents(E(''), OUT, (from, entry) =>
        entry.isFile() && /\.(html|json)$/.test(entry.name)
    );
    await copyDirContents(E('css'), O('css'));
    await copyDirContents(E('js'), O('js'));
    await copyDirContents(E('img'), O('img'));
    await copy(E('_locales'), O('_locales'));
}

// uBO Lite UI files which are replaced by the Aegis UI
const REPLACED_ENGINE_FILES = [
    'dashboard.html',
    'popup.html',
    'css/dashboard.css',
    'css/develop.css',
    'css/filter-editor.css',
    'css/popup.css',
    'css/settings.css',
    'js/dashboard.js',
    'js/develop.js',
    'js/dnr-editor.js',
    'js/filter-editor.js',
    'js/filter-lists.js',
    'js/filter-manager-ui.js',
    'js/mode-editor.js',
    'js/popup.js',
    'js/ro-dnr-editor.js',
    'js/rw-dnr-editor.js',
    'js/settings.js',
    'img/ublock.svg',
    // The report page files issues upstream as "uBO Lite": not for a fork
    'report.html',
    'css/report.css',
    'js/report.js',
];

async function pruneEngine() {
    for ( const f of REPLACED_ENGINE_FILES ) {
        await fs.rm(path.join(OUT, f), { force: true });
    }
}

// The only change made to engine code: expose the engine's initialization
// promise, so that Aegis extras never race the engine at service worker
// startup.
async function patchEngine() {
    const file = path.join(OUT, 'js', 'background.js');
    const code = await fs.readFile(file, 'utf8');
    if ( /^const isFullyInitialized = /m.test(code) === false ) {
        throw new Error('js/background.js: `isFullyInitialized` not found, engine changed?');
    }
    await fs.writeFile(file, `${code}\n// Aegis\nexport { isFullyInitialized };\n`);
}

/******************************************************************************/

async function copyOverlay() {
    log('Copying Aegis UI from src/');
    await copyDirContents(SRC, OUT, (from, entry) =>
        entry.name !== 'manifest.json' && entry.name !== '_locales'
    );
}

// Aegis strings are merged on top of uBO Lite's translations, so that the
// engine pages (picker, zapper, strict-block) stay fully translated.
async function mergeLocales() {
    const ours = new Map();
    for ( const lang of await fs.readdir(path.join(SRC, '_locales')) ) {
        ours.set(lang, await readJSON(path.join(SRC, '_locales', lang, 'messages.json')));
    }
    const en = ours.get('en');
    const dir = path.join(OUT, '_locales');
    await fs.mkdir(dir, { recursive: true });
    const langs = new Set([ ...await fs.readdir(dir), ...ours.keys() ]);
    // Engine strings name the product: rebrand them in every language
    const rebrand = /uBlock Origin Lite|uBO Lite|\buBOL\b(?!-)/g;
    for ( const lang of langs ) {
        const file = path.join(dir, lang, 'messages.json');
        const base = await exists(file) ? await readJSON(file) : {};
        for ( const entry of Object.values(base) ) {
            if ( typeof entry?.message !== 'string' ) { continue; }
            entry.message = entry.message.replace(rebrand, 'Aegis');
        }
        const merged = Object.assign(base, ours.get(lang) ?? {
            extName: en.extName,
            extShortDesc: en.extShortDesc,
        });
        await writeJSON(file, merged, 1);
    }
}

// Re-skin the engine pages we keep with the Aegis design tokens
const THEMED_ENGINE_PAGES = [
    'picker-ui.html',
    'zapper-ui.html',
    'unpicker-ui.html',
    'strictblock.html',
    'matched-rules.html',
];

async function themeEnginePages() {
    for ( const page of THEMED_ENGINE_PAGES ) {
        const file = path.join(OUT, page);
        if ( await exists(file) === false ) { continue; }
        let html = await fs.readFile(file, 'utf8');
        if ( html.includes('aegis/ubo-theme.css') ) { continue; }
        html = html.replace('</head>',
            '<link rel="stylesheet" href="/css/aegis/ubo-theme.css">\n</head>'
        );
        await fs.writeFile(file, html);
    }
}

/******************************************************************************/

// Same file selection as uBO's tools/make-nodejs.sh + tools/make-mv3.sh
// (rulesets part)

async function prepareRulesetCompiler() {
    log('Preparing filter list compiler');
    await fs.rm(TMP, { recursive: true, force: true });
    const S = p => path.join(UBO, p);
    const T = p => path.join(TMP, p);

    for ( const f of [
        'arglist-parser.js', 'base64-custom.js', 'biditrie.js',
        'dynamic-net-filtering.js', 'filtering-context.js', 'hnswitches.js',
        'hntrie.js', 'jsonpath.js', 'redirect-resources.js', 'regex-analyzer.js',
        's14e-serializer.js', 'static-dnr-filtering.js',
        'static-filtering-parser.js', 'static-net-filtering.js',
        'static-filtering-io.js', 'tasks.js', 'text-utils.js', 'urlskip.js',
        'uri-utils.js', 'url-net-filtering.js',
    ] ) {
        await copy(S(`src/js/${f}`), T(`js/${f}`));
    }
    await copy(S('src/lib/csstree'), T('lib/csstree'));
    await copy(S('src/lib/punycode.js'), T('lib/punycode.js'));
    await copy(S('src/lib/regexanalyzer'), T('lib/regexanalyzer'));
    await copy(S('src/lib/publicsuffixlist'), T('lib/publicsuffixlist'));
    await copy(S('src/js/wasm'), T('js/wasm'));
    const wasmToJSON = async (from, to) => {
        const bytes = await fs.readFile(S(from));
        await fs.writeFile(T(to), JSON.stringify(Array.from(bytes)));
    };
    await wasmToJSON('src/js/wasm/hntrie.wasm', 'js/wasm/hntrie.wasm.json');
    await wasmToJSON('src/js/wasm/biditrie.wasm', 'js/wasm/biditrie.wasm.json');
    await wasmToJSON(
        'src/lib/publicsuffixlist/wasm/publicsuffixlist.wasm',
        'lib/publicsuffixlist/wasm/publicsuffixlist.wasm.json'
    );
    await copyDirContents(S('platform/nodejs'), TMP, (f, e) => e.isFile() && f.endsWith('.js'));
    await copy(S('LICENSE.txt'), T('LICENSE.txt'));

    await copyDirContents(MV3, TMP, (f, e) => e.isFile() && /\.(json|js|mjs)$/.test(f));
    await copy(path.join(MV3, 'extension/js/ubo-parser.js'), T('js/ubo-parser.js'));
    await copy(path.join(MV3, 'extension/js/utils.js'), T('js/utils.js'));
    await copy(S('src/lib/punycode.js'), T('js/punycode.js'));
    await copy(S('src/lib/regexanalyzer'), T('js/regexanalyzer'));
    await copy(S('src/js/resources'), T('js/resources'));
    await copy(S('src/js/trusted-tokens.js'), T('js/trusted-tokens.js'));
    await copy(path.join(MV3, 'scriptlets'), T('scriptlets'));
    await copy(path.join(MV3, 'extension/js/offscreen'), T('js/offscreen'));
    await copy(S('src/js/regex-analyzer.js'), T('js/offscreen/regex-analyzer.js'));
    await copyDirContents(S('src/web_accessible_resources'), T('web_accessible_resources'));
    await copy(path.join(MV3, 'chromium'), T('chromium'));
}

async function compileRulesets() {
    if ( FRESH ) {
        log('Clearing cached filter lists');
        const secret = await fs.readFile(path.join(CACHE, 'secret.txt'), 'utf8').catch(( ) => null);
        await fs.rm(CACHE, { recursive: true, force: true });
        if ( secret ) {
            await fs.mkdir(CACHE, { recursive: true });
            await fs.writeFile(path.join(CACHE, 'secret.txt'), secret);
        }
    }
    await prepareRulesetCompiler();
    log('Compiling filter lists into rulesets (downloads lists on first run)…');
    await run(process.execPath, [
        '--no-warnings',
        'make-rulesets.js',
        `output=${OUT}`,
        'platform=chromium',
    ], TMP);
    await fs.rm(TMP, { recursive: true, force: true });
}

/******************************************************************************/

// Compact lookup tables used by the live statistics (js/aegis/stats.js):
//   - which rules of each ruleset are not plain "block" rules
//   - which hostnames are known trackers (from EasyPrivacy)

const TRACKER_RULESETS = [ 'easyprivacy' ];

async function makeStatsIndex() {
    log('Indexing rulesets for live statistics');
    const mainDir = path.join(OUT, 'rulesets', 'main');
    const indexDir = path.join(OUT, 'rulesets', 'aegis');
    await fs.mkdir(indexDir, { recursive: true });
    const reHostnameFilter = /^\|\|([a-z0-9.-]+)\^$/;
    const trackers = new Set();
    for ( const fname of await fs.readdir(mainDir) ) {
        if ( fname.endsWith('.json') === false ) { continue; }
        const id = fname.slice(0, -5);
        const rules = await readJSON(path.join(mainDir, fname));
        const kinds = {};
        const add = (kind, ruleId) => {
            (kinds[kind] ??= []).push(ruleId);
        };
        for ( const rule of rules ) {
            const { type } = rule.action;
            if ( type === 'block' ) {
                if ( TRACKER_RULESETS.includes(id) ) {
                    for ( const hn of rule.condition.requestDomains ?? [] ) {
                        trackers.add(hn);
                    }
                    const match = reHostnameFilter.exec(rule.condition.urlFilter ?? '');
                    if ( match && rule.condition.initiatorDomains === undefined ) {
                        trackers.add(match[1]);
                    }
                }
                continue;
            }
            if ( type === 'redirect' ) {
                add(rule.action.redirect?.extensionPath ? 'redirect' : 'clean', rule.id);
            } else {
                add(type, rule.id);
            }
        }
        await writeJSON(path.join(indexDir, `${id}.json`), kinds, 0);
    }
    await writeJSON(path.join(indexDir, 'trackers.json'), Array.from(trackers).sort(), 0);
}

/******************************************************************************/

// Compiler diagnostics include the per-build token used for trusted filter
// directives. They are useful while building but must never ship in the
// extension (matching upstream's release packaging).
async function finalizeArtifact() {
    await fs.rm(path.join(OUT, 'log.txt'), { force: true });
    await fs.rm(path.join(OUT, '_metadata'), { recursive: true, force: true });
    await fs.rm(path.join(OUT, 'rulesets', 'debug'), { recursive: true, force: true });
}

/******************************************************************************/

// The manifest is ./src/manifest.json, completed with the parts generated
// by the ruleset compiler (ruleset list, redirect resources, version).

async function writeManifest(generated) {
    const manifest = await readJSON(path.join(SRC, 'manifest.json'));
    if ( generated ) {
        manifest.version = generated.version;
        manifest.declarative_net_request = generated.declarative_net_request;
        manifest.web_accessible_resources = [
            ...manifest.web_accessible_resources,
            ...generated.web_accessible_resources,
        ];
    }
    await writeJSON(path.join(OUT, 'manifest.json'), manifest);
    return manifest;
}

async function saveGeneratedManifestParts(before) {
    const after = await readJSON(path.join(OUT, 'manifest.json'));
    const ownWAR = new Set(before.web_accessible_resources.map(a => JSON.stringify(a)));
    await writeJSON(GENERATED, {
        version: after.version,
        declarative_net_request: after.declarative_net_request,
        web_accessible_resources: after.web_accessible_resources.filter(a =>
            ownWAR.has(JSON.stringify(a)) === false
        ),
    });
}

/******************************************************************************/

async function main() {
    const t0 = Date.now();
    if ( await exists(path.join(MV3, 'make-rulesets.js')) === false ) {
        throw new Error(`uBO repository not found at ${UBO} (set UBO_DIR)`);
    }

    if ( UI_ONLY ) {
        if ( await exists(GENERATED) === false || await exists(path.join(OUT, 'rulesets')) === false ) {
            throw new Error('No previous full build found, run a full build first');
        }
        await copyOverlay();
        await mergeLocales();
        await themeEnginePages();
        await writeManifest(await readJSON(GENERATED));
        await finalizeArtifact();
        log(`UI refreshed in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${OUT}`);
        return;
    }

    await fs.rm(OUT, { recursive: true, force: true });
    await copyEngine();
    await pruneEngine();
    await patchEngine();
    await copyOverlay();
    await mergeLocales();
    await themeEnginePages();
    const manifest = await writeManifest();
    await compileRulesets();
    await saveGeneratedManifestParts(manifest);
    await makeStatsIndex();
    await finalizeArtifact();

    const { version } = await readJSON(path.join(OUT, 'manifest.json'));
    log(`Built Aegis ${version} in ${((Date.now() - t0) / 1000).toFixed(0)}s → ${OUT}`);
}

main().catch(reason => {
    console.error('\x1b[31m[aegis] Build failed:\x1b[0m', reason?.message ?? reason);
    process.exit(1);
});
