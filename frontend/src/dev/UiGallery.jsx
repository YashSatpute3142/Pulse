import { useState } from 'react';
import { Bell, Plus, Trash2, Copy } from 'lucide-react';
import { Button } from '../components/ui/Button.jsx';
import { IconButton } from '../components/ui/IconButton.jsx';
import { Input } from '../components/ui/Input.jsx';
import { Textarea } from '../components/ui/Textarea.jsx';
import { Select } from '../components/ui/Select.jsx';
import { Toggle } from '../components/ui/Toggle.jsx';
import { SegmentedControl } from '../components/ui/SegmentedControl.jsx';
import { Avatar } from '../components/ui/Avatar.jsx';
import { PresenceDot } from '../components/ui/PresenceDot.jsx';
import { CountPill } from '../components/ui/CountPill.jsx';
import { Chip } from '../components/ui/Chip.jsx';
import { Menu } from '../components/ui/Menu.jsx';
import { Modal } from '../components/ui/Modal.jsx';
import { BottomSheet } from '../components/ui/BottomSheet.jsx';
import { Drawer } from '../components/ui/Drawer.jsx';
import { Tabs } from '../components/ui/Tabs.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { Spinner } from '../components/ui/Spinner.jsx';
import { Divider } from '../components/ui/Divider.jsx';
import { Kbd } from '../components/ui/Kbd.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { EmptyState } from '../components/common/EmptyState.jsx';
import { ErrorState } from '../components/common/ErrorState.jsx';
import { ConnectionBanner } from '../components/common/ConnectionBanner.jsx';
import { SearchField } from '../components/common/SearchField.jsx';
import { UserRow } from '../components/common/UserRow.jsx';
import { Wordmark, Mark } from '../components/common/Logo.jsx';
import { useTheme } from '../app/theme/useTheme.js';
import { Inbox } from 'lucide-react';

function Section({ title, children }) {
  return (
    <section className="flex flex-col gap-3 border-t border-line pt-6">
      <h2 className="font-mono text-xs uppercase tracking-wider text-ink-faint">{title}</h2>
      <div className="flex flex-wrap items-start gap-3">{children}</div>
    </section>
  );
}

