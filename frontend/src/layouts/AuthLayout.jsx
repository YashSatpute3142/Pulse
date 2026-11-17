import { Outlet } from 'react-router-dom';
import { Wordmark } from '../components/common/Logo.jsx';
import { SkipLink } from '../components/common/SkipLink.jsx';

/** >= 1024: form column + --s1 panel with one static heartbeat and the tagline. < 1024: single column, panel hidden. */
export default function AuthLayout() {
  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-2">
      <SkipLink />
      <main id="main" className="flex min-h-dvh flex-col justify-center px-4 py-10 pt-safe pb-safe">
        <div className="mx-auto flex w-full max-w-[360px] flex-col gap-8">
          <Wordmark width={96} className="mx-auto lg:mx-0" />
          <Outlet />
        </div>
      </main>
      <aside aria-hidden="true" className="relative hidden border-l border-line bg-s1 lg:flex lg:flex-col lg:justify-center">
        <svg className="absolute inset-x-0 top-1/2 h-32 w-full -translate-y-1/2" viewBox="0 0 1000 120" preserveAspectRatio="none">
          <path d="M0 60 H380 L420 38 L460 84 L495 60 H1000" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <p className="absolute bottom-16 left-12 right-12 font-display text-[30px] font-semibold leading-tight text-ink">Conversations that feel alive.</p>
      </aside>
    </div>
  );
}
