# MagickMonkey — Gist overlay UI skill

Use when authoring **in-page overlay UIs** in Gist userscripts (modals, panels, explorers) so they match **preset runtime UI** — the same dark shell as command palette, notifications, and log viewer on injected pages.

**Canonical source**: `preset/src/ui/shared/vws-ui-tokens.css` (also mirrored in WEB `homePalette`).

**MCP**: `resources/read` → `skill://magickmonkey/scripts-ui-skill.md`  
**Static**: `/docs/scripts-ui-skill.md`

Related: `scripts-ai-skill.md`, `gme-webmcp-skill.md`, `editor-lib-skill.md`, `preset/src/ui/shared/wrap-ui-styles.ts`.

---

## When to use

- Fixed overlay (`position: fixed`) dialog/panel injected by a userscript.
- File trees, toolbars, status bars, context menus beside `editor-lib`.
- Any Gist UI that should feel native next to **Cmd/Ctrl+Shift+P** command palette or corner widget.

## When not to use

- WEB React (`components/ScriptEditor`) — Tailwind + `homePalette`.
- Extension admin — light `mmPalette` (intentional split).
- `editor-lib` CM6 chrome — `editor-lib-skill.md`.

---

## Preset reference modules

Copy patterns from these (all use `wrapUiStyles()` + `--vws-*`):

| Module          | Path                                      | Reuse for                                                               |
| --------------- | ----------------------------------------- | ----------------------------------------------------------------------- |
| Command palette | `preset/src/ui/command-palette/index.css` | Backdrop blur, compact modal box, list rows, selected `inset` brand bar |
| Log viewer      | `preset/src/ui/log-viewer/index.css`      | Centered large panel, header/toolbar, filters                           |
| Notification    | `preset/src/ui/notification/index.css`    | Toast surface, semantic success/danger/warn                             |
| Scroll          | `preset/src/ui/shared/vws-scroll.css`     | `.vws-scroll-draggable` on long lists                                   |
| Tokens          | `preset/src/ui/shared/vws-ui-tokens.css`  | **Single source of truth** for colors                                   |

WEB `/editor` `FileListPanel` is a **secondary** reference for file-tree row height (22px + 6px padding) and `#202634` selection — preset list UIs use `var(--vws-surface-hover)` + brand inset instead.

---

## Design tokens (`--vws-*`)

Must match `vws-ui-tokens.css` exactly.

| CSS variable           | Value                         | Usage                                             |
| ---------------------- | ----------------------------- | ------------------------------------------------- |
| `--vws-canvas`         | `#111318`                     | Page-level dark base, editor column, scroll track |
| `--vws-surface`        | `#171a21`                     | Header, status bar, input backgrounds             |
| `--vws-surface-raised` | `#1b1f27`                     | Modal shell, context menu, notification card      |
| `--vws-surface-hover`  | `#222733`                     | Row hover, icon chip bg, selected list bg         |
| `--vws-surface-muted`  | `#151820`                     | Subtle strips                                     |
| `--vws-border`         | `#2a303a`                     | Dividers, input borders, scrollbar thumb          |
| `--vws-border-strong`  | `#3f4a5c`                     | Hover borders, scrollbar thumb hover              |
| `--vws-brand`          | `#3b82f6`                     | Primary button, focus ring, selected inset        |
| `--vws-brand-hover`    | `#2563eb`                     | Primary hover                                     |
| `--vws-brand-soft`     | `#60a5fa`                     | Links, loading accent, scrollbar active           |
| `--vws-brand-muted`    | `rgba(59,130,246,0.18)`       | Soft brand tint                                   |
| `--vws-violet`         | `#8b5cf6`                     | Optional accent                                   |
| `--vws-violet-soft`    | `#a78bfa`                     | Optional accent text                              |
| `--vws-text-primary`   | `#e6eaf0`                     | Titles, body                                      |
| `--vws-text-secondary` | `#9aa4b2`                     | Secondary labels                                  |
| `--vws-text-muted`     | `#6f7a8a`                     | Placeholders, empty states, hints                 |
| `--vws-success`        | `#10b981`                     | Success toast / status                            |
| `--vws-success-soft`   | `rgba(16,185,129,0.18)`       | Success tint                                      |
| `--vws-danger`         | `#ef4444`                     | Destructive                                       |
| `--vws-danger-soft`    | `rgba(239,68,68,0.18)`        | Danger tint                                       |
| `--vws-warn`           | `#f59e0b`                     | Warning                                           |
| `--vws-warn-soft`      | `rgba(245,158,11,0.18)`       | Warning tint                                      |
| `--vws-info`           | `#60a5fa`                     | Info                                              |
| `--vws-info-soft`      | `rgba(96,165,250,0.18)`       | Info tint                                         |
| `--vws-backdrop`       | `rgba(17,19,24,0.6)`          | Full-screen scrim                                 |
| `--vws-shadow-lg`      | `0 12px 40px rgba(0,0,0,0.5)` | Large modal                                       |
| `--vws-shadow-md`      | `0 8px 32px rgba(0,0,0,0.4)`  | Compact modal / toast                             |
| `--vws-radius`         | `8px`                         | Shell, buttons, inputs                            |
| `--vws-radius-sm`      | `4px`                         | Chips, context menu                               |
| `--vws-code-bg`        | `#0d0f14`                     | Code/meta strips                                  |

