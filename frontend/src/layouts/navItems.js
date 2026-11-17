import { Home, MessageSquare, Activity, Timer, Users } from 'lucide-react';

// Five primary destinations (DESIGN_SYSTEM 6.1 / 6.4).
export const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/messages', label: 'Messages', icon: MessageSquare, match: '/messages/*' },
  { to: '/activity', label: 'Activity', icon: Activity, match: '/activity/*' },
  { to: '/focus', label: 'Focus', icon: Timer, match: '/focus/*' },
  { to: '/friends', label: 'Friends', icon: Users, match: '/friends/*' },
];