// Dev-only (/dev/ui). Every component and state, in the active theme. Toggle theme at the top.
export default function UiGallery() {
  const { choice, setChoice } = useTheme();
  const toast = useToast();
  const [seg, setSeg] = useState('everyone');
  const [on, setOn] = useState(true);
  const [tab, setTab] = useState('friends');
  const [modal, setModal] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [q, setQ] = useState('');

  return (
    <main id="main" className="mx-auto flex max-w-[1080px] flex-col gap-6 p-6 text-ink">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-[30px] font-semibold">UI gallery</h1>
        <SegmentedControl label="Theme" value={choice} onChange={setChoice} options={[{ value: 'system', label: 'System' }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} />
      </header>
      <Section title="Brand"><Wordmark width={96} /><Mark size={32} /><Mark size={48} /></Section>
      <Section title="Button">
        <Button>Primary</Button><Button variant="secondary">Secondary</Button><Button variant="ghost">Ghost</Button><Button variant="danger">Danger</Button>
        <Button size="sm">Small</Button><Button loading>Loading</Button><Button disabled>Disabled</Button>
      </Section>
      <Section title="IconButton">
        <IconButton label="Notifications"><Bell size={18} strokeWidth={1.5} aria-hidden="true" /></IconButton>
        <IconButton label="Add" disabled><Plus size={18} strokeWidth={1.5} aria-hidden="true" /></IconButton>
      </Section>
      <Section title="Fields">
        <div className="w-[320px]"><Input label="Default" placeholder="Placeholder" /></div>
        <div className="w-[320px]"><Input label="With helper" helper="Helper text" defaultValue="value" /></div>
        <div className="w-[320px]"><Input label="Error" error="Something is wrong" defaultValue="bad" /></div>
        <div className="w-[320px]"><Input label="Disabled" disabled defaultValue="locked" /></div>
        <div className="w-[320px]"><Textarea label="Textarea" placeholder="Write something" /></div>
        <div className="w-[320px]"><Select label="Select" defaultValue="1h"><option value="0">No limit</option><option value="1h">1 hour</option></Select></div>
        <div className="w-[320px]"><SearchField value={q} onChange={setQ} placeholder="Search conversations" hotkey /></div>
      </Section>
      <Section title="Toggle / Segmented">
        <Toggle label="Example" checked={on} onChange={setOn} /><Toggle label="Off" checked={false} onChange={() => {}} /><Toggle label="Disabled" checked disabled onChange={() => {}} />
        <SegmentedControl label="Visibility" value={seg} onChange={setSeg} options={[{ value: 'everyone', label: 'Everyone' }, { value: 'friends', label: 'Friends' }, { value: 'nobody', label: 'Nobody' }]} />
      </Section>
      <Section title="Avatar / presence / pill / chip">
        {[24, 28, 36, 42, 48, 96].map((s) => <Avatar key={s} name="Meera Rao" size={s} decorative={false} />)}
        <Avatar name="Zoya Khan" presence="online" decorative={false} /><Avatar name="Kabir Shah" presence="away" decorative={false} /><Avatar name="Tara Menon" presence="offline" decorative={false} />
        <PresenceDot status="online" /><CountPill count={3} /><CountPill count={120} /><Chip onRemove={() => {}} removeLabel="Remove Rohan">Rohan Verma</Chip>
      </Section>
      <Section title="Menu / Tabs / Kbd">
        <Menu label="More" trigger={({ ref, props }) => <Button ref={ref} variant="secondary" {...props}>Menu</Button>}
          items={[{ label: 'Copy', icon: <Copy size={16} strokeWidth={1.5} /> }, 'separator', { label: 'Delete', destructive: true, icon: <Trash2 size={16} strokeWidth={1.5} /> }]} />
        <div className="w-[360px]"><Tabs label="Friends" value={tab} onChange={setTab} items={[{ value: 'friends', label: 'Friends' }, { value: 'requests', label: 'Requests', count: 2 }, { value: 'find', label: 'Find people' }]} /></div>
        <Kbd>Esc</Kbd>
      </Section>
      <Section title="Layers / toasts">
        <Button variant="secondary" onClick={() => setModal(true)}>Modal (sheet on mobile)</Button>
        <Button variant="secondary" onClick={() => setSheet(true)}>Bottom sheet</Button>
        <Button variant="secondary" onClick={() => setDrawer(true)}>Drawer</Button>
        <Button variant="secondary" onClick={() => toast.show('Saved')}>Toast</Button>
        <Button variant="secondary" onClick={() => toast.error('Could not save')}>Error toast</Button>
      </Section>
      <Section title="States">
        <div className="w-[360px] rounded-lg border border-line bg-s1"><EmptyState icon={Inbox} title="No conversations yet" description="Find a friend to start one." action={<Button size="sm">Find friends</Button>} /></div>
        <div className="w-[360px] rounded-lg border border-line bg-s1"><ErrorState message="The request failed." onRetry={() => {}} /></div>
        <div className="flex w-[360px] flex-col gap-2"><Skeleton className="h-12" /><Skeleton className="h-12" /><Spinner /></div>
        <div className="w-[360px]"><ConnectionBanner status="reconnecting" online /><ConnectionBanner status="open" online={false} /></div>
      </Section>
      <Section title="UserRow"><div className="w-[360px] rounded-lg border border-line bg-s1"><UserRow user={{ displayName: 'Meera Rao', username: 'meera' }} presence="online" actions={<Button size="sm" variant="ghost">Message</Button>} /><Divider /></div></Section>

      <Modal open={modal} onClose={() => setModal(false)} title="Example modal" footer={<><Button variant="ghost" onClick={() => setModal(false)}>Cancel</Button><Button onClick={() => setModal(false)}>Confirm</Button></>}>
        <p className="text-sm text-ink-muted">Focus is trapped. Esc, scrim and the close button dismiss.</p>
      </Modal>
      <BottomSheet open={sheet} onClose={() => setSheet(false)} title="Example sheet"><p className="px-4 pb-4 text-sm text-ink-muted">Swipe down from the handle to dismiss.</p></BottomSheet>
      <Drawer open={drawer} onClose={() => setDrawer(false)} title="Live now"><p className="p-4 text-sm text-ink-muted">Drawer content.</p></Drawer>
    </main>
  );
}
