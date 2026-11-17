// status: 'booting' (refresh in flight) | 'authenticated' | 'unauthenticated' | 'error' (server unreachable at boot)
export const initialAuthState = { status: 'booting', user: null, error: null, endedReason: null };

export function authReducer(state, action) {
  switch (action.type) {
    case 'authenticated':
      return { status: 'authenticated', user: action.user, error: null, endedReason: null };
    case 'user-updated':
      return state.status === 'authenticated' ? { ...state, user: action.user } : state;
    case 'unauthenticated':
      return { status: 'unauthenticated', user: null, error: null, endedReason: action.reason || null };
    case 'boot-error':
      return { status: 'error', user: null, error: action.error, endedReason: null };
    case 'booting':
      return { ...initialAuthState };
    default:
      return state;
  }
}
