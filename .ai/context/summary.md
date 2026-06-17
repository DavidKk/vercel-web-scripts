# Context summary

## Project

Vercel Web Scripts (MagickMonkey) is a Tampermonkey-oriented script platform: web editor, OTA publishing, Chrome extension shell, and preset runtime on customer pages.

## Runtime modules (preset OTA)

Canonical list: `../specs/modules-registry.yaml`

| Module        | Status in implementation                                     |
| ------------- | ------------------------------------------------------------ |
| Launcher      | ✅ Extension `page-launcher.js` + TM install path            |
| Preset Core   | ✅ OTA `preset-core` via module manifest                     |
| Preset UI     | ✅ Lazy optional UI bundle                                   |
| Script Bundle | ✅ OTA remote bundle; aggregate path (match-modular Phase D) |

Phase A/B contracts and split foundation: **DONE** (see `../tasks/active/current.md`).

Phase C (per-module hash update / rollback) and Phase D (match-based script modules): **TODO**.

## Extension shell (Chrome MV3)

Canonical map: `../specs/extension-shell.yaml`

| Area                     | Status                                                                          |
| ------------------------ | ------------------------------------------------------------------------------- |
| Multi-service            | ✅ Service list + scriptKey scope (see `extension/docs/multi-service-tasks.md`) |
| Admin tabs               | ✅ Servers, Scripts, Rules, **Logs**, **Permissions** (`admin.html#…`)          |
| Script permissions       | ✅ Tier-1 gate + modal; registry/session/once history; Admin edit + DEBUG       |
| Popup                    | ✅ Shell toggle, log mode, reload extension (dev)                               |
| Debug log viewer         | ✅ Session ring buffer; incognito collection gate; Copy all (TSV)               |
| HTML-only inject         | ✅ `injection-gate.ts` — non-HTML docs skip launcher                            |
| Scripts/Logs DEBUG       | ✅ Per-tab floating panels (`mm-*-debug-panel`)                                 |
| Incognito script toggles | ✅ Separate storage fork for script enabled                                     |
| Native module-loader     | 🔜 Replace interim page-launcher (see `extension/TODO.md`)                      |
| Static asset rewrite     | 🔜 Planned separate module (not in launcher path)                               |

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