### Inject tokens in Gist (`GM_addStyle`)

Preset uses Shadow DOM `:host`; Gist overlays should scope variables on the **root panel id**:

```js
const PANEL_ID = 'my-overlay-root'

GM_addStyle(`
  #${PANEL_ID} {
    --vws-canvas: #111318;
    --vws-surface: #171a21;
    --vws-surface-raised: #1b1f27;
    --vws-surface-hover: #222733;
    --vws-surface-muted: #151820;
    --vws-border: #2a303a;
    --vws-border-strong: #3f4a5c;
    --vws-brand: #3b82f6;
    --vws-brand-hover: #2563eb;
    --vws-brand-soft: #60a5fa;
    --vws-brand-muted: rgba(59, 130, 246, 0.18);
    --vws-text-primary: #e6eaf0;
    --vws-text-secondary: #9aa4b2;
    --vws-text-muted: #6f7a8a;
    --vws-danger: #ef4444;
    --vws-danger-soft: rgba(239, 68, 68, 0.18);
    --vws-backdrop: rgba(17, 19, 24, 0.6);
    --vws-shadow-lg: 0 12px 40px rgba(0, 0, 0, 0.5);
    --vws-shadow-md: 0 8px 32px rgba(0, 0, 0, 0.4);
    --vws-radius: 8px;
    --vws-radius-sm: 4px;
    --vws-code-bg: #0d0f14;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: var(--vws-text-primary);
  }
  #${PANEL_ID} .shell {
    background: var(--vws-surface-raised);
    border: 1px solid var(--vws-border);
    border-radius: var(--vws-radius);
    box-shadow: var(--vws-shadow-lg);
  }
`)
```

Prefer **`var(--vws-*)`** in all child rules so a token update stays one block.

### JS mirror (when `var()` is awkward)

```js
/** Same values as vws-ui-tokens.css — prefer CSS variables in GM_addStyle when possible */
const VWS_UI = {
  canvas: '#111318',
  surface: '#171a21',
  surfaceRaised: '#1b1f27',
  surfaceHover: '#222733',
  surfaceMuted: '#151820',
  border: '#2a303a',
  borderStrong: '#3f4a5c',
  brand: '#3b82f6',
  brandHover: '#2563eb',
  brandSoft: '#60a5fa',
  brandMuted: 'rgba(59, 130, 246, 0.18)',
  textPrimary: '#e6eaf0',
  textSecondary: '#9aa4b2',
  textMuted: '#6f7a8a',
  danger: '#ef4444',
  dangerSoft: 'rgba(239, 68, 68, 0.18)',
  backdrop: 'rgba(17, 19, 24, 0.6)',
  shadowLg: '0 12px 40px rgba(0, 0, 0, 0.5)',
  shadowMd: '0 8px 32px rgba(0, 0, 0, 0.4)',
  codeBg: '#0d0f14',
  radius: '8px',
  radiusSm: '4px',
}
```

---

## Layout patterns (from preset)

### Full-screen modal (log-viewer style)

```
backdrop (--vws-backdrop, optional blur 8px)
└─ shell (--vws-surface-raised, --vws-shadow-lg, min(92vw, 640–1320px))
   ├─ header (border-bottom --vws-border, padding 8–12px)
   ├─ body (grid or flex, min-height: 0)
   └─ status / hint (border-top, 11px --vws-text-muted)
```

- Large editor panels: `width: min(1320px, 96vw)`, `height: min(860px, 92vh)`.
- Compact pickers: command-palette `max-width: 560px`, `max-height: min(60vh, 480px)`.

### Backdrop

Match command palette:

```css
backdrop-filter: blur(8px);
-webkit-backdrop-filter: blur(8px);
background: var(--vws-backdrop);
```

### Typography

