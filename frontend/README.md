# Pulse frontend (Chat 02)

React + Vite + JavaScript, Tailwind CSS v4 (tokens in `src/styles`, owned by Chat 01), react-router-dom 7, TanStack Query, native WebSocket.

```
cp .env.example .env     # VITE_API_URL, VITE_WS_URL (empty = same-origin via the Vite dev proxy)
npm install
npm run dev              # http://localhost:5173, dev-only component gallery at /dev/ui
npm run lint && npm test && npm run build
```
Dev proxy target defaults to `http://localhost:8080` (`DEV_PROXY_TARGET` overrides it).
