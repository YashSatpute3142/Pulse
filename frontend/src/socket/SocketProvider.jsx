import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SocketContext } from './socketContext.js';
import { createSocketClient } from './socketClient.js';
import { eventBus } from './eventBus.js';
import { registerSocketHandlers, recoverAfterReconnect } from './handlers/index.js';
import { authApi } from '../api/endpoints/auth.js';
import { tokenStore } from '../api/tokenStore.js';
import { sessionEvents } from '../api/sessionEvents.js';
import { getWsUrl } from '../constants/config.js';
import { WS_CLOSE } from '../constants/eventTypes.js';
import { useAuth } from '../features/auth/useAuth.js';

/** One socket per authenticated session. Status: idle | connecting | open | reconnecting | closed. */
export function SocketProvider({ children }) {
  const { status: authStatus } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('idle');
  const clientRef = useRef(null);
  const authenticated = authStatus === 'authenticated';

  useEffect(() => {
    const offs = registerSocketHandlers(eventBus);
    return () => offs.forEach((off) => off());
  }, []);

  useEffect(() => {
    if (!authenticated) return undefined;
    const client = createSocketClient({
      getTicket: authApi.wsTicket,
      getUrl: getWsUrl,
      bus: eventBus,
      onStatus: setStatus,
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

  const value = useMemo(() => ({
    status,
    send: (type, payload, opts) => (clientRef.current ? clientRef.current.send(type, payload, opts) : Promise.reject(Object.assign(new Error('Not connected'), { code: 'NOT_CONNECTED' }))),
    subscribe: eventBus.subscribe,
    getServerOffset: () => clientRef.current?.getServerOffset() ?? 0,
  }), [status]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}
