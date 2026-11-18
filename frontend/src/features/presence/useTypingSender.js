import { useCallback, useEffect, useRef } from 'react';
import { useSocket } from '../../socket/useSocket.js';
import { C2S } from '../../constants/eventTypes.js';

const RESEND_MS = 3000; // server stops after 5 s without TYPING_START

/** notifyInput(text) on every change, stop() on send/blur. Fire-and-forget: typing is never queued offline. */
export function useTypingSender(conversationId) {
  const { status, send } = useSocket();
  const last = useRef(0);
  const active = useRef(false);

  const stop = useCallback(() => {
    if (!active.current) return;
    active.current = false; last.current = 0;
    send(C2S.TYPING_STOP, { conversationId }).catch(() => {});
  }, [send, conversationId]);

  const notifyInput = useCallback((text) => {
    if (status !== 'open') return;
    if (!text.trim()) { stop(); return; }
    const now = Date.now();
    if (active.current && now - last.current < RESEND_MS) return;
    active.current = true; last.current = now;
    send(C2S.TYPING_START, { conversationId }).catch(() => {});
  }, [status, send, conversationId, stop]);

  useEffect(() => stop, [stop]); // leaving the conversation or unmounting
  return { notifyInput, stop };
}
