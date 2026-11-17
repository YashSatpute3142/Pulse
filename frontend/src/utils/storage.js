// localStorage can throw (private mode, blocked). Never let it break the app.
export const safeStorage = {
  get(key) { try { return window.localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { window.localStorage.setItem(key, value); } catch { /* ignore */ } },
  remove(key) { try { window.localStorage.removeItem(key); } catch { /* ignore */ } },
};
