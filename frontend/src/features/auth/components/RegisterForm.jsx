import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../useAuth.js';
import { useAuthForm } from '../hooks/useAuthForm.js';
import { validateRegister } from '../validation.js';
import { Input } from '../../../components/ui/Input.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { PasswordInput } from './PasswordInput.jsx';
import { ErrorSummary } from './ErrorSummary.jsx';
import { safeRedirect } from '../../../utils/safeRedirect.js';

export function RegisterForm() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState({ displayName: '', username: '', email: '', password: '' });
  const summaryRef = useRef(null);
  const { fieldErrors, summary, loading, onSubmit } = useAuthForm({
    validate: validateRegister,
    submit: async (v) => {
      await register({
        displayName: v.displayName.trim(),
        username: v.username.trim().toLowerCase(),
        email: v.email.trim(),
        password: v.password,
      });
      navigate(safeRedirect(location.state?.from), { replace: true });
    },
  });
  useEffect(() => { if (summary) summaryRef.current?.focus(); }, [summary]);
  const set = (k) => (e) => setValues((s) => ({ ...s, [k]: e.target.value }));

  return (
    <form onSubmit={(e) => onSubmit(values, e)} noValidate className="flex flex-col gap-4">
      <ErrorSummary ref={summaryRef} message={summary} />
      <Input label="Name" name="displayName" autoComplete="name" value={values.displayName} onChange={set('displayName')} error={fieldErrors.displayName} />
      <Input label="Username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false}
        helper="3 to 24 letters, numbers or underscores." value={values.username} onChange={set('username')} error={fieldErrors.username} />
      <Input label="Email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
        value={values.email} onChange={set('email')} error={fieldErrors.email} />
      <PasswordInput label="Password" name="password" autoComplete="new-password" helper="8 to 72 characters."
        value={values.password} onChange={set('password')} error={fieldErrors.password} />
      <Button type="submit" loading={loading} className="w-full h-10">Create account</Button>
      <p className="text-sm text-ink-muted">
        Already have an account? <Link to="/login" state={location.state} className="font-medium text-accent-text underline-offset-2 hover:underline">Sign in</Link>
      </p>
    </form>
  );
}
