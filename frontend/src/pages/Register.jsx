import { RegisterForm } from '../features/auth/components/RegisterForm.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { usePageFocus } from '../hooks/usePageFocus.js';

export default function Register() {
  useDocumentTitle('Create account');
  const h1 = usePageFocus();
  return (
    <div className="flex flex-col gap-6">
      <h1 ref={h1} tabIndex={-1} className="font-display text-2xl font-semibold text-ink outline-none">Create account</h1>
      <RegisterForm />
    </div>
  );
}
