/*******************************************************************************

    Aegis — popup

*******************************************************************************/

import {
    $, $$,
    CATEGORY_META,
    CATEGORY_ORDER,
    LEVELS,
    animateNumber,
    browser,
    compact,
    durationText,
    fmt,
    hydrateIcons,
    send,
    setupSeg,
} from './lib/ui.js';

import punycode from '../punycode.js';
import { setIcon } from './lib/icons.js';

/******************************************************************************/

const state = {
    tab: null,
    url: null,
    hostname: '',
    na: false,
    level: 0,
    defaultLevel: 2,
    hasOmnipotence: true,
    autoReload: true,
    customFilters: 0,
    paused: false,
    pauseUntil: 0,
    live: true,
};

// Pages where extensions cannot run
const RESTRICTED_HOSTS = new Set([
    'chromewebstore.google.com',
    'chrome.google.com',
    'microsoftedge.microsoft.com',
]);

let levelSeg;

/******************************************************************************/

function renderStatus() {
    const body = document.body;
    let status;
    if ( state.na ) {
        status = 'na';
    } else if ( state.paused ) {
        status = 'paused';
    } else {
        status = state.level === 0 ? 'off' : 'on';
    }
    body.dataset.state = status;
    $('#naPanel').hidden = status !== 'na';
    $('#pausedPanel').hidden = status !== 'paused';

    const orb = $('#orb');
    const title = $('#statusTitle');
    const hostname = $('#hostname');
    orb.disabled = status === 'na';

    switch ( status ) {
    case 'on':
        setIcon($('#orbIcon'), 'shield-check');
        title.textContent = 'You’re protected';
        orb.title = 'Turn protection off for this site';
        break;
    case 'off':
        setIcon($('#orbIcon'), 'shield-off');
        title.textContent = 'Protection is off';
        orb.title = 'Turn protection on for this site';
        break;
    case 'paused':
        setIcon($('#orbIcon'), 'pause');
        title.textContent = 'Protection paused';
        orb.title = 'Resume protection';
        break;
    default:
        setIcon($('#orbIcon'), 'shield');
        title.textContent = 'Nothing to protect here';
        orb.title = '';
        break;
    }

    if ( status === 'paused' ) {
        hostname.textContent = state.pauseUntil
            ? `On all sites · resumes in ${durationText(state.pauseUntil - Date.now())}`
            : 'On all sites, until you resume';
    } else if ( status === 'na' ) {
        hostname.textContent = state.url?.protocol === 'file:' ? 'Local file' : 'Browser page';
    } else {
        hostname.textContent = punycode.toUnicode(state.hostname);
    }

    const pauseButton = $('#pauseMenuButton');
    setIcon($('.icon', pauseButton), state.paused ? 'play' : 'pause');
    pauseButton.title = state.paused ? 'Resume protection' : 'Pause protection everywhere';
}

function renderLevel() {
    levelSeg.select(state.level);
    for ( const button of $$('#levelSeg button') ) {
        const isDefault = Number(button.dataset.value) === state.defaultLevel;
        button.classList.toggle('is-default', isDefault);
        button.title = isDefault ? 'Your default level' : '';
    }
    const meta = LEVELS[state.level];
    const desc = $('#levelDesc');
    desc.textContent = meta.summary;
    desc.title = meta.detail;

    const chip = $('#levelChip');
    const isDefault = state.level === state.defaultLevel;
    chip.textContent = isDefault ? 'Your default' : 'Custom for this site';
    chip.classList.toggle('accent', isDefault === false);

    for ( const button of $$('[data-fix-level]') ) {
        button.disabled = state.level <= Number(button.dataset.fixLevel);
    }
    $('#toolUnpick').disabled = state.customFilters === 0;
}

/******************************************************************************/

function renderStats(stats) {
    if ( stats instanceof Object === false ) { return; }
    state.live = stats.live;
    animateNumber($('#blockedCount'), stats.blocked, { format: compact });

    const bar = $('#catbar');
    const legend = $('#legend');
    const present = CATEGORY_ORDER.filter(cat => stats.cats[cat] > 0);
    bar.replaceChildren(...present.map(cat => {
        const span = document.createElement('span');
        span.className = cat;
        span.style.flexGrow = `${stats.cats[cat]}`;
        return span;
    }));
    bar.setAttribute('aria-label', present.map(cat =>
        `${CATEGORY_META[cat].label}: ${stats.cats[cat]}`
    ).join(', ') || 'Nothing blocked');

    const items = present.map(cat => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="dot ${cat}"></span><b class="num"></b>`;
        li.querySelector('b').textContent = fmt(stats.cats[cat]);
        li.append(CATEGORY_META[cat].label);
        return li;
    });
    if ( stats.cleaned > 0 ) {
        const li = document.createElement('li');
        li.title = 'Tracking parameters removed from links';
        li.innerHTML = '<span class="dot cleaned"></span><b class="num"></b>';
        li.querySelector('b').textContent = fmt(stats.cleaned);
        li.append(stats.cleaned === 1 ? 'Link cleaned' : 'Links cleaned');
        items.push(li);
    }
    if ( items.length === 0 ) {
        const li = document.createElement('li');
        li.className = 'empty';
        li.textContent = state.level === 0
            ? 'Nothing is blocked while protection is off.'
            : 'Nothing blocked on this page so far.';
        items.push(li);
    }
    legend.replaceChildren(...items);

    const toggle = $('#detailsToggle');
    toggle.hidden = stats.domains.length === 0 && state.live;
    renderDomains(stats.domains);
}

function renderDomains(domains) {
    const list = $('#domains');
    if ( state.live === false ) {
        list.innerHTML = '<li class="none">Per-domain details need Aegis to be loaded unpacked (developer mode).</li>';
        return;
    }
    list.replaceChildren(...domains.map(({ domain, count, category }) => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="dot ${category}"></span><span class="domain"></span><span class="kind"></span><span class="count"></span>`;
        li.querySelector('.domain').textContent = punycode.toUnicode(domain);
        li.querySelector('.domain').title = domain;
        li.querySelector('.kind').textContent = CATEGORY_META[category]?.label ?? '';
        li.querySelector('.count').textContent = fmt(count);
        return li;
    }));
}

