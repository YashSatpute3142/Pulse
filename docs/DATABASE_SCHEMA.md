# PULSE — DATABASE SCHEMA v1.2 (APPROVED by Chat 00 2026-11-26, with Section 11 amendments pending as v1.2)
Owner: Chat 05 (Database Architect). Consumers: Chat 03 (Backend), 04 (WebSocket), 06 (Features).
Place in `docs/DATABASE_SCHEMA.md`. MongoDB (Atlas) + Mongoose 8, ESM.

Changes to this file require Chat 00 approval. Backend/WS chats must not add fields or indexes without updating it.

---

## 1. Principles

1. **Reference, don't embed unbounded data.** Messages, room messages and canvas strokes are their own collections. Embedded arrays are used only when bounded (conversation members ≤ 50, room participants ≤ 20, poll votes ≤ 50, reactions ≤ 20 emoji per message).
2. **IDs:** native `ObjectId`. API returns them as strings. Client-generated `clientId` (UUID) is used for idempotent sends.
3. **Cursor pagination only** (by `_id`), never `skip`.
4. **Soft delete** for messages (`deletedAt`); content is blanked on delete so it cannot leak.
5. **Atomic updates** (`$inc`, `$addToSet`, `$pull`, arrayFilters, unique indexes) instead of read-modify-write. Race conditions (double vote, double join) are prevented at the DB level, not just in service code.
6. **Presence is in memory** (WebSocket connection manager). Only `lastSeenAt` is persisted, on last-socket disconnect.
7. **Timestamps:** `{ timestamps: true }` on every schema.
8. **Hide secrets:** `passwordHash` has `select: false`; `toJSON` transform removes `__v` and `passwordHash`.
9. Read paths use `.lean()` and field projection.

---

## 2. Collections Overview

| Collection | Purpose | Approx. growth |
|---|---|---|
| `users` | Accounts and profile/preferences | low |
| `refreshtokens` | Hashed refresh tokens, rotation families | medium, TTL cleaned |
| `friendships` | Friend requests, accepted friends, blocks | low–medium |
| `conversations` | Direct and group conversations + per-member read state | medium |
| `messages` | All conversation messages | **high** |
| `activities` | One live-activity doc per user | = users |
| `focusrooms` | Focus sessions + participants | medium |
| `roommessages` | Chat inside focus rooms | medium |
| `polls` | Polls with votes | low–medium |
| `canvassessions` | Shared canvas metadata | low |
| `canvasstrokes` | Individual strokes | medium, TTL cleaned |
| `uploads` | Registry of uploaded files, to verify ownership and single use (v1.2, A5) | = uploads, unused rows TTL cleaned |

Sparks (conversation starters) are a static array in backend code (`constants/sparks.js`), not a collection.

---

## 3. Schemas

### 3.1 User
```js
const userSchema = new Schema({
  username:      { type: String, required: true, trim: true, minlength: 3, maxlength: 24 },
  usernameLower: { type: String, required: true },          // set in pre-validate; unique
  email:         { type: String, required: true, trim: true, lowercase: true },
  passwordHash:  { type: String, required: true, select: false },
  displayName:   { type: String, required: true, trim: true, maxlength: 40 },
  displayNameLower: { type: String, required: true },
  avatarUrl:     { type: String, default: null },
  bio:           { type: String, default: '', maxlength: 160 },
  settings: {
    theme:              { type: String, enum: ['system', 'dark', 'light'], default: 'system' },
    activityVisibility: { type: String, enum: ['everyone', 'friends', 'nobody'], default: 'friends' },
    showPresence:       { type: Boolean, default: true },   // false => always appears offline to others
    showReadReceipts:   { type: Boolean, default: true },
  },
  lastSeenAt:    { type: Date, default: null },
  tokenVersion:  { type: Number, default: 0 },              // bump to invalidate all access tokens
  disabledAt:    { type: Date, default: null },
}, { timestamps: true });

userSchema.index({ usernameLower: 1 }, { unique: true });
userSchema.index({ email: 1 },         { unique: true });
userSchema.index({ displayNameLower: 1 });                  // prefix search
```
Search: `GET /users/search?q=` uses an anchored, escaped prefix regex on `usernameLower` / `displayNameLower` (index-friendly), limit 20.

### 3.2 RefreshToken
```js
const refreshTokenSchema = new Schema({
  userId:     { type: ObjectId, ref: 'User', required: true },
  tokenHash:  { type: String, required: true },             // SHA-256 of the token
  familyId:   { type: String, required: true },             // rotation chain id
  replacedBy: { type: ObjectId, ref: 'RefreshToken', default: null },
  revokedAt:  { type: Date, default: null },
  expiresAt:  { type: Date, required: true },
  userAgent:  { type: String, default: '' },
  ip:         { type: String, default: '' },
}, { timestamps: true });

refreshTokenSchema.index({ tokenHash: 1 }, { unique: true });
refreshTokenSchema.index({ userId: 1, familyId: 1 });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });   // TTL
```
Reuse of a revoked token ⇒ revoke the whole `familyId` (auth service, Chat 03).

