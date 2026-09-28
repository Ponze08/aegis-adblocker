/*******************************************************************************

    Aegis — dashboard shell: navigation, shared state, pause controls

*******************************************************************************/

import {
    $, $$,
    LEVELS,
    browser,
    durationText,
    hydrateIcons,
    icon,
    onBroadcast,
    send,
} from '../lib/ui.js';

import * as about from './about.js';
import * as activity from './activity.js';
import * as filters from './filters.js';
import * as lists from './lists.js';
import * as overview from './overview.js';
import * as protection from './protection.js';
import * as settings from './settings.js';
import * as sites from './sites.js';

/******************************************************************************/

const PAGES = { overview, protection, lists, sites, filters, activity, settings, about };

// Shared dashboard state
export const ctx = {
    data: {},               // engine options (getOptionsPageData)
    pause: { paused: false, until: 0 },
    modes: { none: [], basic: [], optimal: [], complete: [] },

    async reloadData() {
        const data = await send('getOptionsPageData');
        if ( data instanceof Object ) { this.data = data; }
        return this.data;
    },
    async reloadModes() {
        const modes = await send('getFilteringModeDetails');
        if ( modes instanceof Object ) { this.modes = modes; }
        return this.modes;
    },
    levelName(level = this.data.defaultFilteringMode) {
        return LEVELS[level]?.name ?? 'Standard';
    },
};

/******************************************************************************/

// Confirmation dialog, resolves to true when confirmed
export function confirmDialog({ title, text, ok = 'Confirm', danger = true }) {
    const dialog = $('#confirmDialog');
    $('#confirmTitle').textContent = title;
    $('#confirmText').textContent = text;
    const okButton = $('#confirmOk');
    okButton.textContent = ok;
    okButton.className = `btn ${danger ? 'danger' : 'primary'}`;
    dialog.returnValue = '';
    dialog.showModal();
    return new Promise(resolve => {
        dialog.addEventListener('close', ( ) => {
            resolve(dialog.returnValue === 'ok');
        }, { once: true });
    });
}

