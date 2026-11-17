// Submit-failure summary. role=alert so it is announced; focusable so we can move focus to it.
import { forwardRef } from 'react';

export const ErrorSummary = forwardRef(function ErrorSummary({ message }, ref) {
  if (!message) return null;
  return (
    <div ref={ref} role="alert" tabIndex={-1} className="rounded-md border border-danger bg-canvas px-3 py-2 text-sm text-danger outline-none lg:bg-s1">
      {message}
    </div>
  );
});