### 3.3 Friendship
Normalized so a pair has exactly one document.
```js
const friendshipSchema = new Schema({
  userA:       { type: ObjectId, ref: 'User', required: true },   // lexicographically smaller id
  userB:       { type: ObjectId, ref: 'User', required: true },   // larger id
  requestedBy: { type: ObjectId, ref: 'User', required: true },
  status:      { type: String, enum: ['pending', 'accepted', 'blocked'], default: 'pending' },
  blockedBy:   { type: ObjectId, ref: 'User', default: null },
  respondedAt: { type: Date, default: null },
}, { timestamps: true });

friendshipSchema.index({ userA: 1, userB: 1 }, { unique: true });
friendshipSchema.index({ userA: 1, status: 1 });
friendshipSchema.index({ userB: 1, status: 1 });
```
Helper `pairKey(idX, idY)` in `utils/ids.js` returns `[userA, userB]`, used everywhere. Friend list = query both indexes with `$or`.

### 3.4 Conversation
```js
const memberSchema = new Schema({
  user:              { type: ObjectId, ref: 'User', required: true },
  role:              { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
  joinedAt:          { type: Date, default: Date.now },
  lastReadMessageId: { type: ObjectId, default: null },
  lastReadAt:        { type: Date, default: null },
  unreadCount:       { type: Number, default: 0, min: 0 },
  mutedUntil:        { type: Date, default: null },
  leftAt:            { type: Date, default: null },            // soft leave keeps history readable to admins
}, { _id: false });

const conversationSchema = new Schema({
  type:      { type: String, enum: ['direct', 'group'], required: true },
  directKey: { type: String, default: undefined },             // "idA:idB" sorted; direct only
  title:     { type: String, trim: true, maxlength: 60 },      // group only
  avatarUrl: { type: String, default: null },
  createdBy: { type: ObjectId, ref: 'User', required: true },
  members:   { type: [memberSchema], validate: [v => v.length >= 2 && v.length <= 50, 'members 2-50'] },
  // MUST be a sub-schema. A nested plain object with a key named `type` is read by Mongoose as a type declaration
  // and silently turns the whole field into a String (found by Chat 03's tests, fixed in code, doc corrected in v1.1).
  lastMessage: { type: new Schema({
    messageId: ObjectId,
    senderId:  ObjectId,
    preview:   String,            // max 120 chars; "Photo", "Document", "Poll" for non-text
    type:      String,
    at:        Date,
  }, { _id: false }), default: undefined },
}, { timestamps: true });

conversationSchema.index({ 'members.user': 1, updatedAt: -1 });          // inbox list
conversationSchema.index({ directKey: 1 },
  { unique: true, partialFilterExpression: { type: 'direct' } });        // one DM per pair
```
- **Unread counts:** on message create, one atomic update increments `unreadCount` for every member except the sender: `updateOne({_id}, {$inc:{'members.$[o].unreadCount':1}, $set:{lastMessage, updatedAt}}, {arrayFilters:[{'o.user':{$ne:senderId}}]})`. On read: set `lastReadMessageId`, `lastReadAt`, `unreadCount: 0` for that member.
- **Read receipts** are derived: "seen by" for message M = members whose `lastReadMessageId >= M._id` (ObjectIds are time-ordered). No per-message receipt writes.
- Conversation search: `q` matches `title` (prefix, case-insensitive) or the other member's display name via the `users` prefix index (service performs the user lookup first, then filters conversations by those ids).

