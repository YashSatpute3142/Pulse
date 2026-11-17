import { MessageSquare } from 'lucide-react';
import { PageHeader } from '../layouts/PageHeader.jsx';
import { EmptyState } from '../components/common/EmptyState.jsx';
import { ConversationListPane } from '../features/conversations/components/ConversationListPane.jsx';
import { useIsMobile } from '../hooks/useMediaQuery.js';

/** Mobile: this route IS the full-screen list. Desktop: the list lives in the shell, this is the empty pane. */
export default function Messages() {
  const mobile = useIsMobile();
  if (mobile) {
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader title="Messages" showProfile />
        <ConversationListPane showTitle={false} />
      </div>
    );
  }
  return (
    <>
      <PageHeader title="Messages" showActivityToggle />
      <EmptyState icon={MessageSquare} title="Select a conversation" description="Pick one from the list to start chatting." className="md:px-8" />
    </>
  );
}
