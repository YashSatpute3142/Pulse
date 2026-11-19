import { api } from '../client.js';

// API_CONTRACT 4.8. Creating, joining and chatting go over the WebSocket (WEBSOCKET_PROTOCOL ROOM_*).
export const focusApi = {
  list: (scope) => api.get(`/focus-rooms?scope=${scope}`).then((r) => r.data), // FocusRoom[]
};