// Small dropdown menu anchored to an element
export function openMenu(anchor, items) {
    closeMenu();
    const menu = document.createElement('div');
    menu.className = 'popover-menu';
    menu.setAttribute('role', 'menu');
    for ( const item of items ) {
        if ( item.title ) {
            const title = document.createElement('div');
            title.className = 'menu-title';
            title.textContent = item.title;
            menu.append(title);
            continue;
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('role', 'menuitem');
        button.innerHTML = icon(item.icon ?? 'chevron-right', 'sm');
        button.append(item.label);
        button.addEventListener('click', ( ) => {
            closeMenu();
            item.action();
        });
        menu.append(button);
    }
    document.body.append(menu);
    const rect = anchor.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const top = rect.top - menuRect.height - 8 > 8
        ? rect.top - menuRect.height - 8
        : rect.bottom + 8;
    menu.style.top = `${top}px`;
    menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - menuRect.width - 8))}px`;
    menu.querySelector('button')?.focus();
    setTimeout(( ) => {
        document.addEventListener('click', closeMenu, { once: true });
    });
}

function closeMenu() {
    $('.popover-menu')?.remove();
}

document.addEventListener('keydown', ev => {
    if ( ev.key === 'Escape' ) { closeMenu(); }
});

/******************************************************************************/

// Pause everywhere

export async function setPaused(minutes) {
    const result = minutes === null
        ? await send('aegis:resume')
        : await send('aegis:pause', { minutes });
    if ( result instanceof Object ) {
        ctx.pause = result;
        renderPause();
    }
}

function pauseMenuItems() {
    return [
        { title: 'Pause protection on all sites' },
        { label: 'For 15 minutes', icon: 'clock', action: ( ) => setPaused(15) },
        { label: 'For 1 hour', icon: 'clock', action: ( ) => setPaused(60) },
        { label: 'Until I resume', icon: 'pause', action: ( ) => setPaused(0) },
    ];
}

function renderPause() {
    const { paused, until } = ctx.pause;
    document.body.classList.toggle('paused', paused);
    $('#pauseBanner').hidden = paused === false;
    $('#pauseBannerSub').textContent = until
        ? `Resumes automatically in ${durationText(until - Date.now())}.`
        : 'It stays paused until you resume it.';
    $('#sidebarStatusTitle').textContent = paused ? 'Protection paused' : 'Protection active';
    $('#sidebarStatusSub').textContent = paused
        ? until ? `Resumes in ${durationText(until - Date.now())}` : 'On all sites'
        : `${ctx.levelName()} on all sites`;
    const button = $('#sidebarPause');
    button.innerHTML = icon(paused ? 'play' : 'pause', 'sm');
    button.append(paused ? 'Resume' : 'Pause');
    button.classList.toggle('primary', paused);
}

/******************************************************************************/

function renderNavCounts() {
    const { enabledRulesets = [] } = ctx.data;
    $('#navListCount').textContent = enabledRulesets.length || '';
    const { none, basic, optimal, complete } = ctx.modes;
    const count = [ ...none, ...basic, ...optimal, ...complete ]
        .filter(a => a !== 'all-urls').length;
    $('#navSiteCount').textContent = count || '';
}

export function refreshShell() {
    renderPause();
    renderNavCounts();
}

/******************************************************************************/

// Router: #page or #page?param=value

const initialized = new Set();
let currentPage;

async function route() {
    const [ name, query = '' ] = location.hash.slice(1).split('?');
    const page = PAGES[name] ? name : 'overview';
    const params = new URLSearchParams(query);

    if ( currentPage && currentPage !== page ) {
        PAGES[currentPage].hide?.();
    }
    currentPage = page;

    for ( const link of $$('.nav a') ) {
        link.classList.toggle('active', link.dataset.page === page);
        if ( link.dataset.page === page ) {
            link.setAttribute('aria-current', 'page');
        } else {
            link.removeAttribute('aria-current');
        }
    }
    for ( const section of $$('.page') ) {
        section.hidden = section.dataset.page !== page;
    }
    const module = PAGES[page];
    if ( initialized.has(page) === false ) {
        initialized.add(page);
        await module.init?.(ctx);
    }
    await module.show?.(ctx, params);
    document.title = `${$('.nav a.active')?.textContent.trim() ?? 'Dashboard'} · Aegis`;
    window.scrollTo(0, 0);
}

/******************************************************************************/

function onEngineBroadcast(message) {
    let shell = false;
    for ( const key of [
        'defaultFilteringMode', 'hasOmnipotence', 'autoReload', 'showBlockedCount',
        'strictBlockMode', 'popupBlockMode', 'enabledRulesets', 'developerMode',
    ] ) {
        if ( message[key] === undefined ) { continue; }
        ctx.data[key] = message[key];
        shell = true;
    }
    if ( message.filteringModeDetails ) {
        const d = message.filteringModeDetails;
        ctx.modes = {
            none: Array.from(d.none ?? []),
            basic: Array.from(d.basic ?? []),
            optimal: Array.from(d.optimal ?? []),
            complete: Array.from(d.complete ?? []),
        };
        shell = true;
    }
    if ( message.aegisPause ) {
        ctx.pause = message.aegisPause;
        shell = true;
    }
    if ( shell ) { refreshShell(); }
    for ( const [ name, module ] of Object.entries(PAGES) ) {
        if ( initialized.has(name) ) { module.onBroadcast?.(ctx, message); }
    }
}

/******************************************************************************/

async function start() {
    hydrateIcons();

    const [ , , pause ] = await Promise.all([
        ctx.reloadData(),
        ctx.reloadModes(),
        send('aegis:pauseState'),
    ]);
    if ( pause instanceof Object ) { ctx.pause = pause; }
    refreshShell();

    $('#sidebarPause').addEventListener('click', ev => {
        ev.stopPropagation();
        if ( ctx.pause.paused ) { return setPaused(null); }
        openMenu(ev.currentTarget, pauseMenuItems());
    });
    $('#pauseBannerResume').addEventListener('click', ( ) => setPaused(null));

    // Keep the pause countdown fresh
    setInterval(( ) => {
        if ( ctx.pause.paused && ctx.pause.until ) {
            if ( ctx.pause.until <= Date.now() ) {
                send('aegis:pauseState').then(state => {
                    if ( state instanceof Object ) { ctx.pause = state; renderPause(); }
                });
            }
            renderPause();
        }
    }, 15000);

    onBroadcast(onEngineBroadcast);
    addEventListener('hashchange', route);
    await route();
    document.body.classList.remove('loading');
}

start().catch(reason => {
    console.error(reason);
    document.body.classList.remove('loading');
});

export { browser };
