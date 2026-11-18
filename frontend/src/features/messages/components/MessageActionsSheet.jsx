import { Copy, Pencil, Reply, Trash2 } from 'lucide-react';
import { BottomSheet } from '../../../components/ui/BottomSheet.jsx';
import { QUICK_REACTIONS } from '../constants.js';
import { cx } from '../../../utils/cx.js';

const rowCls = 'flex h-[52px] w-full items-center gap-3 border-t border-line px-4 text-left text-[15px] text-ink active:bg-s3';

/** Mobile message actions: six quick reactions (44px), Reply, Copy text, Edit, Delete (danger icon, normal label). Rows 52px. */
export function MessageActionsSheet({ open, onClose, message, meId, can, onReact, onReply, onCopy, onEdit, onDelete }) {
  if (!message) return null;
  const mine = (emoji) => message.reactions.find((r) => r.emoji === emoji)?.userIds.includes(meId);
  const act = (fn) => () => { onClose(); fn(); };
  return (
    <BottomSheet open={open} onClose={onClose} title="Message actions">
      <div className="flex justify-between gap-2 px-4 pb-3">
        {QUICK_REACTIONS.map((e) => (
          <button
            key={e} type="button" aria-pressed={!!mine(e)} aria-label={`React ${e}`} onClick={act(() => onReact(e))}
            className={cx('grid size-11 place-items-center rounded-md border text-xl', mine(e) ? 'border-accent bg-accent-soft' : 'border-line bg-s2')}
          >{e}</button>
        ))}
      </div>
      {can.reply && <button type="button" className={rowCls} onClick={act(onReply)}><Reply size={20} strokeWidth={1.5} aria-hidden="true" className="text-ink-muted" />Reply</button>}
      {can.copy && <button type="button" className={rowCls} onClick={act(onCopy)}><Copy size={20} strokeWidth={1.5} aria-hidden="true" className="text-ink-muted" />Copy text</button>}
      {can.edit && <button type="button" className={rowCls} onClick={act(onEdit)}><Pencil size={20} strokeWidth={1.5} aria-hidden="true" className="text-ink-muted" />Edit message</button>}
      {can.remove && <button type="button" className={rowCls} onClick={act(onDelete)}><Trash2 size={20} strokeWidth={1.5} aria-hidden="true" className="text-danger" />Delete message</button>}
    </BottomSheet>
  );
}
