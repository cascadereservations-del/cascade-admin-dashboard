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
import { SessionProvider } from '@/auth/session';
import { ThemeProvider } from '@/hooks/use-theme';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TYPES } from '@/features/operations/notices-page';

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

describe('D_ F17 Bookings on a phone in embed mode', { timeout: 120_000 }, () => {
  it('one Filters button, search visible, cards instead of a table, the guest card opens the booking', async () => {
    at('/bookings', PHONE);
    await screen.findByRole('heading', { level: 1, name: 'Bookings' }, T);
    expect(screen.getByRole('textbox', { name: 'Search' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Filters/ })).toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: 'Booking views' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Status' })).toBeNull(); // the selects live in the sheet
    expect(within(screen.getByRole('main')).queryByRole('link', { name: 'Calendar' })).toBeNull(); // sibling links are in the section row only
    const list = await screen.findByRole('list', { name: 'Bookings' }, T);
    expect(screen.queryByRole('table')).toBeNull();
    const first = within(list).getAllByRole('link')[0]!;
    expect(first.getAttribute('href')).toMatch(/^\/bookings\/(airbnb|direct)\//);
    expect(within(list).getAllByText(/confirmed|inquiry|completed/).length).toBeGreaterThan(0); // chip carries a word
  });

  it('the explanation is behind an (i) button', async () => {
    at('/bookings', PHONE);
    await screen.findByRole('heading', { level: 1, name: 'Bookings' }, T);
    expect(screen.queryByText(/Booking, payment and payout states are shown separately/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'About Bookings' }));
    expect(screen.getByText(/Booking, payment and payout states are shown separately/)).toBeInTheDocument();
  });

  it('the Filters button opens a sheet holding the existing filters', async () => {
    at('/bookings', PHONE);
    await screen.findByRole('list', { name: 'Bookings' }, T);
    await userEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Filters' });
    for (const n of ['View', 'Status', 'Channel', 'Balance']) expect(within(sheet).getByRole('combobox', { name: n })).toBeInTheDocument();
    expect(within(sheet).getByLabelText('From date')).toBeInTheDocument();
  });

  it('wide embed (1280) keeps the table; a phone-width page that is NOT embed keeps the table and the header', async () => {
    at('/bookings', { embed: true, width: 1280 });
    await screen.findByRole('table', undefined, T);
    expect(screen.queryByRole('button', { name: /^Filters/ })).toBeNull();
    cleanup();
    at('/bookings', { embed: false, width: 360 });
    await screen.findByRole('table', undefined, T);
    expect(screen.getByText(/Booking, payment and payout states are shown separately/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Filters/ })).toBeNull();
  });
});

