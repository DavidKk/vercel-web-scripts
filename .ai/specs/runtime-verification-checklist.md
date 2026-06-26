# Runtime modularization verification checklist

Use this checklist when validating each phase of runtime modularization.

**Baseline (2026-06-27)**: Phase A–C + Phase D match-fallback implemented. Extension native loader (E25–E27) done. Checkboxes below are for **release-candidate re-verification**.

## Phase A - Contracts and docs

- [x] Manifest schema documented and example payload available
- [x] Cache lifecycle documented (scoped keys, fallback keys, stale behavior)
- [x] Update lifecycle documented (compare/download/validate/atomic switch/rollback)
- [x] Core communication contract documented (registry/event bus/handshake)
- [x] Compatibility guardrails documented

## Phase B - Runtime split foundation

- [x] `Launcher -> Preset Core` default path runs without `Preset UI`
- [x] Optional UI path can be triggered and loaded separately
- [x] Optional UI fetch failure does not break script execution
- [x] Runtime logs show module load state transitions

## Phase C - Update hardening

- [x] Hash unchanged: no redundant module download
- [x] Hash changed: update applies only changed module
- [x] Validation mismatch: module activation rejected
- [x] Atomic switch updates active pointer only after successful validation
- [x] Rollback restores previous known-good artifact on failure
- [x] OTA policy: alpha script edits do not change stable `script-bundle` hash for non-alpha clients
- [x] OTA policy: `autoUpgrade=false` blocks automatic preset-core apply; popup **Update runtime** bypasses via manual flag
- [x] OTA policy: fleet `lockedVersion` pins stable clients to releases snapshot
- [x] Extension popup footer shows preset semver and runtime stage (STB / ALP)

## Phase D - Script modularization

- [x] Aggregate script fallback remains available (default `scriptLoadMode=aggregate`)
- [x] Match-fallback loads per-file modules when `runtime.scriptLoadMode=match-fallback` and URL matches
- [x] No match or per-module fetch failure falls back to aggregate bundle
- [x] Dependency ordering for script modules is respected (`dependsOn` + topo sort)
- [x] Tampermonkey path documented as aggregate-only (see `runtime-phase-d.md`)

## Minimal smoke test (before each release candidate)

- [ ] Fresh install path works
- [ ] Existing install (with legacy cache keys) still works
- [ ] Offline/cache-first boot works after one successful online boot
- [ ] Update path works with and without optional modules
