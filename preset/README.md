# Preset (modular gm-templates build)

`templates/gm-templates` was moved into `preset/` as ES modules (`import` / `export`), built with Vite. Output: `preset/dist/preset.js` (not `ipreset.js` in the default config—check `vite.config.ts`). Target: Chrome, ESNext.

## Layout

```
preset/
├── src/
│   ├── typings.d.ts    # Globals (GM_*, __BASE_URL__, etc.)
│   ├── entry.ts        # Build entry: ordered imports
│   ├── helpers/        # utils, logger, http, dom
│   ├── services/       # log-store, tab-communication, script-update, ...
│   ├── ui/             # corner-widget, notification, log-viewer, node-selector, command-palette
│   ├── rules.ts
│   ├── scripts.ts
│   └── main.ts
├── dist/
│   └── preset.js       # Built IIFE (see vite output filename)
├── vite.config.ts
├── tsconfig.json
└── README.md
```

## UI modules (HTML + CSS)

Each UI module (e.g. `ui/corner-widget`) has:

- `index.ts`: logic; `import css from './index.css?raw'` and `import html from './index.html?raw'`; **export** `{ css, html }` for injection.
- `index.css`: styles as a string via Vite `?raw`.
- `index.html`: markup as a string via Vite `?raw`.

`preset/src/typings.d.ts` declares:

```ts
declare module '*.css?raw' {
  const content: string
  export default content
}
declare module '*.html?raw' {
  const content: string
  export default content
}
```

Example `index.ts`:

```ts
import css from './index.css?raw'
import html from './index.html?raw'
// ... component logic (e.g. register custom element)
export { css, html }
```

## Build

From the repo root:

```bash
pnpm build:preset
```

Output: `preset/dist/preset.js` (and source maps).

## Dev workflow (recommended)

You do not need to reload the browser manually after every preset change:

1. **From the repo root**

   ```bash
   pnpm dev
   ```

   Starts the Next dev server and Vite preset watch (`build:preset:dev`); edits under `preset/src` rebuild automatically.

2. **Keep at least one same-origin tab open**  
   e.g. `http://localhost:3000/editor` (or any `http://localhost:3000/...`).  
   That tab listens over SSE for “preset rebuilt”; on event it clears preset cache and reloads, and notifies **other tabs** via GM storage so they pick up the new preset too.

3. **Day to day**
   - Edit and save anything under `preset/src`.
   - Wait for Vite to finish in the terminal.
   - Within a few seconds, tabs with the launcher reload and load the new preset.

If you only run `pnpm build:preset` without `pnpm dev`, there is no SSE broadcast—refresh manually.

## Migration checklist

- [x] typings.d.ts (incl. `?raw` declarations)
- [x] helpers/utils.ts
- [x] services/log-store.ts
- [x] helpers/logger.ts (imports logStore)
- [ ] helpers/http.ts
- [ ] helpers/dom.ts
- [ ] services/\* (tab-communication, script-update, dev-mode, script-execution, editor-dev-mode, local-dev-mode, menu, cli-service)
- [ ] rules.ts, scripts.ts
- [ ] main.ts
- [ ] ui/\* (each module: `?raw` css/html and export)

To port a module from `templates/gm-templates` into `preset/src`:

1. Replace globals with **import** (e.g. logger imports `logStore` from `../services/log-store`).
2. **export** public symbols at the bottom of the file.
3. Remove `const g = globalThis; (g as any).xxx = xxx` style globals.
4. In UI `index.ts`, add `import css from './index.css?raw'`, `import html from './index.html?raw'`, and **export { css, html }**.
