# Chrome Web Store submission notes

This file contains the release and review information for the Chrome Web Store build of Aegis.

## Build the upload ZIP

Requirements:

- Node.js 22+
- the uBlock Origin repository next to this repository, checked out at commit `d34727edfeef5ada28807edebe43073ced1142e9`

Build:

```bash
npm run build:store:fresh
npm run check:store
```

The store-ready extension is written to:

```text
dist/aegis-store/
```

When creating the upload ZIP, `manifest.json` must be at the root of the ZIP.

Example on Linux/macOS:

```bash
cd dist/aegis-store
zip -qr ../aegis-chrome-web-store.zip .
```

Example on Windows PowerShell from the repository root:

```powershell
Compress-Archive -Path .\dist\aegis-store\* -DestinationPath .\dist\aegis-chrome-web-store.zip -Force
```

The GitHub Actions workflow also builds and uploads `aegis-chrome-web-store.zip` as a workflow artifact.

## Store listing

### Name

Aegis – Ad & Tracker Blocker

### Summary

A fast, privacy-focused ad and tracker blocker powered by the uBlock Origin Lite filtering engine.

### Single purpose

Aegis protects web browsing by blocking ads, trackers, malicious requests, annoyances, and other unwanted network activity using Manifest V3 declarative filtering.

### Suggested category

Privacy & Security

### Description

Aegis is a privacy-focused content blocker for Chrome. It uses the uBlock Origin Lite filtering engine with a redesigned interface and Manifest V3 declarative network rules.

Features include:

- ad and tracker blocking;
- protection against known malicious and unwanted requests;
- Basic, Standard, and Strict protection levels;
- per-site protection controls and trusted sites;
- cosmetic filtering and element hiding;
- built-in and optional regional filter lists;
- custom filters and optional custom filter-list URLs;
- timed global pause and automatic resume;
- import/export and local extension settings;
- a current-tab blocking count when supported by Chrome's user-granted tab access.

Aegis performs filtering locally in the browser. It contains no analytics or telemetry and does not upload browsing history to Aegis-operated servers.

The Chrome Web Store build intentionally omits Chrome's unpacked-only `declarativeNetRequestFeedback` debugging permission. As a result, detailed live request logging and long-term live-match statistics that depend on that debugging API are not available in the Web Store build.

Aegis is an independent GPLv3 project built using the uBlock Origin Lite engine by Raymond Hill and contributors. The source code is publicly available in this repository.

## Permission justifications

Use these explanations in the Privacy practices / permissions section of the Chrome Web Store Developer Dashboard.

### `activeTab`

Used only after a user interacts with Aegis to inspect filtering information for the current tab and to run user-requested page tools. It also allows Chrome's `declarativeNetRequest.getMatchedRules()` fallback for that user-granted tab.

### `alarms`

Used to implement timed pause/resume behavior so protection can automatically turn back on after the duration selected by the user.

### `declarativeNetRequest`

Core permission used to block or modify unwanted network requests with Manifest V3 declarative rules.

### `offscreen`

Used by the filtering engine for background operations that require an offscreen document / DOM-capable context, including filter-processing support.

### `scripting`

Used for cosmetic filtering, page-level filtering behavior, and user-requested element picker/hider tools.

### `storage`

Used to store extension settings, protection levels, trusted-site choices, custom filters, enabled filter lists, and local Aegis state.

### `unlimitedStorage`

Used by the filtering engine so filter data, custom rules, and extension state are not limited by the normal extension storage quota as users enable or add filter lists.

### `userScripts`

Used for user-created filters and scriptlet behavior supported by the filtering engine. The User Scripts API is Chrome's documented API for running user-provided script logic. Users may need to enable Chrome's Allow User Scripts setting for functionality that requires it.

### Host permission: `<all_urls>`

A content blocker must be able to apply filtering and cosmetic rules on the websites the user visits. Host access is therefore required across normal web origins for Aegis's disclosed blocking purpose.

## Permissions intentionally omitted from the Store build

### `declarativeNetRequestFeedback`

Not included. Chrome documents its rule-match debug functionality as intended for unpacked extensions, and the Store build does not rely on it.

### `webNavigation`

Not included in the Store build. Aegis uses it only to maintain the detailed live per-navigation statistics associated with the unpacked debug build. It is not required for core content blocking.

## Remote code declaration

Aegis does not load ordinary remotely hosted JavaScript into extension pages and does not use `eval()` to execute remotely fetched application logic.

Users can optionally add custom filter-list URLs. Filter data may include user-script/filter behavior handled through Chrome's documented User Scripts API. Chrome Web Store policy explicitly provides an exception for remote logic executed through the User Scripts API when used for its documented purpose.

For the Developer Dashboard remote-code question, describe this behavior accurately rather than claiming that Aegis never obtains user-provided filter logic from remote lists.

Suggested reviewer note:

> Aegis is Manifest V3 and ships its application/filtering engine code in the extension package. Users may optionally add custom filter-list URLs. Any user-provided scriptlet/user-script behavior is handled through Chrome's `userScripts` API, which is the documented browser API used by the underlying filtering engine for user-supplied script logic. Aegis does not inject remotely hosted `<script>` files into extension pages and does not execute fetched JavaScript with `eval()`.

## User-data disclosure

Aegis handles web browsing activity locally because blocking necessarily evaluates the sites and network requests being browsed. This processing is required for the extension's user-facing blocking functionality.

In the Web Store privacy disclosures, disclose **Web browsing activity** rather than claiming the extension handles no user data.

The data is used for the extension's single purpose: filtering unwanted web content and showing related user-facing information. It is not sold, used for advertising, or sent to Aegis-operated analytics/telemetry services.

If the dashboard asks whether data is sold or used for unrelated purposes, the intended answers are no. Certify the Limited Use statements only while the released code and privacy policy continue to match those statements.

## Privacy policy

The repository contains `docs/privacy.md`. Enable GitHub Pages from the repository's `docs/` directory and use the resulting public `privacy.html` URL in the Chrome Web Store Privacy Policy field.

Expected URL after GitHub Pages is enabled:

```text
https://ponze08.github.io/aegis-adblocker/privacy.html
```

Verify the URL is publicly reachable before submitting the extension.

## Listing assets

Prepare at least one accurate screenshot of the Web Store build. Recommended screenshots:

1. Aegis popup / protection level.
2. Protection settings.
3. Filter lists.
4. Site settings.
5. Custom filters / element hiding.

Do not use an unpacked-build Activity Log screenshot to advertise the Chrome Web Store build, because the detailed live debug log is intentionally unavailable there.

## Before submitting

- Build `npm run build:store:fresh`.
- Run `npm run check:store`.
- Test `dist/aegis-store` with **Load unpacked** in Chrome.
- Verify blocking, popup controls, protection levels, site settings, custom filters, pause/resume, and filter-list management.
- Confirm the Store build's manifest does not contain `declarativeNetRequestFeedback` or `webNavigation`.
- Verify the privacy-policy URL works publicly.
- Use screenshots taken from the Store build.
- Ensure the Chrome Web Store developer account has 2-Step Verification enabled.
- Upload the ZIP with `manifest.json` at its root.
