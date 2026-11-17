import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../features/auth/useAuth.js';
import { BootGate } from './BootGate.jsx';

export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  return (
    <BootGate>
      {status === 'authenticated'
        ? <Outlet />
        : <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />}
    </BootGate>
  );
}
