import { api } from '../client.js';

export const usersApi = {
  // Contract 4.2 (master plan's /users/me/privacy is superseded by /settings).
  updateSettings: (body) => api.patch('/users/me/settings', body).then((r) => r.data),
  search: (q) => api.get(`/users/search?q=${encodeURIComponent(q)}`).then((r) => r.data), // User[] (max 20)
};
