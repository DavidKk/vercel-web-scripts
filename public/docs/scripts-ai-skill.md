# MagickMonkey — AI / integration skill

Use this when you should **read or change user script files** stored in the project’s GitHub Gist **without opening the web editor**.

## When to use

- Read, search, create, update, rename, validate, or delete managed `.ts` / `.js` userscript files in the Gist.
- Generate browser userscript code that will run after the MagickMonkey launcher loads the shared preset runtime.
- Make token-efficient remote edits through MCP tools instead of copying full files into the conversation.
- Inspect available runtime APIs before authoring code, especially `GM_*`, `GME_*`, and injected constants.

## When not to use

- Do **not** use this to install runtime for browser end users. Browser users install the launcher userscript URL, not `/api/mcp`.
- Do **not** use this to edit the launcher, preset bundle, generated entry file, rules JSON, or other project source files.
- Do **not** use this for generic browser automation or scraping when no Gist script file should be read or changed.
- Do **not** call write tools when the target domains, path patterns, activation mode, or runtime timing are unclear.
- Do **not** default to broad `@match` patterns like `*://*/*`, broad `@connect` targets, or unnecessary `@grant` values.
- Do **not** put API keys into Gist files, generated scripts, page DOM, console examples, prompts, commits, or user-visible output.

## Authentication

- **Browser session**: same cookie as the admin UI after login.
- **Automation / MCP / API clients**: provide `x-api-key` in request headers. If your MCP client supports env-driven headers, set `SCRIPTS_MCP_HEADERS` as a JSON string in that client/deployment.
  - Example env: `SCRIPTS_MCP_HEADERS='{"x-api-key":"<your-key>","x-org-id":"acme"}'`
  - Required auth header for integration APIs: `x-api-key: <your-key>`
- **Signed-in admin users**: `GET /api/mcp/headers` can return the MCP endpoint and configured headers for the current deployment.

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

Tools:

- Baseline CRUD: `scripts_runtime_summary`, `scripts_list`, `scripts_get`, `scripts_upsert`, `scripts_delete`, `scripts_rename`.
- Token-efficient reads/edits: `scripts_search`, `scripts_snippet`, `scripts_replace`, `scripts_patch`, `scripts_batch_patch`, `scripts_validate`.

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

Default to `GME_*` helpers when they match the task. Use `GM_*` when you need Tampermonkey compatibility, native userscript storage, tab/menu primitives, resources, or low-level network behavior. Treat the lists below as a compact orientation, not a complete type reference.

**Tampermonkey-style `GM_*` (subset; see typings for full signatures)**

| Area             | APIs                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Network          | `GM_xmlhttpRequest`                                                                                                                        |
| Storage          | `GM_getValue`, `GM_setValue`, `GM_deleteValue`, `GM_listValues`, `GM_getValues`, `GM_setValues`, `GM_deleteValues`, value change listeners |
| UI / page        | `GM_addElement`, `GM_addStyle`, `GM_registerMenuCommand`, `GM_unregisterMenuCommand`, `GM_notification`, `GM_openInTab`, `GM_download`     |
| Resources / meta | `GM_getResourceText`, `GM_getResourceURL`, `GM_log`, `GM_setClipboard`, `GM_info`                                                          |
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

**Advanced / use sparingly**

- `unsafeWindow`, `GM_webRequest`, and `GM_cookie` are available in the typings but should be used only when the task explicitly needs page-window access, request interception, or cookie-level behavior.
- `scripts_runtime_summary` returns a compact machine-readable summary. For exact function signatures, use `preset/src/editor-typings.d.ts` as the source of truth.

### Maintenance note (keep docs in sync)

If you add or modify any `GM_*` / `GME_*` interface in the preset (source of truth: `preset/src/editor-typings.d.ts` and preset runtime code), you MUST update:

