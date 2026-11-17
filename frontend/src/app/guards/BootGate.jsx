import { useAuth } from '../../features/auth/useAuth.js';
import { Splash } from '../../components/common/Splash.jsx';
import { ErrorState } from '../../components/common/ErrorState.jsx';

/** Holds children until the boot refresh resolves. Server unreachable is an error state, never a silent logout. */
export function BootGate({ children }) {
  const { status, error, retryBoot } = useAuth();
  if (status === 'booting') return <Splash />;
  if (status === 'error') {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas">
        <ErrorState title="Can't reach Pulse" message={error?.message || 'The server did not respond.'} onRetry={retryBoot} />
      </div>
    );
  }
  return children;
}
