---
name: code-quality-check
description: Automatically runs code quality checks (format, lint, typecheck) after generating or modifying code. Use when writing code, generating files, or when code changes need to be validated.
---

# Code Quality Check

## Critical: Always Run After Code Changes

**After generating or modifying any code, you MUST automatically execute:**

```bash
pnpm format && pnpm lint && pnpm typecheck
```

## Workflow

1. **Generate or modify code**
2. **Immediately run quality checks** (do not wait for user request)
3. **If checks fail**: Fix issues and re-run until all pass
4. **Only then**: Consider the task complete

## Command Details

1. **`pnpm format`**: Formats code using Prettier
   - Automatically fixes formatting issues
   - Ensures consistent code style

2. **`pnpm lint`**: Runs ESLint with auto-fix
   - Checks for code quality issues
   - Automatically fixes fixable issues

3. **`pnpm typecheck`**: Runs TypeScript type checking
   - Validates type safety
   - Catches type errors before runtime

## Execution Rules

**MANDATORY**: Execute these commands automatically after:

- Creating new files
- Modifying existing files
- Generating code
- Completing code changes

**DO NOT**:

- Skip these checks
- Wait for user to request them
- Consider task complete without running checks

**If checks fail**:

1. Review error messages carefully
2. Fix all issues
3. Re-run the full command sequence
4. Repeat until all checks pass

## Example Workflow

```
1. User: "Create a new component"
2. Agent: [Creates component code]
3. Agent: [Automatically runs: pnpm format && pnpm lint && pnpm typecheck]
4. Agent: [If passes] "Component created and all quality checks passed"
5. Agent: [If fails] "Component created but quality checks failed. Fixing issues..."
   [Fixes issues and re-runs checks]
```
