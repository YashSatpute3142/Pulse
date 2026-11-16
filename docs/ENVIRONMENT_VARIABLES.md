# PULSE — ENVIRONMENT VARIABLES
Owner: Chat 08 (DevOps), contributions from 03. Version 1.0.

**Rules:** only `.env.example` files are committed (placeholders, no real values). Real secrets live in local `.env` (gitignored), Render environment settings, and Vercel project settings. Frontend variables prefixed `VITE_` are public in the browser bundle: never put secrets there. The backend validates its env with `zod` in `config/env.js` and refuses to start if anything is missing or malformed.

## Backend (`backend/.env`, set in Render)
| Variable | Required | Example / default | Description |
|---|---|---|---|
| `NODE_ENV` | yes | `development` \| `production` \| `test` | |
| `PORT` | yes | `8080` | Render injects its own; use `process.env.PORT` |
| `MONGODB_URI` | yes | `mongodb+srv://USER:PASS@cluster/pulse` | Atlas connection string, secret |
| `JWT_ACCESS_SECRET` | yes | 64+ random chars | Signs access tokens, secret |
| `JWT_REFRESH_SECRET` | yes | 64+ random chars, **different** from access | Signs/hashes refresh tokens, secret |
| `ACCESS_TOKEN_TTL` | no | `15m` | |
| `REFRESH_TOKEN_TTL` | no | `7d` | |
| `WS_TICKET_TTL_SEC` | no | `30` | |
| `CLIENT_ORIGINS` | yes | `http://localhost:5173,https://pulse.vercel.app` | Comma-separated CORS and WS origin allowlist (no wildcards in production) |
| `COOKIE_SAMESITE` | no | `lax` dev, `none` prod (cross-site) | See cookie decision in `ARCHITECTURE.md` |
| `COOKIE_DOMAIN` | no | empty | Only if sharing a parent domain |
| `TRUST_PROXY` | no | `1` on Render | Express `trust proxy` for correct IPs and secure cookies |
| `CLOUDINARY_CLOUD_NAME` | yes | | |
| `CLOUDINARY_API_KEY` | yes | | secret |
| `CLOUDINARY_API_SECRET` | yes | | secret |
| `MAX_UPLOAD_MB` | no | `10` | |
| `RATE_LIMIT_AUTH_PER_MIN` | no | `10` | |
| `RATE_LIMIT_API_PER_MIN` | no | `120` | |
| `LOG_LEVEL` | no | `info` | `debug` in dev |
| `BCRYPT_COST` | no | `12` | minimum 12 in production |

Generate secrets with: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

## Frontend (`frontend/.env`, set in Vercel)
| Variable | Required | Example | Description |
|---|---|---|---|
| `VITE_API_URL` | yes | `http://localhost:8080` / `https://pulse-api.onrender.com` | Backend origin (or empty if using a Vercel rewrite for `/api`) |
| `VITE_WS_URL` | yes | `ws://localhost:8080/ws` / `wss://pulse-api.onrender.com/ws` | WebSocket endpoint; must be `wss://` in production |

## `.env.example` files
**backend/.env.example**
```
NODE_ENV=development
PORT=8080
MONGODB_URI=mongodb://127.0.0.1:27017/pulse
JWT_ACCESS_SECRET=change-me-access
JWT_REFRESH_SECRET=change-me-refresh
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=7d
WS_TICKET_TTL_SEC=30
CLIENT_ORIGINS=http://localhost:5173
COOKIE_SAMESITE=lax
TRUST_PROXY=0
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
MAX_UPLOAD_MB=10
LOG_LEVEL=debug
BCRYPT_COST=12
```
**frontend/.env.example**
```
VITE_API_URL=http://localhost:8080
VITE_WS_URL=ws://localhost:8080/ws
```

## `.gitignore` must include
```
node_modules
.env
.env.*
!.env.example
dist
coverage
```

## Environments
| | Local | Staging (optional) | Production |
|---|---|---|---|
| Frontend | Vite `:5173` | Vercel preview | Vercel production |
| Backend | `:8080` | Render service | Render service |
| Database | local MongoDB or Atlas dev cluster | Atlas staging DB | Atlas production DB (separate user, IP/network rules) |

## Checklist before deploy
- [ ] Secrets rotated away from placeholders, different per environment.
- [ ] `CLIENT_ORIGINS` lists only real frontend origins.
- [ ] `autoIndex` off in production; `npm run db:sync-indexes` run on deploy.
- [ ] `TRUST_PROXY` set on Render; cookie `Secure` and correct `SameSite`.
- [ ] `VITE_WS_URL` uses `wss://`.
- [ ] No secret appears in the frontend bundle (search build output).
