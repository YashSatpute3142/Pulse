import { api } from '../client.js';

// API_CONTRACT: GET /activity/feed -> [{ user, activity, presence }]; PUT /activity/me; DELETE /activity/me (also broadcast).
export const activityApi = {
  feed: () => api.get('/activity/feed').then((r) => r.data),
  set: (body) => api.put('/activity/me', body).then((r) => r.data),
  clear: () => api.delete('/activity/me').then((r) => r.data),
};
