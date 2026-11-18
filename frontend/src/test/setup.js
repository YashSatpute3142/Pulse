import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { clearDrafts } from '../features/messages/drafts.js';

afterEach(() => { cleanup(); clearDrafts(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

if (!window.matchMedia) {
  window.matchMedia = (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } });
}
