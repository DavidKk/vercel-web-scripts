# Context summary

## Project

Vercel Web Scripts (MagickMonkey) is a Tampermonkey-oriented script platform: web editor, OTA publishing, Chrome extension shell, and preset runtime on customer pages.

## Runtime modules (preset OTA)

Canonical list: `../specs/modules-registry.yaml`

| Module        | Status in implementation                                                |
| ------------- | ----------------------------------------------------------------------- |
| Launcher      | ✅ Extension `page-launcher.js` + TM install path                       |
| Preset Core   | ✅ OTA `preset-core` via module manifest                                |
| Preset UI     | ✅ Lazy optional UI bundle                                              |
| Editor Lib    | ✅ Lazy optional CM6 editor (`ensureEditorLib` / `GME_ensureEditorLib`) |
| Script Bundle | ✅ OTA remote bundle; aggregate path (match-modular Phase D)            |

Phase A/B/C: **DONE** — `../tasks/done/runtime-modularization-phase-a-b-c.md`.

Phase D (match-based script modules): **TODO** — `../tasks/backlog/runtime-phase-d.md`.

## Engineering / tech debt (2026-06-27)

| Item                              | Status         | Doc                                                    |
| --------------------------------- | -------------- | ------------------------------------------------------ |
| Large file split (Phase 1–2, 4–5) | DONE           | `tasks/done/large-file-split.md`                       |
| CSS logical properties review     | DONE           | `tasks/done/css-logical-properties-review.md`          |
| Script permissions                | DONE           | `tasks/done/script-permissions.md`                     |
| OTA publish policy                | DONE           | `tasks/done/ota-publish-policy.md`                     |
| Runtime Phase A–C                 | DONE           | `tasks/done/runtime-modularization-phase-a-b-c.md`     |
| Extension native loader           | TODO           | `tasks/backlog/extension-native-loader.md`             |
| Runtime Phase D                   | TODO           | `tasks/backlog/runtime-phase-d.md`                     |
| UI cross-module dedup             | DONE (Phase A) | `tasks/backlog/ui-cross-module-dedup.md` (B/C/D defer) |

Normative rules: `rules/engineering-standards.md`.

## Extension shell (Chrome MV3)

Canonical map: `../specs/extension-shell.yaml`

| Area                     | Status                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| Multi-service            | ✅ Service list + scriptKey scope (see `extension/docs/multi-service-tasks.md`)              |
| Admin tabs               | ✅ Servers, Scripts, Rules, **Logs**, **Permissions** (`admin.html#…`)                       |
| Script permissions       | ✅ Tier-1 gate + modal; registry/session/once history; Admin edit + DEBUG                    |
| Popup                    | ✅ Shell toggle, log mode, reload extension (dev)                                            |
| Debug log viewer         | ✅ Session ring buffer; incognito collection gate; Copy all (TSV)                            |
| HTML-only inject         | ✅ `injection-gate.ts` — non-HTML docs skip launcher                                         |
| Scripts/Logs DEBUG       | ✅ Per-tab floating panels (`mm-*-debug-panel`)                                              |
| Incognito script toggles | ✅ Separate storage fork for script enabled                                                  |
| Native module-loader     | 🔜 Backlog — `tasks/backlog/extension-native-loader.md` (XHR 已在 background；编排仍在 page) |
| Static asset rewrite     | 🔜 Planned separate module (not in launcher path)                                            |

## Injection policy (important)

Only **`text/html`** top-level documents receive launcher injection.  
See `../specs/extension-injection-policy.md`.

## Documentation drift to avoid

- Do **not** describe runtime as a single undifferentiated preset blob; extension already loads `preset-core` + bundle via manifest.
- Do **not** assume inject on JSON/image/video/SVG URLs.
- `shouldInjectOnUrl` (RULE) exists but MVP injects all HTML pages; URL match for scripts is preset-side (see multi-service T6.10).

## Process baseline

- Major platform changes: `../workflow/requirements-audit.md` → `../workflow/module-development.md`
- Extension shell changes: read `extension-shell.yaml` + `extension-injection-policy.md`
- Terminology: `../knowledge/glossary.md`