### 3.5 Message
```js
const attachmentSchema = new Schema({
  kind:     { type: String, enum: ['image', 'file'], required: true },
  url:      { type: String, required: true },
  publicId: { type: String, required: true },     // storage id, for deletion
  name:     { type: String, maxlength: 200 },
  mime:     { type: String },
  size:     { type: Number },                     // bytes
  width: Number, height: Number,
}, { _id: false });

const messageSchema = new Schema({
  conversationId: { type: ObjectId, ref: 'Conversation', required: true },
  senderId:       { type: ObjectId, ref: 'User', default: null },     // null for system
  type:           { type: String, enum: ['text', 'image', 'file', 'poll', 'system'], default: 'text' },
  text:           { type: String, default: '', maxlength: 4000 },
  attachments:    { type: [attachmentSchema], default: [], validate: [v => v.length <= 5, 'max 5'] },
  replyTo:        { type: ObjectId, ref: 'Message', default: null },
  pollId:         { type: ObjectId, ref: 'Poll', default: null },
  reactions: [{ _id: false, emoji: { type: String, maxlength: 16 }, users: [{ type: ObjectId, ref: 'User' }] }],
  clientId:       { type: String, default: undefined },               // idempotency key
  editedAt:       { type: Date, default: null },
  deletedAt:      { type: Date, default: null },
}, { timestamps: true });

messageSchema.index({ conversationId: 1, _id: -1 });                  // history pagination
messageSchema.index({ conversationId: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } });   // dedupe retries
```
- History query: `find({ conversationId, _id: { $lt: before } }).sort({ _id: -1 }).limit(limit+1)`; `hasMore` from the extra row.
- Reply preview is populated on read (`replyTo` lookup, projected to `senderId, text(first 120), type, deletedAt`).
- Edit: only sender, only `type: text`, within 24 h of creation (policy, enforced by service). Sets `editedAt`.
- Delete: sender (or group admin), sets `deletedAt`, blanks `text`, empties `attachments`, removes files from storage.
- Reactions: add `$addToSet` to the matching emoji entry (or `$push` new entry); remove `$pull`; remove empty entries. One user may react with several different emoji, once each.

### 3.6 Activity
One document per user; upserted.
```js
const activitySchema = new Schema({
  userId:     { type: ObjectId, ref: 'User', required: true },
  type:       { type: String, enum: ['studying','coding','gaming','music','working','break','available'], required: true },
  label:      { type: String, trim: true, maxlength: 60, default: '' },   // "Organic Chem"
  visibility: { type: String, enum: ['everyone','friends','nobody'], default: 'friends' },
  startedAt:  { type: Date, default: Date.now },
  expiresAt:  { type: Date, default: null },
}, { timestamps: true });                                                  // updatedAt = "updated 12m ago"

activitySchema.index({ userId: 1 }, { unique: true });
activitySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });         // docs with null are not expired
```
Clearing = delete the doc. Because TTL deletion is silent and runs about once a minute, a server job also sweeps expired activities and broadcasts `ACTIVITY_CHANGED` (cleared); TTL is only the backstop. `visibility` is copied from the user's default at publish time and can be overridden per activity.
Feed query: friends' ids (from Friendship) + `visibility in (everyone, friends)` + `everyone` for non-friends if allowed; the service enforces this, never the client.

### 3.7 FocusRoom
```js
const focusRoomSchema = new Schema({
  title:       { type: String, required: true, trim: true, maxlength: 60 },
  hostId:      { type: ObjectId, ref: 'User', required: true },
  durationSec: { type: Number, required: true, min: 300, max: 14400 },     // 5 min - 4 h
  status:      { type: String, enum: ['lobby','running','completed','cancelled'], default: 'lobby' },
  startedAt:   { type: Date, default: null },
  endsAt:      { type: Date, default: null },                              // timer authority
  completedAt: { type: Date, default: null },
  invited:     [{ type: ObjectId, ref: 'User' }],
  participants: [{
    _id: false,
    user:     { type: ObjectId, ref: 'User', required: true },
    joinedAt: { type: Date, default: Date.now },
    leftAt:   { type: Date, default: null },                               // null = currently in room
  }],
}, { timestamps: true });

focusRoomSchema.index({ status: 1, endsAt: 1 });                           // timer recovery on restart
focusRoomSchema.index({ 'participants.user': 1, status: 1 });
focusRoomSchema.index({ invited: 1, status: 1 });
focusRoomSchema.index({ hostId: 1, createdAt: -1 });
```
- Access (v1.2): **invite-only**. Host and users in `invited` may join; friends of the host may not join uninvited. This is the v1 default built by Chat 03 and accepted by Chat 00, pending the owner's answer to `PROJECT_OVERVIEW.md` Q8 (changing it to "friends of host" is a service change only, no schema change). Join is rejected otherwise.
- Join/leave use atomic updates with `arrayFilters` (a user cannot appear twice as active).
- Start (host only): atomic `findOneAndUpdate({_id, status:'lobby', hostId}, {status:'running', startedAt: now, endsAt: now+duration})`.
- On boot, `jobs/focusTimer.js` loads `status:'running'` rooms and re-arms timers; rooms whose `endsAt` has passed are completed immediately.
- If a running room has had zero active participants for 5 minutes, it is cancelled (job).

