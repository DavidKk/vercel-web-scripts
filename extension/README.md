# MagickMonkey Chrome Extension

Native **Chrome loading shell** for MagickMonkey: background + popup + scripts page + content runtime. Loads OTA modules (`preset-core`, `script-bundle`) from your MagickMonkey server — **without Tampermonkey**.

This is **not** a port of `tampermonkey.user.js`. Tampermonkey remains a separate path. The extension shares **server OTA contracts** only.

Full roadmap: **[TODO.md](./TODO.md)**.

## MVP (current)

| Feature                                                                          | Status |
| -------------------------------------------------------------------------------- | ------ |
| Toolbar **popup** (fixed menu on every tab)                                      | ✅     |
| **Badge** — real trigger count; red background if any script failed on this load | ✅     |
| **Background** — update / reset / network / open editor                          | ✅     |
| **Scripts page** — enable/disable modules                                        | ✅     |
| **Servers** — multi-service connections, OTA priority, develop flags             | ✅     |
| Preset dev mode from Server URL (`localhost` → dev)                              | ✅     |
| **Sync rules** from server → badge + script list                                 | ✅     |
| Content bootstrap → background OTA loader + page-host preset execute             | ✅     |
| **Multi-service** (Servers, scriptKey groups, multi launcher)                    | ✅     |
| Extension-native `module-loader` (background orchestration)                      | ✅     |
| Runtime Phase D `match-fallback` (Extension; TM stays aggregate)                 | ✅     |
| Preset **`GME_registerWebMcpTool`** (page WebMCP tools as `vws.{scriptKey}.*`)   | ✅     |
| **WebMCP Agent** side panel (MVP: tools + chat)                                  | ✅ MVP |

## WebMCP Agent (side panel MVP)

Open the Agent from:

- **Popup → Open Agent**
- **Shortcut** `Ctrl+Shift+M` / `Cmd+Shift+M`
- Chrome command palette → **Open MagickMonkey Agent side panel**

Requirements:

1. Chrome `chrome://flags/#enable-webmcp-testing` → **Enabled**, restart browser
2. Extension **Allow User Scripts** enabled (`chrome://extensions` → Details)
3. A Gist script on the page that calls `GME_registerWebMcpTool` (see `/docs/gme-webmcp-skill.md`)
4. **Settings**: paste an LLM API key (Gemini / OpenAI / Claude; stored in `chrome.storage.local` only)

Panels:

| Tab          | Purpose                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| **Chat**     | Natural language → WebMCP tool loop (`vws.*` first; falls back to page-native tools like `editor_*`) |
| **Settings** | Provider / API key / model / optional API Base URL proxy + agent preferences                         |

HTTP MCP (`/api/mcp`) still manages **Gist files only** — it does not control the open tab.

Spec: `.ai/specs/extension-webmcp-agent.md`

## WebMCP (page tools)

Gist scripts can register **page WebMCP tools** via preset `GME_registerWebMcpTool` (canonical name `vws.{scriptKey}.{localName}`). The extension **shell** injects `__VWS_SCRIPT_KEY__`; Chrome needs `chrome://flags/#enable-webmcp-testing`.

- Author guide: `/docs/gme-webmcp-skill.md`
- HTTP MCP (`/api/mcp`) manages **Gist files only** — it does not control the open tab.
- Side panel Agent that calls these tools is **shipped (MVP)** — Popup / shortcut / command; see **WebMCP Agent** section below.

## Architecture

```
extension/dist/
├── background.js      # badge, shell commands
├── popup.html/js      # compact shell menu
├── admin.html/js      # unified admin (Servers / Scripts / Rules tabs)
├── servers.html       # legacy redirect → admin.html#servers
├── scripts.html       # legacy redirect → admin.html#scripts
├── rules.html         # legacy redirect → admin.html#rules (+ hash migration)
├── content-bridge.js  # inject page-host + RUNTIME_ENSURE_LOAD
└── page-launcher.js   # page-host: GM + preset execute (no manifest fetch)
```

Admin URLs use hash routes on a single page:

| Tab     | URL                                                                                                         |
| ------- | ----------------------------------------------------------------------------------------------------------- |
| Servers | `admin.html#servers`                                                                                        |
| Scripts | `admin.html#scripts`                                                                                        |
| Rules   | `admin.html#rules` (optional sub-path: `#rules/new`, `#rules/rule/{id}`, `#rules/script/{scriptKey\|file}`) |
| Logs    | `admin.html#logs`                                                                                           |

## Build

```bash
pnpm build:extension
```

Pack a ZIP for manual install (served at `/downloads/magickmonkey-chrome-extension.zip`):

```bash
pnpm pack:extension
```

Production `pnpm build` runs `pack:extension` automatically so the editor can offer the ZIP download.

All UI uses **Tailwind CSS** only (`extension/src/ui/tailwind.css` imports `extension/src/ui/styles/*.css` partials, inlined into Shadow DOM; `shell.css` for page layout). Extension page markup lives in **`src/html/pages/*.ejs`** with reusable partials under **`src/html/partials/`**, compiled at build time via `extension/scripts/compile-extension-html.mjs`. Built via `extension/vite.config.ts`.

