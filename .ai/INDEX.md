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
  - Read: `tasks/done/script-permissions.md`
  - Code: `shared/script-permission.ts`, `extension/src/shell/permission-manager.ts`
- **Editor lib（共享代码编辑器 OTA）**
  - Read: `tasks/done/editor-lib.md`, `public/docs/editor-lib-skill.md`, `.cursor/skills/editor-lib/SKILL.md`
  - Prerequisite: `tasks/done/preset-cm-ui-removal.md`
- **Agent chat panel** (script management Agent — backlog)
  - Read: `tasks/backlog/agent-chat-panel.md`
  - Related: `.cursor/skills/scripts-api-mcp/SKILL.md`, `public/docs/scripts-ai-skill.md`
- **UI cross-module dedup** (Phase A done; B/C/D defer until UI work)
  - Read: `specs/ui-cross-module-review.md`, `tasks/backlog/ui-cross-module-dedup.md`
- **Large file split** (same-folder modules — done baseline)
  - Read: `rules/engineering-standards.md` §1, `tasks/done/large-file-split.md`
- **CSS logical properties review** (padding/margin/logical CSS — done baseline)
  - Read: `rules/engineering-standards.md` §2, `tasks/done/css-logical-properties-review.md`
- **Gist script history & rollback** (editor version browse/restore — backlog)
  - Read: `tasks/backlog/gist-script-rollback.md`
- **OTA publish policy** (SERVER per-script autoUpgrade / alpha / version lock)
  - Read: `specs/ota-publish-policy.md`, `tasks/done/ota-publish-policy.md`
- **Runtime modularization** (Phase A–C done; Phase D backlog)
  - Read: `tasks/done/runtime-modularization-phase-a-b-c.md`, `tasks/backlog/runtime-phase-d.md`
- **Extension native loader** (OTA 编排去 TM 化 — backlog)
  - Read: `tasks/backlog/extension-native-loader.md`, `extension/TODO.md` E25–E27
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

| Topic                          | File                                                        |
| ------------------------------ | ----------------------------------------------------------- |
| Preset runtime modules         | `specs/modules-registry.yaml`                               |
| Extension shell modules        | `specs/extension-shell.yaml`                                |
| HTML-only injection            | `specs/extension-injection-policy.md`                       |
| Runtime split baseline         | `specs/runtime-modularization.md`                           |
| Compatibility policy           | `specs/runtime-compatibility.md`                            |
| OTA publish policy             | `specs/ota-publish-policy.md`                               |
| Verification checklist         | `specs/runtime-verification-checklist.md`                   |
| Terminology                    | `knowledge/glossary.md`                                     |
| Engineering standards          | `rules/engineering-standards.md`                            |
| Requirements process           | `workflow/requirements-audit.md`                            |
| Execution phases               | `workflow/module-development.md`                            |
| Active TODO                    | `tasks/active/current.md`                                   |
| Runtime Phase A–C              | `tasks/done/runtime-modularization-phase-a-b-c.md`          |
| Script permissions             | `tasks/done/script-permissions.md`                          |
| OTA publish policy             | `tasks/done/ota-publish-policy.md`                          |
| Extension native loader        | `tasks/backlog/extension-native-loader.md`                  |
| Runtime Phase D                | `tasks/backlog/runtime-phase-d.md`                          |
| Extension ZIP 自更新（已取消） | `tasks/done/extension-fs-update.md` — 改走 Chrome Web Store |
| UI folder restructure          | `tasks/done/ui-folder-restructure.md`                       |
| UI cross-module review         | `specs/ui-cross-module-review.md`                           |
| Editor lib                     | `tasks/done/editor-lib.md`                                  |
| Agent chat panel               | `tasks/backlog/agent-chat-panel.md`                         |
| UI cross-module dedup          | `tasks/backlog/ui-cross-module-dedup.md` (Phase A done)     |
| Large file split               | `tasks/done/large-file-split.md`                            |
| CSS logical properties         | `tasks/done/css-logical-properties-review.md`               |
| Gist script rollback           | `tasks/backlog/gist-script-rollback.md`                     |
| Project overview               | `context/summary.md`                                        |
