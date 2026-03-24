# Runtime modularization TODO (active)

Source requirement: `../../specs/runtime-modularization.md`

Status legend:

- `TODO`
- `IN_PROGRESS`
- `DONE`
- `BLOCKED`

## Phase A - Contract and docs

- [DONE] A1. Define module manifest contract (fields, versioning, dependency/optional flags, hash policy).
- [DONE] A2. Define module cache lifecycle (cache keys, cache-first boot, stale policy).
- [DONE] A3. Define update lifecycle (compare hash -> download -> validate -> atomic switch -> rollback).
- [DONE] A4. Define runtime communication contract in Preset Core (`Core Registry`, `Core Event Bus`, `Version Handshake`).
- [DONE] A5. Define compatibility policy and migration guardrails (legacy aggregate script compatibility).
- [DONE] A6. Add verification checklist for each phase (build checks, runtime checks, failure-path checks).

## Phase B - Runtime split foundation

- [DONE] B1. Split build output into explicit runtime modules (`Launcher`, `Preset Core`, `Preset UI`, `Script Bundle` baseline).
- [DONE] B2. Make default startup path strictly `Launcher -> Preset Core`.
- [DONE] B3. Move optional UI hooks behind lazy loader and explicit triggers.
- [DONE] B4. Ensure optional module load failure does not break core execution.
- [DONE] B5. Add runtime telemetry/log markers for module load state.

## Phase C - Update hardening

- [TODO] C1. Implement per-module hash comparison and selective updates.
- [TODO] C2. Implement atomic switch pointer for activated versions.
- [TODO] C3. Implement rollback to previous known-good module.
- [TODO] C4. Add corruption/incomplete download handling and safe fallback behavior.
- [TODO] C5. Verify no duplicate downloads when module hash unchanged.

## Phase D - Script modularization

- [TODO] D1. Keep current aggregate script path as fallback.
- [TODO] D2. Introduce script metadata for match-based loading.
- [TODO] D3. Implement first script-level loading path (`Match-Based Load`) with backward compatibility.
- [TODO] D4. Add dependency handling for script modules.
- [TODO] D5. Define rollout strategy from aggregate bundle to script modules.

## Milestone completion criteria

- [TODO] M1. Docs/contracts are complete and approved.
- [TODO] M2. Runtime split foundation is running in development.
- [TODO] M3. Hash update + rollback flow is validated.
- [TODO] M4. First script-level match-based module path is validated.
