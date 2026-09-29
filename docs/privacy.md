---
title: Aegis Privacy Policy
---

# Aegis Privacy Policy

_Last updated: September 29, 2026_

Aegis is a browser extension that blocks advertisements, trackers, malicious requests, annoyances, and other unwanted network activity. Its filtering engine is based on uBlock Origin Lite.

## Summary

Aegis is designed to process browsing-related information locally on your device. Aegis does not include analytics or telemetry, does not sell personal data, and does not transmit your browsing history to Aegis-operated servers.

## Information Aegis processes

To provide blocking, per-site controls, filtering statistics, and related user-facing features, Aegis may process information about the pages and network requests handled by your browser. Depending on the browser and distribution channel, this may include:

- the hostname or URL of the site you are visiting;
- the hostname or URL of network requests evaluated by the blocking engine;
- which filtering rule or ruleset matched a request;
- per-site protection settings and trusted-site choices;
- custom filters and custom filter-list URLs that you choose to add;
- local blocking statistics and extension settings.

This information is used only to provide Aegis's filtering and user-facing controls.

## Local storage

Aegis stores its settings locally in browser extension storage.

In builds where live rule-match information is available, Aegis may also keep local blocking statistics, including aggregate category totals for up to 90 days, the top blocked destination/site domains, and a short recent activity list. The activity list is stored in session storage and is not intended as a permanent browsing history.

Private/incognito-window statistics are not persisted by Aegis and are discarded when the private extension context closes.

You can remove Aegis's locally stored statistics from the extension's Settings page, or remove all extension data by uninstalling Aegis and clearing its extension data through the browser.

## Chrome Web Store build

The Chrome Web Store build does not request Chrome's `declarativeNetRequestFeedback` debug permission and does not use the unpacked-only `declarativeNetRequest.onRuleMatchedDebug` API. Detailed live activity logging that depends on that debugging API is therefore unavailable in the Web Store build.

The Web Store build may use Chrome's `activeTab` permission when you explicitly interact with Aegis so it can show information about filtering on the current tab.

## Custom filter lists

If you choose to add a custom filter-list URL, Aegis may contact that URL to download or update the list. The operator of that remote server may receive normal network information associated with an HTTP request, such as your IP address and request metadata. Aegis does not send your browsing history to custom filter-list providers.

Aegis does not control third-party filter-list servers. Their own privacy policies apply to requests made to them.

## Data sharing and sale

Aegis does not sell personal or sensitive user data.

Aegis does not transfer browsing activity to advertisers, data brokers, or other third parties for advertising, profiling, or monetization.

Aegis does not permit humans to read users' browsing data through an Aegis-operated service because Aegis does not operate a server that receives that browsing data.

## Analytics and telemetry

Aegis contains no analytics SDK and no telemetry service. The extension does not send usage analytics or browsing statistics to Aegis-operated servers.

## Permissions

Aegis requests browser permissions needed to perform its disclosed functions. These permissions include network filtering, host access, local storage, scripting needed for cosmetic filtering and user-created filters, alarms for timed pause/resume behavior, and other extension APIs used by the filtering engine.

Aegis aims to request only permissions needed for functionality available in the installed build.

## Security

Aegis is open source. The source code used to build the extension is available in the public GitHub repository at `Ponze08/aegis-adblocker`.

Manifest V3 filtering rules are packaged with the extension. Custom user scripts and custom filter behavior are handled using browser APIs intended for those purposes.

## Children's privacy

Aegis does not knowingly collect personal information from children through an Aegis-operated server. Because Aegis does not operate analytics, account, or telemetry services, it does not maintain a server-side user database.

## Changes to this policy

This privacy policy may be updated when Aegis changes how it handles data or when browser-store requirements change. The latest version will be published with the project.

## Contact

For privacy questions or issues, use the public issue tracker for the Aegis GitHub repository. Do not include sensitive browsing data in a public issue.