After rebuilding, reload the extension at `chrome://extensions` (not just the page tab).

### Scripts page DEBUG panel

On **Scripts**, a floating **DEBUG** button is fixed at the bottom-right: **Force loading**, **Force error**, **Force empty**, **Reset overrides** (for UI state testing).

Rebuild `dist/` and reload the extension after pulling changes.

### Dev watch (HTML / Tailwind / manifest / new files)

`pnpm run build:extension:dev` uses [**build watch**](https://vite.dev/guide/build#build-watch). The primary Rollup graph is only `background.ts`; popup/scripts/servers/bridge/launcher are built in `closeBundle`. Anything not in that graph is registered with [`addWatchFile`](https://rollupjs.org/plugin/typescript/#plugin-context) on **every** `buildStart` (including a fresh `src/**/*.{ts,tsx,html,css}` scan). Newly created files are detected by a small dev watcher that touches `src/dev-build-stamp.ts`, which wakes the primary Rollup graph and lets the next `buildStart` register the new path.

On change, Rollup re-runs and `closeBundle` rebuilds secondary IIFEs, `shell.css`, and compiles EJS HTML into `dist/`. Look for:

- `[extension] watch: … path(s) via addWatchFile (src glob each buildStart)`
- `[extension] compiled HTML, manifest, icons → dist/` (after each rebuild)

Changing `vite.config.ts` or adding a new `EXTENSION_ENTRIES` bundle still requires restarting the watch process.

| Watched                                        | Notes                                                                                     |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/**`                                       | TS/CSS/EJS; new files: dev stamp touch + per-`buildStart` scan                            |
| `src/html/pages/*.ejs`, `src/html/partials/**` | Page templates + shared partials → `dist/*.html`; partial `change` also touches dev stamp |
| `icons/**`, `manifest.json`, Tailwind/PostCSS  | Copied or used in `closeBundle`                                                           |
| `../shared/**`, `../package.json`              | Aliases + manifest `__VERSION__`                                                          |
| `vite-plugins/**`                              | Build helpers (not `vite.config.ts` itself)                                               |
| `~icons/*` (MDI)                               | Resolved via npm / unplugin-icons; no repo file watch                                     |
| `extension/scripts/*.mjs`                      | Dev/build helper scripts; restart watch after changing them                               |

Verify locally: `pnpm run test:extension:static-watch` (create/update/delete coverage for HTML and copied static assets)

### Dev auto-reload (`pnpm dev` / `build:extension:dev --watch`)

Watch build starts an SSE server (default `http://127.0.0.1:5174/extension-reload`). When `dist/` is rebuilt, background receives `reload` and calls `chrome.runtime.reload()` — **only if Options → Develop mode is on** and the extension was built with `--watch`.

Override port: `EXTENSION_DEV_RELOAD_PORT=5180 pnpm run build:extension:dev`

## Install

扩展壳计划通过 **Chrome Web Store** 分发与自动更新。开发期仍可用下方手动 ZIP / Load unpacked。

### Manual ZIP（开发 / 过渡）

1. Download `/downloads/magickmonkey-chrome-extension.zip` from the web app (editor header when extension is not detected), or run `pnpm pack:extension` locally.
2. Unzip, then Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → select the extracted folder (must contain `manifest.json`).
3. Refresh the editor page; click the extension button to **Connect** (upserts a Service row for this page’s origin + Script Key — existing Services are kept).

### Developer (unpacked from repo)

1. `pnpm build:extension`
2. Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → `extension/dist`
3. **Servers** (`admin.html#servers`, or Chrome **Extension options**): manage one or more **Service** rows (label, Server URL, Script Key, enabled, developMode, gmScope)
   - **List order = OTA priority** for the same scriptKey (top enabled row is the OTA representative).
   - **Same scriptKey, different baseUrl** → shared Scripts toggles / RULE bucket; separate OTA cache per `(baseUrl|scriptKey)`.
   - **Editor Connect** upserts `(baseUrl, scriptKey)`; duplicate endpoints update the existing row.
   - **Preset develop mode** follows Server URL: `localhost` / `127.0.0.1` → dev paths on that host; remote origins → prod.
   - **Extension watch reload** is per-Service `developMode` (first enabled + developMode row); not a global toggle.
4. **Popup** → **Sync rules from server** (imports RULE per enabled scriptKey)
5. Visit a matching page; one launcher per enabled scriptKey loads OTA modules

## Multi-service model

| Concept                        | Behavior                                                                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **Service**                    | One connection row: label + baseUrl + scriptKey + enabled (+ developMode)                                                         |
| **scriptKey capability layer** | Shared RULE, script list cache, per-file toggles for the same scriptKey                                                           |
| **OTA**                        | One fetch per enabled scriptKey; endpoint = first **enabled** row for that scriptKey in Servers list                              |
| **GM storage**                 | Physical keys `{gmScope}_{key}`; gmScope is per scriptKey (Servers → gmScope field)                                               |
| **Badge**                      | Sum of `SCRIPT_TRIGGERED` executions on this page load (not RULE match count); lifecycle glyphs when count is 0 (see SPA section) |

**Upgrade from single config:** on first run, legacy `vws_extension_config` migrates to one default Service; `vws_extension_rules` → `vws_scriptkey_rules:{scriptKey}`; `vws_script_enabled:{file}` → `vws_script_enabled:{scriptKey}:{file}`.

Design notes and task checklist: **[docs/multi-service-tasks.md](./docs/multi-service-tasks.md)**.

## Popup (same on every tab)

- Subtitle: active Service label + enabled server / scriptKey counts
- Open editor (active Service, or first enabled) · Update runtime (all enabled scriptKeys) · Reload tab · Reset state (all enabled scriptKeys)
- Shell network toggle
- Manage scripts (opens `admin.html#scripts`, grouped by scriptKey) · Sync rules (all enabled scriptKeys)

## Scripts page (`admin.html#scripts`)

Per-script enable/disable scoped by scriptKey (`vws_script_enabled:{scriptKey}:{file}`). Same scriptKey across multiple Services shares one toggle group. Does not edit source — use the web editor.

### Debug logs (`admin.html#logs`)

Session-only debug log viewer backed by a background ring buffer (max 1000 entries). **Collection runs in the background** and does not depend on opening the Logs tab — popup, admin, content, inject, and page/preset logs are captured whenever log mode is Console or Viewer.

The Logs tab only reads and displays that store. Refreshing the admin page or switching to the Logs tab loads the full history via `GET_DEBUG_LOGS`. Live updates use a background port subscription.

**Cleared when:** the browser session ends (close browser) or the extension is reloaded/reinstalled (`onInstalled`). The Logs toolbar **Clear filters** button resets filters only — it does not clear stored logs. **Not cleared when:** refreshing the Logs tab or navigating away from admin. MV3 service worker restarts restore the buffer from `chrome.storage.session` within the same browser session.

Collection follows popup log mode: **Console** and **Viewer** collect; **Off** disables all capture.

Logs include background, popup, admin, content relay, inject bootstrap, and page/preset/script lines. Each row shows `host` and `tabId` when available (page logs get tab context from the content relay + background sender enrichment).

Legacy `#scripts/logs` redirects to the logs tab.

## Tampermonkey vs extension

|             | Tampermonkey        | Extension                 |
| ----------- | ------------------- | ------------------------- |
| Shell       | `.user.js`          | MV3 extension             |
| Shell UI    | TM menu             | Popup + scripts page      |
| Loader      | `launcherScript.ts` | `extension/src/` (native) |
| OTA modules | Same server URLs    | Same server URLs          |

## SPA / client-side routing (same as Tampermonkey)

The shell does **not** treat CSR URL changes specially:

- **Launcher + preset + remote bundle** run once per full page load (no re-inject on `pushState` / `replaceState`).
- **Badge** updates on normal tab navigation (`tabs.onUpdated` / tab switch), not on dedicated SPA hooks.
- **Badge count** (`triggeredCountOnActiveTab`) increments once per GIST module that actually runs (`GME_ok` “Executing script …” line). Different `@run-at` timings on the same page load can increase the count at different times.
- **Badge background** is blue by default; turns **red** if any GIST module logs `GME_fail` “Executing script … failed:” on this page load (count and text unchanged).
- **Badge lifecycle** (when trigger count is 0): `…` initializing (page load / bootstrap), `·` idle (bootstrap done, no scripts yet), `?` no enabled service config, `✓` reset complete, `↻` update complete (last two flash ~3s). Red `!` when the shell is off or a script failed with zero triggers.
- Count resets on each top-level page load (including same-URL refresh), when the content script starts. URL-only changes without a new document (typical SPA) do not reset.
- **Update runtime** / **Reset runtime** also clears counts before reload.
- Counts are stored in `chrome.storage.session` so a short MV3 service-worker sleep does not zero the badge while you stay on the same URL.

For SPA sites (e.g. Douyin): use a **root `@match`** (e.g. `*://www.douyin.com/*`) and handle route/slide changes inside the script (DOM observers, `location`, optional Tampermonkey `window.onurlchange`). This matches Tampermonkey’s model and keeps the extension shell simple and predictable.

## Script load modes (Phase D)

| Client           | Default                                            | Optional                                                     |
| ---------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| **Extension**    | `aggregate` — full `tampermonkey-remote.js` bundle | `match-fallback` when SERVER `runtime.scriptLoadMode` is set |
| **Tampermonkey** | `aggregate` only                                   | —                                                            |

With `match-fallback`, the extension loads only URL-matched per-file modules from `module-manifest.json` `scriptModules[]`; on no match or fetch failure it falls back to the aggregate bundle. Tampermonkey continues to use the aggregate path only.
