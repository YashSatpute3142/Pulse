import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../features/auth/useAuth.js';
import { BootGate } from './BootGate.jsx';
import { safeRedirect } from '../../utils/safeRedirect.js';

export function PublicOnly() {
  const { status } = useAuth();
  const location = useLocation();
  return (
    <BootGate>
      {status === 'authenticated'
        ? <Navigate to={safeRedirect(location.state?.from)} replace />
        : <Outlet />}
    </BootGate>
  );
}
