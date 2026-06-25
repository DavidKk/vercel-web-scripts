# editor-lib

Optional OTA module providing CodeMirror 6 editors for Gist userscripts.

## Build

```bash
pnpm run build:editor-lib
```

Output: `editor-lib/dist/editor-lib.js` + `editor-lib/dist/manifest.json` (SHA-1 hash).

## Local manual testing (maintainers)

`pnpm dev` builds/serves OTA artifacts. On **any injected page** (no extra dev UI route):

1. **Cmd/Ctrl+Shift+P** → search `ota` or `editor-lib`
2. Run **DEBUG OTA: Test editor-lib**

A panel mounts on the current page via `GME_ensureEditorLib()` — switch profile, direct/iframe, readOnly, Remount. Toggle the same command again to close.

Registered in `preset/src/ui/command-palette/debug-ota.ts` (`__IS_DEVELOP_MODE__` only).

## Unit tests

```bash
pnpm test -- __tests__/editor-lib __tests__/preset/command-palette-debug-ota
```

## Runtime

Loaded lazily via `ensureEditorLib()` in preset-core. Registered on `__VWS_CORE__` as `editor-lib`.

```ts
const editor = await ensureEditorLib()
const handle = editor?.create({
  parent: hostElement,
  profile: 'javascript',
  value: '...',
  isolated: true,
  onChange: (v) => save(v),
})
```

## Profiles (v1)

`plain`, `json`, `javascript`, `html`, `css`, `markdown`

## Built-in shortcuts

| Shortcut             | Action                                            |
| -------------------- | ------------------------------------------------- |
| Cmd/Ctrl+F           | Open search panel                                 |
| Cmd/Ctrl+G / Shift+G | Next / previous match                             |
| Cmd/Ctrl+Alt+R/C/W   | Toggle regexp / case / whole word (panel focused) |
| Cmd/Ctrl+Z / Shift+Z | Undo / redo                                       |

## Docs

- Author skill: `public/docs/editor-lib-skill.md`
- Cursor skill: `.cursor/skills/editor-lib/SKILL.md`
