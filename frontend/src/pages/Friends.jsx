import { useState } from 'react';
import { PageHeader } from '../layouts/PageHeader.jsx';
import { Tabs } from '../components/ui/Tabs.jsx';
import { FriendsList } from '../features/friends/components/FriendsList.jsx';
import { RequestsList } from '../features/friends/components/RequestsList.jsx';
import { FindPeople } from '../features/friends/components/FindPeople.jsx';
import { useFriendRequests } from '../hooks/useFriends.js';

export default function Friends() {
  const [tab, setTab] = useState('friends');
  const requests = useFriendRequests();
  return (
    <>
      <PageHeader title="Friends" />
      <div className="max-w-[720px] md:px-8">
        <Tabs label="Friends sections" value={tab} onChange={setTab} className="px-4 md:px-0"
          items={[{ value: 'friends', label: 'Friends' }, { value: 'requests', label: 'Requests', count: requests.data?.incoming.length || 0 }, { value: 'find', label: 'Find people' }]} />
        <div role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {tab === 'friends' && <FriendsList onFindPeople={() => setTab('find')} />}
          {tab === 'requests' && <RequestsList />}
          {tab === 'find' && <FindPeople />}
        </div>
      </div>
    </>
  );
}
