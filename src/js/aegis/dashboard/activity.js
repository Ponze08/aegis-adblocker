/*******************************************************************************

    Aegis — dashboard: live activity log

*******************************************************************************/

import {
    $,
    CATEGORY_META,
    browser,
    icon,
    send,
} from '../lib/ui.js';

import { shortListName } from '../lib/lists-meta.js';

/******************************************************************************/

const MAX_ENTRIES = 1000;
const MAX_ROWS = 400;

const ACTIONS = {
    block: { group: 'blocked', label: 'Blocked', tip: 'The request was blocked' },
    redirect: { group: 'blocked', label: 'Neutered', tip: 'Replaced with a harmless stand-in so the page keeps working' },
    strictblock: { group: 'blocked', label: 'Warned', tip: 'A dangerous page was intercepted' },
    clean: { group: 'cleaned', label: 'Cleaned', tip: 'Tracking parameters were removed from the address' },
    allow: { group: 'allowed', label: 'Allowed', tip: 'An exception rule let this request through' },
    modifyHeaders: { group: 'other', label: 'Modified', tip: 'Request or response headers were modified' },
    upgradeScheme: { group: 'other', label: 'Upgraded', tip: 'Upgraded to a secure connection' },
};

const TYPES = {
    main_frame: 'Page',
    sub_frame: 'Frame',
    script: 'Script',
    image: 'Image',
    stylesheet: 'Style',
    font: 'Font',
    media: 'Media',
    xmlhttprequest: 'Fetch/XHR',
    ping: 'Ping',
    websocket: 'WebSocket',
    csp_report: 'CSP report',
    object: 'Object',
    webtransport: 'WebTransport',
    webbundle: 'Web bundle',
    other: 'Other',
};

let entries = [];
let lastSeq = 0;
let timer;
let frozen = false;
let live = true;
let rulesetNames = new Map();
const kinds = new Set([ 'blocked', 'cleaned' ]);

/******************************************************************************/

