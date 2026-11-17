// subscribe(type, handler) -> unsubscribe. '*' receives everything. Socket events never go into React state:
// handlers in socket/handlers write to the TanStack Query cache (ARCHITECTURE 6).
export function createEventBus() {
  const map = new Map();
  return {
    subscribe(type, handler) {
      if (!map.has(type)) map.set(type, new Set());
      map.get(type).add(handler);
      return () => map.get(type)?.delete(handler);
    },
    emit(type, payload, envelope) {
      map.get(type)?.forEach((h) => h(payload, envelope));
      map.get('*')?.forEach((h) => h(payload, envelope));
    },
  };
}
export const eventBus = createEventBus();
