# .ai quick index

Purpose: task -> file routing. Do not read the full `.ai/**` tree by default.

## Suggested load order

1. `INDEX.md` (this file)
2. `rules/global.md`
3. `context/summary.md` (stable facts) or `context/current.md` (active focus)
4. Task-specific spec/workflow below

## By task

- **Extension shell** (popup, admin, content bridge, logs, inject policy)
  - Read: `specs/extension-shell.yaml`, `specs/extension-injection-policy.md`
  - Code: `extension/README.md`, `extension/TODO.md`
- **Script permissions** (gate, modal, admin Permissions tab)
  - Read: `tasks/active/script-permissions.md`
  - Code: `shared/script-permission.ts`, `extension/src/shell/permission-manager.ts`
- **Editor lib（共享代码编辑器 OTA）**
  - Read: `tasks/done/editor-lib.md`, `public/docs/editor-lib-skill.md`, `.cursor/skills/editor-lib/SKILL.md`
  - Prerequisite: `tasks/done/preset-cm-ui-removal.md`
- **Agent chat panel** (script management Agent — backlog)
  - Read: `tasks/backlog/agent-chat-panel.md`
  - Related: `.cursor/skills/scripts-api-mcp/SKILL.md`, `public/docs/scripts-ai-skill.md`
- **UI cross-module dedup** (WEB / Extension / Preset shared layer — backlog)
  - Read: `specs/ui-cross-module-review.md`, `tasks/backlog/ui-cross-module-dedup.md`
- **Large file split** (>1000 lines → same-folder modules — backlog)
  - Read: `tasks/backlog/large-file-split.md`
- **CSS logical properties review** (padding/margin/logical CSS — backlog)
  - Read: `tasks/backlog/css-logical-properties-review.md`
- **Gist script history & rollback** (editor version browse/restore — backlog)
  - Read: `tasks/backlog/gist-script-rollback.md`
- **Multi-service / scriptKey / Connect**
  - Read: `extension/docs/multi-service-tasks.md` (repo path, not under `.ai/`)
- New platform capability or major behavior change
  - Read: `workflow/requirements-audit.md` → `workflow/module-development.md`
  - Execute: `tasks/active/current.md`
- Split/refactor **preset OTA** modules (launcher/core/ui/scripts)
  - Read: `specs/modules-registry.yaml`, `specs/runtime-modularization.md`
- Align architecture docs with implementation
  - Read: `context/summary.md`, `specs/modules-registry.yaml`, `specs/extension-shell.yaml`
- Code style / lint / tests (Cursor)
  - Read: `.cursor/skills/` (typescript-jsdoc, test-naming, code-quality-check)

## By topic

| Topic                   | File                                             |
| ----------------------- | ------------------------------------------------ |
| Preset runtime modules  | `specs/modules-registry.yaml`                    |
| Extension shell modules | `specs/extension-shell.yaml`                     |
| HTML-only injection     | `specs/extension-injection-policy.md`            |
| Runtime split baseline  | `specs/runtime-modularization.md`                |
| Compatibility policy    | `specs/runtime-compatibility.md`                 |
| Verification checklist  | `specs/runtime-verification-checklist.md`        |
| Terminology             | `knowledge/glossary.md`                          |
| Requirements process    | `workflow/requirements-audit.md`                 |
| Execution phases        | `workflow/module-development.md`                 |
| Active TODO             | `tasks/active/current.md`                        |
| Script permissions      | `tasks/active/script-permissions.md`             |
| UI folder restructure   | `tasks/done/ui-folder-restructure.md`            |
| UI cross-module review  | `specs/ui-cross-module-review.md`                |
| Editor lib              | `tasks/done/editor-lib.md`                       |
| Agent chat panel        | `tasks/backlog/agent-chat-panel.md`              |
| UI cross-module dedup   | `tasks/backlog/ui-cross-module-dedup.md`         |
| Large file split        | `tasks/backlog/large-file-split.md`              |
| CSS logical properties  | `tasks/backlog/css-logical-properties-review.md` |
| Gist script rollback    | `tasks/backlog/gist-script-rollback.md`          |
| Project overview        | `context/summary.md`                             |
