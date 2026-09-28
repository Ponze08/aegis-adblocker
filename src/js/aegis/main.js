/*******************************************************************************

    Aegis — service worker entry point

    Loads the uBlock Origin Lite engine (../background.js) and the Aegis
    extras. The stats module is imported first on purpose: it hooks the
    badge API before the engine configures it.

    Aegis messages use the `aegis:` prefix, which the engine's own message
    handler ignores.

*******************************************************************************/

import {
    clearLog,
    getGlobalStats,
    getLog,
    getTabStats,
    resetGlobalStats,
} from './stats.js';

import {
    checkPauseExpiry,
    getPauseState,
    isPauseAlarm,
    pause,
    resume,
} from './pause.js';

import {
    MODE_NONE,
    MODE_OPTIMAL,
    getDefaultFilteringMode,
    getFilteringMode,
    setFilteringMode,
} from '../mode-manager.js';

import { browser, runtime } from '../ext.js';
import { isFullyInitialized } from '../background.js';
import { registerContentScripts } from '../scripting-manager.js';
import { registerUserScripts } from '../compiled-filters.js';
import { rulesetConfig } from '../config.js';

/******************************************************************************/

const EXTENSION_ORIGIN = runtime.getURL('').replace(/\/$/, '').toLowerCase();

const hostnameFromURL = url => {
    try {
        const { protocol, hostname } = new URL(url);
        return /^https?:$/.test(protocol) ? hostname : '';
    } catch {
        return '';
    }
};

/******************************************************************************/

// Flip a site between "no filtering" and the default protection level

async function toggleSite(tab) {
    if ( tab?.id === undefined ) { return; }
    const { paused } = await getPauseState();
    if ( paused ) {
        await resume();
    } else {
        const hostname = hostnameFromURL(tab.url);
        if ( hostname === '' ) { return; }
        const level = await getFilteringMode(hostname);
        const afterLevel = level !== MODE_NONE
            ? MODE_NONE
            : await getDefaultFilteringMode() || MODE_OPTIMAL;
        await setFilteringMode(hostname, afterLevel);
        await Promise.all([ registerContentScripts(), registerUserScripts() ]);
    }
    if ( rulesetConfig.autoReload ) {
        setTimeout(( ) => {
            browser.tabs.reload(tab.id).catch(( ) => { });
        }, 1000);
    }
}

/******************************************************************************/

async function onMessage(request) {
    await isFullyInitialized;

    switch ( request.what ) {
    case 'aegis:tabStats':
        return getTabStats(request.tabId);
    case 'aegis:stats':
        return getGlobalStats();
    case 'aegis:resetStats':
        return resetGlobalStats();
    case 'aegis:log':
        return getLog(request.after);
    case 'aegis:clearLog':
        return clearLog();
    case 'aegis:pauseState':
        return getPauseState();
    case 'aegis:pause':
        return pause(request.minutes);
    case 'aegis:resume':
        return resume();
    default:
        break;
    }
}

runtime.onMessage.addListener((request, sender, callback) => {
    const what = request?.what;
    if ( typeof what !== 'string' || what.startsWith('aegis:') === false ) { return; }
    // Only Aegis's own pages may talk to this handler
    const origin = sender?.origin?.toLowerCase();
    if ( origin !== undefined && origin !== EXTENSION_ORIGIN ) { return; }
    onMessage(request).then(callback, reason => {
        callback({ error: `${reason}` });
    });
    return true;
});

/******************************************************************************/

browser.commands.onCommand.addListener((command, tab) => {
    if ( command !== 'aegis-toggle-site' ) { return; }
    isFullyInitialized.then(( ) => toggleSite(tab));
});

browser.alarms.onAlarm.addListener(alarm => {
    if ( isPauseAlarm(alarm) === false ) { return; }
    isFullyInitialized.then(( ) => resume());
});

runtime.onInstalled.addListener(details => {
    if ( details.reason !== 'install' ) { return; }
    browser.tabs.create({ url: '/welcome.html' });
});

isFullyInitialized.then(( ) => checkPauseExpiry());
