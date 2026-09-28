/*******************************************************************************

    Aegis — dashboard: filter lists

*******************************************************************************/

import {
    $, $$,
    filterCount,
    fmt,
    icon,
    send,
    toast,
} from '../lib/ui.js';

import { LIST_META } from '../lib/lists-meta.js';
import { confirmDialog, refreshShell } from './main.js';

/******************************************************************************/

const GROUPS = [
    { id: 'default', title: 'Recommended', icon: 'star', desc: 'The core lists, blocking most ads and trackers. Best kept on.' },
    { id: 'privacy', title: 'Privacy', icon: 'eye-off', desc: 'Extra protection against tracking.' },
    { id: 'malware', title: 'Security', icon: 'shield-alert', desc: 'Protection from malware, scams and dangerous sites.' },
    { id: 'annoyances', title: 'Annoyances', icon: 'sparkles', desc: 'Hide cookie banners, pop-ups and other distractions.' },
    { id: 'ads', title: 'More ad blocking', icon: 'ban', desc: 'Additional ad filters for specific cases.' },
    { id: 'regions', title: 'Languages & regions', icon: 'globe', desc: 'Ads specific to websites of a country or language.' },
    { id: 'misc', title: 'Other', icon: 'flask', desc: 'Specialized lists.' },
    { id: 'imported', title: 'Added by you', icon: 'link', desc: 'Lists you added from the web.' },
];

const reFlags = /[\u{1F1E6}-\u{1F1FF}]{2}/gu;
const regionNames = new Intl.DisplayNames([ 'en' ], { type: 'region' });

const userLangs = new Set([
    ...navigator.languages.map(l => l.split('-')[0]),
    navigator.language.split('-')[0],
]);

let enabledNow = new Set();
let applyTimer;
let applyChain = Promise.resolve();
let applyRevision = 0;
let showAllRegions = false;
let rulesetMap = new Map();
let pageCtx;

/******************************************************************************/

function groupOf(ruleset) {
    if ( ruleset.group === undefined ) {
        return typeof ruleset.lang === 'string' ? 'regions' : 'misc';
    }
    return ruleset.group;
}

function parseRegional(name) {
    const flags = Array.from(name.matchAll(reFlags), m =>
        Array.from(m[0], c => String.fromCharCode(c.codePointAt(0) - 0x1F1E6 + 97)).join('')
    );
    const pos = name.indexOf(': ');
    const title = pos !== -1 ? name.slice(pos + 2) : name.replace(reFlags, '').trim();
    return { flags, title };
}

function matchesUserLanguage(ruleset) {
    if ( typeof ruleset.lang !== 'string' ) { return false; }
    return ruleset.lang.split(/\s+/).some(l => userLangs.has(l));
}

function describe(ruleset) {
    const meta = LIST_META[ruleset.id];
    if ( meta ) { return { ...meta }; }
    if ( ruleset.group === 'imported' ) {
        let host = ruleset.id;
        try { host = new URL(ruleset.id).hostname; } catch { }
        return { name: ruleset.name || host, icon: 'link', desc: ruleset.id };
    }
    if ( groupOf(ruleset) === 'regions' ) {
        const { flags, title } = parseRegional(ruleset.name);
        const countries = flags.map(cc => {
            try { return regionNames.of(cc.toUpperCase()); } catch { return cc.toUpperCase(); }
        });
        return {
            name: title,
            flags,
            desc: countries.length ? `For websites in ${countries.join(', ')}` : '',
        };
    }
    return { name: ruleset.name, icon: 'layers', desc: '' };
}

/******************************************************************************/

