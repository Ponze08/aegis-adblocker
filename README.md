# Aegis

A fast, friendly ad & tracker blocker for Chrome and Edge. It blocks as well as uBlock Origin Lite because it **is** the uBlock Origin Lite engine (same filter lists, same compiler, same cosmetic filtering and scriptlets), with a completely new interface on top.

## Install (Chrome or Edge)

1. Download `aegis-<version>.zip` from the [Releases](../../releases) page and unzip it, or [build it](#build) yourself.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the unzipped folder (or `dist/aegis` if you built it).
5. Pin the shield: click the puzzle piece in the toolbar, then the pin next to Aegis.

Optional: on the Aegis details page, turn on **Allow User Scripts**. It's only needed for cosmetic and scriptlet filters that you write yourself or import from custom lists. Everything built in works without it.

Aegis is meant to run unpacked: that's what enables live per-page statistics and the activity log (`declarativeNetRequest.onRuleMatchedDebug` is only available to unpacked extensions). Packed, it still blocks the same way, but with fewer details.

## What you get

- **Popup:** one big shield turns protection on or off for the current site. It shows a live count of what was blocked on the page (ads, trackers, annoyances, threats) and which domains were blocked. It also has a 4-step protection level (Off, Basic, Standard, Strict), the Zap / Hide / Unhide element tools, and a "Site broken?" helper.
- **Pause everywhere** for 15 minutes, 1 hour, or until you resume. Resumes automatically, and your site settings are kept.
- **Dashboard:**
  - **Overview:** today / week / all-time stats, a 30-day chart, top blocked domains and sites.
  - **Protection:** default level, dangerous-site warnings, pop-up blocking, badge, keyboard shortcuts.
  - **Filter lists:** 56 lists with plain-language descriptions, search, regional lists with flags, add any list by URL.
  - **Site settings:** trusted sites and per-site levels.
  - **My filters:** elements you hid, plus a filter editor in uBlock Origin syntax.
  - **Activity:** a live log of every blocked request, with the list that blocked it.
  - **Settings:** theme, backup/restore, reset.
- **Welcome page:** one-click extras (cookie banners, pop-ups, chat bubbles, social widgets, link tracking).
- **Light and dark themes**, following the system or chosen in Settings.

## Build

Requires Node.js 22+ and a copy of the uBlock Origin repository next to this one (`../uBlock`, or set `UBO_DIR`). Aegis is tested against uBlock Origin commit `d34727e`:

```bash
git clone https://github.com/gorhill/uBlock.git
git -C uBlock checkout d34727edfeef5ada28807edebe43073ced1142e9
git clone <this repository> aegis
cd aegis
npm run build
```

This copies the uBO Lite engine, overlays the Aegis UI from `src/`, downloads the filter lists and compiles them into browser rulesets. The result goes to `dist/aegis`. Downloaded lists are cached in `dist/mv3-data`, so rebuilds take about 20 s.

| Command | What it does |
| --- | --- |
| `npm run build` | Full build, reusing cached filter lists |
| `npm run build:fresh` | Full build with freshly downloaded filter lists (to update blocking) |
| `npm run build:ui` | Only re-copies `src/` (quick UI iteration; then reload the extension) |
| `npm test` / `npm run test:edge` | Headless end-to-end check against real websites |
| `npm run icons` | Re-renders `src/img` icons from the SVG in `scripts/make-icons.mjs` |

Filter lists are compiled into the extension, as required by Manifest V3. To get the latest filters, run `npm run build:fresh` from time to time, then click the reload arrow on the Aegis card in `chrome://extensions`. Lists you add by URL update by themselves.

## How it's put together

```
src/                    Aegis's own files (override engine files with the same path)
  manifest.json
  popup.html, dashboard.html, welcome.html
  css/aegis/            design tokens + page styles; ubo-theme.css re-skins engine pages
  js/aegis/main.js      service worker entry: loads the engine, then the extras below
  js/aegis/stats.js     live per-tab / all-time statistics and the toolbar badge
  js/aegis/pause.js     pause everywhere (snapshot + restore of per-site modes)
  js/aegis/lib/         shared UI helpers, icon set, list names
  js/aegis/dashboard/   one module per dashboard page
scripts/
  build.mjs             assembles dist/aegis from the engine + src/
  smoke-test.mjs        end-to-end test in headless Chrome/Edge
  make-icons.mjs        icon renderer
```

The engine is used unmodified, with one exception: the build appends a single `export` to `js/background.js`, so that Aegis's extras wait for the engine to finish starting up. Aegis's messages use an `aegis:` prefix, which the engine's message handler ignores. To upgrade the engine, update the uBlock repository and rebuild.

Statistics are computed from the rules the browser reports as matched, using small indexes generated at build time (`rulesets/aegis/`): which rules are not plain blocks, and which domains are known trackers (from EasyPrivacy). No browsing data leaves your computer.

## Privacy

Aegis does all filtering and statistics on your device. It makes no analytics or telemetry requests and never uploads browsing data. For the dashboard, it keeps aggregate category totals for up to 90 days and the top 400 blocked destination/site domains in the extension's local browser storage. The activity view keeps only the latest 500 rule matches in session storage. You can erase these at any time from **Settings → Reset statistics** or clear the activity list independently.

Private-window statistics stay only in the private extension process's memory: they are not read from or written to the shared local/session stores. Closing the private session discards them.

The unpacked extension's `declarativeNetRequestFeedback` permission powers the live counters and activity log. Chrome and Edge describe this broadly in their permission UI because matched requests include addresses, but Aegis processes them locally. Browser-store builds do not expose this debugging API, so this project is intentionally distributed for unpacked personal use.

The four category colors (Ads, Trackers, Annoyances, Threats) are a colorblind-safe categorical palette, validated against both the light and dark card surfaces.

## License

GPLv3. Aegis is built on [uBlock Origin / uBO Lite](https://github.com/gorhill/uBlock) by Raymond Hill and contributors. Filter lists belong to their respective authors (uBlock filters, EasyList, EasyPrivacy, Peter Lowe, URLhaus, AdGuard, and the regional list maintainers).
