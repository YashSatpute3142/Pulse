import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup, configure } from '@testing-library/react';
import { clearDrafts } from '../features/messages/drafts.js';

// Slow or busy machines (many jsdom workers at once) need more than the 1 s default to boot the app and load lazy routes.
configure({ asyncUtilTimeout: 8000 });

afterEach(() => { cleanup(); clearDrafts(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

if (!window.matchMedia) {
  window.matchMedia = (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } });
}
