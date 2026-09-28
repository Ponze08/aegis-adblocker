/*******************************************************************************

    Aegis — dashboard: about

*******************************************************************************/

import { $, browser, toast } from '../lib/ui.js';

/******************************************************************************/

async function diagnostics() {
    try {
        const { getTroubleshootingInfo } = await import('../../troubleshooting.js');
        const text = await getTroubleshootingInfo();
        return text.replace(/__MSG_extName__/g, 'Aegis');
    } catch (reason) {
        return `Could not collect troubleshooting information: ${reason}`;
    }
}

export function init() {
    $('#aboutVersion').textContent = browser.runtime.getManifest().version;
    $('#copyDiagnostics').addEventListener('click', async ( ) => {
        await navigator.clipboard.writeText($('#diagnostics').textContent);
        toast('Copied to the clipboard');
    });
}

export async function show() {
    $('#diagnostics').textContent = await diagnostics();
}
