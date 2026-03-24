# .ai quick index

Purpose: task -> file routing. Do not read the full `.ai/**` tree by default.

## Suggested load order

1. `INDEX.md` (this file)
2. `rules/global.md`
3. `context/current.md`
4. `workflow/README.md`
5. task-specific workflow/spec files

## By task

- New platform capability or major behavior change
  - Read: `workflow/requirements-audit.md`
  - Then: `workflow/module-development.md`
  - Execute from: `tasks/active/current.md`
- Split/refactor runtime modules (launcher/core/ui/scripts)
  - Read: `specs/modules-registry.yaml`, `specs/README.md`
- Define or update process/rules
  - Read: `rules/global.md`
- Align architecture docs with implementation
  - Read: `specs/modules-registry.yaml`, `context/current.md`, `context/summary.md`

## By topic

- Canonical architecture modules: `specs/modules-registry.yaml`
- Runtime split requirement baseline: `specs/runtime-modularization.md`
- Runtime compatibility policy: `specs/runtime-compatibility.md`
- Runtime verification checklist: `specs/runtime-verification-checklist.md`
- Canonical terminology: `knowledge/glossary.md`
- Requirements process: `workflow/requirements-audit.md`
- Execution phases: `workflow/module-development.md`
- Active pointer for ongoing work: `context/current.md`
- Active TODO list: `tasks/active/current.md`
- Project overview for AI: `context/summary.md`
