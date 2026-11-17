// Tiny emitter so the HTTP layer can tell the AuthProvider about session changes
// without importing React. Events: 'refreshed' (payload: Me), 'expired' (payload: reason).
const listeners = { refreshed: new Set(), expired: new Set() };

export const sessionEvents = {
  on(event, fn) {
    listeners[event].add(fn);
    return () => listeners[event].delete(fn);
  },
  emit(event, payload) {
    listeners[event].forEach((fn) => fn(payload));
  },
};
