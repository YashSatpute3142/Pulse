import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { C2S } from '../../../constants/eventTypes.js';
import { queryKeys } from '../../../api/queryKeys.js';
import { useSocket } from '../../../socket/useSocket.js';
import { useToast } from '../../../components/ui/Toast.jsx';
import { applyDeleted, patchMessage, toggleReaction } from '../cache.js';

/**
 * Edit / delete / react over the socket. Each applies optimistically and restores the old value if the server refuses.
 * The server's MESSAGE_* event then confirms (idempotent patches).
 */
export function useMessageActions(conversationId, meId) {
  const qc = useQueryClient();
  const { send } = useSocket();
  const toast = useToast();
  const key = queryKeys.conversations.messages(conversationId);

  const run = useCallback(async (type, payload, apply, restore, failText) => {
    qc.setQueryData(key, apply);
    try { await send(type, payload); } catch (err) {
      qc.setQueryData(key, restore);
      toast.error(err?.code === 'NOT_CONNECTED' ? 'You are offline. Try again when you are back.' : (err?.message && err.code ? err.message : failText));
    }
  }, [qc, key, send, toast]);

  return useMemo(() => ({
    edit: (message, text) => run(C2S.MESSAGE_EDIT, { messageId: message.id, text },
      (d) => patchMessage(d, message.id, { text, editedAt: new Date().toISOString() }),
      (d) => patchMessage(d, message.id, { text: message.text, editedAt: message.editedAt }), 'Could not edit the message.'),
    remove: (message) => run(C2S.MESSAGE_DELETE, { messageId: message.id },
      (d) => applyDeleted(d, message.id, new Date().toISOString()),
      (d) => patchMessage(d, message.id, { text: message.text, attachments: message.attachments, reactions: message.reactions, deletedAt: null }), 'Could not delete the message.'),
    react: (message, emoji) => {
      const add = !message.reactions.find((r) => r.emoji === emoji)?.userIds.includes(meId);
      return run(C2S.MESSAGE_REACTION, { messageId: message.id, emoji, action: add ? 'add' : 'remove' },
        (d) => patchMessage(d, message.id, (m) => ({ reactions: toggleReaction(m.reactions, emoji, meId, add) })),
        (d) => patchMessage(d, message.id, { reactions: message.reactions }), 'Could not update the reaction.');
    },
  }), [run, meId]);
}
