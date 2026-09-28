/*******************************************************************************

    Aegis — dashboard: per-site protection levels

*******************************************************************************/

import {
    $,
    LEVELS,
    icon,
    send,
    setupSeg,
    toast,
} from '../lib/ui.js';

import punycode from '../../punycode.js';
import { refreshShell } from './main.js';

/******************************************************************************/

const MODE_KEYS = [ 'none', 'basic', 'optimal', 'complete' ];

const SUBTITLES = [
    'Trusted: nothing is blocked',
    'Basic protection',
    'Standard protection',
    'Strict protection',
];

let filter = 'all';

/******************************************************************************/

function siteEntries(ctx) {
    const out = [];
    MODE_KEYS.forEach((key, level) => {
        for ( const hostname of ctx.modes[key] ?? [] ) {
            if ( hostname === 'all-urls' ) { continue; }
            out.push({ hostname, level });
        }
    });
    return out.sort((a, b) => a.hostname.localeCompare(b.hostname));
}

// Accepts "example.com", "https://www.example.com/page", "münchen.de"…
function normalizeHostname(input) {
    let s = input.trim().toLowerCase();
    if ( s === '' ) { return ''; }
    if ( /^[a-z][a-z0-9+.-]*:\/\//.test(s) === false ) { s = `http://${s}`; }
    let hostname;
    try { hostname = new URL(s).hostname; } catch { return ''; }
    hostname = punycode.toASCII(hostname.replace(/\.$/, ''));
    if ( /^[a-z0-9.-]+$/.test(hostname) === false || hostname.includes('.') === false ) {
        return '';
    }
    return hostname;
}

/******************************************************************************/

function levelSelect(level) {
    const select = document.createElement('select');
    select.className = 'select';
    select.setAttribute('aria-label', 'Protection level');
    for ( const meta of LEVELS ) {
        const option = document.createElement('option');
        option.value = `${meta.level}`;
        option.textContent = meta.level === 0 ? 'Off (trusted)' : meta.name;
        select.append(option);
    }
    select.value = `${level}`;
    return select;
}

function render(ctx) {
    const paused = ctx.pause.paused;
    const all = paused ? [] : siteEntries(ctx);
    const needle = $('#sitesSearch').value.trim().toLowerCase();
    const entries = all.filter(({ hostname, level }) => {
        if ( filter === '0' && level !== 0 ) { return false; }
        if ( filter === 'custom' && level === 0 ) { return false; }
        return needle === '' || punycode.toUnicode(hostname).includes(needle) || hostname.includes(needle);
    });

    $('#sitesDefaultName').textContent = ctx.levelName();
    $('#addSiteForm').querySelectorAll('input, select, button').forEach(e => { e.disabled = paused; });

    $('#siteList').replaceChildren(...entries.map(({ hostname, level }) => {
        const li = document.createElement('li');
        li.className = 'site-row';
        li.dataset.hostname = hostname;
        li.dataset.level = `${level}`;
        const display = punycode.toUnicode(hostname);
        const avatar = document.createElement('span');
        avatar.className = 'site-avatar';
        avatar.textContent = display.replace(/^www\./, '').charAt(0);
        const name = document.createElement('span');
        name.className = 'site-name';
        name.textContent = display;
        const sub = document.createElement('span');
        sub.className = 'muted';
        sub.textContent = `${SUBTITLES[level]} · includes subdomains`;
        name.append(sub);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'icon-btn sm';
        remove.title = `Use the default level on ${display}`;
        remove.innerHTML = icon('x', 'sm');
        li.append(avatar, name, levelSelect(level), remove);
        return li;
    }));

    const empty = $('#sitesEmpty');
    empty.hidden = entries.length !== 0;
    const [ strong, text ] = empty.querySelectorAll('strong, .muted');
    if ( paused ) {
        strong.textContent = 'Protection is paused';
        text.textContent = 'Site settings are kept aside while paused. Resume protection to see and edit them.';
    } else if ( all.length !== 0 ) {
        strong.textContent = 'No matching site';
        text.textContent = 'Try another search or filter.';
    } else {
        strong.textContent = 'No site-specific settings yet';
        text.textContent = 'Turn protection off for a site from the toolbar popup, or add one above.';
    }
}

async function setSiteLevel(ctx, hostname, level) {
    const actual = await send('setFilteringMode', { hostname, level });
    await ctx.reloadModes();
    refreshShell();
    render(ctx);
    return actual;
}

/******************************************************************************/

export function init(ctx) {
    setupSeg($('#sitesFilter'), value => {
        filter = value;
        render(ctx);
    }).select('all');

    $('#sitesSearch').addEventListener('input', ( ) => render(ctx));

    $('#addSiteForm').addEventListener('submit', async ev => {
        ev.preventDefault();
        const input = $('#addSiteInput');
        const hostname = normalizeHostname(input.value);
        if ( hostname === '' ) {
            toast('That doesn’t look like a website address', { type: 'error' });
            return;
        }
        const level = Number($('#addSiteLevel').value);
        if ( level === ctx.data.defaultFilteringMode ) {
            toast(`${LEVELS[level].name} is already your default level`, { type: 'error' });
            return;
        }
        await setSiteLevel(ctx, hostname, level);
        input.value = '';
        toast(level === 0
            ? `${punycode.toUnicode(hostname)} is now trusted`
            : `${punycode.toUnicode(hostname)} now uses ${LEVELS[level].name}`);
    });

    $('#siteList').addEventListener('change', async ev => {
        if ( ev.target.matches('select') === false ) { return; }
        const row = ev.target.closest('.site-row');
        const level = Number(ev.target.value);
        await setSiteLevel(ctx, row.dataset.hostname, level);
        toast(`Updated ${punycode.toUnicode(row.dataset.hostname)}`);
    });

    $('#siteList').addEventListener('click', async ev => {
        const button = ev.target.closest('.icon-btn');
        if ( button === null ) { return; }
        const hostname = button.closest('.site-row').dataset.hostname;
        await setSiteLevel(ctx, hostname, ctx.data.defaultFilteringMode);
        toast(`${punycode.toUnicode(hostname)} now uses your default level`);
    });
}

export async function show(ctx, params) {
    await ctx.reloadModes();
    const add = params.get('add');
    if ( add ) { $('#addSiteInput').value = add; }
    render(ctx);
}

export function onBroadcast(ctx) {
    if ( $('.page[data-page="sites"]').hidden === false ) { render(ctx); }
}
