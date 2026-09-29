# Aegis

A fast, friendly ad & tracker blocker for Chrome and Edge. It blocks as well as uBlock Origin Lite because it **is** the uBlock Origin Lite engine (same filter lists, same compiler, same cosmetic filtering and scriptlets), with a completely new interface on top.

## Install (Chrome or Edge)

For a local/development install:

1. Download `aegis-<version>.zip` from the [Releases](../../releases) page and unzip it, or [build it](#build) yourself.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the unzipped folder (or `dist/aegis` if you built it).
5. Pin the shield: click the puzzle piece in the toolbar, then the pin next to Aegis.

Optional: on the Aegis details page, turn on **Allow User Scripts**. It's only needed for cosmetic and scriptlet filters that you write yourself or import from custom lists. Everything built in works without it.

The unpacked/development build can use Chrome's debug-only rule-match API for detailed live per-page statistics and the Activity log. A separate Chrome Web Store build omits that debugging permission and keeps the core blocker and supported UI features without relying on unpacked-only APIs.

## What you get

- **Popup:** one big shield turns protection on or off for the current site. It shows the current tab's blocked-request count when the browser makes that information available, plus a 4-step protection level (Off, Basic, Standard, Strict), the Zap / Hide / Unhide element tools, and a "Site broken?" helper.
- **Pause everywhere** for 15 minutes, 1 hour, or until you resume. Resumes automatically, and your site settings are kept.
- **Dashboard:**
  - **Overview:** filtering configuration plus detailed today / week / all-time statistics in builds where live rule-match information is available.
  - **Protection:** default level, dangerous-site warnings, pop-up blocking, badge, keyboard shortcuts.
  - **Filter lists:** 56 lists with plain-language descriptions, search, regional lists with flags, add any list by URL.
  - **Site settings:** trusted sites and per-site levels.
  - **My filters:** elements you hid, plus a filter editor in uBlock Origin syntax.
  - **Activity:** a detailed live log in unpacked/development builds where Chrome exposes the debugging API.
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

This copies the uBO Lite engine, overlays the Aegis UI from `src/`, downloads the filter lists and compiles them into browser rulesets. The normal development result goes to `dist/aegis`. Downloaded lists are cached in `dist/mv3-data`, so rebuilds are much faster after the first run.

| Command | What it does |
| --- | --- |
| `npm run build` | Full development/unpacked build, reusing cached filter lists |
| `npm run build:fresh` | Full development build with freshly downloaded filter lists |
| `npm run build:ui` | Only re-copies `src/` (quick UI iteration; then reload the extension) |
| `npm run build:store` | Build `dist/aegis-store`, removing unpacked-only permissions |
| `npm run build:store:fresh` | Fresh-filter Chrome Web Store build |
| `npm run check:store` | Validate the Web Store artifact and manifest |
| `npm test` / `npm run test:edge` | Headless end-to-end check against real websites |
| `npm run icons` | Re-renders `src/img` icons from the SVG in `scripts/make-icons.mjs` |

Filter lists are compiled into the extension, as required by Manifest V3. To get the latest filters, run a fresh build from time to time. Lists you add by URL update by themselves.

## Chrome Web Store

The Store-specific build is created in `dist/aegis-store`. It removes `declarativeNetRequestFeedback` and `webNavigation`, which Aegis uses only for detailed unpacked-build statistics, and forces the statistics module onto its packed-extension fallback.

Submission text, permission justifications, privacy guidance, ZIP instructions, and the reviewer note are in [`docs/chrome-web-store.md`](docs/chrome-web-store.md). The privacy policy is in [`docs/privacy.md`](docs/privacy.md).

GitHub Actions also builds and validates a ready-to-upload `aegis-chrome-web-store.zip` artifact.

## How it's put together

```text
src/                    Aegis's own files (override engine files with the same path)
  manifest.json
  popup.html, dashboard.html, welcome.html
  css/aegis/            design tokens + page styles; ubo-theme.css re-skins engine pages
  js/aegis/main.js      service worker entry: loads the engine, then the extras below
  js/aegis/stats.js     live/fallback per-tab statistics and development live stats
  js/aegis/pause.js     pause everywhere (snapshot + restore of per-site modes)
  js/aegis/lib/         shared UI helpers, icon set, list names
  js/aegis/dashboard/   one module per dashboard page
scripts/
  build.mjs             assembles dist/aegis from the engine + src/
  build-store.mjs       creates the Chrome Web Store-safe dist/aegis-store build
  check-store.mjs       validates the Web Store artifact
  smoke-test.mjs        end-to-end test in headless Chrome/Edge
  make-icons.mjs        icon renderer
```

The engine is used unmodified, with one exception: the build appends a single `export` to `js/background.js`, so that Aegis's extras wait for the engine to finish starting up. Aegis's messages use an `aegis:` prefix, which the engine's message handler ignores. To upgrade the engine, update the uBlock repository and rebuild.

Detailed live statistics in the development build are computed from the rules the browser reports as matched, using small indexes generated at build time (`rulesets/aegis/`): which rules are not plain blocks, and which domains are known trackers (from EasyPrivacy). No browsing data is uploaded to Aegis-operated servers.

## Privacy

Aegis does all filtering on your device. It makes no analytics or telemetry requests and does not upload browsing history to Aegis-operated servers. In builds where live rule-match statistics are available, the dashboard keeps aggregate category totals for up to 90 days and the top 400 blocked destination/site domains in local browser storage. The activity view keeps only the latest 500 rule matches in session storage. You can erase these from **Settings → Reset statistics** or clear the activity list independently.

Private-window statistics stay only in the private extension process's memory: they are not read from or written to the shared local/session stores. Closing the private session discards them.

The unpacked development build can request `declarativeNetRequestFeedback` to power detailed live counters and the Activity log. The Chrome Web Store build intentionally does not request that permission and does not depend on `declarativeNetRequest.onRuleMatchedDebug`.

See the full [privacy policy](docs/privacy.md).

The four category colors (Ads, Trackers, Annoyances, Threats) are a colorblind-safe categorical palette, validated against both the light and dark card surfaces.

## License

GPLv3. Aegis is built on [uBlock Origin / uBO Lite](https://github.com/gorhill/uBlock) by Raymond Hill and contributors. Filter lists belong to their respective authors (uBlock filters, EasyList, EasyPrivacy, Peter Lowe, URLhaus, AdGuard, and the regional list maintainers).
