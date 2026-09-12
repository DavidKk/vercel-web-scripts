---
name: ai
description: Project architecture and process live in .ai/; read INDEX.md and context/summary.md before substantial work. Code standards live in sibling .cursor/skills/.
---

# Project AI docs (`.ai/`)

## Read first (minimal)

1. `.ai/INDEX.md` — route by task
2. `.ai/rules/global.md` — global rules index
3. `.ai/context/summary.md` — what is implemented vs TODO

## By task type

| Task                                   | Read                                                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Extension (admin, popup, inject, logs) | `.ai/specs/extension-shell.yaml`, `.ai/specs/extension-injection-policy.md`, `extension/README.md` |
| Preset OTA / module split              | `.ai/specs/modules-registry.yaml`, `.ai/specs/runtime-modularization.md`                           |
| Major feature / refactor               | `.ai/workflow/requirements-audit.md` → `.ai/workflow/module-development.md`                        |
| Active TODO                            | `.ai/tasks/active/current.md`                                                                      |

## Code quality (this folder's siblings)

After editing code, follow `.cursor/skills/code-quality-check/SKILL.md` (and ts/jsdoc/test skills as applicable).

Do **not** duplicate architecture docs under `.cursor/` — update `.ai/` instead.
