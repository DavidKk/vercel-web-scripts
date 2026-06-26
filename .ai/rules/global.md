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
- Extension shell, admin UI, content inject, debug logs
  - Read `specs/extension-shell.yaml` and `specs/extension-injection-policy.md`
- Need project-level context
  - Read `context/summary.md` (stable) or `context/current.md` (focus)
- Code structure / CSS hygiene (refactor, file size, Tailwind partials)
  - Read `rules/engineering-standards.md`

## One-line reminders

- Keep runtime modules loosely coupled (communicate via core runtime APIs/events).
- Default path should stay lightweight (core first, UI optional).
- Use hash-based module updates for cache correctness and rollback.
