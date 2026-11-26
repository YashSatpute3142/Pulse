# Models (Chat 03 implementation, reviewed by Chat 05 on 2026-11-26)

**Chat 05 review status (2026-11-26):** done by reading; 9 non-Canvas models match `DATABASE_SCHEMA.md` and were left unchanged. `CanvasSession` and `CanvasStroke` were finalized by Chat 05 (schema v1.1, section 3.10). The database-level checks in `tests/http/dbReview.test.js` are written but **not yet run** (no MongoDB in the review environment). Findings and proposals: `DATABASE_SCHEMA.md` section 10.

**v1.2 (2026-11-26, Chat 00 approved):** Canvas stroke `epoch`; FocusRoom index `{hostId,status,createdAt}` (run `npm run db:sync-indexes` on deploy); Friendship `userA < userB` hook; new `Upload` registry model (not yet used by any service). Details: `DATABASE_SCHEMA.md` Sections 3.10, 3.11, 12.

History below is from Chat 03's original note.

These 11 Mongoose models were **initially implemented by Chat 03 (Backend Architect)** directly from `docs/DATABASE_SCHEMA.md` v1.0, with the owner's approval, because Chat 05 (Database Architect) has not started.

- Collections, fields, enums, validators and indexes follow the schema section by section (each file names its section). Nothing was redesigned.
- Only additions beyond the literal schema text: the `pre('validate')` hook on `User` that fills `usernameLower` / `displayNameLower` (the schema says "set in pre-validate"), and the `toJSON` transform (schema principle 8).
- **Correction found by testing (for Chat 05 / Chat 00):** `DATABASE_SCHEMA.md` 3.4 declares `lastMessage: { messageId, senderId, preview, type: String, at }`. In Mongoose, a nested key named `type` is parsed as the *type declaration*, so `lastMessage` silently became a `String` and every message send failed. `Conversation.js` now uses a sub-schema (`_id: false`) with exactly the documented fields. No field, index or API shape changed; the schema document should note this pitfall.
- **Chat 05 review: done 2026-11-26 (see top of this file).** Original note: When Chat 05 starts it owns these files (see MASTER_PLAN Section 2): review, adjust through Chat 00, and update `DATABASE_SCHEMA.md` first if anything changes.
- Verified so far (Chat 03, real MongoDB): all indexes build, including unique, partial and TTL; see `backend/tests/http/models.test.js`. Concurrency, pagination and explain() checks from schema Section 9 are NOT done.
