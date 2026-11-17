import { useIsMobile } from '../hooks/useMediaQuery.js';
import AppShell from './AppShell.jsx';
import MobileShell from './MobileShell.jsx';

/** Mobile (< 768) is a different layout, not a shrunk desktop (DESIGN_SYSTEM 6.4). */
export default function ShellSwitch() {
  return useIsMobile() ? <MobileShell /> : <AppShell />;
}
