# .ai (for AI)

Single source for AI-facing process, rules, and requirements in this repository.
All content here is in English for consistent agent consumption.

## Start here

- `INDEX.md` — Task/topic routing (what to read first)
- `rules/global.md` — Minimal global rule index
- `context/summary.md` — Stable project + implementation status
- `context/current.md` — Active focus pointer

## Two architecture layers

### 1. Preset OTA runtime (on web pages)

Modules in `specs/modules-registry.yaml`:

- Launcher, Preset Core, Preset UI, Script Bundle

Specs: `specs/runtime-modularization.md` and related files.

### 2. Chrome extension shell

Modules in `specs/extension-shell.yaml`:

- Background, content-bridge, page-launcher, admin (Servers/Scripts/Rules/Logs), popup, debug-log-store, extension-storage

Injection policy: `specs/extension-injection-policy.md` (**text/html only**).

Implementation docs: `extension/README.md`, `extension/docs/multi-service-tasks.md`.

## Workflow

Requirements audit → module development → verification. See `workflow/README.md`.

## Cursor integration

- `.cursor/rules/ai-rules.mdc` points here (`.ai/rules/global.md`)
- `.cursor/skills/ai/SKILL.md` points here for architecture; code standards live in sibling `.cursor/skills/*`
