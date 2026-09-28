/*******************************************************************************

    Aegis — pause protection everywhere

    Pausing saves the current filtering modes, then switches every site to
    "no filtering". Resuming restores the saved filtering modes. A pause can
    be timed, in which case an alarm resumes protection automatically.

*******************************************************************************/

import {
    browser,
    localRead, localRemove, localWrite,
} from '../ext.js';

import {
    getDefaultFilteringMode,
    getFilteringModeDetails,
    setFilteringModeDetails,
} from '../mode-manager.js';

import { broadcastMessage } from '../utils.js';
import { registerContentScripts } from '../scripting-manager.js';
import { registerUserScripts } from '../compiled-filters.js';

/******************************************************************************/

const STORAGE_KEY = 'aegis.pause';
const ALARM_NAME = 'aegis:resume';

const PAUSED_MODES = {
    none: [ 'all-urls' ],
    basic: [],
    optimal: [],
    complete: [],
};

let pendingOp = Promise.resolve();

const serialized = fn => (...args) => {
    pendingOp = pendingOp.then(( ) => fn(...args));
    return pendingOp;
};

/******************************************************************************/

export async function getPauseState() {
    const state = await localRead(STORAGE_KEY);
    if ( state instanceof Object === false ) {
        return { paused: false, until: 0 };
    }
    return { paused: true, until: state.until || 0 };
}

async function applyModes(modes) {
    await setFilteringModeDetails(modes);
    await Promise.all([ registerContentScripts(), registerUserScripts() ]);
    const defaultFilteringMode = await getDefaultFilteringMode();
    broadcastMessage({ defaultFilteringMode });
}

async function notify() {
    const state = await getPauseState();
    broadcastMessage({ aegisPause: state });
    return state;
}

/******************************************************************************/

// minutes: 0 means "until resumed"
export const pause = serialized(async (minutes = 0) => {
    const before = await localRead(STORAGE_KEY);
    const until = minutes > 0 ? Date.now() + minutes * 60000 : 0;
    if ( before instanceof Object ) {
        await localWrite(STORAGE_KEY, { ...before, until });
    } else {
        const snapshot = await getFilteringModeDetails(true);
        await localWrite(STORAGE_KEY, { snapshot, until });
        await applyModes(PAUSED_MODES);
    }
    await browser.alarms.clear(ALARM_NAME);
    if ( until !== 0 ) {
        browser.alarms.create(ALARM_NAME, { when: until });
    }
    return notify();
});

export const resume = serialized(async ( ) => {
    const state = await localRead(STORAGE_KEY);
    await browser.alarms.clear(ALARM_NAME);
    if ( state instanceof Object === false ) { return notify(); }
    await applyModes(state.snapshot ?? {
        none: [], basic: [], optimal: [ 'all-urls' ], complete: [],
    });
    await localRemove(STORAGE_KEY);
    return notify();
});

// Alarms are not guaranteed to survive a browser restart
export async function checkPauseExpiry() {
    const { paused, until } = await getPauseState();
    if ( paused === false || until === 0 ) { return; }
    if ( until <= Date.now() ) {
        return resume();
    }
    const alarm = await browser.alarms.get(ALARM_NAME);
    if ( alarm === undefined ) {
        browser.alarms.create(ALARM_NAME, { when: until });
    }
}

export function isPauseAlarm(alarm) {
    return alarm?.name === ALARM_NAME;
}
