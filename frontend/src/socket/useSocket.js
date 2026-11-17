import { useContext } from 'react';
import { SocketContext } from './socketContext.js';

/** { status, send(type, payload), subscribe(type, handler), getServerOffset() } */
export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used inside <SocketProvider>');
  return ctx;
}
