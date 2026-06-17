# Done: `extension/src/ui` folder restructure

Status: **DONE** (2026-06-16)

Source: agent REVIEW of flat `extension/src/ui` (47 files).

---

## Goal

Reduce root-level clutter; colocate each Admin tab + its DEBUG helpers.

---

## Implemented layout

```
ui/
  admin/           # hash, router, tabs, nav, view-lifecycle, debug-panel-visibility
  servers/         # mm-options-app.ts
  scripts/         # mm-scripts-app, footer, scripts-hash, *-debug-*
  permissions/     # mm-permissions-app, *-debug-*
  rules/           # mm-rules-app, mm-rules-hash
  logs/            # mm-logs-app, mm-logs-filter, *-debug-*
  popup/           # mm-popup-app, popup-version-footer
  shared/          # toast, tooltip, format-relative-time, createMmSwitch, checkbox enhance
  mm-form-components/
  mm-icons/
  mm-notification/
  mm-form-components.ts
  tailwind.css
  document-css-entry.ts
```

### Hash modules

- `mm-rules-hash.ts` → `rules/`; `mm-scripts-hash.ts` → `scripts/`; `admin/mm-admin-hash.ts` imports both.

### Preserved separation

- `shared/mm-switch.ts` (factory) ≠ `mm-form-components/mm-switch.ts` (Web Component)
- `shared/mm-checkbox.ts` (enhance helper) ≠ `mm-form-components/mm-checkbox.ts`

---

## Migration completed

1. Updated `@ext/ui/*` imports in `extension/src/pages/admin/admin.ts`, `shell/popup/popup.ts`
2. Updated Jest specs under `__tests__/extension/`
3. Updated `.ai/specs/extension-shell.yaml` paths
4. Custom element tags unchanged (`mm-permissions-app`, etc.)
