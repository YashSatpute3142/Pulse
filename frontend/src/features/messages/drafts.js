// Unsent composer drafts, per conversation. Memory only (never persisted), so a reload clears them.
const drafts = new Map();
export const getDraft = (id) => drafts.get(id) || '';
export const setDraft = (id, text) => { if (text) drafts.set(id, text); else drafts.delete(id); };
export const clearDrafts = () => drafts.clear();
