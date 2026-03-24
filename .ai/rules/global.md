# Global rules (read first - index)

This file is the rule index for AI tasks in this repository.

## Authority

- Canonical process/rules live under `.ai/`
- `.cursor/rules/ai-rules.mdc` only points to this location

## Do X -> read Y

- Any non-trivial change
  - Read this file first, then relevant workflow/spec docs
- New feature, major refactor, runtime architecture change
  - Read `workflow/requirements-audit.md` first
  - Then follow `workflow/module-development.md`
- Module split/merge/load-policy change
  - Read `specs/modules-registry.yaml` and `specs/README.md`
- Need project-level context
  - Read `context/summary.md`

## One-line reminders

- Keep runtime modules loosely coupled (communicate via core runtime APIs/events).
- Default path should stay lightweight (core first, UI optional).
- Use hash-based module updates for cache correctness and rollback.
