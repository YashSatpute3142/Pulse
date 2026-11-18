import { Copy, MoreHorizontal, Pencil, Reply, SmilePlus, Trash2 } from 'lucide-react';
import { IconButton } from '../../../components/ui/IconButton.jsx';
import { Menu } from '../../../components/ui/Menu.jsx';
import { QUICK_REACTIONS } from '../constants.js';

/**
 * Hover toolbar (hover devices only): --s2, border-strong, radius 8, shadow-float, three 30px buttons, top-right of the message.
 * Also shown on focus-within so keyboard users reach the same actions.
 */
export function MessageToolbar({ can, onReact, onReply, onCopy, onEdit, onDelete }) {
  const more = [
    can.copy && { label: 'Copy text', icon: <Copy size={16} strokeWidth={1.5} />, onSelect: onCopy },
    can.edit && { label: 'Edit message', icon: <Pencil size={16} strokeWidth={1.5} />, onSelect: onEdit },
    can.remove && { label: 'Delete message', destructive: true, icon: <Trash2 size={16} strokeWidth={1.5} />, onSelect: onDelete },
  ].filter(Boolean);
  return (
    <div className="absolute -top-4 right-2 z-20 flex items-center rounded-md border border-line-strong bg-s2 p-0.5 opacity-0 shadow-float focus-within:opacity-100 group-hover/msg:opacity-100 [@media(hover:none)]:hidden">
      <Menu
        label="Add reaction" align="right"
        trigger={({ ref, props }) => <IconButton ref={ref} label="Add reaction" size={30} tooltip={false} {...props}><SmilePlus size={16} strokeWidth={1.5} aria-hidden="true" /></IconButton>}
        items={QUICK_REACTIONS.map((e) => ({ label: e, onSelect: () => onReact(e) }))}
      />
      {can.reply && <IconButton label="Reply" size={30} tooltip={false} onClick={onReply}><Reply size={16} strokeWidth={1.5} aria-hidden="true" /></IconButton>}
      {more.length > 0 && (
        <Menu
          label="More actions"
          trigger={({ ref, props }) => <IconButton ref={ref} label="More actions" size={30} tooltip={false} {...props}><MoreHorizontal size={16} strokeWidth={1.5} aria-hidden="true" /></IconButton>}
          items={more}
        />
      )}
    </div>
  );
}
