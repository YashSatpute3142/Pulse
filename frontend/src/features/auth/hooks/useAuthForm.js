import { useRef, useState } from 'react';
import { ApiError } from '../../../api/ApiError.js';
import { ERROR_CODES } from '../../../constants/errorCodes.js';

/** Submit wrapper: client validation -> call -> map server errors to field errors + a summary for role=alert. */
export function useAuthForm({ validate, submit }) {
  const [fieldErrors, setFieldErrors] = useState({});
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const firstInvalid = useRef(null);

  async function onSubmit(values, e) {
    e?.preventDefault();
    if (loading) return;
    setSummary('');
    const errs = validate(values);
    setFieldErrors(errs);
    if (Object.keys(errs).length) { setSummary('Fix the highlighted fields and try again.'); return; }
    setLoading(true);
    try {
      await submit(values);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === ERROR_CODES.VALIDATION_ERROR && Object.keys(err.fieldErrors).length) {
          setFieldErrors(err.fieldErrors);
          setSummary('Fix the highlighted fields and try again.');
        } else if (err.code === ERROR_CODES.CONFLICT) {
          setSummary(err.message || 'That username or email is already taken.');
        } else if (err.code === ERROR_CODES.RATE_LIMITED) {
          setSummary(err.retryAfter ? `Too many attempts. Try again in ${err.retryAfter} seconds.` : 'Too many attempts. Try again in a minute.');
        } else if (err.isNetwork) {
          setSummary(err.message);
        } else {
          setSummary(err.message || 'Something went wrong. Try again.');
        }
      } else {
        setSummary('Something went wrong. Try again.');
      }
    } finally {
      setLoading(false);
    }
  }
  return { fieldErrors, summary, loading, onSubmit, firstInvalid };
}
