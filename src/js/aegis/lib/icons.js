/*******************************************************************************

    Aegis — icon set (24x24, 2px stroke)

    Usage in markup: <span class="icon" data-icon="shield"></span>
    then call hydrateIcons(), or build with icon('shield', 'sm').

*******************************************************************************/

const SHIELD = '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.3 7.5 9.5 4.3-1.2 7.5-4.9 7.5-9.5V6z"/>';
const TRAY = '<path d="M4 16.5v3A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-3"/>';

export const ICONS = {
    'shield': SHIELD,
    'shield-check': `${SHIELD}<path d="m9 12 2.2 2.2L15.5 10"/>`,
    'shield-off': `${SHIELD}<path d="m3.5 3.5 17 17"/>`,
    'shield-alert': `${SHIELD}<path d="M12 8.5v4"/><path d="M12 16h.01"/>`,
    'power': '<path d="M12 3v8"/><path d="M6.3 6.9a8 8 0 1 0 11.4 0"/>',
    'pause': '<rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/>',
    'play': '<path d="M7.5 4.8v14.4a.8.8 0 0 0 1.2.7l11.3-7.2a.8.8 0 0 0 0-1.4L8.7 4.1a.8.8 0 0 0-1.2.7z"/>',
    'sliders': '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    'zap': '<path d="M13 2.5 4.5 13.5h6.5l-1 8 8.5-11h-6.5z"/>',
    'crosshair': '<circle cx="12" cy="12" r="8"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/>',
    'eye': '<path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z"/><circle cx="12" cy="12" r="3"/>',
    'eye-off': '<path d="M10 5.2A9.4 9.4 0 0 1 12 5c6 0 9.5 7 9.5 7a16 16 0 0 1-2.4 3.3M6.6 6.6C4 8.3 2.5 12 2.5 12S6 19 12 19a9 9 0 0 0 5.2-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="m3 3 18 18"/>',
    'undo': '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5"/><path d="M3.5 3.5v5h5"/>',
    'refresh': '<path d="M20.5 12a8.5 8.5 0 0 1-14.6 5.9L3.5 15.5"/><path d="M3.5 12A8.5 8.5 0 0 1 18.1 6.1l2.4 2.4"/><path d="M20.5 3.5v5h-5"/><path d="M3.5 20.5v-5h5"/>',
    'wrench': '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    'home': '<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9v10.5a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9"/><path d="M10 20.5v-6h4v6"/>',
    'layers': '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12.5 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
    'globe': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
    'code': '<path d="m8 7-5 5 5 5"/><path d="m16 7 5 5-5 5"/><path d="m14 4-4 16"/>',
    'activity': '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    'info': '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><path d="M12 7.5h.01"/>',
    'alert': '<path d="M10.3 4.2 2.8 17.3a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4"/><path d="M12 17h.01"/>',
    'help': '<circle cx="12" cy="12" r="9"/><path d="M9.3 9.2a2.8 2.8 0 0 1 5.4 1c0 1.9-2.7 2.3-2.7 4.3"/><path d="M12 17.5h.01"/>',
    'check': '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.3 2.4 2.4 4.6-4.9"/>',
    'x': '<path d="M6 6l12 12M18 6 6 18"/>',
    'plus': '<path d="M12 5v14M5 12h14"/>',
    'minus': '<path d="M5 12h14"/>',
    'trash': '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="m6 7 1 12.6A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.4L18 7"/><path d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7"/>',
    'search': '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/>',
    'download': `<path d="M12 3.5v11"/><path d="m7.5 10 4.5 4.5 4.5-4.5"/>${TRAY}`,
    'upload': `<path d="M12 14.5v-11"/><path d="M7.5 8 12 3.5 16.5 8"/>${TRAY}`,
    'external': '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
    'chevron-right': '<path d="m9 6 6 6-6 6"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'chevron-up': '<path d="m6 15 6-6 6 6"/>',
    'arrow-right': '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    'moon': '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    'sun': '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M2.5 12h2M19.5 12h2M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    'monitor': '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    'clock': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
    'chart': '<path d="M4 20h16"/><path d="M7 16v-4M12 16V7M17 16v-6"/>',
    'list': '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    'copy': '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
    'keyboard': '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M7.5 14h9"/>',
    'sparkles': '<path d="M11 3.5 12.7 8l4.5 1.7-4.5 1.7L11 16l-1.7-4.6L4.8 9.7 9.3 8z"/><path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
    'ban': '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
    'lock': '<rect x="4.5" y="10.5" width="15" height="10.5" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    'cookie': '<path d="M12 3a9 9 0 1 0 9 9 3 3 0 0 1-3.5-3A3 3 0 0 1 14 5.5 3 3 0 0 1 12 3z"/><path d="M8.5 10.5h.01M12.5 15.5h.01M8 15h.01M16 13.5h.01"/>',
    'message': '<path d="M20.5 12a8.5 8.5 0 0 1-12.3 7.6L3.5 21l1.4-4.6A8.5 8.5 0 1 1 20.5 12z"/>',
    'bell': '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 21h4"/>',
    'share': '<circle cx="17.5" cy="5.5" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="17.5" cy="18.5" r="2.5"/><path d="m8.7 10.7 6.6-3.9M8.7 13.3l6.6 3.9"/>',
    'overlay': '<rect x="3" y="3" width="14" height="14" rx="2"/><path d="M21 7.5v11a2.5 2.5 0 0 1-2.5 2.5h-11"/>',
    'bot': '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4.5M9 13.5h.01M15 13.5h.01M9.5 17h5"/>',
    'phone': '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18h2"/>',
    'router': '<rect x="3" y="13.5" width="18" height="7" rx="2"/><path d="M7 17h.01M10.5 17h.01"/><path d="M15 13.5v-4"/><path d="M11.5 7a5 5 0 0 1 7 0"/>',
    'link': '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    'flask': '<path d="M9 3h6M10 3v6.2L4.6 18.4A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.4-2.6L14 9.2V3"/><path d="M7.5 15h9"/>',
    'filter': '<path d="M3.5 5h17l-6.5 8v6l-4 2v-8z"/>',
    'bug': '<rect x="7" y="7" width="10" height="13" rx="5"/><path d="M12 11v9M7 13H3.5M20.5 13H17M7.5 17.5 4.5 19.5M16.5 17.5l3 2M7.5 9 4.5 7M16.5 9l3-2M9.5 7a2.5 2.5 0 0 1 5 0"/>',
    'book': '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15.5H5.5A1.5 1.5 0 0 0 4 20z"/><path d="M4 20a1.5 1.5 0 0 0 1.5 1.5H20"/>',
    'heart': '<path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10z"/>',
    'save': '<path d="M5.5 3.5h10l4 4v11a2 2 0 0 1-2 2h-12a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z"/><path d="M8 3.5V8h7V3.5M8 20.5V14h8v6.5"/>',
    'more': '<circle cx="5.5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18.5" cy="12" r="1"/>',
    'star': '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>',
    'gauge': '<path d="M4.2 17.5a9 9 0 1 1 15.6 0"/><path d="m12 13 4-4.5"/><circle cx="12" cy="13.5" r="1"/>',
    'puzzle': '<path d="M4.5 7.5h4a2.25 2.25 0 1 1 4.5 0h4v4a2.25 2.25 0 1 1 0 4.5v4h-12.5z"/>',
    'hand':'<path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4a1.5 1.5 0 0 1 3 0v6M14 10.5V5.5a1.5 1.5 0 0 1 3 0v8c0 4-2.7 7-6.5 7-2.4 0-3.8-1-5-2.8l-2.3-3.6a1.5 1.5 0 0 1 2.5-1.6L8 14.5"/>',
};

export function icon(name, cls = '') {
    const paths = ICONS[name] ?? ICONS.info;
    return `<span class="icon ${cls}" aria-hidden="true"><svg viewBox="0 0 24 24">${paths}</svg></span>`;
}

export function setIcon(elem, name) {
    elem.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[name] ?? ICONS.info}</svg>`;
    elem.dataset.icon = name;
}

export function hydrateIcons(root = document) {
    for ( const elem of root.querySelectorAll('.icon[data-icon]') ) {
        if ( elem.firstElementChild ) { continue; }
        elem.setAttribute('aria-hidden', 'true');
        setIcon(elem, elem.dataset.icon);
    }
}
