import { useState } from 'react';
import { Plus, Timer } from 'lucide-react';
import { PageHeader } from '../layouts/PageHeader.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { EmptyState } from '../components/common/EmptyState.jsx';
import { ErrorState } from '../components/common/ErrorState.jsx';
import { useFocusRooms } from '../features/focus/hooks/useFocus.js';
import { RoomCard } from '../features/focus/components/RoomCard.jsx';
import { NewRoomModal } from '../features/focus/components/NewRoomModal.jsx';

function Section({ id, title, scope, empty, action }) {
  const q = useFocusRooms(scope);
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="font-mono text-xs uppercase tracking-wider text-ink-faint">{title}</h2>
      {q.isPending && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>}
      {q.isError && <ErrorState title="Could not load rooms" message={q.error?.message} onRetry={() => q.refetch()} />}
      {q.isSuccess && (q.data.length === 0
        ? <EmptyState icon={Timer} title={empty.title} description={empty.description} action={action} className="!p-0" headingLevel="h3" />
        : <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{q.data.map((r) => <li key={r.id}><RoomCard room={r} /></li>)}</ul>)}
    </section>
  );
}

export default function FocusRooms() {
  const [open, setOpen] = useState(false);
  const create = <Button onClick={() => setOpen(true)}><Plus size={16} strokeWidth={1.5} aria-hidden="true" />New room</Button>;
  return (
    <>
      <PageHeader title="Focus" subtitle="Study and work together on a shared timer" actions={create} />
      <div className="flex flex-col gap-8 px-4 pb-8 pt-4 md:px-8">
        <Section id="joinable-h" title="You can join" scope="joinable" empty={{ title: 'No open rooms', description: 'Rooms friends invite you to, or open ones you can access, show up here.' }} />
        <Section id="mine-h" title="Your rooms" scope="mine" empty={{ title: 'You have no rooms yet', description: 'Create one, invite friends and start the timer together.' }} action={create} />
      </div>
      <NewRoomModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
