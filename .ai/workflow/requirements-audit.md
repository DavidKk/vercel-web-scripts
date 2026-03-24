# Requirements audit (mandatory)

Apply this audit before implementing any material change:

- Runtime module split/merge
- Script loading strategy changes
- Cache/update mechanism changes
- New UI runtime capabilities in preset
- Public behavior changes in launcher/core

## Checklist

1. Problem and user
   - Who is affected (platform maintainer, script author, end user)?
   - What is the success criterion?
2. Scope and module impact
   - Which modules change (`launcher`, `preset-core`, `preset-ui`, `script-bundle`)?
   - Is this change backward compatible?
3. Loading model
   - Sync vs async loading?
   - What is the default path and what is optional?
4. Cache/update model
   - Hash strategy per module
   - Atomic switch and rollback plan
5. Runtime safety
   - What happens if optional module fetch fails?
   - Does core still function?
6. Communication contract
   - How modules communicate (core registry/event bus)?
   - Any new API/version handshake needed?
7. Verification plan
   - Which build/runtime checks prove correctness?
8. Developer confirmation
   - Provide short summary and wait for explicit approval

If any key item is unknown, stop and ask before coding.