### 3.8 RoomMessage
```js
const roomMessageSchema = new Schema({
  roomId:   { type: ObjectId, ref: 'FocusRoom', required: true },
  senderId: { type: ObjectId, ref: 'User', default: null },                // null = system line
  kind:     { type: String, enum: ['text', 'join', 'leave', 'start', 'complete'], default: 'text' },
  text:     { type: String, default: '', maxlength: 500 },
}, { timestamps: true });

roomMessageSchema.index({ roomId: 1, _id: -1 });
roomMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });   // 30-day retention
```

### 3.9 Poll
```js
const pollSchema = new Schema({
  conversationId: { type: ObjectId, ref: 'Conversation', required: true },
  messageId:      { type: ObjectId, ref: 'Message', default: null },
  creatorId:      { type: ObjectId, ref: 'User', required: true },
  question:       { type: String, required: true, trim: true, maxlength: 200 },
  options: { type: [{ _id: false, id: { type: String, required: true }, text: { type: String, maxlength: 80 } }],
             validate: [v => v.length >= 2 && v.length <= 8, '2-8 options'] },
  multiple:       { type: Boolean, default: false },
  anonymous:      { type: Boolean, default: false },
  votes: [{ _id: false, user: { type: ObjectId, ref: 'User' }, optionIds: [String], at: { type: Date, default: Date.now } }],
  closesAt:       { type: Date, default: null },
  closedAt:       { type: Date, default: null },
}, { timestamps: true });

pollSchema.index({ conversationId: 1, createdAt: -1 });
```
One vote per user: vote = atomic "replace my entry" (`$pull` my entry then `$push`) guarded by the filter `{ closedAt: null, 'options.id': { $all: optionIds } }`, or `bulkWrite` of both ops. For `anonymous`, the API returns counts only, never voters (the data is still stored for dedupe).
Results are computed in the service from `votes`; sent as `{ optionId: count }` plus `myVote`.

### 3.10 CanvasSession and CanvasStroke (v1.2, finalized by Chat 05; models implemented, no consumers yet)
```js
const canvasSessionSchema = new Schema({
  ownerType: { type: String, enum: ['conversation', 'room'], required: true },
  ownerId:   { type: ObjectId, required: true },
  seq:       { type: Number, default: 0, min: 0, max: 2000 },   // strokes persisted since the last clear; hard cap 2000
  epoch:     { type: Number, default: 0, min: 0 },              // +1 on every clear (NEW in v1.1)
  clearedAt: { type: Date, default: null },
}, { timestamps: true });
canvasSessionSchema.index({ ownerType: 1, ownerId: 1 }, { unique: true });

const canvasStrokeSchema = new Schema({
  sessionId: { type: ObjectId, ref: 'CanvasSession', required: true },
  authorId:  { type: ObjectId, ref: 'User', required: true },
  strokeId:  { type: String, required: true, match: /^[A-Za-z0-9_-]{8,64}$/ },   // NEW: client id from CANVAS_UPDATE; idempotent `end`
  epoch:     { type: Number, required: true, min: 0 },   // v1.2: CanvasSession.epoch when the slot was allocated
  seq:       { type: Number, required: true, min: 1 },
  tool:      { type: String, enum: ['pen','eraser','line','rect','ellipse'], default: 'pen' },
  color:     { type: String, match: /^#[0-9a-fA-F]{6}$/ },
  size:      { type: Number, min: 1, max: 32 },
  points:    { type: [Number], validate: validPoints },   // flat [x0,y0,...], even length, 1..1000 points, each 0..1
}, { timestamps: true });
canvasStrokeSchema.index({ sessionId: 1, epoch: 1, seq: 1 }, { unique: true });   // v1.0 non-unique; v1.1 {sessionId,seq} unique; v1.2 per epoch
canvasStrokeSchema.index({ sessionId: 1, strokeId: 1 }, { unique: true });   // NEW
canvasStrokeSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 14 });   // 14-day retention
```
**v1.2 (Chat 00 amendment 1, applied):** `CanvasStroke.epoch` (required) and the unique index `{sessionId, epoch, seq}` replace v1.1's `{sessionId, seq}`. Reason: a stroke could allocate slot *k* in epoch *e*, lose to a clear (epoch *e+1*, `seq` reset to 0), and still be created afterwards; it would then show in replay and collide with a legitimate stroke reaching `seq` *k*. Now the stale stroke keeps epoch *e*, is never replayed, and cannot collide. Covered by the "RACE" test in `tests/http/dbReview.test.js`.

**Changes from v1.0 (all additive or tightening; need Chat 00 approval, no running code depends on them):** `strokeId`, `CanvasSession.epoch`, unique `seq`, unique `strokeId`, stricter `points` validation (v1.0 allowed odd length and values outside 0..1), `seq` cap.

