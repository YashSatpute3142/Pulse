import { PageHeader } from '../layouts/PageHeader.jsx';
import { AppearanceSection } from '../features/settings/components/AppearanceSection.jsx';
import { AccountSection } from '../features/settings/components/AccountSection.jsx';

// Phase 2 ships Appearance and Account. Profile and Privacy need endpoints/UI from later phases.
// Layout deviates from DESIGN_SYSTEM 9 (sub-list + detail) until there are enough sections; flagged for Chat 01.
export default function Settings() {
  return (
    <>
      <PageHeader title="Settings" />
      <div className="flex max-w-[560px] flex-col gap-8 px-4 py-6 md:px-8">
        <AppearanceSection />
        <AccountSection />
      </div>
    </>
  );
}
