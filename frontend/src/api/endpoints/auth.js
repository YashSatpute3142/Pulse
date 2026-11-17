import { api } from '../client.js';

// All shapes per API_CONTRACT.md 4.1.
export const authApi = {
  register: (body) => api.post('/auth/register', body, { auth: false }).then((r) => r.data), // { user, accessToken }
  login: (body) => api.post('/auth/login', body, { auth: false }).then((r) => r.data),       // { user, accessToken }
  logout: () => api.post('/auth/logout', undefined, { auth: false }).then(() => undefined),   // cookie only, 204
  wsTicket: () => api.post('/auth/ws-ticket').then((r) => r.data),                            // { ticket, expiresInSec }
  me: () => api.get('/auth/me').then((r) => r.data),
};