**Canvas service contract (for Chat 03/04/06; the "canvas service and stroke format" that WEBSOCKET_PROTOCOL item 27 is blocked on):**
- **Get or create session:** `CanvasSession.findOneAndUpdate({ ownerType, ownerId }, { $setOnInsert: { seq: 0, epoch: 0 } }, { upsert: true, new: true })`. The unique index makes concurrent first joins safe (retry once on E11000).
- **Live drawing** (`CANVAS_UPDATE` phases `start`/`move`) is relayed in memory only. The server buffers the points of an in-flight stroke per socket, keyed by `strokeId`, and remembers the session `epoch` seen at `start`.
- **Persist on `end`:** (1) allocate a slot atomically: `CanvasSession.findOneAndUpdate({ _id, epoch: epochAtStart, seq: { $lt: 2000 } }, { $inc: { seq: 1 } }, { new: true })`. `null` means the canvas was cleared meanwhile or is full: drop the stroke (and tell the author if full). (2) `CanvasStroke.create({ sessionId, authorId, strokeId, epoch: updated.epoch, seq: updated.seq, ... })` (**use the epoch returned by step 1, never a cached one**). On E11000 for `strokeId` it is a retry: ACK and ignore. If step 2 fails after step 1, the slot is lost (a gap in `seq`); gaps are harmless because replay orders by `seq`.
- **Replay on `CANVAS_JOIN`:** read the session, then `CanvasStroke.find({ sessionId, epoch: session.epoch }).sort({ seq: 1 }).limit(2000).lean()`; the response carries the session `seq` and `epoch`.
- **Clear:** `const c = await CanvasSession.findOneAndUpdate({ _id }, { $inc: { epoch: 1 }, $set: { seq: 0, clearedAt: now } }, { new: true })`, then `CanvasStroke.deleteMany({ sessionId, epoch: { $lt: c.epoch } })`; broadcast `CANVAS_CLEARED` with `c.epoch`. Order matters: bumping the epoch first stops allocation for strokes that started before the clear. A stroke that had already allocated its slot may still be written into the old epoch after the `deleteMany`; it is invisible to replay and is removed by the next clear or by the 14-day TTL.
- **Retention:** strokes expire after 14 days (TTL). Empty sessions are tiny and are not cleaned in v1.1; a sweeper can delete sessions with `seq: 0` older than 30 days later (Chat 08).

### 3.11 Upload (v1.2; CONTRACT_DECISIONS A5)
```js
const uploadSchema = new Schema({
  uploaderId: { type: ObjectId, ref: 'User', required: true },
  kind:       { type: String, enum: ['image', 'file'], required: true },
  url:        { type: String, required: true },
  publicId:   { type: String, required: true },     // storage id; never sent to clients
  usedAt:     { type: Date, default: null },        // set atomically by the message that claims the file
  expiresAt:  { type: Date, default: now + 24 h },  // $unset when claimed; TTL only sees unused rows
}, { timestamps: { createdAt: true, updatedAt: false } });
uploadSchema.index({ url: 1 }, { unique: true });
uploadSchema.index({ uploaderId: 1, createdAt: -1 });
uploadSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
```
- **Deviation from the A5 text:** A5 says "TTL 24 h on rows with `usedAt: null`". A TTL index cannot be conditional on `usedAt: null` portably (a partial index cannot express `$exists: false`, and a TTL on `createdAt` would also delete used rows), so the row carries an `expiresAt` that the claim removes. Same effect. Extra fields vs A5: `kind` (needed for storage deletion) and `expiresAt`.
- **Write:** `POST /uploads` inserts the row after the storage upload succeeds.
- **Claim (CHAT_MESSAGE):** per attachment, atomically `Upload.findOneAndUpdate({ url, uploaderId: actor, usedAt: null }, { $set: { usedAt: now }, $unset: { expiresAt: 1 } }, { new: true })`. `null` means unknown url, another user's file, or already used: `FORBIDDEN`. `publicId` and `kind` come from the row. If the message insert then fails, release the claim (`usedAt: null`, restore `expiresAt`).
- **Known limit (needs a decision, Chat 03/08):** TTL deletes the row but **not the file in storage**. An upload that is never attached is therefore orphaned in Cloudinary once its row expires. Better than TTL alone: a sweeper that finds unused rows older than 24 h, destroys the file, then deletes the row (the weekly orphan job in Section 6 can do this). Until then nothing is lost relative to today.
- **How ownership is verified TODAY (v1.1 code, `attachment.service.js`, answers E7):** no registry. `verifyAttachments` accepts an attachment only if its `url` matches `https://res.cloudinary.com/<cloud>/<image|raw>/upload/[v123/]pulse/<actorId>/<12-byte random>[.ext]`. The storage adapter builds `pulse/<userId>/<random>` server-side at upload time, so the path proves the uploader; `publicId` is derived from the URL, never trusted from the client. This is sound against using **another user's** file. It does **not** enforce single use: the same own URL can be attached to several messages, and deleting one message destroys the file for the others. It also needs a configured Cloudinary cloud name. The registry above closes both gaps; until Chat 03 wires it, nothing else in the system depends on `uploads`, and the model is not written to by any code.

