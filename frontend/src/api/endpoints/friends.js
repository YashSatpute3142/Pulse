import { api } from '../client.js';

// API_CONTRACT 4.3
export const friendsApi = {
  list: () => api.get('/friends').then((r) => r.data),                       // Friend[]
  requests: () => api.get('/friends/requests').then((r) => r.data),          // { incoming, outgoing }
  sendRequest: (userId) => api.post('/friends/requests', { userId }).then((r) => r.data),
  accept: (userId) => api.post(`/friends/requests/${userId}/accept`).then((r) => r.data),
  decline: (userId) => api.post(`/friends/requests/${userId}/decline`).then((r) => r.data), // also cancels outgoing
  remove: (userId) => api.delete(`/friends/${userId}`).then((r) => r.data),
  block: (userId) => api.post(`/friends/${userId}/block`).then((r) => r.data),
};
