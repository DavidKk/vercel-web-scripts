# MagickMonkey Chrome Extension

Native **Chrome loading shell** for MagickMonkey: background + popup + scripts page + content runtime. Loads OTA modules (`preset-core`, `script-bundle`) from your MagickMonkey server — **without Tampermonkey**.

This is **not** a port of `tampermonkey.user.js`. Tampermonkey remains a separate path. The extension shares **server OTA contracts** only.

Full roadmap: **[TODO.md](./TODO.md)**.

## MVP (current)

| Feature                                                 | Status |
| ------------------------------------------------------- | ------ |
| Toolbar **popup** (fixed menu on every tab)             | ✅     |
| **Badge** — rule match count on active tab              | ✅     |
| **Background** — update / reset / network / open editor | ✅     |
| **Scripts page** — enable/disable modules               | ✅     |
| **Options** — `baseUrl`, `scriptKey`, develop mode      | ✅     |
| **Sync rules** from server → badge + script list        | ✅     |
| Content bootstrap → OTA preset (interim loader)         | ✅     |
| Extension-native `module-loader` (replace TM port)      | 🔜     |

## Architecture

```
extension/dist/
├── background.js      # badge, shell commands
├── popup.html/js      # compact shell menu
├── scripts.html/js    # script enable/disable
├── options.html/js    # connection config
├── content-bridge.js  # inject preset when RULE allows
└── page-launcher.js   # interim OTA bootstrap (to be replaced)
```

## Build

```bash
pnpm build:extension
```

All UI uses **Tailwind CSS** only (`extension/src/ui/tailwind.css` inlined into Shadow DOM; `shell.css` for page layout). Built via `extension/vite.config.ts`.

After rebuilding, reload the extension at `chrome://extensions` (not just the page tab).

### Scripts page DEBUG panel

On **Scripts**, a floating **DEBUG** button is fixed at the bottom-right: **Force loading**, **Force error**, **Force empty**, **Reset overrides** (for UI state testing).

Rebuild `dist/` and reload the extension after pulling changes.

### Dev watch (HTML / Tailwind / manifest / new files)

`pnpm run build:extension:dev` uses [**build watch**](https://vite.dev/guide/build#build-watch). The primary Rollup graph is only `background.ts`; popup/scripts/options/bridge/launcher are built in `closeBundle`. Anything not in that graph is registered with [`addWatchFile`](https://rollupjs.org/plugin/typescript/#plugin-context) on **every** `buildStart` (including a fresh `src/**/*.{ts,tsx,html,css}` scan). Newly created files are detected by a small dev watcher that touches `src/dev-build-stamp.ts`, which wakes the primary Rollup graph and lets the next `buildStart` register the new path.

On change, Rollup re-runs and `closeBundle` rebuilds secondary IIFEs, `shell.css`, and copies HTML into `dist/`. Look for:

- `[extension] watch: … path(s) via addWatchFile (src glob each buildStart)`
- `[extension] copied HTML, manifest, icons → dist/` (after each rebuild)

Changing `vite.config.ts` or adding a new `EXTENSION_ENTRIES` bundle still requires restarting the watch process.

| Watched                                       | Notes                                                           |
| --------------------------------------------- | --------------------------------------------------------------- |
| `src/**`                                      | TS/HTML/CSS; new files: dev stamp touch + per-`buildStart` scan |
| `icons/**`, `manifest.json`, Tailwind/PostCSS | Copied or used in `closeBundle`                                 |
| `../shared/**`, `../package.json`             | Aliases + manifest `__VERSION__`                                |
| `vite-plugins/**`                             | Build helpers (not `vite.config.ts` itself)                     |
| `~icons/*` (MDI)                              | Resolved via npm / unplugin-icons; no repo file watch           |
| `extension/scripts/*.mjs`                     | Dev/build helper scripts; restart watch after changing them     |

Verify locally: `pnpm run test:extension:static-watch` (create/update/delete coverage for HTML and copied static assets)

### Dev auto-reload (`pnpm dev` / `build:extension:dev --watch`)

Watch build starts an SSE server (default `http://127.0.0.1:5174/extension-reload`). When `dist/` is rebuilt, background receives `reload` and calls `chrome.runtime.reload()` — **only if Options → Develop mode is on** and the extension was built with `--watch`.

Override port: `EXTENSION_DEV_RELOAD_PORT=5180 pnpm run build:extension:dev`

## Install

1. `pnpm build:extension`
2. Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → `extension/dist`
3. **Options**: set Server URL + Script Key
4. **Popup** → **Sync rules from server** (imports RULE for badge + script names)
5. Visit a matching page; preset loads via content script

## Popup (same on every tab)

- Open editor · Update runtime · Reload tab · Reset state
- Shell network toggle
- Manage scripts (opens `scripts.html`) · Sync rules

## Scripts page

Global enable/disable per script name (`vws_script_enabled:*`). Does not edit source — use the web editor.

## Tampermonkey vs extension

|             | Tampermonkey        | Extension                 |
| ----------- | ------------------- | ------------------------- |
| Shell       | `.user.js`          | MV3 extension             |
| Shell UI    | TM menu             | Popup + scripts page      |
| Loader      | `launcherScript.ts` | `extension/src/` (native) |
| OTA modules | Same server URLs    | Same server URLs          |
