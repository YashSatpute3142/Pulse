import { LoginForm } from '../features/auth/components/LoginForm.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { usePageFocus } from '../hooks/usePageFocus.js';

export default function Login() {
  useDocumentTitle('Sign in');
  const h1 = usePageFocus();
  return (
    <div className="flex flex-col gap-6">
      <h1 ref={h1} tabIndex={-1} className="font-display text-2xl font-semibold text-ink outline-none">Sign in</h1>
      <LoginForm />
    </div>
  );
}
