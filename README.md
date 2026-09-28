# Consent Intelligence

A Chrome Manifest V3 extension that detects consent moments, reads the exact linked or opened agreement, and shows evidence-backed findings before the user decides. Detection is local. Optional agreement analysis uses [TypeSafe JEV](https://docs.typesafe.ai/) through a local coordinator so the API key never enters the extension.

Product source: `/Users/localroot/Documents/Codex/2026-09-28/referenced-chatgpt-conversation-this-is-an/outputs/consent-intelligence-pdr.md`

## What works

- Visible checkbox, radio, and accessible checkable-control detection, including the supplied Turkish checkout markup.
- Footer/navigation and common remember-me/newsletter exclusions.
- Linked HTML/text agreement retrieval with basic public-URL and size controls.
- Agreements opened in page dialogs, drawers, and modals. The extension observes them; it never synthetic-clicks the site control.
- Explicit opt-in before agreement text leaves the browser.
- JEV clause classification, candidate evidence selection, and a second citation-support check.
- Concise finding bullets, a conservative confidence percentage, source links where available, document SHA-256, versioned extraction/scoring, and hash/version cache.
- Evidence text is used internally to verify findings but is not displayed in the card.
- Deterministic risk score only when all core topics have explicit, confident coverage. Partial reviews get no risk score.

## Configure JEV

Node 24+ and a TypeSafe `JEV_API_KEY` are required for analysis. Get a key from [TypeSafe](https://typesafe.ai/), then explicitly set it before starting the server:

```bash
cp .env.example .env
```

Open `.env` and replace the placeholder:

```dotenv
JEV_API_KEY=your_actual_key_here
```

`.env` is git-ignored and the key stays in the local coordinator; never put it in extension settings or commit it. The server refuses analysis when `JEV_API_KEY` is missing.

## Run

```bash
npm test
npm run server
```

Then:

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select this directory.
3. Open the extension’s **Privacy & settings**, enable analysis, and keep `http://127.0.0.1:8787` as the server.
4. Visit a signup or checkout flow. For agreements implemented as page buttons, open the agreement yourself, then press **Analyze agreement** in the card.

The server binds only to `127.0.0.1`. Its cache lives under `.cache/` and contains assessments/evidence from analyzed public agreements.

## Privacy and limits

The content script reads labels, nearby actions, agreement controls, and a linked/open agreement. It does not read input values, credentials, cookies, payment data, or record whether the user accepts. Routine telemetry and browsing history do not exist. Only agreement text, its public URL when available, and its visible title are sent to the configured analysis server after the user presses **Analyze agreement**.

This is not legal advice. JEV supplies narrow typed judgments; code owns evidence checks and scoring. Findings may still be incomplete or wrong. ToS;DR matching, authenticated/script-only documents, PDFs, cross-origin frames, nonlocal deployment authentication, and a calibrated release evaluation set remain outside this local MVP.
