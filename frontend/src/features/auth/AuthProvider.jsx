import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AuthContext } from './authContext.js';
import { authReducer, initialAuthState } from './authReducer.js';
import { authApi } from '../../api/endpoints/auth.js';
import { refreshSession } from '../../api/refresh.js';
import { tokenStore } from '../../api/tokenStore.js';
import { sessionEvents } from '../../api/sessionEvents.js';
import { ApiError } from '../../api/ApiError.js';

/**
 * Owns "who is logged in". Boot = POST /auth/refresh (cookie). The access token never touches storage.
 * 401/TOKEN_REUSED anywhere in the HTTP layer arrives here as the 'expired' session event.
 */
export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialAuthState);
  const queryClient = useQueryClient();

  const boot = useCallback(async () => {
    dispatch({ type: 'booting' });
    try {
      const { user } = await refreshSession();
      dispatch({ type: 'authenticated', user });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        dispatch({ type: 'unauthenticated' });
      } else {
        // Network down or server error: we do not know the session is gone, so do not claim it is.
        dispatch({ type: 'boot-error', error: err });
      }
    }
  }, []);

  useEffect(() => {
    boot(); // safe under StrictMode: refreshSession() is single-flight
  }, [boot]);

  useEffect(() => {
    const offRefreshed = sessionEvents.on('refreshed', (user) => dispatch({ type: 'user-updated', user }));
    const offExpired = sessionEvents.on('expired', (reason) => {
      queryClient.clear();
      dispatch({ type: 'unauthenticated', reason });
    });
    return () => { offRefreshed(); offExpired(); };
  }, [queryClient]);

  const applySession = useCallback((data) => {
    tokenStore.set(data.accessToken);
    dispatch({ type: 'authenticated', user: data.user });
  }, []);

  const login = useCallback(async (credentials) => {
    applySession(await authApi.login(credentials));
  }, [applySession]);

  const register = useCallback(async (payload) => {
    applySession(await authApi.register(payload));
  }, [applySession]);

  const logout = useCallback(async () => {
    try { await authApi.logout(); } catch { /* server unreachable: still end the local session */ }
    tokenStore.clear();
    queryClient.clear();
    dispatch({ type: 'unauthenticated', reason: 'logout' });
  }, [queryClient]);

  const value = useMemo(
    () => ({ ...state, login, register, logout, retryBoot: boot }),
    [state, login, register, logout, boot],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
