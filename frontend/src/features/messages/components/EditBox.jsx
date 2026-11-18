import { useState } from 'react';
import { Button } from '../../../components/ui/Button.jsx';
import { MAX_TEXT } from '../constants.js';

/** Inline editor. Enter saves, Shift+Enter newline, Esc cancels. Unchanged or empty text cancels/blocks. */
export function EditBox({ initial, onSave, onCancel }) {
  const [text, setText] = useState(initial);
  const save = () => { const t = text.trim(); if (!t || t === initial.trim()) { onCancel(); return; } onSave(t); };
  return (
    <div className="flex w-full flex-col gap-2">
      <textarea
        autoFocus aria-label="Edit message" value={text} maxLength={MAX_TEXT} rows={Math.min(6, Math.max(2, text.split('\n').length))}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.stopPropagation(); onCancel(); }
          else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); save(); }
        }}
        className="w-full resize-none rounded-md border border-control bg-canvas px-3 py-2 text-ink"
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={save} disabled={!text.trim()}>Save</Button>
      </div>
    </div>
  );
}
