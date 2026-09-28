/*******************************************************************************

    Aegis — dashboard: my filters (hidden elements + custom filter rules)

*******************************************************************************/

import {
    $,
    browser,
    fmt,
    icon,
    send,
    toast,
} from '../lib/ui.js';

import { confirmDialog } from './main.js';
import punycode from '../../punycode.js';

/******************************************************************************/

let savedText = '';

const prettySelector = selector => {
    if ( selector.startsWith('{') === false ) { return selector; }
    try { return JSON.parse(selector).raw ?? selector; } catch { return selector; }
};

const countFilters = text => text.split('\n').filter(line => {
    const s = line.trim();
    return s !== '' && s.startsWith('!') === false && s.startsWith('#') === false;
}).length;

/******************************************************************************/

// Hidden elements (element picker)

async function renderHidden() {
    const entries = await send('getAllCustomFilters') ?? [];
    const blocks = entries
        .filter(([ , selectors ]) => selectors.length !== 0)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([ hostname, selectors ]) => {
            const block = document.createElement('div');
            block.className = 'site-block';
            block.dataset.hostname = hostname;
            block.innerHTML = `
                <div class="site-block-head">
                    ${icon('globe', 'sm')}
                    <strong></strong>
                    <span class="muted"></span>
                    <button type="button" class="icon-btn sm remove-site" title="Show everything again on this site">${icon('trash', 'sm')}</button>
                </div>
                <ul class="selector-list"></ul>`;
            block.querySelector('strong').textContent = punycode.toUnicode(hostname);
            block.querySelector('.muted').textContent =
                `${selectors.length} hidden ${selectors.length === 1 ? 'element' : 'elements'}`;
            block.querySelector('.selector-list').append(...selectors.map(selector => {
                const li = document.createElement('li');
                li.dataset.selector = selector;
                const code = document.createElement('code');
                code.textContent = prettySelector(selector);
                code.title = prettySelector(selector);
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'icon-btn sm remove-selector';
                remove.title = 'Show this element again';
                remove.innerHTML = icon('x', 'sm');
                li.append(code, remove);
                return li;
            }));
            return block;
        });
    $('#hiddenElements').replaceChildren(...blocks);
    $('#hiddenEmpty').hidden = blocks.length !== 0;
}

/******************************************************************************/

// Custom filter editor

const editor = ( ) => $('#filterText');

function renderGutter() {
    const lines = editor().value.split('\n').length;
    const gutter = $('.editor-gutter');
    if ( Number(gutter.dataset.lines) !== lines ) {
        gutter.dataset.lines = `${lines}`;
        gutter.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
    }
    gutter.scrollTop = editor().scrollTop;
}

function renderEditorState() {
    const text = editor().value;
    const dirty = text.trim() !== savedText.trim();
    $('#filtersSave').disabled = dirty === false;
    $('#filtersRevert').disabled = dirty === false;
    const n = countFilters(text);
    $('#filterCount').textContent = `${fmt(n)} ${n === 1 ? 'filter' : 'filters'}${dirty ? ' · unsaved changes' : ''}`;
    renderGutter();
}

async function loadEditor() {
    savedText = await send('getSandboxFilters') ?? '';
    editor().value = savedText;
    renderEditorState();
}

async function saveEditor() {
    const button = $('#filtersSave');
    if ( button.disabled ) { return; }
    button.disabled = true;
    const text = editor().value;
    const label = button.lastChild;
    label.textContent = 'Applying…';
    await send('setSandboxFilters', { text });
    label.textContent = 'Save & apply';
    savedText = text.trim();
    renderEditorState();
    toast(`${fmt(countFilters(text))} custom filters saved and applied`);
}

function download(filename, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ text ], { type: 'text/plain' }));
    a.download = filename;
    a.click();
    setTimeout(( ) => URL.revokeObjectURL(a.href), 1000);
}

/******************************************************************************/

export async function init(ctx) {
    const textarea = editor();
    textarea.addEventListener('input', renderEditorState);
    textarea.addEventListener('scroll', renderGutter);
    textarea.addEventListener('keydown', ev => {
        if ( (ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's' ) {
            ev.preventDefault();
            saveEditor();
        } else if ( ev.key === 'Tab' && ev.shiftKey === false ) {
            ev.preventDefault();
            document.execCommand('insertText', false, '    ');
        }
    });
    $('#filtersSave').addEventListener('click', saveEditor);
    $('#filtersRevert').addEventListener('click', ( ) => {
        textarea.value = savedText;
        renderEditorState();
    });
    $('#filtersExport').addEventListener('click', ( ) => {
        const date = new Date().toISOString().slice(0, 10);
        download(`aegis-filters-${date}.txt`, `${textarea.value.trim()}\n`);
    });
    $('#filtersImport').addEventListener('click', ( ) => {
        const input = $('#filtersImportFile');
        input.value = '';
        input.click();
    });
    $('#filtersImportFile').addEventListener('change', async ev => {
        const file = ev.target.files?.[0];
        if ( file === undefined ) { return; }
        const text = await file.text();
        const before = textarea.value.trimEnd();
        textarea.value = before ? `${before}\n${text.trim()}\n` : `${text.trim()}\n`;
        renderEditorState();
        toast(`${fmt(countFilters(text))} filters added to the editor, review them then save`);
    });
    addEventListener('beforeunload', ev => {
        if ( $('#filtersSave').disabled === false ) { ev.preventDefault(); }
    });

    $('#userScriptsCallout').hidden = ctx.data.supportsUserScripts !== false;
    $('#openExtDetails').addEventListener('click', ( ) => {
        const scheme = /\bEdg\//.test(navigator.userAgent) ? 'edge' : 'chrome';
        browser.tabs.create({ url: `${scheme}://extensions/?id=${browser.runtime.id}` });
    });

    $('#hiddenElements').addEventListener('click', async ev => {
        const selectorButton = ev.target.closest('.remove-selector');
        if ( selectorButton ) {
            const li = selectorButton.closest('li');
            const hostname = li.closest('.site-block').dataset.hostname;
            await send('removeCustomFilters', { hostname, selectors: [ li.dataset.selector ] });
            await renderHidden();
            toast('The element will show again');
            return;
        }
        const siteButton = ev.target.closest('.remove-site');
        if ( siteButton ) {
            const hostname = siteButton.closest('.site-block').dataset.hostname;
            const ok = await confirmDialog({
                title: 'Show everything again?',
                text: `All the elements you hid on ${punycode.toUnicode(hostname)} will be visible again.`,
                ok: 'Show everything',
            });
            if ( ok !== true ) { return; }
            await send('removeAllCustomFilters', { hostname });
            await renderHidden();
            toast('Elements restored');
        }
    });

    await loadEditor();
}

export async function show() {
    await renderHidden();
    // Refresh the editor only when there is nothing unsaved
    if ( $('#filtersSave').disabled ) { await loadEditor(); }
    requestAnimationFrame(renderGutter);
}