async function refreshStats() {
    if ( state.na || state.tab === null ) { return; }
    const stats = await send('aegis:tabStats', { tabId: state.tab.id });
    renderStats(stats);
}

async function refreshGlobal() {
    const stats = await send('aegis:stats');
    if ( stats instanceof Object === false ) { return; }
    animateNumber($('#totalBlocked'), stats.total, { format: compact });
    animateNumber($('#todayBlocked'), stats.today, { format: compact });
}

/******************************************************************************/

function reloadTab() {
    if ( state.autoReload !== true || state.tab === null ) { return; }
    const { id, url } = state.tab;
    const justReload = state.url.href === url;
    setTimeout(( ) => {
        if ( justReload ) {
            browser.tabs.reload(id);
        } else {
            browser.tabs.update(id, { url: state.url.href });
        }
    }, 1000);
}

function celebrate() {
    document.body.classList.remove('changed');
    void document.body.offsetWidth;
    document.body.classList.add('changed');
}

async function changeLevel(afterLevel) {
    if ( state.na || state.paused ) { return; }
    const beforeLevel = state.level;
    if ( afterLevel === beforeLevel ) { return; }

    // Standard/Strict need permission to act on the site's pages
    if ( afterLevel > 1 && state.hasOmnipotence === false ) {
        if ( beforeLevel <= 1 ) {
            send('setPendingFilteringMode', {
                tabId: state.tab.id,
                url: state.url.href,
                hostname: state.hostname,
                beforeLevel,
                afterLevel,
            });
        }
        let granted = false;
        try {
            granted = await browser.permissions.request({
                origins: [ `*://*.${state.hostname}/*` ],
            });
        } catch {
        }
        if ( granted !== true ) {
            renderLevel();
            return;
        }
    }

    document.body.classList.add('busy');
    const actualLevel = await send('setFilteringMode', {
        hostname: state.hostname,
        level: afterLevel,
    });
    document.body.classList.remove('busy');
    state.level = typeof actualLevel === 'number' ? actualLevel : beforeLevel;
    renderStatus();
    renderLevel();
    celebrate();
    if ( state.level !== beforeLevel ) {
        reloadTab();
    }
}

let pauseInFlight = false;

async function setPaused(minutes) {
    if ( pauseInFlight ) { return; }
    pauseInFlight = true;
    const pauseButton = $('#pauseMenuButton');
    pauseButton.disabled = true;
    // Show the new state right away: the engine can take a few seconds to
    // switch every site over (notably on Edge). Reverted if it fails.
    const before = { paused: state.paused, until: state.pauseUntil };
    state.paused = minutes !== null;
    state.pauseUntil = minutes ? Date.now() + minutes * 60000 : 0;
    renderStatus();
    celebrate();
    document.body.classList.add('busy');
    const result = minutes === null
        ? await send('aegis:resume')
        : await send('aegis:pause', { minutes });
    document.body.classList.remove('busy');
    pauseButton.disabled = false;
    pauseInFlight = false;
    if ( result instanceof Object ) {
        state.paused = result.paused;
        state.pauseUntil = result.until;
    } else {
        state.paused = before.paused;
        state.pauseUntil = before.until;
    }
    renderStatus();
    if ( state.na === false && result instanceof Object ) { reloadTab(); }
}

/******************************************************************************/

function runTool(files) {
    if ( state.tab === null ) { return; }
    browser.scripting.executeScript({
        files,
        target: { tabId: state.tab.id },
    }).finally(( ) => {
        self.close();
    });
}

