#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist', 'aegis-store');

const fail = message => {
    throw new Error(message);
};

async function main() {
    const manifestPath = path.join(OUT, 'manifest.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    const permissions = new Set(manifest.permissions ?? []);

    if ( manifest.manifest_version !== 3 ) {
        fail('Chrome Web Store artifact must use Manifest V3');
    }
    if ( permissions.has('declarativeNetRequestFeedback') ) {
        fail('Store artifact still contains declarativeNetRequestFeedback');
    }
    if ( permissions.has('webNavigation') ) {
        fail('Store artifact still contains webNavigation');
    }
    if ( permissions.has('declarativeNetRequest') === false ) {
        fail('Store artifact is missing declarativeNetRequest');
    }
    if ( manifest.host_permissions?.includes('<all_urls>') !== true ) {
        fail('Store artifact is missing the host access required for blocking');
    }

    const stats = await fs.readFile(path.join(OUT, 'js', 'aegis', 'stats.js'), 'utf8');
    if ( stats.includes('export const LIVE = false; // Chrome Web Store build: debug-only API unavailable') === false ) {
        fail('Store statistics fallback was not applied');
    }

    const required = [
        'popup.html',
        'dashboard.html',
        'welcome.html',
        'img/icon_128.png',
        'rulesets/ruleset-details.json',
    ];
    for ( const relative of required ) {
        await fs.access(path.join(OUT, relative)).catch(( ) => fail(`Missing required artifact: ${relative}`));
    }

    console.log('[aegis] Chrome Web Store artifact checks passed');
}

main().catch(reason => {
    console.error('[aegis] Store check failed:', reason?.message ?? reason);
    process.exit(1);
});
