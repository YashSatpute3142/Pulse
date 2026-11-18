import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SocketContext } from './socketContext.js';
import { createSocketClient } from './socketClient.js';
import { eventBus } from './eventBus.js';
import { applySnapshot } from '../features/presence/presenceCache.js';
import { registerSocketHandlers, recoverAfterReconnect } from './handlers/index.js';
import { authApi } from '../api/endpoints/auth.js';
import { tokenStore } from '../api/tokenStore.js';
import { sessionEvents } from '../api/sessionEvents.js';
import { getWsUrl } from '../constants/config.js';
import { WS_CLOSE } from '../constants/eventTypes.js';
import { useAuth } from '../features/auth/useAuth.js';

/** One socket per authenticated session. Status: idle | connecting | open | reconnecting | closed. */
export function SocketProvider({ children }) {
  const { status: authStatus, user } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('idle');
  const clientRef = useRef(null);
  const meRef = useRef(null);
  useEffect(() => { meRef.current = user?.id ?? null; });
  const authenticated = authStatus === 'authenticated';

  useEffect(() => {
    const offs = registerSocketHandlers(eventBus, queryClient, { getMeId: () => meRef.current });
    return () => offs.forEach((off) => off());
  }, [queryClient]);

  useEffect(() => {
    if (!authenticated) return undefined;
    const client = createSocketClient({
      getTicket: authApi.wsTicket,
      getUrl: getWsUrl,
      bus: eventBus,
      onStatus: setStatus,
      onRegistered: (data) => applySnapshot(queryClient, data),
      onReady: ({ reconnect }) => { if (reconnect) recoverAfterReconnect(queryClient); },
      onFinal: (code) => {
        // 4001/4002: do not reconnect; go to login (WEBSOCKET_PROTOCOL 1).
        tokenStore.clear();
        sessionEvents.emit('expired', code === WS_CLOSE.SESSION_REVOKED ? 'revoked' : 'expired');
      },
    });
    clientRef.current = client;
    client.connect();
    return () => { client.close(); clientRef.current = null; setStatus('idle'); };
  }, [authenticated, queryClient]);

  // Stable identity: consumers (the outbox) can hold it without re-subscribing.
  const send = useCallback(
    (type, payload, opts) => (clientRef.current ? clientRef.current.send(type, payload, opts) : Promise.reject(Object.assign(new Error('Not connected'), { code: 'NOT_CONNECTED' }))),
    [],
  );
  const value = useMemo(() => ({
    status,
    send,
    subscribe: eventBus.subscribe,
    getServerOffset: () => clientRef.current?.getServerOffset() ?? 0,
  }), [status, send]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}