const pad = n => `${n}`.padStart(2, '0');
const timeText = t => {
    const d = new Date(t);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

function listName(rulesetId) {
    if ( rulesetId === '_dynamic' ) { return 'Your rules & settings'; }
    if ( rulesetId === '_session' ) { return 'Session rules'; }
    return rulesetNames.get(rulesetId) ?? rulesetId;
}

function matches(entry, tabFilter, needle) {
    const action = ACTIONS[entry.kind] ?? ACTIONS.modifyHeaders;
    if ( kinds.has(action.group) === false ) { return false; }
    if ( tabFilter !== '' && `${entry.tabId}` !== tabFilter ) { return false; }
    if ( needle !== '' ) {
        const hay = `${entry.url} ${listName(entry.rulesetId)} ${entry.type}`.toLowerCase();
        if ( hay.includes(needle) === false ) { return false; }
    }
    return true;
}

function buildRow(entry, isNew = false) {
    const action = ACTIONS[entry.kind] ?? ACTIONS.modifyHeaders;
    const tr = document.createElement('tr');
    if ( isNew ) { tr.className = 'new'; }

    const time = document.createElement('td');
    time.className = 'time';
    time.textContent = timeText(entry.t);

    const act = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `action-badge ${action.group}`;
    badge.textContent = action.label;
    badge.title = action.tip;
    act.append(badge);

    const type = document.createElement('td');
    type.className = 'type';
    type.textContent = TYPES[entry.type] ?? entry.type;

    const url = document.createElement('td');
    url.className = 'url';
    url.title = entry.url;
    try {
        const u = new URL(entry.url);
        const host = document.createElement('span');
        host.className = 'host';
        host.textContent = u.hostname;
        const path = document.createElement('span');
        path.className = 'path';
        path.textContent = `${u.pathname}${u.search}`;
        url.append(host, path);
    } catch {
        url.textContent = entry.url;
    }

    const list = document.createElement('td');
    list.className = 'list';
    if ( entry.category ) {
        const dot = document.createElement('span');
        dot.className = `dot ${entry.category}`;
        dot.title = CATEGORY_META[entry.category]?.label ?? '';
        dot.style.marginRight = '8px';
        list.append(dot);
    }
    list.append(listName(entry.rulesetId));
    list.title = `${listName(entry.rulesetId)} · rule #${entry.ruleId}`;

    tr.append(time, act, type, url, list);
    return tr;
}

function currentFilters() {
    return {
        tabFilter: $('#activityTab').value,
        needle: $('#activitySearch').value.trim().toLowerCase(),
    };
}

function renderAll() {
    const { tabFilter, needle } = currentFilters();
    const rows = [];
    for ( let i = entries.length - 1; i >= 0 && rows.length < MAX_ROWS; i-- ) {
        if ( matches(entries[i], tabFilter, needle) ) {
            rows.push(buildRow(entries[i]));
        }
    }
    $('#activityRows').replaceChildren(...rows);
    renderEmpty();
}

function renderEmpty() {
    const empty = $('#activityEmpty');
    const hasRows = $('#activityRows').childElementCount !== 0;
    empty.hidden = hasRows;
    if ( hasRows ) { return; }
    const [ strong, text ] = empty.querySelectorAll('strong, .muted');
    if ( entries.length === 0 ) {
        strong.textContent = 'Waiting for activity…';
        text.textContent = 'Browse the web and blocked requests will show up here in real time.';
    } else {
        strong.textContent = 'Nothing matches';
        text.textContent = 'Try another tab, search, or turn on more kinds above.';
    }
}

function prependNew(newEntries) {
    const { tabFilter, needle } = currentFilters();
    const tbody = $('#activityRows');
    const fragment = document.createDocumentFragment();
    for ( let i = newEntries.length - 1; i >= 0; i-- ) {
        if ( matches(newEntries[i], tabFilter, needle) ) {
            fragment.append(buildRow(newEntries[i], true));
        }
    }
    tbody.prepend(fragment);
    while ( tbody.childElementCount > MAX_ROWS ) {
        tbody.lastElementChild.remove();
    }
    renderEmpty();
}

/******************************************************************************/

async function poll() {
    const result = await send('aegis:log', { after: lastSeq });
    if ( result instanceof Object === false ) { return; }
    live = result.live;
    $('#activityNotLive').hidden = live;
    $('#navLive').hidden = live === false;
    if ( result.seq < lastSeq ) {
        // Log was cleared elsewhere
        entries = [];
        lastSeq = 0;
        return poll();
    }
    lastSeq = result.seq;
    if ( result.entries.length === 0 ) { return; }
    const first = entries.length === 0;
    entries.push(...result.entries);
    if ( entries.length > MAX_ENTRIES ) {
        entries.splice(0, entries.length - MAX_ENTRIES);
    }
    if ( first ) {
        renderAll();
    } else {
        prependNew(result.entries);
    }
}

function startPolling() {
    clearInterval(timer);
    if ( frozen ) { return; }
    timer = setInterval(poll, 1000);
}

async function renderTabs(selected) {
    const select = $('#activityTab');
    const previous = selected ?? select.value;
    const tabs = await browser.tabs.query({});
    const options = [ new Option('All tabs', '') ];
    for ( const tab of tabs ) {
        if ( /^https?:/.test(tab.url ?? '') === false ) { continue; }
        let host = '';
        try { host = new URL(tab.url).hostname; } catch { }
        const title = tab.title ? `${tab.title.slice(0, 48)}${tab.title.length > 48 ? '…' : ''}` : host;
        options.push(new Option(`${title} — ${host}`, `${tab.id}`));
    }
    options.push(new Option('Outside tabs (background requests)', '-1'));
    select.replaceChildren(...options);
    select.value = options.some(o => o.value === previous) ? previous : '';
}

/******************************************************************************/

export async function init() {
    const details = await send('getRulesetDetails') ?? [];
    rulesetNames = new Map(details.map(r => [ r.id, shortListName(r) ]));

    $('#activityTab').addEventListener('change', renderAll);
    $('#activitySearch').addEventListener('input', renderAll);
    $('#activityKinds').addEventListener('click', ev => {
        const chip = ev.target.closest('.chip-toggle');
        if ( chip === null ) { return; }
        const on = chip.getAttribute('aria-pressed') !== 'true';
        chip.setAttribute('aria-pressed', `${on}`);
        if ( on ) { kinds.add(chip.dataset.kind); } else { kinds.delete(chip.dataset.kind); }
        renderAll();
    });
    $('#activityFreeze').addEventListener('click', ev => {
        frozen = !frozen;
        const button = ev.currentTarget;
        button.setAttribute('aria-pressed', `${frozen}`);
        button.innerHTML = icon(frozen ? 'play' : 'pause', 'sm');
        button.append(frozen ? 'Resume' : 'Pause');
        button.classList.toggle('primary', frozen);
        startPolling();
        if ( frozen === false ) { poll(); }
    });
    $('#activityClear').addEventListener('click', async ( ) => {
        await send('aegis:clearLog');
        entries = [];
        renderAll();
    });
    addEventListener('focus', ( ) => {
        if ( $('.page[data-page="activity"]').hidden === false ) { renderTabs(); }
    });
}

export async function show(ctx, params) {
    await renderTabs(params.get('tab') ?? undefined);
    await poll();
    renderAll();
    startPolling();
}

export function hide() {
    clearInterval(timer);
}

