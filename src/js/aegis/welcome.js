/*******************************************************************************

    Aegis — welcome page (first install)

*******************************************************************************/

import {
    $, $$,
    browser,
    hydrateIcons,
    icon,
    send,
    toast,
} from './lib/ui.js';

/******************************************************************************/

const EXTRAS = [
    { id: 'annoyances-cookies', icon: 'cookie', title: 'Hide cookie banners', desc: 'No more consent pop-ups on every site.' },
    { id: 'annoyances-overlays', icon: 'overlay', title: 'Hide pop-ups & overlays', desc: 'Newsletter boxes, sign-in nags, page covers.' },
    { id: 'annoyances-notifications', icon: 'bell', title: 'Hide notification prompts', desc: '“Allow notifications?” banners.' },
    { id: 'annoyances-widgets', icon: 'message', title: 'Hide chat bubbles', desc: 'Support chat widgets in the corner.' },
    { id: 'annoyances-social', icon: 'share', title: 'Hide social widgets', desc: 'Share buttons and social embeds.' },
    { id: 'adguard-spyware-url', icon: 'link', title: 'Clean tracking from links', desc: 'Strips utm_source and similar tags.' },
];

let enabled = new Set();
let applyTimer;

/******************************************************************************/

function renderExtras(details) {
    const known = new Set(details.map(r => r.id));
    $('#extras').replaceChildren(...EXTRAS.filter(e => known.has(e.id)).map(extra => {
        const label = document.createElement('label');
        label.className = 'extra';
        label.innerHTML = `
            <span class="extra-icon">${icon(extra.icon)}</span>
            <span class="extra-text"><strong></strong><span></span></span>
            <span class="switch"><input type="checkbox"><span></span></span>`;
        label.querySelector('strong').textContent = extra.title;
        label.querySelector('.extra-text > span').textContent = extra.desc;
        const input = label.querySelector('input');
        input.dataset.id = extra.id;
        input.checked = enabled.has(extra.id);
        return label;
    }));
}

// Regional lists enabled automatically from the browser language
function renderLanguageNote(details) {
    const reFlags = /[\u{1F1E6}-\u{1F1FF}]{2}/gu;
    const regional = details.filter(r =>
        enabled.has(r.id) && typeof r.lang === 'string' && r.group !== 'imported'
    );
    if ( regional.length === 0 ) { return; }
    const note = $('#langNote');
    const regionNames = new Intl.DisplayNames([ 'en' ], { type: 'region' });
    const countries = new Set();
    for ( const r of regional ) {
        for ( const m of r.name.matchAll(reFlags) ) {
            const cc = Array.from(m[0], c => String.fromCharCode(c.codePointAt(0) - 0x1F1E6 + 97)).join('');
            countries.add(cc);
        }
    }
    const [ first ] = countries;
    if ( first ) {
        const img = document.createElement('img');
        img.src = `/img/flags-of-the-world/${first}.png`;
        img.alt = '';
        note.append(img);
    }
    const names = Array.from(countries).slice(0, 3).map(cc => {
        try { return regionNames.of(cc.toUpperCase()); } catch { return cc.toUpperCase(); }
    });
    note.append(`Ad filters for websites in ${names.join(', ')} are on, based on your browser’s language.`);
    note.hidden = false;
}

async function apply() {
    const next = new Set(enabled);
    for ( const input of $$('#extras input') ) {
        if ( input.checked ) { next.add(input.dataset.id); } else { next.delete(input.dataset.id); }
    }
    await send('applyRulesets', { enabledRulesets: Array.from(next) });
    enabled = next;
    toast('Saved, it applies right away');
}

/******************************************************************************/

async function init() {
    hydrateIcons();
    const [ enabledRulesets, details ] = await Promise.all([
        send('getEnabledRulesets'),
        send('getRulesetDetails'),
    ]);
    enabled = new Set(enabledRulesets ?? []);
    renderExtras(details ?? []);
    renderLanguageNote(details ?? []);

    $('#extras').addEventListener('change', ( ) => {
        clearTimeout(applyTimer);
        applyTimer = setTimeout(( ) => {
            applyTimer = undefined;
            apply();
        }, 500);
    });

    $('#done').addEventListener('click', async ( ) => {
        if ( applyTimer !== undefined ) {
            clearTimeout(applyTimer);
            await apply();
        }
        const tab = await browser.tabs.getCurrent();
        if ( tab?.id !== undefined ) {
            browser.tabs.remove(tab.id);
        } else {
            self.close();
        }
    });
}

init();
