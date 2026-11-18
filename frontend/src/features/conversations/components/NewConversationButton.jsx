import { useState } from 'react';
import { Plus } from 'lucide-react';
import { IconButton } from '../../../components/ui/IconButton.jsx';
import { NewConversationModal } from './NewConversationModal.jsx';

export function NewConversationButton({ tooltip = true }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton label="New conversation" tooltip={tooltip} onClick={() => setOpen(true)}><Plus size={18} strokeWidth={1.5} aria-hidden="true" /></IconButton>
      <NewConversationModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
