import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../useAuth.js';
import { useAuthForm } from '../hooks/useAuthForm.js';
import { validateLogin } from '../validation.js';
import { Input } from '../../../components/ui/Input.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { PasswordInput } from './PasswordInput.jsx';
import { ErrorSummary } from './ErrorSummary.jsx';
import { safeRedirect } from '../../../utils/safeRedirect.js';

export function LoginForm() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState({ identifier: '', password: '' });
  const summaryRef = useRef(null);
  const { fieldErrors, summary, loading, onSubmit } = useAuthForm({
    validate: validateLogin,
    submit: async (v) => {
      await login({ identifier: v.identifier.trim(), password: v.password });
      navigate(safeRedirect(location.state?.from), { replace: true });
    },
  });
  useEffect(() => { if (summary) summaryRef.current?.focus(); }, [summary]);
  const set = (k) => (e) => setValues((s) => ({ ...s, [k]: e.target.value }));

  return (
    <form onSubmit={(e) => onSubmit(values, e)} noValidate className="flex flex-col gap-4">
      <ErrorSummary ref={summaryRef} message={summary} />
      <Input label="Email or username" name="identifier" autoComplete="username" autoCapitalize="none" spellCheck={false}
        value={values.identifier} onChange={set('identifier')} error={fieldErrors.identifier} />
      <PasswordInput label="Password" name="password" autoComplete="current-password"
        value={values.password} onChange={set('password')} error={fieldErrors.password} />
      <Button type="submit" loading={loading} className="w-full h-10">Sign in</Button>
      <p className="text-sm text-ink-muted">
        New to Pulse? <Link to="/register" state={location.state} className="font-medium text-accent-text underline-offset-2 hover:underline">Create an account</Link>
      </p>
    </form>
  );
}