---

## 4. Relationships

```
User 1─* RefreshToken
User *─* User            (Friendship, normalized pair)
User *─* Conversation    (Conversation.members[].user)
Conversation 1─* Message
Message *─1 Message      (replyTo)
Message 1─0..1 Poll      (pollId <-> Poll.messageId)
User 1─0..1 Activity
User 1─* FocusRoom       (host);  User *─* FocusRoom (participants / invited)
FocusRoom 1─* RoomMessage
Conversation|FocusRoom 1─0..1 CanvasSession 1─* CanvasStroke
```

## 5. Authorization Queries (service layer, used by HTTP and WS identically)

| Check | Query |
|---|---|
| Is member of conversation | `Conversation.exists({ _id, 'members': { $elemMatch: { user, leftAt: null } } })` |
| Are friends | `Friendship.exists({ userA, userB, status: 'accepted' })` using `pairKey` |
| Blocked | `Friendship.exists({ userA, userB, status: 'blocked' })`; DMs cannot be created and activity is hidden |
| Can see activity | owner, or visibility `everyone`, or `friends` and accepted friendship |
| Can join room | host, or in `invited` (invite-only in v1; see 3.7) |
| Can vote | member of poll's conversation, poll not closed |

Membership results may be cached per socket (invalidated on `CONVERSATION_UPDATED`), never trusted from client input.

## 6. Retention & Cleanup

| Data | Rule |
|---|---|
| Refresh tokens | TTL on `expiresAt` |
| Room messages | 30 days after creation |
| Canvas strokes | 14 days |
| Activities | TTL on optional `expiresAt` + sweeper job |
| Upload registry rows | Unused: 24 h via `expiresAt` TTL (file in storage needs the sweeper, see 3.11). Used: kept |
| Orphaned uploads | Weekly job compares storage ids to `messages.attachments.publicId` (Chat 08, later) |

## 7. Connection & Operational Settings (`config/db.js`)
`mongoose.set('strictQuery', true)`, `autoIndex: true` in dev, **false in production** (indexes synced by `npm run db:sync-indexes` during deploy), `maxPoolSize: 20`, `serverSelectionTimeoutMS: 8000`, retry-writes on. Connection string only from `MONGODB_URI`. Graceful `mongoose.disconnect()` on SIGTERM.

## 8. Migration from the Existing App
Unknown until the audit (Phase 0). If the current app stores chat data in memory or a different shape, no data migration is assumed; if it already uses MongoDB, Chat 05 writes a one-off script mapping old collections into Section 3 and proposes it to Chat 00 before running.

## 9. Test Plan (Chat 07 + Chat 05)
- Unique constraints: duplicate username/email, duplicate DM for one pair (race with two concurrent creates), duplicate `clientId`.
- Concurrency: 20 simultaneous votes by the same user → exactly one vote; double join → one active participant; two concurrent reads/unread increments are consistent.
- Pagination: 10k messages, no duplicates or gaps across pages; `explain()` shows index use on every list query.
- TTL and cleanup behaviour; refresh-token family revocation.

---

## 10. Chat 05 Review of the Chat 03 Models (2026-11-26, v1.1)
Method: every model file read against sections 3.1-3.10, and every service write that touches them (`message`, `conversation`, `poll`, `focus`, `friend`, `activity` services) read for atomicity. **No MongoDB binary could be obtained in this environment, so none of the database-level checks in the new `tests/http/dbReview.test.js` have been run yet** (see Implementation Report).

