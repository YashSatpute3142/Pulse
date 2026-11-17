import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { ThemeContext } from './themeContext.js';
import { THEME_STORAGE_KEY } from '../../constants/config.js';
import { safeStorage } from '../../utils/storage.js';

const CHOICES = ['system', 'dark', 'light'];
const mq = () => window.matchMedia('(prefers-color-scheme: light)');

function readChoice() {
  const v = safeStorage.get(THEME_STORAGE_KEY);
  return CHOICES.includes(v) ? v : 'system';
}
function resolve(choice) {
  if (choice === 'dark' || choice === 'light') return choice;
  return mq().matches ? 'light' : 'dark';
}

function reducer(state, action) {
  switch (action.type) {
    case 'choice': return { ...state, choice: action.choice, resolved: resolve(action.choice) };
    case 'system-changed': return state.choice === 'system' ? { ...state, resolved: resolve('system') } : state;
    default: return state;
  }
}

/**
 * Theme choice: system | dark | light. Persisted in localStorage('pulse-theme').
 * index.html sets data-theme before first paint; this provider keeps it in sync after that.
 * "system" follows the OS live. Server value (settings.theme) is applied by <ThemeSync/>.
 */
export function ThemeProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const choice = readChoice();
    return { choice, resolved: resolve(choice) };
  });

  useEffect(() => {
    document.documentElement.dataset.theme = state.resolved;
  }, [state.resolved]);

  useEffect(() => {
    const m = mq();
    const onChange = () => dispatch({ type: 'system-changed' });
    m.addEventListener('change', onChange);
    return () => m.removeEventListener('change', onChange);
  }, []);

  const setChoice = useCallback((choice) => {
    if (!CHOICES.includes(choice)) return;
    safeStorage.set(THEME_STORAGE_KEY, choice);
    dispatch({ type: 'choice', choice });
  }, []);

  const value = useMemo(() => ({ choice: state.choice, resolved: state.resolved, setChoice }), [state, setChoice]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