describe('D_ F17 Inquiries and Transactions on a phone in embed mode', { timeout: 120_000 }, () => {
  it('Inquiries: no repeated "Open in list", 44 px decision buttons', async () => {
    at('/bookings/inquiries', PHONE);
    await screen.findByRole('heading', { level: 1, name: 'Inquiries' }, T);
    const confirm = await screen.findByRole('button', { name: 'Confirm booking' }, T);
    expect(confirm.className).toContain('min-h-11');
    expect(screen.getByRole('button', { name: 'Decline' }).className).toContain('min-h-11');
    expect(screen.queryByRole('link', { name: 'Open in list' })).toBeNull();
    expect(screen.queryByText('Requested')).toBeNull();
  });

  it('Inquiries wide: unchanged (Open in list, 40 px buttons, Requested row)', async () => {
    at('/bookings/inquiries', { embed: true, width: 1280 });
    const confirm = await screen.findByRole('button', { name: 'Confirm booking' }, T);
    expect(confirm.className).toContain('min-h-10');
    expect(screen.getByRole('link', { name: 'Open in list' })).toBeInTheDocument();
    expect(screen.getAllByText('Requested').length).toBeGreaterThan(0);
  });

  it('Transactions: Filters button, New, cards with amount and a status word; Export CSV sits in the sheet', async () => {
    at('/finance/transactions', PHONE);
    await screen.findByRole('heading', { level: 1, name: 'Transactions' }, T);
    const list = await screen.findByRole('list', { name: 'Transactions' }, T);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('button', { name: 'New transaction' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export CSV' })).toBeNull();
    expect(within(list).getAllByText(/₱|PHP/).length).toBeGreaterThan(0);
    expect(within(list).getAllByText(/confirmed|pending review|void/).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Filters' });
    expect(within(sheet).getByRole('button', { name: 'Export CSV' })).toBeInTheDocument();
    expect(within(sheet).getByRole('combobox', { name: 'Type' })).toBeInTheDocument();
    expect(within(sheet).getByRole('switch', { name: 'Show voided' })).toBeInTheDocument();
  });

  it('Transactions wide: the table, the density toggle and both header buttons stay', async () => {
    at('/finance/transactions', { embed: true, width: 1280 });
    await screen.findByRole('table', undefined, T);
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument();
    expect(screen.getByLabelText('Comfortable rows')).toBeInTheDocument();
  });
});

describe('D_ F18 Key figures', { timeout: 120_000 }, () => {
  it('embed: ONE card with a label/number list and the All KPIs link', async () => {
    const { container } = at('/today', PHONE);
    await screen.findByText('Key figures', undefined, T);
    const card = container.querySelector('.D_key-figures') as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.querySelectorAll('dt').length).toBeGreaterThanOrEqual(3);
    expect(within(card).getByRole('link', { name: 'All KPIs' }).getAttribute('href')).toBe('/insights');
    expect(container.querySelectorAll('.grid.grid-cols-2')).toHaveLength(0);
  });

  it('not embed: the tile grid is unchanged', async () => {
    const { container } = at('/today', { embed: false, width: 1280 });
    await screen.findByText('Key figures', undefined, T);
    expect(container.querySelector('.D_key-figures')).toBeNull();
    expect(container.querySelector('section[aria-label="Key figures, month to date"] .grid')).not.toBeNull();
  });
});

describe('D_ pay rates live in the shell only', { timeout: 120_000 }, () => {
  it('embed: the Settings entry leaves the frame for ../#payrates, and the route hands over instead of rendering a copy', async () => {
    at('/settings/health', PHONE);
    const nav = await screen.findByRole('navigation', { name: 'Settings sections' }, T);
    const link = within(nav).getByRole('link', { name: 'Pay rates' });
    expect(link.getAttribute('href')).toBe('../#payrates');
    expect(link.getAttribute('target')).toBe('_parent');
    cleanup();
    at('/settings/pay-rates', PHONE);
    const open = await screen.findByRole('link', { name: 'Open Pay rates' }, T);
    expect(open.getAttribute('href')).toBe('../#payrates');
    expect(screen.queryByText(/In force today/)).toBeNull();
  });

  it('not embed: the dashboard keeps its own Pay rates page', async () => {
    at('/settings/pay-rates', { embed: false, width: 1280 });
    await screen.findByRole('heading', { level: 1, name: 'Pay rates' }, T);
    expect(screen.queryByRole('link', { name: 'Open Pay rates' })).toBeNull();
  });
});

describe('D_ MF5 Search in embed mode', { timeout: 120_000 }, () => {
  it('#/search?q=Demo is filled in and lists a guest and a task; stock and cleanings are not searched', async () => {
    at('/search?q=Demo', PHONE);
    const box = await screen.findByRole('searchbox', { name: 'Search' }, T);
    expect((box as HTMLInputElement).value).toBe('Demo');
    const results = await screen.findByRole('list', { name: 'Results' }, T);
    const kinds = within(results).getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(kinds.some((t) => t.startsWith('guest'))).toBe(true);
    expect(kinds.some((t) => t.startsWith('task'))).toBe(true);
    expect(kinds.some((t) => t.startsWith('stock') || t.startsWith('cleaning'))).toBe(false);
    expect(within(results).getAllByRole('link').find((a) => a.textContent?.startsWith('task'))!.getAttribute('href')).toBe('/operations/tasks');
  });

  it('typing updates ?q= and a short term shows the hint, not the page list', async () => {
    at('/search', PHONE);
    const box = await screen.findByRole('searchbox', { name: 'Search' }, T);
    expect(screen.getByText(/Type at least two letters/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Pages' })).toBeNull();
    await userEvent.type(box, 'Guest');
    await screen.findByRole('list', { name: 'Results' }, T);
  });
});

describe('D_ Notices types', () => {
  it('equal exactly what ops_notices_notice_type_check allows', () => {
    expect([...TYPES].sort()).toEqual(['brownout', 'deep_clean', 'event', 'holiday', 'maintenance', 'note', 'reminder', 'water']);
  });
});
