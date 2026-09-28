/*******************************************************************************

    Aegis — dashboard: overview

*******************************************************************************/

import {
    $,
    CATEGORY_META,
    CATEGORY_ORDER,
    animateNumber,
    compact,
    filterCount,
    fmt,
    send,
    setupSeg,
} from '../lib/ui.js';

import punycode from '../../punycode.js';

/******************************************************************************/

const DAYS = 30;
const SVG_NS = 'http://www.w3.org/2000/svg';

let refreshTimer;
let lastStats;
let chartView;

const dayKey = d => {
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
};

const shortDate = d => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const longDate = d => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long' });

function lastDays(days, n = DAYS) {
    const out = [];
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    for ( let i = n - 1; i >= 0; i-- ) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const values = days[dayKey(d)] ?? {};
        const entry = { date: d };
        let total = 0;
        for ( const cat of CATEGORY_ORDER ) {
            entry[cat] = values[cat] ?? 0;
            total += entry[cat];
        }
        entry.total = total;
        out.push(entry);
    }
    return out;
}

// Clean axis ticks: 1, 2, 2.5, 5 x 10^n
function niceScale(max, ticks = 4) {
    if ( max <= 0 ) { return { top: 4, step: 1 }; }
    const rough = max / ticks;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
    const step = [ 1, 2, 2.5, 5, 10 ].map(f => f * magnitude).find(s => s >= rough);
    const niceStep = Math.max(1, step);
    return { top: Math.ceil(max / niceStep) * niceStep, step: niceStep };
}

function svg(tag, attrs = {}) {
    const elem = document.createElementNS(SVG_NS, tag);
    for ( const [ k, v ] of Object.entries(attrs) ) { elem.setAttribute(k, v); }
    return elem;
}

