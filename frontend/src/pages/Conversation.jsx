import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MessageSquareOff } from 'lucide-react';
import { useConversation } from '../features/conversations/hooks/useConversations.js';
import { ConversationHeader } from '../features/messages/components/ConversationHeader.jsx';
import { MessageList } from '../features/messages/components/MessageList.jsx';
import { TypingLine } from '../features/presence/TypingLine.jsx';
import { Composer } from '../features/messages/components/Composer.jsx';
import { useMessaging } from '../features/messages/useMessaging.js';
import { useAuth } from '../features/auth/useAuth.js';
import { memberById, conversationTitle } from '../features/conversations/utils.js';
import { PageHeader } from '../layouts/PageHeader.jsx';
import { EmptyState } from '../components/common/EmptyState.jsx';
import { ErrorState } from '../components/common/ErrorState.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { ERROR_CODES } from '../constants/errorCodes.js';

function View({ conversation, meId }) {
  const { setActiveConversation } = useMessaging();
  const [replyTo, setReplyTo] = useState(null);
  useEffect(() => { setActiveConversation(conversation.id); return () => setActiveConversation(null); }, [conversation.id, setActiveConversation]);
  const reply = useCallback((m) => setReplyTo(m), []);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ConversationHeader conversation={conversation} meId={meId} />
      <MessageList conversation={conversation} meId={meId} onReply={reply} />
      <TypingLine conversation={conversation} meId={meId} />
      <Composer
        conversationId={conversation.id} title={conversationTitle(conversation, meId)} autoFocus
        replyTo={replyTo} replySender={replyTo ? (memberById(conversation, replyTo.senderId)?.displayName || 'Former member') : ''}
        onCancelReply={() => setReplyTo(null)}
      />
    </div>
  );
}

export default function Conversation() {
  const { conversationId } = useParams();
  const { user } = useAuth();
  const { data, isPending, isError, error, refetch } = useConversation(conversationId);

  if (isPending) {
    return (
      <div className="flex h-full flex-col" aria-busy="true">
        <PageHeader title="Conversation" documentTitle="Conversation" />
        <div className="flex flex-col gap-3 p-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-10 w-2/3" /></div>
      </div>
    );
  }
  if (isError) {
    return (
      <>
        <PageHeader title="Conversation" documentTitle="Conversation" />
        {error?.code === ERROR_CODES.NOT_FOUND || error?.code === ERROR_CODES.FORBIDDEN
          ? <EmptyState icon={MessageSquareOff} title="Conversation not found" description="It may have been removed, or you are not a member." className="md:px-8" />
          : <ErrorState title="Could not load this conversation" message={error?.message} onRetry={() => refetch()} />}
      </>
    );
  }
  return <View key={conversationId} conversation={data} meId={user.id} />;
}
