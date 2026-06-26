# Engineering standards (code quality)

Normative rules for **technical-debt / refactor** work. These are not product features; they keep the codebase maintainable without changing user-visible behavior.

Related completed task snapshots: `tasks/done/large-file-split.md`, `tasks/done/css-logical-properties-review.md`.

---

## 1. Large file split

### Thresholds

| Lines    | Action                                                               |
| -------- | -------------------------------------------------------------------- |
| ≤ 800    | Acceptable; do not split for line count alone                        |
| 800–1000 | Watch list; split when next touch is large                           |
| > 1000   | Avoid single source file unless one class with no clean domain seams |

Generated files, global `.d.ts` aggregates, and test specs are excluded unless logic is reusable elsewhere.

### Split rules

1. **Same feature folder** — new files live next to the original; keep `customElements.define` names and public exports unchanged.
2. **Extract pure functions first**, then modules that need `this` via a **host interface** (see `extension/src/ui/servers/mm-options-*.ts`, `extension/src/ui/scripts/mm-scripts-*.ts`).
3. **One class per CE** — do not split one custom element into multiple CE classes; split by domain delegates.
4. **Independent PRs per phase** — easier review and rollback.
5. **No behavior change** — acceptance is line-count targets + existing tests + targeted manual smoke.

### Extension CSS (`tailwind.css`)

- Entry: `extension/src/ui/tailwind.css` (`@import` partials, then `@tailwind` directives).
- Partials: `extension/src/ui/styles/components-*.css`, each wrapped in `@layer components { … }`.
- Target: single partial **≤ 500 lines** where practical; domain split preferred over fixed-size chunks.
- Build check: `pnpm run build:extension` — `shell.css` size stable, no PostCSS `@import` order errors.

### Current baseline (2026-06)

| Area               | Status                               |
| ------------------ | ------------------------------------ |
| `mm-options-app`   | Split (main ≤ 600 lines)             |
| `mm-scripts-app`   | Split (main ≤ 700 lines)             |
| `background.ts`    | Split (entry ≤ 250 lines)            |
| `tailwind.css`     | Split into `styles/` partials        |
| `NodeSelector.ts`  | 856 lines — under 1000, optional     |
| Phase 6 watch list | Not started (`gistScripts.ts`, etc.) |

---

## 2. CSS conventions (padding / margin / logical properties)

Project default: **LTR** UI (Extension Admin, Preset injected UI, WEB editor). See also `knowledge/glossary.md` → CSS conventions.

### Default (LTR)

- Use **physical** Tailwind utilities: `pl/pr/pt/pb/px/py`, `ml/mr`, `text-left/right`.
- Do not mix `px-*` with `pl-*`/`pr-*` on the same rule. When sides differ, use `pl-* pr-*` explicitly.

### CSS variables

- **Physical naming** (`-left`, `-right`, `-x`) → pair with `pl/pr/ml/mr`.
- **Logical naming** (`-start`, `-end`) → pair with `ps/pe/ms/me`.
- Do not mix logical variable names with physical utilities (e.g. `--foo-pad-end` + `pr-*`).

### Logical properties

- `padding-inline` / `padding-block`: use only when symmetric logical padding is intentional (RTL-ready).
- Vertical spacing: `py-*` or `padding-block`, not `padding-inline`.
- `inset: 0` / `inset-0` for full overlays is correct (not a padding/margin logical-property issue).

### Cleanup

- Remove redundant `border-*-width: 1px` after `@apply border-b` / `border-t`.
- Prefer `@apply` or a single shorthand consistently within a file block.
- RTL migration (`margin-left: auto` → `margin-inline-start: auto`, `translateX`) is a **future milestone**, not required for LTR-only work.

### Review scope

When touching Extension / Preset / WEB CSS, scan:

```bash
rg 'padding-inline|padding-block|margin-inline|margin-block' --glob '*.{css,tsx,ts}'
rg 'px-[^\s"\']+.*\bpr-|px-[^\s"\']+.*\bpl-' --glob '*.{css,tsx,ts}'
```

---

## When to apply

- Voluntary refactor or tech-debt PRs.
- Any new file approaching **800 lines**.
- CSS changes in `extension/src/ui/styles/` or Preset `*.css`.

Do **not** block product features on these rules unless the touched file already exceeds thresholds.
