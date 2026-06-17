# Script permissions (gate + admin) — task thread

Status: **IN_PROGRESS** (implementation largely landed; verify + commit pending)

Related code: `shared/script-permission.ts`, `extension/src/shell/permission-manager.ts`, `extension/src/ui/permissions/mm-permissions-app.ts`, `extension/src/page/gm-bridge.ts`

---

## Objective

Gate **Tier-1 capabilities** at call time (not a separate `requestPermission` API). Record decisions, expose **Admin → Permissions** for audit/edit, and support DEBUG/preset testing.

---

## Permission model (confirmed — do not re-litigate)

| Dimension             | Rule                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Subject**           | `scriptKey` + `file` (not tied to storefront hostname)                                                     |
| **Resource**          | Request URL **host** for `network`; capability-specific resource for others (e.g. `*` for `unsafe-window`) |
| **Tier 0 (no gate)**  | storage, DOM, GME menu, etc.                                                                               |
| **Tier 1 (gated)**    | `network`, `clipboard-write`, `open-tab`, `download`, `unsafe-window`                                      |
| **Enforcement scope** | User scripts inside `enterScriptPermissionScope` only; preset/launcher paths do not enforce                |

### Remember levels (`ScriptPermissionRemember`)

| UI label   | Internal     | Persistence                     | Listed in Permissions |
| ---------- | ------------ | ------------------------------- | --------------------- |
| Allow once | `once`       | Not enforced after prompt       | Yes (audit history)   |
| This tab   | `session`    | In-memory per tab until close   | Yes (revocable)       |
| Always     | `persistent` | `chrome.storage.local` registry | Yes (revocable)       |

Dismissed modal → recorded as **deny + once** in history.

### contentHash (Always)

- Grant time may store `contentHash` on the registry row (**audit only**).
- **Persistent allow/deny is not invalidated by hash mismatch** — survives Update runtime / Reset runtime and script-list refresh.
- Revoke or change scope/decision only via **Admin → Permissions**.
- `vws_script_permission_registry` is **not** cleared by Update runtime / Reset runtime.

---

## Storage keys

| Key                                        | Purpose                                                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `vws_script_permission_registry`           | Persistent allow/deny (`remember: persistent`) — **not cleared** by Update/Reset runtime                              |
| `vws_script_permission_session`            | This-tab allow/deny per tab — `chrome.storage.session`, survives SW restart                                           |
| `vws_script_permission_history`            | Audit log — **every modal allow/deny** (once / this tab / always) plus admin edits; Permissions UI lists full history |
| Session maps (in-memory + session storage) | `sessionAllowKeys` / `sessionDenyKeys` per tab in `permission-manager.ts`                                             |

---

## Shell messages (extension)

| Message                                                    | Purpose                                         |
| ---------------------------------------------------------- | ----------------------------------------------- |
| `SCRIPT_PERMISSION_ENSURE`                                 | Gate before privileged GM APIs                  |
| `GET_SCRIPT_PERMISSION_REGISTRY`                           | Admin list: registry + session + once history   |
| `UPDATE_SCRIPT_PERMISSION_ENTRY`                           | Admin override scope/decision                   |
| `REMOVE_SCRIPT_PERMISSION_ENTRY`                           | Revoke persistent                               |
| `REMOVE_SESSION_PERMISSION_ENTRY`                          | Revoke session for tab                          |
| `SCRIPT_PERMISSION_SEED_CONNECTS`                          | `@connect` → session allow (Tampermonkey-style) |
| `DEBUG_PERMISSION_PROMPT` / `DEBUG_RUN_GM_PERMISSION_TEST` | Admin + preset dev tests                        |

---

## Admin Permissions UI (`admin.html#permissions`)

Delivered in this thread:

- [x] List: full audit history (all modal allow/deny: Once, This tab, Always); active grants remain revocable/editable
- [x] **Scope** + **Decision** dropdowns (`mm-native-select`); promote Once → Always / This tab
- [x] **Revoke** for active grants
- [x] File column → deep link `admin.html#scripts/script/{scriptKey}|{file}` with row focus animation
- [x] Toolbar: search + scope filter + decision filter (Refresh removed)
- [x] Table horizontal center; page copy explains Scope
- [x] DEBUG panel: modal relay to admin tab, clipboard tests, preset command-palette commands (`__IS_DEVELOP_MODE__`)

### Hash routes

| Route                           | Meaning                                                     |
| ------------------------------- | ----------------------------------------------------------- |
| `#permissions`                  | Permissions tab                                             |
| `#scripts/script/{key}\|{file}` | Scripts tab + scroll/highlight row (`mm-script-row--focus`) |

---

## Implementation map

| Area                       | Files                                                                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shared types + URL match   | `shared/script-permission.ts`, `shared/script-permission-scope.ts`                                                                                                                               |
| Registry / history storage | `extension/src/shared/extension-storage/script-permission-registry.ts`, `script-permission-history.ts`                                                                                           |
| Modal + batching + apply   | `extension/src/shell/permission-manager.ts`                                                                                                                                                      |
| Background handlers        | `extension/src/shell/background.ts`                                                                                                                                                              |
| Page gate                  | `extension/src/page/gm-bridge.ts`, `script-permission-scope.ts`, `permission-bridge-client.ts`                                                                                                   |
| Bridge                     | `extension/src/bridge/permission-modal.ts`, `bridge-listeners.ts`                                                                                                                                |
| Admin UI                   | `extension/src/ui/permissions/mm-permissions-app.ts`, `mm-permissions-debug-panel.ts`, `permissions-debug-state.ts`                                                                              |
| Preset DEBUG               | `preset/src/ui/command-palette/debug-permissions.ts`                                                                                                                                             |
| `@connect` seed            | `services/tampermonkey/createUserScript.server.ts`                                                                                                                                               |
| Tests                      | `__tests__/shared/script-permission*.spec.ts`, `__tests__/extension/permission-manager.spec.ts`, `script-permission-registry.spec.ts`, `script-permission-history.spec.ts`, `admin-hash.spec.ts` |

---

## Verification checklist

- [ ] Extension build (`pnpm run build:extension`) after `tailwind.css` fixes
- [ ] Admin Permissions: Once row visible; promote to Always; Revoke persistent
- [ ] Permissions → click File → Scripts tab focuses correct row
- [ ] Search/filter on Permissions toolbar
- [ ] DEBUG: prompt on admin tab (modal relay); clipboard / xhr tests
- [ ] Preset command palette DEBUG commands (develop mode)
- [ ] Jest: permission + admin-hash specs

---

## Open / follow-up

- [ ] Git commit (user has not requested yet)
- [ ] `extension-shell.yaml` + `extension/README.md` — Permissions tab docs (partially updated via `.ai` only)
- [x] UI folder restructure (done) → see `../done/ui-folder-restructure.md`

---

## Changelog (conversation thread)

1. Call-time permission gate (Tier 1), modal batching, bridge token, `@connect` seed
2. P0–P2 review fixes (unsafe-window, XHR host validation, session revoke, contentHash, tab-scoped inFlight)
3. Permissions history for deny + once; admin UPDATE message
4. Permissions UI: dropdowns, scripts deep link + focus animation
5. Remove Refresh; add search/filters; center table; Scope help text
6. `text-mm-text` → `text-mm-secondary` (tailwind build fix)
