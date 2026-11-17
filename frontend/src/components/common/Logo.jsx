// Inline SVGs from assets/logo so ink follows --text and the heartbeat follows --accent (DESIGN_SYSTEM 12).
export function Wordmark({ width = 96, className }) {
  return (
    <svg viewBox="-14 -46 304 150" width={width} height={(width * 150) / 304} role="img" aria-label="pulse" className={className}>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="8">
        <g stroke="var(--text)">
          <path d="M6 0 V88" /><ellipse cx="32" cy="30" rx="26" ry="30" />
          <path d="M76 0 V38 C76 54 83 60 92 60" /><path d="M130 0 V60" /><path d="M150 -28 V60" />
          <path transform="translate(18 0)" d="M184 10 C180 3 173 0 166 0 C156 0 150 6 150 14 C150 23 158 27 168 30 C178 33 186 37 186 46 C186 55 178 60 168 60 C159 60 152 56 149 48" />
          <path transform="translate(18 0)" d="M203 32 H249 C249 12 239 0 226 0 C212 0 203 13 203 31 C203 49 213 60 227 60 C237 60 244 55 249 49" />
        </g>
        <g stroke="var(--accent)"><path d="M92 60 H99 L105 38 L112 70 L117 60 H130" /></g>
      </g>
    </svg>
  );
}

export function Mark({ size = 32, className, title = 'Pulse' }) {
  return (
    <svg viewBox="0 0 128 128" width={size} height={size} role="img" aria-label={title} className={className}>
      <rect width="128" height="128" rx="28" fill="var(--accent)" />
      <g transform="translate(64 64) scale(1.2) translate(-103 -34)" fill="none" stroke="var(--on-accent)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="6">
        <path d="M76 0 V38 C76 54 83 60 92 60" /><path d="M130 0 V60" /><path d="M92 60 H99 L105 38 L112 70 L117 60 H130" />
      </g>
    </svg>
  );
}
