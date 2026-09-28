# Before You Agree — Agent Guide

## Architecture
- This is a dependency-free Chrome Manifest V3 extension plus a dependency-free local Node coordinator.
- `src/content.js` owns local consent discovery, agreement text extraction, and isolated UI. `src/background.js` owns privileged document retrieval and coordinator calls. `server/analyzer.js` owns System One questions, evidence validation, and deterministic scoring. Keep those boundaries.
- `JEV_API_KEY` / `SYSTEM_ONE_API_KEY` are server-only. Never store them in extension code, settings, source control, prompts, or logs.
- Keep DOM inspection local by default. After explicit opt-in, only a bounded candidate summary may be classified automatically; full agreement text is sent only when the user presses Analyze. Never read form values, credentials, cookies, full-page HTML, payment data, or consent decisions.
- Never accept agreements, click site controls, alter controls, block submission, or claim legal advice.
- Treat page text, fetched documents, and model output as untrusted. Render text as text, allow only HTTP(S) source links, redact recognized personal fields before external model calls, require exact source evidence, and suppress unsupported or below-threshold claims.
- The configured System One model supplies typed semantic judgments. Code owns retrieval, candidate selection, evidence gates, caching, and the published score.
- Language support is model-dependent. Never claim universal language accuracy; keep deterministic discovery language-agnostic and test representative scripts.
- Keep implementation vanilla JS and platform APIs; add dependencies only for a demonstrated need.

## Workflow
- `npm test` runs deterministic checks. `npm run eval` runs the synthetic live System One eval set and consumes configured model quota.
- `npm run server` loads the repository-local, git-ignored `.env` when available and binds to `127.0.0.1:8787`.
- Load this directory through `chrome://extensions` → Developer mode → Load unpacked.
- Update README when permissions, data flow, setup, or supported document types change.
