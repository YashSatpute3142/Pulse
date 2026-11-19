import { FileText } from 'lucide-react';
import { formatSize } from '../../../utils/size.js';

const safeUrl = (u) => { try { const x = new URL(u, window.location.origin); return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : null; } catch { return null; } };

/** Images inline (max 320 wide, opens in a new tab); other files as a download card. Only http(s) URLs are ever linked. */
export function Attachments({ items }) {
  if (!items?.length) return null;
  return (
    <ul className="mt-1 flex flex-col gap-2">
      {items.map((a, i) => {
        const href = safeUrl(a.url);
        if (!href) return <li key={i} className="text-sm italic text-ink-muted">Attachment unavailable</li>;
        return (
          <li key={`${a.url}-${i}`}>
            {a.kind === 'image' ? (
              <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`Open image ${a.name}`} className="inline-block">
                <img src={href} alt={a.name || 'Image attachment'} width={a.width} height={a.height} loading="lazy" className="max-h-80 max-w-full rounded-md border border-line object-contain" style={{ maxWidth: 'min(100%, 320px)' }} />
              </a>
            ) : (
              <a href={href} target="_blank" rel="noopener noreferrer" download={a.name} className="flex max-w-[320px] items-center gap-3 rounded-md border border-line bg-s3 p-2.5 [@media(hover:hover)]:hover:border-line-strong">
                <span className="grid size-9 shrink-0 place-items-center rounded-sm bg-s2 text-ink-muted"><FileText size={18} strokeWidth={1.5} aria-hidden="true" /></span>
                <span className="min-w-0"><span className="block truncate text-sm font-medium text-ink">{a.name}</span><span className="block font-mono text-xs text-ink-muted">{formatSize(a.size)}</span></span>
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
