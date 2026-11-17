import { createContext, useContext } from 'react';

export const ShellContext = createContext({ activityDocked: false, activityCollapsed: false, toggleActivity: () => {}, openActivityDrawer: () => {} });
export const useShell = () => useContext(ShellContext);
