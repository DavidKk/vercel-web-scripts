# Context summary

## Project

Vercel Web Scripts is a Tampermonkey-oriented script platform with web-based editing, publishing, and runtime distribution.

## Current status (baseline)

### What is already done

- Initial `.ai` process skeleton has been created for this repository.
- Canonical high-level runtime modules have been defined in `specs/modules-registry.yaml`:
  - `launcher`
  - `preset-core`
  - `preset-ui`
  - `script-bundle`
- Preset bundle size has been reduced significantly by removing heavy UI imports from `preset/src/entry.ts`:
  - removed `string-tool`
  - removed `compiled-code-viewer`
- Publish behavior has been simplified to save-first flow (compile validation removed in editor publish path).

### What is still true in implementation

- Runtime is still primarily a single preset build artifact in current code paths.
- UI capabilities still exist in the repository and have not been fully modularized into a standalone async UI runtime contract yet.
- Script execution is not yet fully one-script-one-module with match-first lazy loading.

### Known gaps

- No finalized module manifest + loader contract for independent module updates.
- No finalized hash lifecycle document for per-module atomic update and rollback.
- Core/UI/script module communication contract still needs to be formalized.

## Target architecture direction

- Keep default runtime lightweight.
- Split runtime into independently deployable modules.
- Use hash-based per-module caching and updates.
- Support async optional UI loading.
- Move business scripts to match-based modular loading.

## Process baseline

- Use requirements audit for material changes.
- Use phase-based development workflow.
- Keep module registry and implementation aligned.
- Keep "current state" and "target state" explicitly separated in docs.
