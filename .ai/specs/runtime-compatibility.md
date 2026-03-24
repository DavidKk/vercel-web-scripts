# Runtime compatibility and migration guardrails

## Purpose

Define compatibility policy for modular runtime rollout and ensure legacy behavior remains usable during migration.

## Compatibility policy

### 1) Launcher compatibility

- Existing installed launcher scripts must continue working without reinstall.
- If `module-manifest.json` is unavailable, launcher must fall back to legacy preset fetch path.
- Scoped cache keys must keep legacy key fallback reads until migration is complete.

### 2) Preset Core compatibility

- `Preset Core` is the mandatory baseline runtime.
- Optional module failures (`Preset UI`, future script modules) must not block core startup.
- Core APIs exposed in global namespace must remain backward-compatible for existing script usage.

### 3) Version handshake policy

- Every module declares minimum required core API version.
- Core validates module requirement before activation.
- If handshake fails:
  - module activation is skipped
  - failure event is emitted
  - runtime continues with remaining compatible modules

### 4) Script compatibility

- Aggregate script path remains enabled during migration.
- Match-based script module loading is additive until equivalent behavior is verified.
- Removing aggregate path requires explicit milestone approval.

## Migration guardrails

1. No hard switch without fallback:
   - Every new module path needs rollback to previous known-good artifact.
2. No mandatory optional dependency:
   - Optional modules may consume core APIs, core may not require optional modules at startup.
3. No silent contract break:
   - Any global API removal/rename must include compatibility shim or documented deprecation window.
4. No unscoped cache overwrite:
   - Cache writes should be scoped by runtime context (`baseUrl + key`).

## Exit criteria for removing legacy fallback

- Module manifest path stable in production
- Hash update + rollback validated
- Match-based loading validated for required script set
- Explicit developer confirmation recorded
