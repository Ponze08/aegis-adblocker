#!/usr/bin/env node
/*******************************************************************************

    Aegis — Chrome Web Store build

    Builds the normal Chromium extension first, then creates a store-safe copy
    in dist/aegis-store. The Web Store build removes permissions which are only
    useful for unpacked/debug builds and forces the statistics module to use
    its packed-extension fallback.

    Usage:
      node scripts/build-store.mjs
      node scripts/build-store.mjs --fresh

*******************************************************************************/

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SOURCE = path.join(DIST, 'aegis');
const OUT = path.join(DIST, 'aegis-store');
const FRESH = process.argv.includes('--fresh');

const STORE_ONLY_PERMISSIONS = new Set([
    'declarativeNetRequestFeedback',
    'webNavigation',
]);

const run = (cmd, argv, cwd) => new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, { cwd, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => {
        if ( code === 0 ) { return resolve(); }
        reject(new Error(`${cmd} ${argv.join(' ')} exited with code ${code}`));
    });
});

async function main() {
    const buildArgs = [ path.join(ROOT, 'scripts', 'build.mjs') ];
    if ( FRESH ) { buildArgs.push('--fresh'); }
    await run(process.execPath, buildArgs, ROOT);

    await fs.rm(OUT, { recursive: true, force: true });
    await fs.cp(SOURCE, OUT, { recursive: true });

    const manifestPath = path.join(OUT, 'manifest.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    manifest.permissions = (manifest.permissions ?? []).filter(
        permission => STORE_ONLY_PERMISSIONS.has(permission) === false
    );
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    // onRuleMatchedDebug is explicitly an unpacked-extension debugging API.
    // Force the store build onto the existing getMatchedRules()/activeTab
    // fallback so the UI never advertises unavailable live-debug features.
    const statsPath = path.join(OUT, 'js', 'aegis', 'stats.js');
    let stats = await fs.readFile(statsPath, 'utf8');
    const liveProbe = "export const LIVE = typeof dnr.onRuleMatchedDebug?.addListener === 'function';";
    if ( stats.includes(liveProbe) === false ) {
        throw new Error('stats.js live-debug probe changed; review the Web Store patch');
    }
    stats = stats.replace(
        liveProbe,
        'export const LIVE = false; // Chrome Web Store build: debug-only API unavailable'
    );
    await fs.writeFile(statsPath, stats);

    console.log(`[aegis] Chrome Web Store build ready → ${OUT}`);
}

main().catch(reason => {
    console.error('[aegis] Store build failed:', reason?.message ?? reason);
    process.exit(1);
});