// Rounded data-end (top), square at the baseline
function topRoundedRect(x, y, w, h, r) {
    r = Math.min(r, h, w / 2);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/******************************************************************************/

function renderChart(series) {
    const container = $('#dailyChart');
    container.replaceChildren();
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 240;
    const m = { top: 22, right: 6, bottom: 26, left: 44 };
    const plotW = width - m.left - m.right;
    const plotH = height - m.top - m.bottom;
    const max = Math.max(...series.map(d => d.total));
    const { top, step } = niceScale(max);
    const y = v => m.top + plotH - (v / top) * plotH;

    const root = svg('svg', { viewBox: `0 0 ${width} ${height}`, role: 'group' });
    root.setAttribute('aria-label', 'Blocked requests per day, last 30 days. Use the table view for exact values.');

    for ( let v = 0; v <= top; v += step ) {
        const yy = Math.round(y(v)) + 0.5;
        root.append(svg('line', {
            class: v === 0 ? 'baseline' : 'grid-line',
            x1: m.left, x2: width - m.right, y1: yy, y2: yy,
        }));
        const label = svg('text', { class: 'tick', x: m.left - 10, y: yy + 4, 'text-anchor': 'end' });
        label.textContent = compact(v);
        root.append(label);
    }

    const band = plotW / series.length;
    const barW = Math.min(24, Math.max(4, band * 0.62));
    const gap = 2;
    let maxIndex = -1;
    series.forEach((d, i) => { if ( d.total > 0 && (maxIndex === -1 || d.total > series[maxIndex].total) ) { maxIndex = i; } });

    series.forEach((d, i) => {
        const x0 = m.left + i * band;
        const x = x0 + (band - barW) / 2;
        const breakdown = CATEGORY_ORDER
            .map(cat => `${CATEGORY_META[cat].label}: ${fmt(d[cat])}`)
            .join(', ');
        const group = svg('g', {
            class: 'bar-group',
            tabindex: '0',
            role: 'img',
            'aria-label': `${longDate(d.date)}: ${fmt(d.total)} blocked. ${breakdown}`,
            'data-index': `${i}`,
        });
        group.append(svg('rect', { class: 'bar-hover', x: x0 + 1, y: m.top, width: Math.max(1, band - 2), height: plotH, rx: 6 }));

        const present = CATEGORY_ORDER.filter(cat => d[cat] > 0);
        const totalH = (d.total / top) * plotH;
        const gaps = (present.length - 1) * gap;
        const useGaps = totalH - gaps >= present.length * 2;
        const available = useGaps ? totalH - gaps : totalH;
        let cursor = m.top + plotH;
        present.forEach((cat, j) => {
            const h = Math.max(1, available * d[cat] / d.total);
            const yTop = cursor - h;
            const isTop = j === present.length - 1;
            group.append(svg('path', {
                class: `seg-${cat}`,
                d: isTop ? topRoundedRect(x, yTop, barW, h, 4) : `M${x},${yTop}h${barW}v${h}h${-barW}Z`,
            }));
            cursor = yTop - (useGaps ? gap : 0);
        });

        // Hit target: the whole column band, taller than the mark
        group.append(svg('rect', { class: 'bar-hit', x: x0, y: m.top, width: band, height: plotH }));
        root.append(group);

        const isLast = i === series.length - 1;
        if ( (series.length - 1 - i) % 5 === 0 ) {
            const tick = svg('text', {
                class: 'tick',
                x: x0 + band / 2,
                y: height - 6,
                'text-anchor': isLast ? 'end' : 'middle',
            });
            if ( isLast ) { tick.setAttribute('x', x0 + band); }
            tick.textContent = isLast ? 'Today' : shortDate(d.date);
            root.append(tick);
        }
    });

    // Direct label on the extreme only
    if ( maxIndex !== -1 ) {
        const d = series[maxIndex];
        const label = svg('text', {
            class: 'tick',
            x: m.left + maxIndex * band + band / 2,
            y: y(d.total) - 7,
            'text-anchor': 'middle',
        });
        label.style.fill = 'var(--text-2)';
        label.style.fontWeight = '600';
        label.textContent = fmt(d.total);
        root.append(label);
    }

    container.append(root);

    if ( max === 0 ) {
        const empty = document.createElement('div');
        empty.className = 'chart-empty';
        empty.textContent = 'No blocked requests yet. Browse a little and come back!';
        container.append(empty);
    }

    const tooltip = $('#chartTooltip');
    const show = group => {
        const d = series[Number(group.dataset.index)];
        tooltip.replaceChildren();
        const title = document.createElement('strong');
        title.textContent = longDate(d.date);
        tooltip.append(title);
        for ( const cat of [ ...CATEGORY_ORDER ].reverse() ) {
            const row = document.createElement('div');
            row.className = 'tt-row';
            const key = document.createElement('span');
            key.style.cssText = `width:10px;height:3px;border-radius:2px;background:var(--c-${cat})`;
            const value = document.createElement('b');
            value.textContent = fmt(d[cat]);
            row.append(key, CATEGORY_META[cat].label, value);
            tooltip.append(row);
        }
        const total = document.createElement('div');
        total.className = 'tt-row tt-total';
        const totalValue = document.createElement('b');
        totalValue.textContent = fmt(d.total);
        total.append('Total', totalValue);
        tooltip.append(total);
        tooltip.hidden = false;
        const rect = group.getBoundingClientRect();
        const tipRect = tooltip.getBoundingClientRect();
        let left = rect.right + 8;
        if ( left + tipRect.width > innerWidth - 8 ) { left = rect.left - tipRect.width - 8; }
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${Math.max(8, rect.top + 20)}px`;
    };
    const hide = ( ) => { tooltip.hidden = true; };
    for ( const group of root.querySelectorAll('.bar-group') ) {
        group.addEventListener('pointerenter', ( ) => show(group));
        group.addEventListener('pointerleave', hide);
        group.addEventListener('focus', ( ) => { group.classList.add('focus'); show(group); });
        group.addEventListener('blur', ( ) => { group.classList.remove('focus'); hide(); });
    }
}

function renderTable(series) {
    const table = document.createElement('table');
    table.className = 'data-table';
    const head = document.createElement('tr');
    for ( const label of [ 'Date', ...CATEGORY_ORDER.map(c => CATEGORY_META[c].label), 'Total' ] ) {
        const th = document.createElement('th');
        th.textContent = label;
        head.append(th);
    }
    const thead = document.createElement('thead');
    thead.append(head);
    const tbody = document.createElement('tbody');
    for ( const d of [ ...series ].reverse() ) {
        const tr = document.createElement('tr');
        for ( const value of [ longDate(d.date), ...CATEGORY_ORDER.map(c => fmt(d[c])), fmt(d.total) ] ) {
            const td = document.createElement('td');
            td.textContent = value;
            tr.append(td);
        }
        tbody.append(tr);
    }
    table.append(thead, tbody);
    $('#dailyTable').replaceChildren(table);
}

function renderLegend(series) {
    const totals = Object.fromEntries(CATEGORY_ORDER.map(c => [ c, series.reduce((a, d) => a + d[c], 0) ]));
    $('#chartLegend').replaceChildren(...CATEGORY_ORDER.map(cat => {
        const li = document.createElement('li');
        const dot = document.createElement('span');
        dot.className = `dot ${cat}`;
        const b = document.createElement('b');
        b.textContent = fmt(totals[cat]);
        li.append(dot, CATEGORY_META[cat].label, b);
        return li;
    }));
}

/******************************************************************************/

function renderRank(list, entries, emptyText) {
    const elem = $(list);
    if ( entries.length === 0 ) {
        const li = document.createElement('li');
        li.className = 'empty';
        li.textContent = emptyText;
        elem.replaceChildren(li);
        return;
    }
    const max = entries[0][1];
    elem.replaceChildren(...entries.slice(0, 10).map(([ name, value ]) => {
        const li = document.createElement('li');
        const label = document.createElement('span');
        label.className = 'name';
        label.textContent = punycode.toUnicode(name);
        label.title = name;
        const count = document.createElement('span');
        count.className = 'value';
        count.textContent = fmt(value);
        const bar = document.createElement('span');
        bar.className = 'bar';
        const fill = document.createElement('span');
        fill.style.width = `${Math.max(2, value / max * 100)}%`;
        bar.append(fill);
        li.append(label, count, bar);
        return li;
    }));
}

function greeting() {
    const h = new Date().getHours();
    if ( h < 5 ) { return 'Good night'; }
    if ( h < 12 ) { return 'Good morning'; }
    if ( h < 18 ) { return 'Good afternoon'; }
    return 'Good evening';
}

async function renderSummary(ctx) {
    const { enabledRulesets = [], rulesetDetails = [] } = ctx.data;
    const enabled = new Set(enabledRulesets);
    let filters = 0;
    for ( const r of rulesetDetails ) {
        if ( enabled.has(r.id) ) { filters += filterCount(r); }
    }
    $('#sumLevel').textContent = ctx.levelName();
    $('#sumLists').textContent = `${enabled.size} filter ${enabled.size === 1 ? 'list' : 'lists'}`;
    $('#sumRules').textContent = `${compact(filters)} filters`;
    const { none, basic, optimal, complete } = ctx.modes;
    const sites = [ ...none, ...basic, ...optimal, ...complete ].filter(a => a !== 'all-urls').length;
    $('#sumSites').textContent = `${sites} ${sites === 1 ? 'site' : 'sites'}`;

    const [ custom, sandbox ] = await Promise.all([
        send('getAllCustomFilters'),
        send('getSandboxFilters'),
    ]);
    let count = 0;
    for ( const [ , selectors ] of custom ?? [] ) { count += selectors.length; }
    for ( const line of (sandbox ?? '').split('\n') ) {
        const s = line.trim();
        if ( s !== '' && s.startsWith('!') === false ) { count += 1; }
    }
    $('#sumFilters').textContent = `${count} ${count === 1 ? 'filter' : 'filters'}`;
}

async function refresh(ctx) {
    const stats = await send('aegis:stats');
    if ( stats instanceof Object === false ) { return; }
    const series = lastDays(stats.days);
    const week = series.slice(-7).reduce((a, d) => a + d.total, 0);
    const yesterday = series.at(-2)?.total ?? 0;

    $('#overviewGreeting').textContent = greeting();
    const since = new Date(stats.since).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    $('#overviewSince').textContent = stats.total > 0
        ? `Aegis has blocked ${fmt(stats.total)} ads, trackers and threats for you since ${since}.`
        : `Aegis is on guard since ${since}. Here is what it has been up to.`;

    animateNumber($('#tileToday'), stats.today, { format: compact });
    animateNumber($('#tileWeek'), week, { format: compact });
    animateNumber($('#tileTotal'), stats.total, { format: compact });
    animateNumber($('#tileCleaned'), stats.cleaned, { format: compact });
    $('#tileTodaySub').textContent = `Yesterday: ${fmt(yesterday)}`;
    $('#tileWeekSub').textContent = `About ${fmt(Math.round(week / 7))} per day`;
    $('#tileTotalSub').textContent = `Since ${new Date(stats.since).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;

    const signature = JSON.stringify(series.map(d => d.total)) + JSON.stringify(stats.cats);
    if ( signature !== lastStats ) {
        lastStats = signature;
        renderLegend(series);
        renderChart(series);
        renderTable(series);
    }
    renderRank('#topDomains', stats.domains, 'Nothing blocked yet.');
    renderRank('#topSites', stats.sites, 'Nothing blocked yet.');
    if ( stats.live === false ) {
        $('#topDomains').parentElement.querySelector('.muted').textContent =
            'Needs Aegis loaded unpacked (developer mode)';
    }
    renderSummary(ctx);
}

/******************************************************************************/

export function init(ctx) {
    chartView = setupSeg($('#chartView'), value => {
        $('#dailyChart').hidden = value !== 'chart';
        $('#chartLegend').hidden = value !== 'chart';
        $('#dailyTable').hidden = value !== 'table';
    });
    chartView.select('chart');
    let resizeTimer;
    new ResizeObserver(( ) => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(( ) => {
            lastStats = undefined;
            if ( $('.page[data-page="overview"]').hidden === false ) { refresh(ctx); }
        }, 150);
    }).observe($('#dailyChart'));
}

export async function show(ctx) {
    await refresh(ctx);
    clearInterval(refreshTimer);
    refreshTimer = setInterval(( ) => refresh(ctx), 5000);
}

export function hide() {
    clearInterval(refreshTimer);
    $('#chartTooltip').hidden = true;
}

export function onBroadcast(ctx) {
    if ( $('.page[data-page="overview"]').hidden === false ) {
        renderSummary(ctx);
    }
}
