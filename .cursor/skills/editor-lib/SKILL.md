---
name: editor-lib
description: Optional OTA CodeMirror 6 module for Gist userscripts. Use GME_ensureEditorLib() with profiles; do not embed cdnjs CodeMirror.
---

# editor-lib

Read `public/docs/editor-lib-skill.md` for author rules.

## Quick reference

```ts
const api = await GME_ensureEditorLib()
const handle = api?.create({
  parent: element,
  profile: 'json', // plain | json | javascript | html | css | markdown
  isolated: true, // iframe for third-party pages
  value: '',
  onChange: (v) => {},
})
handle?.destroy()
```

## Constraints

- Does not depend on `preset-ui`
- Failure returns `null` — scripts must handle gracefully
- No custom CM6 extensions in v1 — use `profile` only
- WEB Monaco ScriptEditor is separate — do not conflate
- Built-in search: Cmd/Ctrl+F (content search panel; enable **正则** checkbox or Cmd/Ctrl+Alt+R for regex)

## Build (maintainers)

```bash
pnpm run build:editor-lib
```

Output: `editor-lib/dist/editor-lib.js` + `manifest.json`

## Local debugging (maintainers)

`pnpm dev` serves OTA bundles. On any injected page: **Cmd/Ctrl+Shift+P** → `ota` → **DEBUG OTA: Test editor-lib** — in-page panel, no `/dev/ota` route.

See `preset/src/ui/command-palette/debug-ota.ts` and `editor-lib/README.md`.
