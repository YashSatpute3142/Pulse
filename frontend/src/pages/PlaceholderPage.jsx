import { PageHeader } from '../layouts/PageHeader.jsx';
import { EmptyState } from '../components/common/EmptyState.jsx';

/** Honest stand-in for a screen that belongs to a later phase. No sample data, says what is missing. */
export function PlaceholderPage({ title, icon, phase, description, ...header }) {
  return (
    <>
      <PageHeader title={title} {...header} />
      <EmptyState icon={icon} title={`${title} is not built yet`} description={description || `This screen arrives in ${phase}.`} className="md:px-8" headingLevel="h2" />
    </>
  );
}