**Result: the 9 non-Canvas models match v1.0 field for field, enum for enum and index for index.** Only additions: `User` lowercase hook and `toJSON` transform (both intended by the schema). No change made to them.

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | Doc 3.4 `lastMessage` shows the form that breaks in Mongoose (key named `type`) | bug in doc | **Fixed in v1.1** |
| 2 | Canvas: no `strokeId` although `CANVAS_UPDATE` carries one; `seq` index not unique; stroke could be persisted into a canvas cleared in the meantime; odd or out-of-range `points` accepted; no per-session cap | blocks Phase 6 | **Fixed in v1.1** (3.10 and service contract) |
| 3 | Poll vote, room join/leave, reactions, unread counters, DM creation, `clientId` dedupe are atomic in the services (single-document conditional updates plus unique indexes) | verified by reading | Tests written, not yet run |
| 4 | `FocusRoom` index `{ hostId, createdAt }` does not cover the "open rooms hosted" count (`hostId` + `status`). Index is selective enough at 3 rooms per host; changing it is optional | low | **Proposal** (replace by `{ hostId: 1, status: 1, createdAt: -1 }`), not applied |
| 5 | Room participant cap (20) is checked then written, so a race can overshoot by a few; the doc says "bounded". The document stays small, so this is safe | low | Accepted; documented in `limits.js` already |
| 6 | Poll `votes` and Conversation `members` caps are enforced by conversation size (50) and a validator, not by a poll-level validator | none | Accepted |
| 7 | `Friendship` does not enforce `userA < userB` in the model (only `pairKey` does). A caller that skips `pairKey` could create two documents for one pair | low | **Proposal**: pre-validate hook that throws if `userA >= userB`. Not applied (cannot run the 333 existing tests here) |
| 8 | Unread uses a stored counter, not a computed one (the MASTER_PLAN left this to Chat 05). Counter is cheap and atomic; drift is only possible if an increment is skipped, and `read` resets it to 0 | decision | **Confirmed: stored counter** |
| 9 | `CanvasSession` documents are never cleaned | low | Deferred (Chat 08 sweeper) |

Rule applied: nothing consumed by running code was changed, because it cannot be re-tested here. Items 4 and 7 are ready to apply by the next chat that can run the suite.

---

