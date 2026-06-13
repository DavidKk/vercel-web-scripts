# Skills

Project agent skills are split by concern:

## Architecture & process (`.ai/`)

- Rules: `.ai/rules/global.md`
- Routing: `.ai/INDEX.md`
- Extension shell: `.ai/specs/extension-shell.yaml`
- No per-skill files here yet — add `.ai/skills/<name>/SKILL.md` when a workflow stabilizes.

## Code standards (`.cursor/skills/`)

Used by Cursor agents for implementation quality:

| Skill                                  | Purpose                               |
| -------------------------------------- | ------------------------------------- |
| `ai/SKILL.md`                          | Pointer to `.ai/`                     |
| `code-quality-check/SKILL.md`          | format / lint / typecheck after edits |
| `typescript-jsdoc-standards/SKILL.md`  | JSDoc                                 |
| `typescript-export-standards/SKILL.md` | export style                          |
| `test-naming-standards/SKILL.md`       | test naming                           |
| `scripts-api-mcp/SKILL.md`             | MagickMonkey scripts API / MCP        |

Entry: read `.cursor/skills/ai/SKILL.md` first, then task-specific skill.
