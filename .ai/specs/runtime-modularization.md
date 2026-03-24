# Runtime modularization requirements

## 1. Background

Current runtime behavior still trends toward a large preset artifact, which increases startup payload and makes optional tooling expensive on the default path.
The target architecture is to modularize runtime delivery and execution while preserving compatibility and stability.

Canonical module names follow `../knowledge/glossary.md`.

## 2. Objective

Establish a production-ready modular runtime model with:

- Lightweight default startup path
- Optional UI/debug runtime loaded asynchronously
- Hash-based module update and local cache strategy
- Gradual migration from script aggregate to script-level modular loading

## 3. In scope

### 3.1 Architecture modules

The runtime must operate through the following modules:

1. `Launcher` (install entry + bootstrap)
2. `Preset Core` (always-on minimal runtime)
3. `Preset UI` (optional lazy runtime)
4. `Script Bundle` (business scripts; evolving toward script modules)

### 3.2 Loading model

- `Default Path` must be `Launcher -> Preset Core`.
- `Preset UI` must be loaded via `Lazy Load` and must not block default startup.
- `Script Bundle` loading must support future `Match-Based Load`.

### 3.3 Update/cache model

- Runtime must use `Module Manifest` as remote index.
- Each module update decision must be based on `Module Hash`.
- Startup strategy must be `Cache-First Boot`.
- Activation must use `Atomic Switch`.
- Failed update/load must support `Rollback` to last known-good module.

### 3.4 Communication model

- Cross-module communication must use `Core Registry` + `Core Event Bus`.
- No direct hard dependency between optional modules.
- Module activation must enforce `Version Handshake`.

## 4. Out of scope (for this requirement phase)

- Full implementation of every script as independent module in one release
- Rebuilding all editor-side UX details
- Non-runtime product redesign

These may be delivered incrementally after core modular runtime contracts are stable.

## 5. Functional requirements

### FR-01 Default startup

- System shall initialize successfully when only `Launcher` and `Preset Core` are available.
- Optional module failure (for example `Preset UI` fetch fail) shall not break core script execution path.

### FR-02 UI optionality

- `Preset UI` shall be disabled by default in normal startup.
- `Preset UI` shall be loadable by explicit conditions (menu action, debug flag, or runtime rule).

### FR-03 Module updates

- System shall compare local and remote module hashes before update.
- System shall update changed modules only.
- System shall keep previous valid artifact for rollback.

### FR-04 Script loading evolution

- Current aggregate script path may remain during migration.
- Runtime contracts must support script-level `Match-Based Load` without redesigning core.

### FR-05 Compatibility

- Existing runtime behavior must remain backward compatible during staged rollout.
- Breaking contract changes require version negotiation through `Version Handshake`.

## 6. Non-functional requirements

### NFR-01 Performance

- Default startup payload should exclude optional UI/debug bundles.
- Runtime should avoid duplicate module downloads when hash unchanged.

### NFR-02 Reliability

- Partial update failure should not leave runtime in half-switched state.
- Core must keep functioning even when optional modules fail.

### NFR-03 Maintainability

- Module ownership boundaries must be documented and stable.
- Terminology must stay aligned with `../knowledge/glossary.md`.

## 7. Acceptance criteria

1. Architecture/module docs are aligned:
   - `modules-registry.yaml`
   - this requirement file
   - context docs
2. Runtime contracts are explicitly defined:
   - manifest fields
   - hash and cache lifecycle
   - module communication interfaces
3. A staged implementation plan exists and maps each phase to:
   - module changes
   - compatibility notes
   - verification steps
4. Optional UI can be disabled without breaking core runtime behavior.
5. Update flow supports hash-based selective update and rollback.

## 8. Delivery phases (high level)

### Phase A - Contract and docs

- Freeze terminology and module boundaries
- Define manifest/update/communication contracts

### Phase B - Runtime split foundation

- Keep `Default Path` minimal (`Launcher + Preset Core`)
- Move optional UI hooks behind lazy loader

### Phase C - Update hardening

- Implement per-module hash validation, atomic switch, rollback

### Phase D - Script modularization

- Introduce script-level loading based on match
- Keep aggregate fallback during transition

## 9. Risks and mitigations

- Risk: module coupling regressions
  - Mitigation: enforce Core Registry/Event Bus and no direct optional-module imports
- Risk: cache inconsistency
  - Mitigation: hash verification + atomic activation + rollback pointer
- Risk: migration complexity
  - Mitigation: phased rollout and backward-compatible fallback path