function setupEvents() {
    $('#orb').addEventListener('click', ( ) => {
        if ( state.paused ) { return setPaused(null); }
        if ( state.level !== 0 ) { return changeLevel(0); }
        changeLevel(state.defaultLevel || 2);
    });

    levelSeg = setupSeg($('#levelSeg'), value => {
        changeLevel(Number(value));
    });

    const menu = $('#pauseMenu');
    const menuButton = $('#pauseMenuButton');
    const closeMenu = ( ) => {
        menu.hidden = true;
        menuButton.setAttribute('aria-expanded', 'false');
    };
    menuButton.addEventListener('click', ev => {
        ev.stopPropagation();
        if ( state.paused ) { return setPaused(null); }
        menu.hidden = !menu.hidden;
        menuButton.setAttribute('aria-expanded', `${!menu.hidden}`);
        if ( menu.hidden === false ) { $('button', menu).focus(); }
    });
    menu.addEventListener('click', ev => {
        const item = ev.target.closest('[data-minutes]');
        if ( item === null ) { return; }
        closeMenu();
        setPaused(Number(item.dataset.minutes));
    });
    document.addEventListener('click', ev => {
        if ( ev.target.closest('.menu-wrap') === null ) { closeMenu(); }
    });
    document.addEventListener('keydown', ev => {
        if ( ev.key === 'Escape' && menu.hidden === false ) {
            ev.preventDefault();
            closeMenu();
            menuButton.focus();
        }
    });

    $('#resumeButton').addEventListener('click', ( ) => setPaused(null));

    $('#openDashboard').addEventListener('click', ( ) => {
        browser.runtime.openOptionsPage();
        self.close();
    });

    $('#detailsToggle').addEventListener('click', ev => {
        const details = $('#details');
        details.hidden = !details.hidden;
        ev.currentTarget.setAttribute('aria-expanded', `${!details.hidden}`);
    });

    $('#openActivity').addEventListener('click', ( ) => {
        const url = browser.runtime.getURL(`/dashboard.html#activity?tab=${state.tab?.id ?? ''}`);
        browser.tabs.create({ url });
        self.close();
    });

    $('#toolZap').addEventListener('click', ( ) => {
        runTool([ '/js/scripting/tool-overlay.js', '/js/scripting/zapper.js' ]);
    });
    $('#toolPick').addEventListener('click', ( ) => {
        runTool([
            '/js/scripting/css-procedural-api.js',
            '/js/scripting/tool-overlay.js',
            '/js/scripting/picker.js',
        ]);
    });
    $('#toolUnpick').addEventListener('click', ( ) => {
        runTool([
            '/js/scripting/css-procedural-api.js',
            '/js/scripting/tool-overlay.js',
            '/js/scripting/unpicker.js',
        ]);
    });
    $('#toolFix').addEventListener('click', ev => {
        const panel = $('#fixPanel');
        panel.hidden = !panel.hidden;
        ev.currentTarget.setAttribute('aria-expanded', `${!panel.hidden}`);
        if ( panel.hidden === false ) {
            panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    });
    $('#fixPanel').addEventListener('click', ev => {
        const button = ev.target.closest('[data-fix-level]');
        if ( button === null ) { return; }
        changeLevel(Number(button.dataset.fixLevel));
    });
}

/******************************************************************************/

async function init() {
    hydrateIcons();
    setupEvents();

    // popup.html?tab=<id> targets a specific tab (handy to test the popup
    // as a regular page)
    const forcedTabId = Number(new URLSearchParams(location.search).get('tab'));
    const [ tab ] = forcedTabId
        ? [ await browser.tabs.get(forcedTabId).catch(( ) => undefined) ]
        : await browser.tabs.query({ active: true, currentWindow: true });
    state.tab = tab ?? null;

    let url;
    try {
        url = new URL(tab.url);
        const strictBlockURL = browser.runtime.getURL('/strictblock.');
        if ( url.href.startsWith(strictBlockURL) ) {
            url = new URL(url.hash.slice(1));
        }
    } catch {
    }
    state.url = url ?? null;
    state.hostname = url?.hostname ?? '';
    state.na = url === undefined ||
        /^https?:$/.test(url.protocol) === false ||
        state.hostname === '' ||
        RESTRICTED_HOSTS.has(state.hostname);

    const [ panelData, pauseState, defaultLevel ] = await Promise.all([
        state.na ? undefined : send('popupPanelData', { origin: url.origin, hostname: state.hostname }),
        send('aegis:pauseState'),
        send('getDefaultFilteringMode'),
        refreshGlobal(),
    ]);

    if ( panelData instanceof Object ) {
        state.level = panelData.level;
        state.hasOmnipotence = panelData.hasOmnipotence;
        state.autoReload = panelData.autoReload;
        state.customFilters = panelData.hasCustomFilters || 0;
    } else {
        state.na = true;
    }
    if ( typeof defaultLevel === 'number' ) {
        state.defaultLevel = defaultLevel;
    }
    if ( pauseState instanceof Object ) {
        state.paused = pauseState.paused;
        state.pauseUntil = pauseState.until;
    }

    renderStatus();
    renderLevel();
    await refreshStats();
    document.body.classList.remove('loading');

    // Live updates while the popup is open
    setInterval(( ) => {
        refreshStats();
        if ( state.paused && state.pauseUntil ) { renderStatus(); }
    }, 1000);
    setInterval(refreshGlobal, 5000);
}

init().catch(reason => {
    console.error(reason);
    state.na = true;
    renderStatus();
    document.body.classList.remove('loading');
});
