/*******************************************************************************

    Aegis — dashboard: protection (default level, behavior, shortcuts)

*******************************************************************************/

import {
    $, $$,
    LEVELS,
    browser,
    icon,
    send,
    toast,
} from '../lib/ui.js';

import { refreshShell } from './main.js';

/******************************************************************************/

const isEdge = /\bEdg\//.test(navigator.userAgent);

const SWITCHES = [
    { id: 'optStrictBlock', key: 'strictBlockMode', what: 'setStrictBlockMode' },
    { id: 'optPopupBlock', key: 'popupBlockMode', what: 'setPopupBlockMode' },
    { id: 'optBadge', key: 'showBlockedCount', what: 'setShowBlockedCount' },
    { id: 'optAutoReload', key: 'autoReload', what: 'setAutoReload' },
];

/******************************************************************************/

function renderLevelCards(ctx) {
    const current = ctx.data.defaultFilteringMode;
    const paused = ctx.pause.paused;
    for ( const card of $$('#levelCards .level-card') ) {
        const level = Number(card.dataset.level);
        card.setAttribute('aria-checked', `${level === current}`);
        card.tabIndex = level === current || current === 0 && level === 2 ? 0 : -1;
        card.disabled = paused;
    }
    $('#levelCards').title = paused ? 'Resume protection to change the default level' : '';
}

function buildLevelCards(ctx) {
    const container = $('#levelCards');
    container.replaceChildren(...LEVELS.slice(1).map(meta => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'level-card';
        card.setAttribute('role', 'radio');
        card.dataset.level = `${meta.level}`;
        card.innerHTML = `
            <span class="level-icon">${icon(meta.icon)}</span>
            <span class="level-name"><strong></strong></span>
            <span class="summary"></span>
            <span class="detail"></span>
            <span class="check">${icon('check', 'xs')}</span>`;
        card.querySelector('strong').textContent = meta.name;
        card.querySelector('.summary').textContent = meta.summary;
        card.querySelector('.detail').textContent = meta.detail;
        if ( meta.level === 2 ) {
            const chip = document.createElement('span');
            chip.className = 'chip accent';
            chip.textContent = 'Recommended';
            card.querySelector('.level-name').append(chip);
        }
        return card;
    }));

    container.addEventListener('click', ev => {
        const card = ev.target.closest('.level-card');
        if ( card === null || card.disabled ) { return; }
        setDefaultLevel(ctx, Number(card.dataset.level));
    });
    container.addEventListener('keydown', ev => {
        if ( /^Arrow(Left|Right|Up|Down)$/.test(ev.key) === false ) { return; }
        ev.preventDefault();
        const forward = ev.key === 'ArrowRight' || ev.key === 'ArrowDown';
        const next = Math.min(3, Math.max(1, ctx.data.defaultFilteringMode + (forward ? 1 : -1)));
        $(`#levelCards [data-level="${next}"]`).focus();
        setDefaultLevel(ctx, next);
    });
}

async function setDefaultLevel(ctx, level) {
    if ( level === ctx.data.defaultFilteringMode ) { return; }
    // Standard and Strict need access to all sites. Must be requested
    // synchronously from the user gesture.
    if ( level > 1 && ctx.data.hasOmnipotence !== true ) {
        const granted = await browser.permissions.request({ origins: [ '<all_urls>' ] }).catch(( ) => false);
        if ( granted !== true ) {
            toast('Standard and Strict need access to all websites.', { type: 'error' });
            return;
        }
        ctx.data.hasOmnipotence = true;
    }
    const actual = await send('setDefaultFilteringMode', { level });
    if ( typeof actual === 'number' ) {
        ctx.data.defaultFilteringMode = actual;
    }
    renderLevelCards(ctx);
    refreshShell();
    toast(`Default protection set to ${LEVELS[ctx.data.defaultFilteringMode].name}`);
}

/******************************************************************************/

function renderSwitches(ctx) {
    const data = ctx.data;
    for ( const { id, key } of SWITCHES ) {
        $(`#${id}`).checked = data[key] === true;
    }
    const strict = $('#optStrictBlock');
    strict.disabled = data.hasOmnipotence !== true;
    strict.closest('.row').classList.toggle('disabled', strict.disabled);
    const badge = $('#optBadge');
    badge.disabled = data.canShowBlockedCount === false;
    badge.closest('.row').classList.toggle('disabled', badge.disabled);
}

/******************************************************************************/

async function renderShortcuts() {
    const commands = await browser.commands.getAll().catch(( ) => []);
    const labels = {
        '_execute_action': 'Open the Aegis popup',
        'enter-picker-mode': 'Hide an element on the page (element picker)',
        'enter-zapper-mode': 'Zap elements until the page is reloaded',
    };
    $('#shortcutList').replaceChildren(...commands.map(cmd => {
        const li = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = labels[cmd.name] ?? cmd.description ?? cmd.name;
        const keys = document.createElement('span');
        if ( cmd.shortcut ) {
            for ( const [ i, part ] of cmd.shortcut.split('+').entries() ) {
                if ( i !== 0 ) { keys.append(' + '); }
                const kbd = document.createElement('kbd');
                kbd.textContent = part;
                keys.append(kbd);
            }
        } else {
            keys.className = 'unset';
            keys.textContent = 'Not set';
        }
        li.append(name, keys);
        return li;
    }));
}

/******************************************************************************/

export function init(ctx) {
    buildLevelCards(ctx);

    for ( const { id, key, what } of SWITCHES ) {
        $(`#${id}`).addEventListener('change', async ev => {
            const state = ev.target.checked;
            await send(what, { state });
            ctx.data[key] = state;
        });
    }

    $('#editShortcuts').addEventListener('click', ( ) => {
        browser.tabs.create({
            url: isEdge ? 'edge://extensions/shortcuts' : 'chrome://extensions/shortcuts',
        });
    });
    addEventListener('focus', ( ) => {
        if ( $('.page[data-page="protection"]').hidden === false ) { renderShortcuts(); }
    });
}

export function show(ctx) {
    renderLevelCards(ctx);
    renderSwitches(ctx);
    return renderShortcuts();
}

export function onBroadcast(ctx) {
    renderLevelCards(ctx);
    renderSwitches(ctx);
}
