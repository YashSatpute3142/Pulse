# ws/handlers

One file per area, each exporting an array of `{ type, schema, ack?, run(ctx, payload, env) }` (see `ws/router.js`).
`ws/index.js` lists them in `ALL_HANDLERS`.

| File | Phase | Status |
|---|---|---|
| `session.handlers.js` (PING, REGISTER) | 3 | built |
| `message.handlers.js` (CHAT_MESSAGE, MESSAGE_EDIT/DELETE/REACTION/READ) | 3 | built |
| `presence.handlers.js` (USER_STATUS, TYPING_START/STOP); state in `ws/presence.js`, `ws/typing.js` | 4 | built |
| activity, focusRoom, poll | 5 | built (activity, focus, poll) + tested |
| canvas (CANVAS_*) | 6 | **deferred, integration point below** |

## Canvas integration point (Phase 6, deferred by decision of the owner)
Nothing for `CANVAS_JOIN / LEAVE / UPDATE / CLEAR` is registered, so those events currently get `ERROR UNKNOWN_TYPE`.
To add them later: create `canvas.handlers.js` exporting the handler array, import it in `ws/index.js` and append it to
`ALL_HANDLERS`; room keys come from `roomKey.canvas(ownerType, ownerId)`; rate group `canvas` already exists in `ws/rateLimiter.js`.
Blocked on: a `canvas.service` (access check, stroke persistence on `end`, clear) from Chat 03/06 and a finalized stroke data
format (the models `CanvasSession` / `CanvasStroke` exist but nothing validates or serializes strokes yet).
