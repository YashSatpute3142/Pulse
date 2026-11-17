import { TriangleAlert } from 'lucide-react';

/**
 * 32px strip under the header (DESIGN_SYSTEM 9). Pure view: the caller passes socket status and browser-online flag.
 * Reconnecting: away dot. Offline: danger warning icon. Renders nothing when healthy; the live region always exists.
 */
export function ConnectionBanner({ status, online }) {
  let content = null;
  if (!online) {
    content = (<><TriangleAlert size={14} strokeWidth={1.5} aria-hidden="true" className="text-danger" /><span>Offline. Messages will send when you&apos;re back</span></>);
  } else if (status === 'reconnecting' || status === 'connecting') {
    content = (<><span aria-hidden="true" className="size-2 rounded-full bg-away" /><span>Reconnecting…</span></>);
  }
  return (
    <div aria-live="polite">
      {content && <div className="flex h-8 items-center gap-2 border-b border-line bg-s2 px-4 text-[13px] text-ink">{content}</div>}
    </div>
  );
}
