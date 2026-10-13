import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Lane D: every dashboard route opens in demo mode from synthetic data, in both shells (embed and full), with the sample-data strip on
// screen, and with no network call, no storage, no cookie, no beacon, no socket and no IndexedDB use. The Supabase client is the demo
// client (what `?demo` selects in the real app); the clock is frozen.

const FROZEN = new Date('2026-10-13T02:00:00Z');
vi.mock('@/lib/demo', () => ({ DEMO: true, DEMO_SAVED: 'Sample mode: nothing was saved.', DEMO_SENT: 'Sample mode: nothing was sent.', DEMO_STRIP: 'Sample data. Nothing here is real and nothing is saved.' }));
vi.mock('@/lib/supabase', async () => {
  const { createDemoClient } = await import('@/lib/demo-client');
  return { supabase: createDemoClient(new Date('2026-10-13T02:00:00Z')) };
});

import { routeObjects } from '@/routes';
import { SessionProvider } from '@/auth/session';
import { ThemeProvider } from '@/hooks/use-theme';
import { TooltipProvider } from '@/components/ui/tooltip';
import { U } from '@/lib/demo-data';

const fetchSpy = vi.fn(() => Promise.reject(new TypeError('network is off in demo')));
const getItem = vi.spyOn(Storage.prototype, 'getItem');
const setItem = vi.spyOn(Storage.prototype, 'setItem');
const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
const cookieSet = vi.spyOn(Document.prototype, 'cookie', 'set');
const xhrOpen = vi.spyOn(XMLHttpRequest.prototype, 'open');
const beacon = vi.fn();
const socket = vi.fn();
const idbOpen = vi.fn();

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: FROZEN });
  vi.stubGlobal('fetch', fetchSpy);
  vi.stubGlobal('WebSocket', socket);
  vi.stubGlobal('indexedDB', { open: idbOpen });
  Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  window.print = vi.fn();
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
});
afterAll(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
afterEach(() => cleanup());

// The real route strings, read from routes.tsx; params get a demo id.
const WITH_PARAMS: Record<string, string> = {
  'bookings/:kind/:id': `bookings/airbnb/${U(101)}`,
  'guests/:id': `guests/${U(1)}`,
  'operations/cleaning/:id': `operations/cleaning/${U(231)}`,
};
const children = routeObjects.find((r) => r.path === '/')!.children!;
const PATHS = children.map((c) => c.path).filter((p): p is string => !!p && p !== '*').map((p) => WITH_PARAMS[p] ?? p);

function open(path: string) {
  const router = createMemoryRouter(routeObjects, { initialEntries: [`/${path}`] });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><ThemeProvider><SessionProvider><TooltipProvider><RouterProvider router={router} /></TooltipProvider></SessionProvider></ThemeProvider></QueryClientProvider>,
  );
}

describe('D_demo mode', () => {
  it('lists every dashboard route (the shell lane links to these)', () => {
    expect(PATHS.length).toBe(32);
    expect(PATHS).toEqual(expect.arrayContaining(['today', 'bookings', 'bookings/calendar', 'bookings/inquiries', 'guests/conversations', 'operations/tasks', 'finance/statements', 'inventory/counts', 'pricing/advisor', 'insights', 'settings/health', 'settings/pay-rates', 'search']));
  });

  describe.each([['embed shell', '/?embed=1&demo'], ['full shell', '/?demo']])('in the %s', (_name, url) => {
    it.each(PATHS)('/%s renders from sample data with the sample-data strip and no outside call', async (path) => {
      window.history.replaceState({}, '', url);
      open(path);
      // Past the skeletons and the session check: a page title (h1) or a section heading is on screen.
      await waitFor(() => expect(document.querySelector('main h1, main h2, main [data-slot="card-title"]')).not.toBeNull(), { timeout: 60_000 });
      await waitFor(() => expect(screen.queryAllByLabelText('Loading')).toHaveLength(0), { timeout: 60_000 });
      // No error state of any kind: demo data answers every read.
      expect(screen.queryByText(/Something went wrong|No connection|^Unavailable$|Not permitted|Not available for your role|Unexpected Application Error/)).toBeNull();
      // Rows have rendered by now; a crash while drawing them would have swapped the page for the router's error screen.
      await new Promise((r) => setTimeout(r, 150));
      expect(document.querySelector('main h1, main h2, main [data-slot="card-title"]')).not.toBeNull();
      expect(screen.queryByText(/Unexpected Application Error/)).toBeNull();
      // The demo label: on every screen, both shells.
      const strip = document.querySelector('[data-demo-strip]');
      expect(strip).not.toBeNull();
      expect(strip).toHaveTextContent('Sample data. Nothing here is real and nothing is saved.');
      expect(document.querySelectorAll('[data-demo-strip]')).toHaveLength(1);
      // Nothing leaves the page and nothing is kept.
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(xhrOpen).not.toHaveBeenCalled();
      expect(beacon).not.toHaveBeenCalled();
      expect(socket).not.toHaveBeenCalled();
      expect(idbOpen).not.toHaveBeenCalled();
      expect(setItem).not.toHaveBeenCalled();
      expect(removeItem).not.toHaveBeenCalled();
      expect(cookieSet).not.toHaveBeenCalled();
      // react-router itself reads one session key for view transitions; the app reads nothing.
      expect(getItem.mock.calls.filter(([k]) => k !== 'remix-router-transitions')).toEqual([]);
    }, 90_000);
  });

  it('uses only synthetic names and the house times (check-in 2:00 pm, check-out 12:00 noon)', async () => {
    window.history.replaceState({}, '', '/?embed=1&demo');
    open('bookings');
    await screen.findByText('Demo Guest One', undefined, { timeout: 60_000 });
    expect(document.body.textContent).not.toMatch(/11:00|3:00 ?pm|15:00/);
  }, 90_000);
});
