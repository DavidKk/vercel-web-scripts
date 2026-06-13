# Current focus

## Objective

Harden extension shell + continue preset runtime Phase C/D (hash updates, script-level modules).

## Active execution list

- `../tasks/active/current.md` — Phase C/D preset items
- `extension/TODO.md` — extension-specific backlog (native module-loader, etc.)

## Recently landed (extension — keep docs aligned)

- Admin **Logs** tab: unified session debug buffer, filters, incognito badge/collection, Copy all
- **HTML-only** launcher injection (`injection-gate.ts`)
- Admin **DEBUG** panels: Scripts tab + Logs tab (tab-scoped visibility)
- Incognito fork for per-file script enabled keys
- Popup **Reload extension** (dev)

## Confirmed decisions

- Launcher inject **only on `text/html`** documents; static assets are a **future separate module**
- Debug log collection: single buffer; incognito logs off by default unless toggled
- Multi-service: Service = connection; scriptKey = capability scope (shared RULE/toggles)

## Next steps

1. Phase C: per-module hash compare, atomic switch, rollback (`tasks/active/current.md`)
2. Extension: native module-loader to replace interim `page-launcher.js`
3. When starting static asset work: new module + update `extension-shell.yaml` (do not widen HTML gate)

## Notes

Update this file when focus shifts. For stable architecture facts use `summary.md` and `specs/`.
