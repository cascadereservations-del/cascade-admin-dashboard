import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createHashRouter, createMemoryRouter } from 'react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Lane D: embed mode hides the dashboard's own header, sidebar and tab bar; routes still link to each other; a deep link opens
// its route; without a shell session the folded sign-in state shows (no second sign-in form).

const state = vi.hoisted(() => ({ signedOut: false }));
vi.mock('@/lib/demo', () => ({ DEMO: true, demoOffline: () => { throw new Error('offline'); } }));
vi.mock('@/lib/supabase', async () => {
  const { createDemoClient } = await import('@/lib/demo-client');
  const client = createDemoClient(new Date('2026-10-13T02:00:00Z'));
  const getSession = client.auth.getSession.bind(client.auth);
  client.auth.getSession = (async () => (state.signedOut ? { data: { session: null }, error: null } : getSession())) as typeof client.auth.getSession;
  return { supabase: client };
});

import { routeObjects } from '@/routes';
import { SessionProvider } from '@/auth/session';
import { ThemeProvider } from '@/hooks/use-theme';
import { TooltipProvider } from '@/components/ui/tooltip';

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-13T02:00:00Z') });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
});
afterAll(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
beforeEach(() => { state.signedOut = false; });
afterEach(() => { cleanup(); window.history.replaceState({}, '', '/'); });

function mount(router: ReturnType<typeof createMemoryRouter>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><ThemeProvider><SessionProvider><TooltipProvider><RouterProvider router={router} /></TooltipProvider></SessionProvider></ThemeProvider></QueryClientProvider>);
}
const at = (path: string) => mount(createMemoryRouter(routeObjects, { initialEntries: [path] }));

describe('D_embed mode chrome', { timeout: 90_000 }, () => {
  it('hides the header, sidebar and search box when the URL has embed=1', async () => {
    window.history.replaceState({}, '', '/?embed=1');
    at('/bookings/calendar');
    await screen.findByRole('heading', { level: 1, name: 'Booking calendar' }, { timeout: 60_000 });
    expect(screen.queryByRole('banner')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Toggle navigation' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Search or jump to/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Account menu' })).toBeNull();
    expect(document.querySelector('[data-sidebar], [data-slot="sidebar"]')).toBeNull();
    expect(document.querySelector('[data-embed]')).not.toBeNull();
  });

  it('keeps its own header and sidebar when it is neither framed nor embed=1', async () => {
    window.history.replaceState({}, '', '/');
    at('/bookings/calendar');
    await screen.findByRole('heading', { level: 1, name: 'Booking calendar' }, { timeout: 60_000 });
    expect(screen.getByRole('button', { name: 'Toggle navigation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Search or jump to/ })).toBeInTheDocument();
    expect(document.querySelector('[data-embed]')).toBeNull();
  });

  it('still moves between routes: the section row links siblings and marks the current one', async () => {
    window.history.replaceState({}, '', '/?embed=1');
    at('/bookings/calendar');
    const nav = await screen.findByRole('navigation', { name: 'Bookings sections' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['List', 'Calendar', 'Inquiries']);
    expect(links.filter((l) => l.getAttribute('aria-current') === 'page').map((l) => l.textContent)).toEqual(['Calendar']);
    links[2]!.click();
    await screen.findByRole('heading', { level: 1, name: /Inquiries/ }, { timeout: 60_000 });
  });

  it('a deep link #/<route> opens that route directly', async () => {
    window.history.replaceState({}, '', '/?embed=1#/guests/conversations');
    mount(createHashRouter(routeObjects) as unknown as ReturnType<typeof createMemoryRouter>);
    await screen.findByRole('heading', { level: 1, name: 'Conversations' }, { timeout: 60_000 });
    expect(screen.queryByRole('banner')).toBeNull();
  });

  it('without a shell session it shows the Cascade Staff sign-in state, never its own form', async () => {
    state.signedOut = true;
    window.history.replaceState({}, '', '/?embed=1');
    at('/today');
    await screen.findByText('Sign in from Cascade Staff', undefined, { timeout: 60_000 });
    expect(screen.getByRole('button', { name: 'Open Cascade Staff' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByLabelText('4-digit PIN')).toBeNull());
    expect(screen.queryByRole('form')).toBeNull();
  });
});
