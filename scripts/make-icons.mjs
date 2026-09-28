#!/usr/bin/env node
/*******************************************************************************

    Aegis — icon generator

    Renders the toolbar/extension icons (src/img/icon_*.png) from the SVG
    sources below, using a headless Chromium browser (Chrome or Edge).

    Usage: node scripts/make-icons.mjs

*******************************************************************************/

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMG = path.join(ROOT, 'src', 'img');

const BROWSER_CANDIDATES = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
].filter(Boolean);

/******************************************************************************/

const SHIELD = 'M64 8C52 15.5 36.5 21 20.5 22.3 17.9 22.5 16 24.6 16 27.2V60c0 29 18.7 50 46.1 60.3 1.2.45 2.6.45 3.8 0C93.3 110 112 89 112 60V27.2c0-2.6-1.9-4.7-4.5-4.9C91.5 21 76 15.5 64 8Z';

// `detail` is reduced for tiny sizes, where fine strokes turn into mud
function iconSVG({ state, size }) {
    const on = state === 'on';
    const small = size <= 32;
    const stroke = small ? 15 : 12;
    const glyph = on
        ? `<path d="M42 64.5 57 79.5 87 48" fill="none" stroke="#fff" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>`
        : `<path d="M44 84 84 44" fill="none" stroke="#fff" stroke-width="${stroke}" stroke-linecap="round"/>`;
    const [ c1, c2 ] = on ? [ '#2FE6A6', '#0A84F0' ] : [ '#B4BCC8', '#6B7385' ];
    const highlight = small ? '' :
        `<path d="${SHIELD}" fill="url(#hl)"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="${size}" height="${size}">
<defs>
<linearGradient id="g" x1="20" y1="10" x2="108" y2="118" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
<linearGradient id="hl" x1="0" y1="8" x2="0" y2="70" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
</defs>
<path d="${SHIELD}" fill="url(#g)"/>
${highlight}
${glyph}
</svg>`;
}

// Logo used inside the UI (scales to any size)
export const LOGO_SVG = iconSVG({ state: 'on', size: 128 }).replace(/ width="128" height="128"/, '');

const ICONS = [
    ...[ 16, 32, 48, 64, 128, 512 ].map(size => ({ name: `icon_${size}.png`, state: 'on', size })),
    ...[ 16, 32, 64, 128 ].map(size => ({ name: `icon_${size}_off.png`, state: 'off', size })),
];

/******************************************************************************/

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function findBrowser() {
    for ( const p of BROWSER_CANDIDATES ) {
        try { await fs.access(p); return p; } catch { }
    }
    throw new Error('No Chrome/Edge found, set CHROME_PATH');
}

async function cdpConnect(port) {
    let version;
    for ( let i = 0; i < 60 && version === undefined; i++ ) {
        await sleep(250);
        version = await fetch(`http://127.0.0.1:${port}/json/version`).then(r => r.json()).catch(( ) => undefined);
    }
    if ( version === undefined ) { throw new Error('Browser did not start'); }
    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let id = 0;
    const pending = new Map();
    ws.onmessage = ev => {
        const msg = JSON.parse(ev.data);
        const p = pending.get(msg.id);
        if ( p === undefined ) { return; }
        pending.delete(msg.id);
        msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    };
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
        pending.set(++id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
    return { send, close: ( ) => ws.close() };
}

async function main() {
    const port = 9400 + Math.floor(Math.random() * 500);
    const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'aegis-icons-'));
    const child = spawn(await findBrowser(), [
        '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
        '--no-first-run', '--hide-scrollbars', 'about:blank',
    ], { stdio: 'ignore' });
    try {
        const cdp = await cdpConnect(port);
        const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
        const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
        const page = (method, params) => cdp.send(method, params, sessionId);
        await page('Page.enable');
        await page('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
        await fs.mkdir(IMG, { recursive: true });
        for ( const icon of ICONS ) {
            await page('Emulation.setDeviceMetricsOverride', {
                width: icon.size, height: icon.size, deviceScaleFactor: 1, mobile: false,
            });
            const html = `<html><body style="margin:0;background:transparent">${iconSVG(icon)}</body></html>`;
            const { frameId } = await page('Page.navigate', { url: 'about:blank' });
            await page('Page.setDocumentContent', { frameId, html });
            await sleep(100);
            const { data } = await page('Page.captureScreenshot', {
                format: 'png',
                clip: { x: 0, y: 0, width: icon.size, height: icon.size, scale: 1 },
            });
            await fs.writeFile(path.join(IMG, icon.name), Buffer.from(data, 'base64'));
            console.log(`  ${icon.name}`);
        }
        await fs.writeFile(path.join(IMG, 'logo.svg'), LOGO_SVG + '\n');
        console.log('  logo.svg');
        cdp.close();
    } finally {
        child.kill();
        await sleep(500);
        await fs.rm(profile, { recursive: true, force: true }).catch(( ) => { });
    }
}

main().catch(reason => {
    console.error(reason);
    process.exit(1);
});