function buildRow(ruleset) {
    const meta = describe(ruleset);
    const li = document.createElement('li');
    li.className = 'list-row';
    li.dataset.id = ruleset.id;

    let visual;
    if ( meta.flags?.length ) {
        visual = document.createElement('span');
        visual.className = 'list-flags';
        for ( const cc of meta.flags.slice(0, 2) ) {
            const img = document.createElement('img');
            img.src = `/img/flags-of-the-world/${cc}.png`;
            img.alt = cc.toUpperCase();
            visual.append(img);
        }
    } else {
        visual = document.createElement('span');
        visual.className = 'list-icon';
        visual.innerHTML = icon(meta.icon ?? 'layers');
    }

    const text = document.createElement('div');
    text.className = 'list-text';
    const name = document.createElement('div');
    name.className = 'list-name';
    const nameText = document.createElement('span');
    nameText.textContent = meta.name;
    name.append(nameText);
    if ( matchesUserLanguage(ruleset) ) {
        const chip = document.createElement('span');
        chip.className = 'chip accent';
        chip.textContent = 'Your language';
        name.append(chip);
    }
    text.append(name);
    if ( meta.desc ) {
        const desc = document.createElement('div');
        desc.className = 'list-desc';
        desc.textContent = meta.desc;
        text.append(desc);
    }
    const metaLine = document.createElement('div');
    metaLine.className = 'list-meta';
    const count = filterCount(ruleset);
    const parts = [];
    if ( count !== 0 ) { parts.push(`${fmt(count)} ${count === 1 ? 'filter' : 'filters'}`); }
    metaLine.textContent = parts.join(' · ');
    if ( ruleset.homeURL ) {
        if ( parts.length ) { metaLine.append(' · '); }
        const a = document.createElement('a');
        a.href = ruleset.homeURL;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = 'Website';
        metaLine.append(a);
    }
    if ( metaLine.childNodes.length ) { text.append(metaLine); }

    li.append(visual, text);

    if ( ruleset.group === 'imported' ) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'icon-btn sm remove-list';
        remove.title = 'Remove this list';
        remove.innerHTML = icon('trash', 'sm');
        li.append(remove);
    }

    const toggle = document.createElement('label');
    toggle.className = 'switch';
    toggle.title = `Turn ${meta.name} on or off`;
    toggle.innerHTML = '<input type="checkbox"><span></span>';
    const input = toggle.querySelector('input');
    input.checked = enabledNow.has(ruleset.id);
    input.setAttribute('aria-label', `${meta.name} filter list`);
    li.append(toggle);

    li.dataset.haystack = [ meta.name, meta.desc, ruleset.id, ruleset.name, ruleset.lang ?? '' ]
        .join(' ').toLowerCase();
    return li;
}

function buildGroup(group, rulesets) {
    const card = document.createElement('div');
    card.className = 'card list-group';
    card.dataset.group = group.id;
    card.innerHTML = `
        <div class="list-group-head">
            <span class="group-icon">${icon(group.icon)}</span>
            <div><h2></h2><p class="muted"></p></div>
            <span class="list-group-count"></span>
        </div>
        <ul class="list-rows"></ul>`;
    card.querySelector('h2').textContent = group.title;
    card.querySelector('.muted').textContent = group.desc;

    const rows = card.querySelector('.list-rows');
    const sorted = [ ...rulesets ];
    if ( group.id === 'regions' ) {
        sorted.sort((a, b) => {
            const rank = r => enabledNow.has(r.id) ? 0 : matchesUserLanguage(r) ? 1 : 2;
            return rank(a) - rank(b) || describe(a).name.localeCompare(describe(b).name);
        });
    }
    for ( const ruleset of sorted ) {
        const row = buildRow(ruleset);
        if ( group.id === 'regions' ) {
            row.classList.toggle('secondary', enabledNow.has(ruleset.id) === false && matchesUserLanguage(ruleset) === false);
        }
        rows.append(row);
    }
    if ( group.id === 'regions' ) {
        const more = document.createElement('div');
        more.className = 'show-more';
        more.innerHTML = '<button class="btn sm ghost" type="button"></button>';
        card.append(more);
    }
    return card;
}

/******************************************************************************/

function updateCounts() {
    for ( const card of $$('#listGroups .list-group') ) {
        const inputs = $$('.list-row input', card);
        const on = inputs.filter(i => i.checked).length;
        $('.list-group-count', card).textContent = `${on} of ${inputs.length} on`;
    }
    const total = $$('#listGroups .list-row input:checked').length;
    let filters = 0;
    for ( const input of $$('#listGroups .list-row input:checked') ) {
        filters += filterCount(rulesetMap.get(input.closest('.list-row').dataset.id));
    }
    $('#listsSummary').textContent =
        `${total} ${total === 1 ? 'list' : 'lists'} enabled, with ${fmt(filters)} filters. Changes apply instantly, no reload needed.`;
}

