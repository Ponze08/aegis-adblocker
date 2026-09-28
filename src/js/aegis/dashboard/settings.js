/*******************************************************************************

    Aegis — dashboard: settings (appearance, backup, reset)

*******************************************************************************/

import {
    $,
    getThemePref,
    send,
    setThemePref,
    setupSeg,
    toast,
} from '../lib/ui.js';

import { confirmDialog, refreshShell, setPaused } from './main.js';

/******************************************************************************/

// Restoring filtering modes while paused would be undone by resuming
async function resumeIfPaused(ctx) {
    if ( ctx.pause.paused ) { await setPaused(null); }
}

async function afterRestore(ctx) {
    await Promise.all([ ctx.reloadData(), ctx.reloadModes() ]);
    refreshShell();
}

async function backup(ctx) {
    const api = await import('../../backup-restore.js');
    const data = await api.backupToObject(ctx.data);
    if ( data instanceof Object === false ) { return; }
    data.aegis = { theme: getThemePref() };
    const json = `${JSON.stringify(data, null, 2)}\n`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ json ], { type: 'application/json' }));
    a.download = `aegis-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(( ) => URL.revokeObjectURL(a.href), 1000);
    toast('Backup saved to your downloads');
}

async function restore(ctx, file) {
    let data;
    try {
        data = JSON.parse(await file.text());
    } catch {
    }
    if ( data instanceof Object === false ) {
        toast('This file is not an Aegis or uBO Lite backup', { type: 'error' });
        return;
    }
    const ok = await confirmDialog({
        title: 'Restore this backup?',
        text: 'Your current lists, site settings and filters will be replaced by the ones in the backup.',
        ok: 'Restore',
    });
    if ( ok !== true ) { return; }
    document.body.classList.add('busy');
    await resumeIfPaused(ctx);
    const api = await import('../../backup-restore.js');
    await api.restoreFromObject(data);
    if ( data.aegis?.theme ) {
        setThemePref(data.aegis.theme);
        themeSeg.select(data.aegis.theme);
    }
    await afterRestore(ctx);
    document.body.classList.remove('busy');
    toast('Backup restored');
}

let themeSeg;

/******************************************************************************/

export function init(ctx) {
    themeSeg = setupSeg($('#themeSeg'), value => setThemePref(value));
    themeSeg.select(getThemePref());

    $('#backupButton').addEventListener('click', ( ) => backup(ctx));
    $('#restoreButton').addEventListener('click', ( ) => {
        const input = $('#restoreFile');
        input.value = '';
        input.click();
    });
    $('#restoreFile').addEventListener('change', ev => {
        const file = ev.target.files?.[0];
        if ( file ) { restore(ctx, file); }
    });

    $('#resetStats').addEventListener('click', async ( ) => {
        const ok = await confirmDialog({
            title: 'Reset statistics?',
            text: 'All blocked counters and charts go back to zero. Your settings are not affected.',
            ok: 'Reset statistics',
        });
        if ( ok !== true ) { return; }
        await send('aegis:resetStats');
        toast('Statistics reset');
    });

    $('#resetAll').addEventListener('click', async ( ) => {
        const ok = await confirmDialog({
            title: 'Restore default settings?',
            text: 'Your site settings, custom filters, hidden elements and list choices will be removed. This cannot be undone, consider making a backup first.',
            ok: 'Restore defaults',
        });
        if ( ok !== true ) { return; }
        document.body.classList.add('busy');
        await resumeIfPaused(ctx);
        const api = await import('../../backup-restore.js');
        await api.restoreFromObject({});
        await afterRestore(ctx);
        document.body.classList.remove('busy');
        toast('Default settings restored');
    });
}

export function show() {
    themeSeg?.select(getThemePref());
}
