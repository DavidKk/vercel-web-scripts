# .ai (for AI)

Single source for AI-facing process, rules, and requirements in this repository.
All content here is in English for consistent agent consumption.

## Start here

- `INDEX.md` - Task/topic routing (what to read first)
- `rules/global.md` - Minimal global rule index
- `workflow/README.md` - Development workflow entry
- `specs/modules-registry.yaml` - Canonical architecture/module list
- `knowledge/glossary.md` - Canonical terminology (use consistent names)

## Scope in this repo

This repository is not an OpenAPI feature-module project. It is a userscript platform.
Current primary architecture modules:

1. Launcher (install script / runtime bootstrap)
2. Preset Core (always-on runtime)
3. Preset UI (optional async UI bundle)
4. Script Bundle(s) (business/user scripts, increasingly modular)

The workflow remains the same as other projects:
requirements audit -> requirements customization -> breakdown -> implementation -> verification.
