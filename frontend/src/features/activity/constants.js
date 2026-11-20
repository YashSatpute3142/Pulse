import { BookOpen, Briefcase, Coffee, Gamepad2, Headphones, MessageCircle, CodeXml } from 'lucide-react';

// DESIGN_SYSTEM "Live Activity card": Studying book-open, Coding code-xml, Gaming gamepad-2, Music headphones,
// Working briefcase, Break coffee, Available message-circle. The wire ids are not enumerated in API_CONTRACT
// (lower-case of the label is assumed; reported to Chat 00/04).
export const ACTIVITY_TYPES = [
  { id: 'studying', label: 'Studying', Icon: BookOpen },
  { id: 'coding', label: 'Coding', Icon: CodeXml },
  { id: 'gaming', label: 'Gaming', Icon: Gamepad2 },
  { id: 'music', label: 'Music', Icon: Headphones },
  { id: 'working', label: 'Working', Icon: Briefcase },
  { id: 'break', label: 'Break', Icon: Coffee },
  { id: 'available', label: 'Available', Icon: MessageCircle },
];
export const activityMeta = (id) => ACTIVITY_TYPES.find((t) => t.id === id) || { id, label: id, Icon: MessageCircle };

export const VISIBILITY = [
  { value: 'everyone', label: 'Everyone', helper: 'Anyone on Pulse can see this.' },
  { value: 'friends', label: 'Friends', helper: 'Only your friends can see this.' },
  { value: 'nobody', label: 'Nobody', helper: 'Only you can see this.' },
];
export const EXPIRY = [
  { value: '', label: 'Never' }, { value: '30', label: 'In 30 minutes' }, { value: '60', label: 'In 1 hour' },
  { value: '120', label: 'In 2 hours' }, { value: '240', label: 'In 4 hours' },
];
export const MAX_LABEL = 60; // CONTRACT_DECISIONS A2 (schema maxlength 60)
