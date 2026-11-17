export function SettingRow({ label, helper, children }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-4 last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-medium text-ink">{label}</div>
        {helper && <p className="text-[13px] text-ink-muted">{helper}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
