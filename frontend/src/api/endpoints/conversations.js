import { api } from '../client.js';

const qs = (o) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, v); });
  const s = p.toString();
  return s ? `?${s}` : '';
};

// API_CONTRACT 4.4. List/pagination calls return the full body ({ data, meta }) for cursor handling.
export const conversationsApi = {
  list: ({ q, before, limit = 30 } = {}) => api.get(`/conversations${qs({ q, before, limit })}`),
  get: (id) => api.get(`/conversations/${id}`).then((r) => r.data),
  createDirect: (userId) => api.post('/conversations', { type: 'direct', userId }).then((r) => r.data),
  createGroup: ({ title, memberIds }) => api.post('/conversations', { type: 'group', title, memberIds }).then((r) => r.data),
  markRead: (id, messageId) => api.post(`/conversations/${id}/read`, { messageId }).then((r) => r.data),
  readState: (id) => api.get(`/conversations/${id}/read-state`).then((r) => r.data),
  messages: (id, { before, limit = 30 } = {}) => api.get(`/conversations/${id}/messages${qs({ before, limit })}`),
};