function applyRegionVisibility() {
    const card = $('#listGroups [data-group="regions"]');
    if ( card === null ) { return; }
    const searching = $('#listsSearch').value.trim() !== '';
    const hidden = $$('.list-row.secondary', card);
    for ( const row of hidden ) {
        row.hidden = showAllRegions === false && searching === false;
    }
    const button = $('.show-more button', card);
    button.parentElement.hidden = searching || hidden.length === 0;
    button.textContent = showAllRegions
        ? 'Show fewer regions'
        : `Show all ${$$('.list-row', card).length} regional lists`;
}

function applySearch() {
    const needle = $('#listsSearch').value.trim().toLowerCase();
    let anyMatch = false;
    for ( const card of $$('#listGroups .list-group') ) {
        let groupMatch = false;
        for ( const row of $$('.list-row', card) ) {
            const match = needle === '' || row.dataset.haystack.includes(needle);
            row.classList.toggle('search-miss', match === false);
            row.style.display = match ? '' : 'none';
            groupMatch ||= match;
        }
        card.hidden = groupMatch === false;
        anyMatch ||= groupMatch;
    }
    applyRegionVisibility();
    let empty = $('#listGroups .search-empty');
    if ( anyMatch === false ) {
        if ( empty === null ) {
            empty = document.createElement('div');
            empty.className = 'search-empty';
            $('#listGroups').append(empty);
        }
        empty.textContent = `No list matches “${needle}”.`;
    } else {
        empty?.remove();
    }
}

/******************************************************************************/

function setSaveState(state) {
    const elem = $('#listsSaveState');
    elem.className = `save-state ${state}`;
    if ( state === 'saving' ) {
        elem.innerHTML = `${icon('refresh', 'sm')}Applying…`;
    } else if ( state === 'saved' ) {
        elem.innerHTML = `${icon('check-circle', 'sm')}Saved`;
        setTimeout(( ) => {
            if ( elem.classList.contains('saved') ) { elem.textContent = ''; }
        }, 2000);
    } else {
        elem.textContent = '';
    }
}

function enforceMaximum(ctx) {
    const max = ctx.data.maxNumberOfEnabledRulesets ?? 50;
    const stock = $$('#listGroups .list-row').filter(row =>
        rulesetMap.get(row.dataset.id)?.group !== 'imported'
    );
    const count = stock.filter(row => $('input', row).checked).length;
    for ( const row of stock ) {
        const input = $('input', row);
        input.disabled = count >= max && input.checked === false;
        input.closest('.switch').title = input.disabled
            ? `The browser allows up to ${max} lists at once`
            : '';
    }
}

function apply(ctx, toRemove = []) {
    const enabledRulesets = $$('#listGroups .list-row')
        .filter(row => $('input', row).checked && toRemove.includes(row.dataset.id) === false)
        .map(row => row.dataset.id);
    const revision = ++applyRevision;
    setSaveState('saving');
    const run = async ( ) => {
        const result = await send('applyRulesets', {
            enabledRulesets,
            toRemove: toRemove.length ? toRemove : undefined,
        });
        const actualResult = await send('getEnabledRulesets');
        const actual = Array.isArray(actualResult) ? actualResult : Array.from(enabledNow);
        const actualSet = new Set(actual);
        const mismatch = actual.length !== enabledRulesets.length ||
            enabledRulesets.some(id => actualSet.has(id) === false);
        const message = result?.error || (mismatch
            ? 'Some lists could not be applied. Your browser may have reached its filter-list limit.'
            : '');

        enabledNow = actualSet;
        ctx.data.enabledRulesets = actual;
        const isLatest = revision === applyRevision && applyTimer === undefined;
        if ( isLatest ) {
            for ( const row of $$('#listGroups .list-row') ) {
                $('input', row).checked = actualSet.has(row.dataset.id);
            }
            updateCounts();
            enforceMaximum(ctx);
            const error = $('#listsError');
            error.hidden = message === '';
            $('div', error).textContent = message;
            setSaveState(message === '' ? 'saved' : '');
        }
        refreshShell();
        return message === '';
    };
    applyChain = applyChain.then(run, run);
    return applyChain;
}

function scheduleApply(ctx) {
    setSaveState('saving');
    clearTimeout(applyTimer);
    applyTimer = setTimeout(( ) => {
        applyTimer = undefined;
        apply(ctx);
    }, 700);
}

