import { api } from '../client.js';

export const usersApi = {
  // Contract 4.2 (master plan's /users/me/privacy is superseded by /settings).
  updateSettings: (body) => api.patch('/users/me/settings', body).then((r) => r.data),
};
