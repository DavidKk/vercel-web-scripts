# Glossary

Use these terms as the only canonical names in docs/discussions.
Avoid alternative names unless explicitly mapping legacy wording.

## Core architecture terms

- **Launcher**
  - Meaning: Tampermonkey install entry and runtime bootstrap layer.
  - Includes: initial load flow, manifest fetch, cache-first boot, module load orchestration.
  - Avoid saying: "shell script", "outer wrapper", "install shell" as primary name.

- **Preset Core**
  - Meaning: default always-on minimal runtime.
  - Includes: module registry/event bus, base logging, match scheduler, cache/update primitives.
  - Excludes: heavy UI/debug tools.
  - Avoid saying: "big preset", "main preset" when referring to the new target model.

- **Preset UI**
  - Meaning: optional async UI/debug runtime bundle.
  - Includes: log viewer, selector/toolbar, command palette, and other non-essential UX tools.
  - Load mode: lazy/conditional, not default blocking path.

- **Script Bundle**
  - Meaning: business/user scripts managed by editor and distributed to runtime.
  - Direction: evolve from one large bundle to script modules (match-based loading).

## Update/cache terms

- **Module Manifest**
  - Meaning: remote index describing module URL/version/hash/dependency metadata.

- **Module Hash**
  - Meaning: immutable content fingerprint used for cache hit/miss and update decisions.

- **Cache-First Boot**
  - Meaning: startup reads local cached module first, then checks remote manifest in background.

- **Atomic Switch**
  - Meaning: activate new module only after download + hash validation succeed.

- **Rollback**
  - Meaning: fallback to previous known-good module when update/load fails.

## Runtime communication terms

- **Core Registry**
  - Meaning: central module API registration/discovery in Preset Core (`register/get` style).

- **Core Event Bus**
  - Meaning: decoupled cross-module signaling channel (`on/emit` style).

- **Version Handshake**
  - Meaning: compatibility check between module and core API version before activation.

## Loading terms

- **Default Path**
  - Meaning: startup-critical path that must stay lightweight (`Launcher -> Preset Core`).

- **Lazy Load**
  - Meaning: async on-demand module loading triggered by condition/menu/match.

- **Match-Based Load**
  - Meaning: load script module only after URL/rule matching.
