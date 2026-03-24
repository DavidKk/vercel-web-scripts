# Specs index

This folder holds architecture and behavior requirements for this userscript platform.

## Canonical module list

- `modules-registry.yaml` is the single source of truth for high-level runtime modules.
- Keep `modules` sorted by `id`.

## Usage

- Before architecture refactors, update registry intent first.
- Keep implementation and registry aligned.
- Use workflow docs before implementation:
  - `../workflow/requirements-audit.md`
  - `../workflow/module-development.md`

## Current core requirement doc

- Runtime split and loading strategy baseline:
  - `runtime-modularization.md`
  - `runtime-compatibility.md`
  - `runtime-verification-checklist.md`
