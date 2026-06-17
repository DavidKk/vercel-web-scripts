# Current focus

## Objective

Harden extension shell (script permissions admin) + continue preset runtime Phase C/D (hash updates, script-level modules).

## Active execution list

- `../tasks/active/script-permissions.md` — permission gate + Admin Permissions tab (verify/commit)
- `../tasks/active/current.md` — Phase C/D preset items
- `extension/TODO.md` — extension-specific backlog (native module-loader, etc.)

## Recently landed (extension — keep docs aligned)

- **Script permissions**: call-time gate (Tier 1), modal batching, registry + session + once history, Admin **Permissions** tab (`#permissions`) with search/filters and scripts deep link (`#scripts/script/…`)
- Admin **Logs** tab: unified session debug buffer, filters, incognito badge/collection, Copy all
- **HTML-only** launcher injection (`injection-gate.ts`)
- **UI cross-module review** (2026-06-18): `specs/ui-cross-module-review.md` — WEB / Extension / Preset 重复项与 `shared/ui/` 分层建议
- Admin **DEBUG** panels: Scripts + Logs + Permissions (tab-scoped visibility)
- Incognito fork for per-file script enabled keys
- Popup **Reload extension** (dev)

## Confirmed decisions

- Launcher inject **only on `text/html`** documents; static assets are a **future separate module**
- Debug log collection: single buffer; incognito logs off by default unless toggled
- Multi-service: Service = connection; scriptKey = capability scope (shared RULE/toggles)

## Next steps

1. Script permissions: run verification checklist in `tasks/active/script-permissions.md`; commit when ready
2. Phase C: per-module hash compare, atomic switch, rollback (`tasks/active/current.md`)
3. Extension: native module-loader to replace interim `page-launcher.js`
4. UI dedup（待排期）: `tasks/backlog/ui-cross-module-dedup.md` + `specs/ui-cross-module-review.md`
5. 大文件拆分（待排期）: `tasks/backlog/large-file-split.md`
6. CSS 逻辑属性审查（待排期）: `tasks/backlog/css-logical-properties-review.md` — padding-inline 等用法与冗余声明

## Notes

Update this file when focus shifts. For stable architecture facts use `summary.md` and `specs/`.
