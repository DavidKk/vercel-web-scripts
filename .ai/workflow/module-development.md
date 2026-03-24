# Module development workflow

Follow these phases in order.

## Phase 1 - Requirements confirmation

- Confirm problem statement and done criteria
- Confirm module boundary changes
- Do not implement yet

## Phase 2 - Requirements customization

- Define concrete behavior:
  - Which module owns which responsibility
  - Which parts are async/lazy
  - Cache and update policy
- Confirm constraints and compatibility

## Phase 3 - Breakdown checklist

- Produce implementation checklist, for example:
  - update `specs/modules-registry.yaml`
  - add/update loader contract in core
  - split build entries
  - add hash verification and rollback
  - update docs
  - run validations

## Phase 4 - Implementation

- Implement by checklist
- Keep module communication through core runtime interfaces
- Verify build and runtime behavior

## Phase 5 - Raise issues

- If blocked or ambiguous, stop and ask
- Resume only after explicit decision
