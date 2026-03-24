# Current focus

## Objective in progress

Stabilize the architecture/process baseline before executing the full runtime split.

## Current phase

Documentation-first alignment.

## Active execution list

- `../tasks/active/current.md`

## Confirmed decisions

- Architecture should move to modular runtime:
  - launcher
  - preset-core
  - preset-ui (async/lazy)
  - script-bundle (toward match-based modular loading)
- UI/debug capabilities should not be forced into the default preset path.
- Module updates should be hash-driven with local cache support.

## Next steps

1. Complete Phase A items in `tasks/active/current.md` one by one.
2. Move into Phase B only after Phase A contracts are confirmed.
3. Execute runtime split incrementally, starting with optional UI modules.

## Notes

Treat this file as the active work pointer for architecture refactor discussions and implementation planning.
