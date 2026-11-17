import { Home as HomeIcon } from 'lucide-react';
import { PageHeader } from '../layouts/PageHeader.jsx';
import { EmptyState } from '../components/common/EmptyState.jsx';
import { useAuth } from '../features/auth/useAuth.js';

function greeting(d) {
  const h = d.getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Home() {
  const { user } = useAuth();
  const now = new Date();
  const first = (user?.displayName || '').split(' ')[0];
  const date = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <>
      <PageHeader title={first ? `${greeting(now)}, ${first}` : greeting(now)} subtitle={date} showProfile showActivityToggle documentTitle="Home" />
      <EmptyState icon={HomeIcon} title="Your home is coming together"
        description="Recent conversations, friends who are live and focus rooms show up here once messaging, presence and focus rooms are connected (Phases 3 to 5)." className="md:px-8" />
    </>
  );
}
