import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { PageHeader } from '../layouts/PageHeader.jsx';
import { EmptyState } from '../components/common/EmptyState.jsx';

export default function NotFound() {
  return (
    <>
      <PageHeader title="Page not found" />
      <EmptyState icon={Compass} title="That page doesn't exist" description="The link may be old or mistyped."
        action={<Link to="/" className="text-sm font-medium text-accent-text underline-offset-2 hover:underline">Go to Home</Link>} className="md:px-8" />
    </>
  );
}
