# Models: provisional, pending Chat 05 review

These 11 Mongoose models were **initially implemented by Chat 03 (Backend Architect)** directly from `docs/DATABASE_SCHEMA.md` v1.0, with the owner's approval, because Chat 05 (Database Architect) has not started.

- Collections, fields, enums, validators and indexes follow the schema section by section (each file names its section). Nothing was redesigned.
- Only additions beyond the literal schema text: the `pre('validate')` hook on `User` that fills `usernameLower` / `displayNameLower` (the schema says "set in pre-validate"), and the `toJSON` transform (schema principle 8).
- **Chat 05 review: NOT done.** When Chat 05 starts it owns these files (see MASTER_PLAN Section 2): review, adjust through Chat 00, and update `DATABASE_SCHEMA.md` first if anything changes.
- Verified so far (Chat 03, real MongoDB): all indexes build, including unique, partial and TTL; see `backend/tests/http/models.test.js`. Concurrency, pagination and explain() checks from schema Section 9 are NOT done.
