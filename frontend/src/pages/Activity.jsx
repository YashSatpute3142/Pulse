import { PageHeader } from '../layouts/PageHeader.jsx';
import { ActivityEditor } from '../features/activity/components/ActivityEditor.jsx';
import { ActivityList } from '../features/activity/components/ActivityList.jsx';
import { ActivityCard } from '../features/activity/components/ActivityCard.jsx';
import { useMyActivity } from '../features/activity/hooks/useActivity.js';
import { useAuth } from '../features/auth/useAuth.js';
import { useNow } from '../hooks/useNow.js';

export default function Activity() {
  const { user } = useAuth();
  const mine = useMyActivity();
  const now = useNow();
  return (
    <>
      <PageHeader title="Activity" subtitle="Share what you are up to and see who is live" />
      <div className="grid gap-8 px-4 pb-8 pt-4 md:px-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <section aria-labelledby="mine-h" className="flex flex-col gap-4">
          <h2 id="mine-h" className="font-mono text-xs uppercase tracking-wider text-ink-faint">You</h2>
          {mine && user && <ActivityCard user={user} activity={mine} now={now} />}
          <ActivityEditor key={mine ? `${mine.type}-${mine.updatedAt}` : 'none'} />
        </section>
        <section aria-labelledby="live-h">
          <h2 id="live-h" className="font-mono text-xs uppercase tracking-wider text-ink-faint">Live now</h2>
          <div className="-mx-4"><ActivityList /></div>
        </section>
      </div>
    </>
  );
}
