import { api } from '../client.js';

// API_CONTRACT 4.9 / 4.x. Upload field name 'file' is an assumption (reported to Chat 00/03).
export const pollsApi = { get: (id) => api.get(`/polls/${id}`).then((r) => r.data) };
export const sparksApi = { random: (kind) => api.get(`/sparks/random?kind=${kind}`).then((r) => r.data) }; // { id, kind, text }
export const uploadsApi = {
  upload: (file) => { const formData = new FormData(); formData.append('file', file); return api.post('/uploads', undefined, { formData }).then((r) => r.data); }, // Attachment
};