- This document’s **Capability summary** table (`GM_*` / `GME_*`) and the typical injected constants list.
- The MCP tool output list returned by `scripts_runtime_summary` (source: `services/scripts/scriptMcpTools.ts`) so AI sees the same reality.
- The static function-tool reference (`public/docs/scripts-function-tools.json`) when tool descriptions or authoring constraints change.

**Authoring rules**

- One userscript header block (`// ==UserScript==` … `// ==/UserScript==`) per Gist file; `@match` / `@grant` / `@connect` as needed.
- Before writing or updating a userscript, explicitly identify the intended header metadata and return it for user confirmation in most cases:
  - `@name`: short, user-visible script name.
  - `@version`: semantic script version; preserve and bump existing versions intentionally.
  - `@description`: concise behavior summary.
  - `@match`: domains and path patterns where the script should run.
  - `@run-at`: when the script should run; supported values are `document-start`, `document-body`, `document-end`, and `document-idle`.
  - `@grant` / `@connect`: only when needed by the APIs or network targets used.
- Treat `@match` and `@run-at` as confirmation-critical fields:
  - Ask/confirm which domains and path patterns should be covered by `@match`.
  - Prefer the narrowest practical `@match` patterns, such as `https://<target-host>/<target-path>/*`.
  - Do not use broad patterns such as `*://*/*` unless the user explicitly asks for all supported sites/paths or the task is clearly universal.
  - Choose `@run-at` based on timing needs: use `document-start` only for early interception, `document-body` when `document.body` is enough, `document-end` for DOMContentLoaded behavior, and `document-idle` for most page enhancement/automation scripts.
  - If the scope or timing is unknown, pause and ask before calling `scripts_upsert`.
- Activation can come from either script metadata or configured rules:
  - Header `@match` is compiled into the generated userscript and checked at runtime.
  - UI/API rules can also activate a script by filename through `matchRule("<filename>")`.
  - Ask whether the user wants fixed header `@match` patterns, dynamic rule-based activation, or both. Avoid broad header matches when a configured rule is the better fit.
- Confirmation example:

```ts
// @name <Script Name>
// @version <Version>
// @description <Short behavior summary>
// @match <scheme>://<target-host>/<target-path>/*
// @run-at document-idle
```

- Output **only** the Gist file body over MCP; do not inline the preset.
- Before `scripts_upsert`, sanity-check the final content:
  - Ensure the header block is present exactly once.
  - Use `scripts_validate` for remote userscript header sanity. It is not a full TypeScript/JavaScript compiler.
  - For TypeScript/JavaScript, run an additional syntax/transpile check when a local toolchain is available.
  - If you cannot run a check, inspect generated string escapes and state the residual risk.
- Prefer token-efficient remote editing tools:
  - Use `scripts_search` before `scripts_get` when locating code.
  - Use `scripts_snippet` to inspect bounded line ranges instead of full files.
  - Use `scripts_replace` for small exact replacements and set `expectedCount` whenever possible.
  - Use `scripts_patch` for structured local edits in one file.
  - Use `scripts_batch_patch` for related changes across multiple files.
  - Use `scripts_get` + `scripts_upsert` only for full-file review, large rewrites, or when patch tools are insufficient.

## Workflow

1. `scripts_runtime_summary` first (runtime APIs + constraints).
2. `scripts_list` (or `GET /api/v1/scripts`) to see names.
3. For updates, start with `scripts_search` / `scripts_snippet`; use `scripts_get` only when full-file context is needed.
4. For new scripts, propose the userscript header metadata, especially activation mode, `@match`, and `@run-at`, and get user confirmation before drafting or writing content in most cases.
5. Use the narrowest safe edit path: `scripts_replace` for simple replacements, `scripts_patch` for local edits, `scripts_batch_patch` for related multi-file edits, and `scripts_upsert` only for full rewrites.
6. (optional) `scripts_rename` to change the managed filename before editing.
7. Validate or inspect the final script content with `scripts_validate` or an equivalent local check.
8. User can publish from UI or rely on Gist sync as configured.