- Base: `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- Panel title: `13px`, `font-weight: 600`, `letter-spacing: 0.02em`
- Section label: `11px`, uppercase, `letter-spacing: 0.04em`, `--vws-text-muted`
- Body/list: `13–14px`, `--vws-text-primary`
- Hint/meta: `11px`, `--vws-text-muted`

### Z-index (preset stack)

| Layer                          | z-index                 | Example                                                      |
| ------------------------------ | ----------------------- | ------------------------------------------------------------ |
| Corner widget / node selector  | `2147483647`            | Highest chrome                                               |
| Command palette / node toolbar | `2147483646`            |                                                              |
| Notification / DEBUG OTA panel | `2147483645`            |                                                              |
| Gist custom overlay            | `2147483640–2147483644` | Stay **below** preset chrome unless modal must block palette |

---

## Components

### Inputs

Align with command-palette input wrap:

- Container: `padding 10px 14px`, `border-bottom: 1px solid var(--vws-border)`
- Field: `background: var(--vws-surface)` or transparent on raised surface
- Border: `1px solid var(--vws-border)`; focus `border-color: var(--vws-brand)`; `outline: none`
- Placeholder: `var(--vws-text-muted)`
- Monospace IDs/paths: `ui-monospace, Menlo, monospace`

### Buttons

| Variant   | Preset-aligned style                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------ |
| Primary   | `background: var(--vws-brand)`, `color: #fff`, hover `var(--vws-brand-hover)`                                      |
| Secondary | `background: var(--vws-surface-raised)`, `border: 1px solid var(--vws-border)`, hover `var(--vws-surface-hover)`   |
| Danger    | `color: var(--vws-danger)`, `border-color: var(--vws-danger)`, bg `var(--vws-danger-soft)` or transparent          |
| Icon chip | `24×24`, `background: var(--vws-surface-hover)`, `border-radius: var(--vws-radius-sm)` (command-palette item icon) |

Disabled: `opacity: 0.5`, `cursor: not-allowed`.

### Icons

**Do not hand-write SVG paths.** Use the same stack as preset UI:

| Layer                       | Pattern                                                                                                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build (preset / editor-lib) | `unplugin-icons` + `@iconify-json/mdi`, `import iconX from '~icons/mdi/foo?raw'`                                                                                 |
| Runtime inject              | `element.innerHTML = iconRaw.replace('<svg', '<svg class="…" aria-hidden="true"')` — see `preset/src/ui/notification/index.ts`, `editor-lib/src/search-icons.ts` |
| Extension hydrate           | `mm-icons/hydrate.ts` → `mmIcon(raw, className)`                                                                                                                 |

Gist scripts without a bundler: embed **MDI path `d` values** from `@iconify-json/mdi` (see `shopline-local-render-idb-editor.ts` `LR_MDI` + `lrMdiSvg()`), or use **Iconify CDN** (`https://api.iconify.design/mdi/close.svg`) — never invent codicon paths inline.

Common MDI names: `close`, `chevron-down`, `chevron-right`, `folder-outline`, `file-outline`, `find-replace`, `file-replace`, `format-letter-case`, `format-letter-matches`, `regex`.

### List / tree rows

**Preset list** (command palette):

```css
.item:hover,
.item--selected {
  background: var(--vws-surface-hover);
}
.item--selected {
  box-shadow: inset 2px 0 0 var(--vws-brand);
}
```

**File tree** (WEB FileListPanel — optional):

- Row: 22px min-height + 6px vertical padding
- Text: `#cbd5e1` or `var(--vws-text-primary)`
- Selected/hover: `#202634` or `var(--vws-surface-hover)` — **not** full-width `#0060c0`

### Editor column

- Background: `var(--vws-canvas)` (same as shell — no light/dark split)
- Path bar: `var(--vws-surface)`, `border-bottom: var(--vws-border)`
- Loading overlay: `position: absolute; inset: 0`, spinner `border-top-color: var(--vws-brand)`

### Context menu

- `background: var(--vws-surface-raised)`, `border: 1px solid var(--vws-border)`, `box-shadow: var(--vws-shadow-md)`, `border-radius: var(--vws-radius-sm)`
- Item hover: `background: var(--vws-surface-hover)` or `var(--vws-brand)` + white text

### Scrollable lists

Add class rules from `vws-scroll.css` or equivalent:

```css
.my-list {
  scrollbar-color: var(--vws-border) var(--vws-canvas);
}
.my-list::-webkit-scrollbar-thumb:hover {
  background-color: var(--vws-border-strong);
}
.my-list::-webkit-scrollbar-thumb:active {
  background-color: var(--vws-brand-soft);
}
```

---

## Loading states

- Do **not** freeze the whole panel while `editor-lib` OTA loads.
- Spinner + label in editor area only; explorer stays interactive.
- List refresh: `opacity: 0.65; pointer-events: none` on list only.

---

## Checklist before `scripts_upsert`

- [ ] Root panel defines full `--vws-*` block from `vws-ui-tokens.css`.
- [ ] Icons: MDI via unplugin-icons / Iconify — no hand-written SVG paths.
- [ ] Shell is `--vws-surface-raised`, not `#fff` / `#f3f3f3`.
- [ ] Backdrop uses `--vws-backdrop` (+ blur like command palette).
- [ ] List selection: `--vws-surface-hover` + optional `inset 2px brand` (preset) or `#202634` (file tree).
- [ ] z-index below command palette unless intentionally blocking it.
- [ ] Loading overlay only in editor column.

---

## MCP workflow for agents

1. `scripts_runtime_summary` → `scriptsUiDocs` / `scriptsUiResource`.
2. `resources/read` → `skill://magickmonkey/scripts-ui-skill.md`.
3. Cross-check `preset/src/ui/shared/vws-ui-tokens.css` if tokens drift.
4. Patch Gist via `scripts_replace` / `scripts_patch`.
