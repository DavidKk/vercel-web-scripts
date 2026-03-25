# MagickMonkey — AI / integration skill

Use this when you should **read or change user script files** stored in the project’s GitHub Gist **without opening the web editor**.

## Authentication

- **Browser session**: same cookie as the admin UI after login.
- **Automation / MCP / API clients**: set env `SCRIPTS_API_KEY` on the deployment, then send:
  - `Authorization: Bearer <SCRIPTS_API_KEY>`, or
  - `x-api-key: <SCRIPTS_API_KEY>`

Never commit the API key or paste it into user-visible pages.

## REST (OpenAPI)

- Spec: `GET /api/v1/openapi.json` (authenticated).
- List files: `GET /api/v1/scripts`
- Read file: `GET /api/v1/scripts/{filename}` (URL-encode `filename`)
- Write file: `PUT /api/v1/scripts/{filename}` with JSON `{ "content": "..." }`
- Delete file: `DELETE /api/v1/scripts/{filename}`

Only `.ts` / `.js` files that are **not** the generated entry or rules JSON can be mutated.

## MCP (HTTP)

- Base URL: `GET /api/mcp` (manifest), `POST /api/mcp` (JSON-RPC 2.0: `initialize`, `tools/list`, `tools/call`, or legacy `{ "tool": "scripts_list", "params": {} }`).

Tools: `scripts_runtime_summary`, `scripts_list`, `scripts_get`, `scripts_upsert`, `scripts_delete`, `scripts_rename`.

**End users do not “install” `/api/mcp`.** That URL is only for MCP clients (e.g. Cursor) that call JSON-RPC to edit **Gist files**. It does **not** run in the browser and does **not** load the preset.

**Browser users** install the launcher userscript from:

`https://<host>/static/<scriptKey>/tampermonkey.user.js`

After they install that once, the launcher loads **preset** and **remote bundle** in the page. They use **preset** automatically (`GME_*`, injected constants, etc.); nothing extra is configured via MCP for runtime.

## Runtime (preset) vs Gist files

- **MCP / REST only return what is stored in the Gist** (per-file source). They do **not** embed the **preset** bundle (`preset.js` / launcher glue).
- In the browser, execution order is roughly: **launcher → preset (shared runtime) → your Gist modules**. Your script should assume **Tampermonkey-compatible `GM_*` APIs** and **MagickMonkey `GME_*` extensions** are already on `globalThis` when the user runs the bundled stack.
- **Do not paste the full `editor-typings.d.ts` into prompts**: it is large (~900+ lines) and hurts context. Use this section for orientation; open the typings file in the repo when you need exact signatures.

### Where the full API lives (source of truth)

- Repo: `preset/src/editor-typings.d.ts` (edited by humans).
- Generated mirror: `lib/tampermonkey-editor-typings.generated.ts` (after `pnpm run build:preset`).

### Capability summary (for AI script authors)

**Tampermonkey-style `GM_*` (subset; see typings for full signatures)**

| Area             | APIs                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Network          | `GM_xmlhttpRequest`                                                                                                                        |
| Storage          | `GM_getValue`, `GM_setValue`, `GM_deleteValue`, `GM_listValues`, `GM_getValues`, `GM_setValues`, `GM_deleteValues`, value change listeners |
| UI / page        | `GM_addElement`, `GM_addStyle`, `GM_registerMenuCommand`, `GM_unregisterMenuCommand`, `GM_notification`, `GM_openInTab`, `GM_download`     |
| Resources / meta | `GM_getResourceText`, `GM_getResourceURL`, `GM_log`, `GM_setClipboard`                                                                     |
| Tabs             | `GM_getTab`, `GM_saveTab`, `GM_getTabs`                                                                                                    |
| Advanced         | `GM_webRequest`, `GM_cookie`                                                                                                               |

**MagickMonkey `GME_*` (preset extensions — prefer these when they match your need)**

| Area                    | APIs                                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Menus (richer than GM)  | `GME_registerMenuCommand`, `GME_updateMenuCommand`                                                                                 |
| Command palette         | `GME_registerCommandPaletteCommand`, `GME_openCommandPalette`                                                                      |
| Node toolbar / dev UX   | `GME_registerNodeToolbar`, `GME_registerNodeToolbarQuery`, `GME_unregisterNodeToolbar`                                             |
| Network / tooling       | `GME_fetch`, `GME_curl`, `GME_preview`                                                                                             |
| DOM / timing            | `GME_waitFor`, `GME_watchFor`, `GME_watchForVisible`, `GME_pollFor`, `GME_sleep`, `GME_isVisible`                                  |
| Utilities               | `GME_debounce`, `GME_throttle`, `GME_sha1`, `GME_md5`, `GME_uuid`                                                                  |
| Logging / notifications | `GME_ok`, `GME_info`, `GME_warn`, `GME_fail`, `GME_group`, `GME_notification`, `GME_notification_update`, `GME_notification_close` |

**Injected constants (typical)**

- `__BASE_URL__`, `__RULE_API_URL__`, `__EDITOR_URL__`, `__PROJECT_VERSION__`, `__SCRIPT_UPDATED_AT__`, `__PRESET_BUILD_HASH__` — see typings for exact types.

### Maintenance note (keep docs in sync)

If you add or modify any `GM_*` / `GME_*` interface in the preset (source of truth: `preset/src/editor-typings.d.ts` and preset runtime code), you MUST update:

- This document’s **Capability summary** table (`GM_*` / `GME_*`) and the typical injected constants list.
- The MCP tool output list returned by `scripts_runtime_summary` (source: `services/scripts/scriptMcpTools.ts`) so AI sees the same reality.

**Authoring rules**

- One userscript header block (`// ==UserScript==` … `// ==/UserScript==`) per Gist file; `@match` / `@grant` / `@connect` as needed.
- Output **only** the Gist file body over MCP; do not inline the preset.

## Workflow

1. `scripts_runtime_summary` first (runtime APIs + constraints).
2. `scripts_list` (or `GET /api/v1/scripts`) to see names.
3. `scripts_get` / GET to read.
4. (optional) `scripts_rename` to change the managed filename before editing.
5. `scripts_upsert` / PUT to apply edits; then user can publish from UI or rely on Gist sync as configured.