// Apply a pending change right away
function flushApply() {
    if ( applyTimer === undefined ) { return; }
    clearTimeout(applyTimer);
    applyTimer = undefined;
    apply(pageCtx);
}

/******************************************************************************/

async function render(ctx) {
    const [ enabled, details ] = await Promise.all([
        send('getEnabledRulesets'),
        send('getRulesetDetails'),
    ]);
    if ( Array.isArray(details) === false ) { return; }
    enabledNow = new Set(enabled ?? []);
    rulesetMap = new Map(details.map(r => [ r.id, r ]));

    const byGroup = new Map(GROUPS.map(g => [ g.id, [] ]));
    for ( const ruleset of details ) {
        byGroup.get(groupOf(ruleset))?.push(ruleset);
    }
    const cards = [];
    for ( const group of GROUPS ) {
        const rulesets = byGroup.get(group.id);
        if ( rulesets.length === 0 ) { continue; }
        cards.push(buildGroup(group, rulesets));
    }
    $('#listGroups').replaceChildren(...cards);
    $('#importedHint').hidden = byGroup.get('imported').length === 0;
    $('#importedUserScripts').hidden = ctx.data.supportsUserScripts !== false;
    updateCounts();
    enforceMaximum(ctx);
    applySearch();
}

/******************************************************************************/

export function init(ctx) {
    pageCtx = ctx;
    const groups = $('#listGroups');
    addEventListener('beforeunload', flushApply);

    groups.addEventListener('change', ev => {
        if ( ev.target.matches('.list-row input') === false ) { return; }
        updateCounts();
        enforceMaximum(ctx);
        scheduleApply(ctx);
    });

    groups.addEventListener('click', async ev => {
        if ( ev.target.closest('.show-more button') ) {
            showAllRegions = !showAllRegions;
            applyRegionVisibility();
            return;
        }
        const remove = ev.target.closest('.remove-list');
        if ( remove === null ) { return; }
        const row = remove.closest('.list-row');
        const name = $('.list-name span', row).textContent;
        const ok = await confirmDialog({
            title: 'Remove this list?',
            text: `“${name}” will be removed from Aegis. You can add it again later.`,
            ok: 'Remove',
        });
        if ( ok !== true ) { return; }
        row.classList.add('removing');
        clearTimeout(applyTimer);
        applyTimer = undefined;
        await apply(ctx, [ row.dataset.id ]);
        await render(ctx);
        const removed = rulesetMap.has(row.dataset.id) === false;
        toast(removed ? 'List removed' : 'The list could not be removed', {
            type: removed ? 'success' : 'error',
        });
    });

    $('#listsSearch').addEventListener('input', applySearch);

    $('#importListForm').addEventListener('submit', async ev => {
        ev.preventDefault();
        const input = $('#importListURL');
        const url = input.value.trim();
        if ( /^https?:\/\/\S+/.test(url) === false ) {
            toast('Please enter a web address starting with https://', { type: 'error' });
            return;
        }
        if ( rulesetMap.has(url) ) {
            toast('This list is already added', { type: 'error' });
            return;
        }
        const button = $('button', ev.currentTarget);
        button.disabled = true;
        setSaveState('saving');
        await send('importFilterList', { url });
        button.disabled = false;
        input.value = '';
        await render(ctx);
        setSaveState('saved');
        toast(rulesetMap.has(url) ? 'List added and applied' : 'The list could not be added', {
            type: rulesetMap.has(url) ? 'success' : 'error',
        });
    });

    $('#updateImported').addEventListener('click', async ev => {
        ev.currentTarget.disabled = true;
        setSaveState('saving');
        await send('updateImportedLists');
        ev.currentTarget.disabled = false;
        setSaveState('saved');
        toast('Added lists are up to date');
    });
}

export function show(ctx) {
    return render(ctx);
}

export function hide() {
    flushApply();
}

export function onBroadcast(ctx, message) {
    if ( message.enabledRulesets === undefined ) { return; }
    if ( $('.page[data-page="lists"]').hidden ) { return; }
    if ( applyTimer !== undefined || $('#listsSaveState').classList.contains('saving') ) { return; }
    const same = message.enabledRulesets.length === enabledNow.size &&
        message.enabledRulesets.every(id => enabledNow.has(id));
    if ( same === false ) { render(ctx); }
}
