# Runtime modularization verification checklist

Use this checklist when validating each phase of runtime modularization.

## Phase A - Contracts and docs

- [ ] Manifest schema documented and example payload available
- [ ] Cache lifecycle documented (scoped keys, fallback keys, stale behavior)
- [ ] Update lifecycle documented (compare/download/validate/atomic switch/rollback)
- [ ] Core communication contract documented (registry/event bus/handshake)
- [ ] Compatibility guardrails documented

## Phase B - Runtime split foundation

- [ ] `Launcher -> Preset Core` default path runs without `Preset UI`
- [ ] Optional UI path can be triggered and loaded separately
- [ ] Optional UI fetch failure does not break script execution
- [ ] Runtime logs show module load state transitions

## Phase C - Update hardening

- [ ] Hash unchanged: no redundant module download
- [ ] Hash changed: update applies only changed module
- [ ] Validation mismatch: module activation rejected
- [ ] Atomic switch updates active pointer only after successful validation
- [ ] Rollback restores previous known-good artifact on failure

## Phase D - Script modularization

- [ ] Aggregate script fallback remains available
- [ ] At least one script module loads by match rule
- [ ] Script module failure is isolated and does not crash core
- [ ] Dependency ordering for script modules is respected

## Minimal smoke test (before each release candidate)

- [ ] Fresh install path works
- [ ] Existing install (with legacy cache keys) still works
- [ ] Offline/cache-first boot works after one successful online boot
- [ ] Update path works with and without optional modules
