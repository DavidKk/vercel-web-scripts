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

| Topic                   | File                                      |
| ----------------------- | ----------------------------------------- |
| Preset runtime modules  | `specs/modules-registry.yaml`             |
| Extension shell modules | `specs/extension-shell.yaml`              |
| HTML-only injection     | `specs/extension-injection-policy.md`     |
| Runtime split baseline  | `specs/runtime-modularization.md`         |
| Compatibility policy    | `specs/runtime-compatibility.md`          |
| Verification checklist  | `specs/runtime-verification-checklist.md` |
| Terminology             | `knowledge/glossary.md`                   |
| Requirements process    | `workflow/requirements-audit.md`          |
| Execution phases        | `workflow/module-development.md`          |
| Active TODO             | `tasks/active/current.md`                 |
| Project overview        | `context/summary.md`                      |