## IMPLEMENTATION REPORT
### Chat 05, 2026-11-26 (review + Canvas finalization)
1. Task: review the 11 provisional models, close the DATABASE_SCHEMA test plan, finalize Canvas
2. Role: Chat 05 Database Architect
3. Files inspected: all 11 models, `models/README.md`, `limits.js`, `ids.js`, poll/focus/message/conversation/friend/activity services (writes only), `tests/http/models.test.js`, `ws/handlers/README.md` and WEBSOCKET_PROTOCOL canvas items
4. Files created: `backend/tests/http/dbReview.test.js`
5. Files modified: `docs/DATABASE_SCHEMA.md` (v1.1), `backend/src/models/CanvasSession.js`, `backend/src/models/CanvasStroke.js`, `backend/tests/http/models.test.js` (canvas assertions), `backend/src/models/README.md`, `docs/IMPLEMENTATION_STATUS.md`
6. Features implemented: Canvas persistence model (no service or handler yet)
7. API changes: none
8. WebSocket event changes: none. Service contract for `CANVAS_*` is in 3.10 (answers item 27's "stroke format")
9. Database changes: `CanvasSession.epoch`; `CanvasStroke.strokeId`; unique `{sessionId, seq}`; unique `{sessionId, strokeId}`; stricter `points`. Needs `db:sync-indexes` on any database that already has the old non-unique `{sessionId, seq}` index (none expected: canvas was never written)
10. Dependencies added: none (installed existing deps with `npm ci --ignore-scripts` for linting)
11. Tests executed: ESLint on the new and changed files (clean); `node --check`; a no-database script that ran the Canvas stroke validator on 10 inputs (1 accepted, 9 rejected as intended)
12. Test results: lint clean; validator check as expected. **NOT RUN: `dbReview.test.js` (about 20 tests: concurrency, 10k pagination, explain(), TTL, canvas) and the updated `models.test.js`, and the existing 333-test suite.** No `mongod` is installed and the download host is blocked in this environment. Nothing was mocked to get around that
13. Known issues: see section 10 items 4, 5, 7, 9. Written tests may need small adjustments on first run (for example explain() plan shapes differ between MongoDB versions)
14. Pending work: run `npm test` on a machine with MongoDB (`MONGOD_BIN` or `MONGODB_TEST_URI`); apply proposals 4 and 7 if wanted; Chat 00 to approve v1.1; Chat 06/03 to build the canvas service from 3.10
15. Integration requirements: Chat 04 registers `CANVAS_*` handlers per the 3.10 contract (buffer in memory, persist on `end`, epoch guard, replay by `seq`); Chat 03/06 to write `canvas.service.js` with those exact update filters

### Chat 05, 2026-11-15 (initial design, v1.0)
1. Task: Design MongoDB architecture for Pulse. 2. Role: Chat 05 Database Architect. 3. Files inspected: `MASTER_PLAN.md`, `DESIGN_SYSTEM.md`, master prompt (no codebase available). 4. Files created: `docs/DATABASE_SCHEMA.md`. 5. Files modified: none. 6. Implemented: schema design only. 7. API changes: none. 8. WebSocket changes: none (Chat 04 uses `clientId` for idempotent `CHAT_MESSAGE`). 9. Database changes: 11 collections with indexes. 10. Dependencies: none. 11-12. Tests: none. 13. Known issues: existing data shape unknown; room-access policy and 24 h edit window need owner OK. 14. Pending: implement models (done provisionally by Chat 03). 15. Integration: `pairKey` in `utils/ids.js`, auth queries from section 5, unread/read semantics from 3.4.


---

## 11. Chat 00 Approval and Required Amendments (2026-11-26)
**Approved: v1.1** (Section 3.4 fix, Section 3.10 Canvas, Section 10 review). The 9 non-Canvas models are unchanged and stay as built. Review was by reading the diff and `CanvasStroke.js`; the DB tests were run by the owner (all pass), nothing else was executed by Chat 00.

**Amendments for v1.2 (Chat 05 to apply and re-run the suite before anyone builds `canvas.service.js`):**
1. **Canvas stroke epoch (defect found in review).** The persist and clear steps in 3.10 can race: a stroke allocates a slot (epoch *e*, `seq` *k*), the canvas is cleared (epoch *e+1*, `seq` reset to 0, `deleteMany`), then the stroke is created. That stale stroke survives the clear, appears in the next replay, and later collides with the unique `{sessionId, seq}` index when new strokes reach `seq` *k*, which drops a legitimate stroke. Fix: add `epoch: Number (required)` to `CanvasStroke`; unique indexes become `{sessionId, epoch, seq}` and keep `{sessionId, strokeId}`; replay is `find({ sessionId, epoch: session.epoch })`; clear deletes `{ sessionId, epoch: { $lt: newEpoch } }`. No code uses Canvas yet, so this is cheap now. Add a test that runs the clear between allocate and create.
2. **Proposal 4 (FocusRoom index): approved.** Replace `{ hostId: 1, createdAt: -1 }` with `{ hostId: 1, status: 1, createdAt: -1 }` (matches the "open rooms hosted" count). Deploy note: run `db:sync-indexes`.
3. **Proposal 7 (Friendship hook): approved.** Pre-validate hook throws if `userA >= userB` using the same comparison as `pairKey`. Run the full suite; fix any test that bypassed `pairKey`.
4. **Uploads registry (from `CONTRACT_DECISIONS.md` A5) is still missing from this schema.** Chat 05 and Chat 03 must say whether the attachment ownership check was implemented another way, and then document it here either way.
5. **Room access policy:** Chat 03 built focus rooms **invite-only** (host and invited), stricter than 3.7 and Section 5 ("or friends of host"). Chat 00 accepts invite-only as the v1 default pending owner answer to `PROJECT_OVERVIEW.md` Q8. Update 3.7 and Section 5 to say so.

---

## 12. Chat 05 Report on Section 11 (2026-11-26, v1.2)
**Done (all in `backend/`; schema doc is this file):**
1. Canvas epoch: `CanvasStroke.epoch`, unique `{sessionId, epoch, seq}`, replay and clear rewritten in 3.10. New test "RACE" runs allocate, clear, create, then new strokes, then replay, then the next clear.
2. FocusRoom index replaced by `{ hostId: 1, status: 1, createdAt: -1 }`. **Deploy: run `npm run db:sync-indexes`** (the old index is dropped by `syncIndexes`; production has `autoIndex` off).
3. Friendship hook: `pre('validate')` throws unless `userA < userB`, using `pairKey()` itself, so the comparison cannot diverge. All existing tests and services already go through `pairKey`; none bypassed it.
4. Uploads: answered (3.11). Ownership today is proven by the storage path, not a registry; single use is not enforced. Added the `Upload` model per A5 (not used by any service yet). Chat 03 wires it.
5. Room access: 3.7 and Section 5 now say invite-only.
6. Confirmed: `RoomMessage.kind` enum is `text|join|leave|start|complete` and system lines have `senderId: null` (A3); `Activity.label` `maxlength: 60` and the seven activity types match A2.

**Verified:** ESLint clean; a no-database script ran the validators (Friendship normalized/reversed/self, stroke with and without epoch, Upload defaults and enum) and printed the final index lists, all as intended. **NOT RUN here: the full backend suite and the new tests** (no MongoDB in this environment). Owner must run `npm test` in `backend/` and report.

**Risks to watch on that first run:** (a) the existing `models.test.js` index assertions were updated for the new FocusRoom and Canvas indexes; (b) the `explain()` assertion for the hosted-rooms count checks the index name `hostId_1_status_1_createdAt_-1` and may need adjusting if the planner picks another plan on a small collection; (c) on a database that already has the old `{ hostId, createdAt }` or `{ sessionId, seq }` indexes, `syncIndexes()` replaces them.

**Open for others:** Chat 03: wire the `Upload` registry (write on upload, claim on send) or decide to keep path-proof only; decide on the orphan sweeper. Chat 00: confirm the `expiresAt` deviation from A5.
