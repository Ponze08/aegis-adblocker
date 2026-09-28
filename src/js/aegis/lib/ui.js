/*******************************************************************************

    Aegis — shared helpers for extension pages

*******************************************************************************/

import { hydrateIcons, icon } from './icons.js';

export { hydrateIcons, icon };

export const browser = self.browser ?? self.chrome;

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/******************************************************************************/

// Messages to the service worker. The worker may be waking up: retry once.
export async function send(what, details = {}) {
    const message = { what, ...details };
    for ( let attempt = 0; attempt < 3; attempt++ ) {
        try {
            return await browser.runtime.sendMessage(message);
        } catch (reason) {
            if ( attempt === 2 ) {
                console.error(`[aegis] ${what}:`, reason);
                return;
            }
            await new Promise(r => setTimeout(r, 200 * (attempt + 1)));
        }
    }
}

// Engine state changes are broadcast on this channel
export function onBroadcast(fn) {
    const bc = new BroadcastChannel('uBOL');
    bc.onmessage = ev => {
        if ( ev.data instanceof Object ) { fn(ev.data); }
    };
    return bc;
}

/******************************************************************************/

// Protection levels (uBO Lite filtering modes)

export const LEVELS = [
    {
        level: 0,
        name: 'Off',
        icon: 'shield-off',
        summary: 'Nothing is blocked on this site.',
        detail: 'For sites you trust, or when a site refuses to work properly.',
    },
    {
        level: 1,
        name: 'Basic',
        icon: 'shield',
        summary: 'Blocks ads & trackers at the network level.',
        detail: 'Lightest and most compatible. Some empty ad spaces may remain visible.',
    },
    {
        level: 2,
        name: 'Standard',
        icon: 'shield-check',
        summary: 'Blocks ads & trackers, and hides leftovers.',
        detail: 'Adds cosmetic filtering and site fixes. The best balance for most sites.',
    },
    {
        level: 3,
        name: 'Strict',
        icon: 'shield-alert',
        summary: 'Maximum blocking. May break some sites.',
        detail: 'Catches the most annoyances, but uses more resources and may break some sites.',
    },
];

export const CATEGORY_META = {
    ads: { label: 'Ads', plural: 'Ads & more' },
    trackers: { label: 'Trackers', plural: 'Trackers' },
    annoyances: { label: 'Annoyances', plural: 'Annoyances' },
    malware: { label: 'Threats', plural: 'Threats' },
};

// Filters in a ruleset: network filters + cosmetic filters. (Many network
// filters compile into a single browser rule, so rules undercount.)
export function filterCount(ruleset) {
    const network = ruleset?.filters?.accepted ?? 0;
    const cosmetic = (ruleset?.css?.generic ?? 0) + (ruleset?.css?.specific ?? 0);
    return network + cosmetic;
}

// Fixed categorical order (see README > colors)
export const CATEGORY_ORDER = [ 'ads', 'trackers', 'annoyances', 'malware' ];

/******************************************************************************/

const numberFormat = new Intl.NumberFormat();
const compactFormat = new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
});

export const fmt = n => numberFormat.format(n ?? 0);
export const compact = n => n < 10000 ? fmt(n) : compactFormat.format(n);

export function escapeHTML(s) {
    return `${s}`.replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
}

export function timeAgo(t) {
    const s = Math.round((Date.now() - t) / 1000);
    if ( s < 5 ) { return 'just now'; }
    if ( s < 60 ) { return `${s}s ago`; }
    const m = Math.round(s / 60);
    if ( m < 60 ) { return `${m} min ago`; }
    const h = Math.round(m / 60);
    if ( h < 24 ) { return `${h} h ago`; }
    return new Date(t).toLocaleDateString();
}

export function durationText(ms) {
    const m = Math.max(1, Math.round(ms / 60000));
    if ( m < 60 ) { return `${m} min`; }
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest ? `${h} h ${rest} min` : `${h} h`;
}

/******************************************************************************/

// Count-up animation for numbers
export function animateNumber(elem, to, { format = fmt, duration = 600 } = {}) {
    const from = Number(elem.dataset.value ?? 0);
    elem.dataset.value = `${to}`;
    if ( from === to || matchMedia('(prefers-reduced-motion: reduce)').matches ) {
        elem.textContent = format(to);
        return;
    }
    const t0 = performance.now();
    cancelAnimationFrame(Number(elem.dataset.raf ?? 0));
    const step = now => {
        const p = Math.min(1, (now - t0) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        elem.textContent = format(Math.round(from + (to - from) * eased));
        if ( p < 1 ) {
            elem.dataset.raf = `${requestAnimationFrame(step)}`;
        }
    };
    elem.dataset.raf = `${requestAnimationFrame(step)}`;
}

/******************************************************************************/

export function toast(message, { type = 'success', duration = 2600 } = {}) {
    let container = $('.toasts');
    if ( container === null ) {
        container = document.createElement('div');
        container.className = 'toasts';
        container.setAttribute('role', 'status');
        document.body.append(container);
    }
    const elem = document.createElement('div');
    elem.className = `toast ${type}`;
    elem.innerHTML = icon(type === 'error' ? 'alert' : 'check-circle', 'sm');
    elem.append(message);
    container.append(elem);
    setTimeout(( ) => {
        elem.classList.add('leaving');
        elem.addEventListener('animationend', ( ) => elem.remove(), { once: true });
    }, duration);
}

/******************************************************************************/

// Theme preference (applied early by theme-boot.js)
export function getThemePref() {
    try { return localStorage.getItem('aegis.theme') || 'auto'; } catch { return 'auto'; }
}

export function setThemePref(pref) {
    try { localStorage.setItem('aegis.theme', pref); } catch { }
    const dark = pref === 'dark' || pref === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

/******************************************************************************/

// Segmented control: <div class="seg"><button data-value>…</button>…</div>
export function setupSeg(seg, onChange) {
    let thumb = $('.seg-thumb', seg);
    if ( thumb === null ) {
        thumb = document.createElement('span');
        thumb.className = 'seg-thumb';
        seg.prepend(thumb);
    }
    const buttons = $$('button', seg);
    const place = ( ) => {
        const active = buttons.find(b => b.getAttribute('aria-pressed') === 'true');
        thumb.hidden = active === undefined;
        if ( active === undefined ) { return; }
        thumb.style.width = `${active.offsetWidth}px`;
        thumb.style.transform = `translateX(${active.offsetLeft - 3}px)`;
    };
    const select = (value, notify = false) => {
        for ( const b of buttons ) {
            b.setAttribute('aria-pressed', `${b.dataset.value === `${value}`}`);
        }
        place();
        if ( notify ) { onChange?.(value); }
    };
    seg.addEventListener('click', ev => {
        const button = ev.target.closest('button');
        if ( button === null || button.disabled ) { return; }
        if ( button.getAttribute('aria-pressed') === 'true' ) { return; }
        select(button.dataset.value, true);
    });
    seg.addEventListener('keydown', ev => {
        if ( ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight' ) { return; }
        const i = buttons.findIndex(b => b.getAttribute('aria-pressed') === 'true');
        const j = Math.min(buttons.length - 1, Math.max(0, i + (ev.key === 'ArrowRight' ? 1 : -1)));
        if ( j === i || buttons[j].disabled ) { return; }
        buttons[j].focus();
        select(buttons[j].dataset.value, true);
    });
    new ResizeObserver(place).observe(seg);
    return { select };
}
