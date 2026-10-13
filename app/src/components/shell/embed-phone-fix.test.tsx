import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Lane D (session 82): the phone form of the dashboard in embed mode. F17 (Bookings, Inquiries, Transactions: one Filters button,
// the explanation behind (i), cards instead of a sideways table), F18 (Key figures as one card), the pay-rates hand-over to the
// shell, MF5 (Search is a real search and honours ?q=), and the Notices type list. Outside embed mode, or wide, nothing changes.
// Layout measurements live in the lane report (a browser run), not here.

vi.mock('@/lib/demo', () => ({ DEMO: true, DEMO_SAVED: 'Sample mode: nothing was saved.', DEMO_SENT: 'Sample mode: nothing was sent.', DEMO_STRIP: 'Sample data. Nothing here is real and nothing is saved.' }));
vi.mock('@/lib/supabase', async () => {
  const { createDemoClient } = await import('@/lib/demo-client');
  return { supabase: createDemoClient(new Date('2026-10-13T02:00:00Z')) };
});

import { routeObjects } from '@/routes';
import { D_toShellPayRates } from '@/lib/fold';
import { SessionProvider } from '@/auth/session';
import { ThemeProvider } from '@/hooks/use-theme';
import { TooltipProvider } from '@/components/ui/tooltip';

const T = { timeout: 60_000 };
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-13T02:00:00Z') });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
});
afterAll(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
afterEach(() => { cleanup(); window.history.replaceState({}, '', '/'); Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true }); });

function at(path: string, opts: { embed: boolean; width: number }) {
  window.history.replaceState({}, '', opts.embed ? '/?embed=1' : '/');
  Object.defineProperty(window, 'innerWidth', { value: opts.width, configurable: true });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><ThemeProvider><SessionProvider><TooltipProvider><RouterProvider router={createMemoryRouter(routeObjects, { initialEntries: [path] })} /></TooltipProvider></SessionProvider></ThemeProvider></QueryClientProvider>);
}
const PHONE = { embed: true, width: 360 };

describe('D_ fix round: Bookings cards and filters', { timeout: 120_000 }, () => {
  it('cards carry the channel, payment state and payout state as words', async () => {
    at('/bookings', PHONE);
    const list = await screen.findByRole('list', { name: 'Bookings' }, T);
    expect(within(list).getAllByText(/^Pay /).length).toBeGreaterThan(0);
    expect(within(list).getAllByText(/^Payout /).length).toBeGreaterThan(0);
    expect(within(list).getAllByText(/ · (airbnb|direct|calendar only|blocked)/).length).toBeGreaterThan(0);
  });
  it('Filters (n) does not count the search text; a view counts and an empty view offers Clear', async () => {
    at('/bookings?q=Demo', PHONE);
    await screen.findByRole('list', { name: 'Bookings' }, T);
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
    cleanup();
    vi.setSystemTime(new Date('2030-01-01T02:00:00Z')); // frozen clock moved: no stay arrives on or after this day
    at('/bookings?view=arrivals', PHONE);
    await screen.findByText('No bookings match these filters', undefined, T);
    expect(screen.getByRole('button', { name: 'Filters (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
    vi.setSystemTime(new Date('2026-10-13T02:00:00Z'));
  });
  it('the date fields in the sheet have visible From and To labels', async () => {
    at('/bookings', PHONE);
    await screen.findByRole('list', { name: 'Bookings' }, T);
    await userEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Filters' });
    expect(within(sheet).getByText('From')).toBeInTheDocument();
    expect(within(sheet).getByText('To')).toBeInTheDocument();
  });
});

describe('D_ fix 2: other pages share the rules', { timeout: 120_000 }, () => {
  it('Cleaning log: dates labelled in the sheet, search text not counted', async () => {
    at('/operations?q=Demo', PHONE);
    await screen.findByRole('heading', { level: 1, name: /Cleaning/ }, T);
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Filters' });
    expect(within(sheet).getByText('From')).toBeInTheDocument();
    expect(within(sheet).getByText('To')).toBeInTheDocument();
  });
  it('Account book: dates labelled in the sheet, search text not counted', async () => {
    at('/finance/book?q=Demo', PHONE);
    await screen.findByRole('heading', { level: 1 }, T);
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    expect(within(await screen.findByRole('dialog', { name: 'Filters' })).getByText('From')).toBeInTheDocument();
  });
});

describe('D_ fix round: Transactions, Inquiries, Search', { timeout: 120_000 }, () => {
  it('Transactions: select all on this page, and the card shows the stage and reference', async () => {
    at('/finance/transactions', PHONE);
    const list = await screen.findByRole('list', { name: 'Transactions' }, T);
    expect(screen.queryByRole('button', { name: 'Select all on this page' })).toBeNull();
    await userEvent.click(within(list).getAllByRole('checkbox')[0]!);
    await userEvent.click(await screen.findByRole('button', { name: 'Select all on this page' }));
    const n = within(list).getAllByRole('checkbox').length;
    expect(await screen.findByText(`${n} selected`)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Select all on this page' })).toBeNull();
    expect(within(list).getAllByText(/ · payout · HMDEMO0003$/).length).toBeGreaterThan(0);
  });
  it('Inquiries keeps the Guests count on the phone card', async () => {
    at('/bookings/inquiries', PHONE);
    await screen.findByRole('button', { name: 'Confirm booking' }, T);
    expect(screen.getAllByText('Guests').length).toBeGreaterThan(0);
  });
  it('embed Search keeps other params when typing; the desktop page ignores ?q=', async () => {
    window.history.replaceState({}, '', '/?embed=1');
    Object.defineProperty(window, 'innerWidth', { value: 360, configurable: true });
    const router = createMemoryRouter(routeObjects, { initialEntries: ['/search?embed=1&q=De'] });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><ThemeProvider><SessionProvider><TooltipProvider><RouterProvider router={router} /></TooltipProvider></SessionProvider></ThemeProvider></QueryClientProvider>);
    const box = await screen.findByRole('searchbox', { name: 'Search' }, T);
    await userEvent.type(box, 'mo');
    expect(new URLSearchParams(router.state.location.search).get('embed')).toBe('1');
    expect(new URLSearchParams(router.state.location.search).get('q')).toBe('Demo');
    cleanup();
    at('/search?q=Demo', { embed: false, width: 1280 });
    expect(((await screen.findByRole('searchbox', { name: 'Search' }, T)) as HTMLInputElement).value).toBe('');
  });
});

describe('D_ fix round: pay-rates hand-over', () => {
  it('replaces the parent location (no Back trap)', () => {
    const replace = vi.fn();
    D_toShellPayRates({ replace });
    expect(replace).toHaveBeenCalledOnce();
    expect(String(replace.mock.calls[0]![0])).toMatch(/#payrates$/);
  });
});
