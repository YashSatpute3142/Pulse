import { useEffect } from 'react';
import { useAuth } from '../../features/auth/useAuth.js';
import { useTheme } from './useTheme.js';

// After login the server value settings.theme wins and is written back to local storage (DESIGN_SYSTEM 5).
export function ThemeSync() {
  const { user } = useAuth();
  const { setChoice } = useTheme();
  const serverTheme = user?.settings?.theme;
  useEffect(() => {
    if (serverTheme === 'system' || serverTheme === 'dark' || serverTheme === 'light') setChoice(serverTheme);
  }, [serverTheme, setChoice]);
  return null;
}
