import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ fetchGuests: vi.fn() }));
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), fetchGuests: api.fetchGuests }));
const role = vi.hoisted(() => ({ value: 'owner' }));
vi.mock('@/auth/session', () => ({ useSession: () => ({ propertyId: 'p1', session: null, caps: { can: () => role.value === 'owner' || role.value === 'admin' } }) }));
vi.mock('./utilities-api', () => ({ UTILITIES_KEY: (p: string) => ['guest-utilities', p], fetchStayUtilities: async () => [] }));

import GuestsPage, { GuestCard, idStatusWord } from './guests-page';
import type { GuestRow } from './api';

// Invented names only (ML-59).
const base: GuestRow = { id: 'g1', name: 'Demo Guest', phone: null, email: null, source: 'airbnb', tier: null, total_stays: 3, total_nights_stayed: 7, first_stay_date: '2026-01-02', last_stay_date: '2026-10-05', is_active: true, created_at: '', updated_at: '', id_on_file: false, has_id_photo: false };
const rows: GuestRow[] = [
  base,
  { ...base, id: 'g2', name: 'Card X', total_stays: 1, total_nights_stayed: 1, last_stay_date: null, id_on_file: true },
  { ...base, id: 'g3', name: 'Sample Person', total_stays: null, total_nights_stayed: null, has_id_photo: true, id_on_file: true },
];

const media = (narrow: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({ matches: narrow && q.includes('max-width: 639px'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
function view() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MemoryRouter><QueryClientProvider client={qc}><GuestsPage /></QueryClientProvider></MemoryRouter>);
}
beforeEach(() => { Element.prototype.setPointerCapture = vi.fn(); Element.prototype.releasePointerCapture = vi.fn(); // jsdom lacks pointer capture, vaul calls it
  api.fetchGuests.mockReset(); api.fetchGuests.mockResolvedValue({ rows, total: 3, page: 1 }); });
afterEach(() => { role.value = 'owner'; cleanup(); vi.unstubAllGlobals(); });

describe('idStatusWord', () => {
  it('names the three states in plain words', () => {
    expect(idStatusWord({ has_id_photo: true, id_on_file: true })).toBe('ID photo');
    expect(idStatusWord({ has_id_photo: false, id_on_file: true })).toBe('ID marked, no photo');
    expect(idStatusWord({ has_id_photo: false, id_on_file: false })).toBe('No ID yet');
    expect(idStatusWord({})).toBe('No ID yet'); // unknown is not "has an ID"
  });
});

describe('GuestCard', () => {
  it('shows initial, name, last stay, stays and nights, ID word, and links to the guest', () => {
    render(<MemoryRouter><GuestCard g={base} /></MemoryRouter>);
    const card = screen.getByRole('link');
    expect(card).toHaveAttribute('href', '/guests/g1');
    expect(within(card).getByText('D')).toBeInTheDocument();
    expect(within(card).getByText('Demo Guest')).toBeInTheDocument();
    expect(within(card).getByText('5 Oct 2026')).toBeInTheDocument();
    expect(within(card).getByText('3 stays · 7 nights')).toBeInTheDocument();
    expect(within(card).getByText('No ID yet')).toBeInTheDocument();
  });
  it('uses singular words and shows a plain line when there is no stay', () => {
    render(<MemoryRouter><GuestCard g={rows[1]!} /></MemoryRouter>);
    expect(screen.getByText('1 stay · 1 night')).toBeInTheDocument();
    expect(screen.getByText('No stay yet')).toBeInTheDocument();
    expect(screen.getByText('ID marked, no photo')).toBeInTheDocument();
  });
  it('treats missing counts as zero, not as a stay', () => {
    render(<MemoryRouter><GuestCard g={rows[2]!} /></MemoryRouter>);
    expect(screen.getByText('0 stays · 0 nights')).toBeInTheDocument();
  });
});

describe('GuestsPage list', () => {
  it('under 640 px: row cards, no table, filters behind one control that applies a tier', async () => {
    media(true);
    const user = userEvent.setup();
    view();
    expect(await screen.findAllByRole('link', { name: /Demo Guest|Card X|Sample Person/ })).toHaveLength(3);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByLabelText('Tier')).toBeNull(); // the selects are not on the page, only behind the control
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    const sheet = await screen.findByRole('dialog', { name: 'Filters' });
    const vip = within(sheet).getByRole('button', { name: 'VIP' });
    expect(vip).toHaveAttribute('aria-pressed', 'false');
    await user.click(vip);
    await waitFor(() => expect(api.fetchGuests).toHaveBeenLastCalledWith('p1', expect.objectContaining({ tier: 'vip', page: '1' })));
    await waitFor(() => expect(within(screen.getByRole('dialog', { name: 'Filters' })).getByRole('button', { name: 'VIP' })).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByRole('button', { name: 'Filters (1)', hidden: true })).toBeInTheDocument();
  });
  it('under 640 px: search counts as a filter and Clear filters empties it', async () => {
    media(true);
    const user = userEvent.setup();
    view();
    await screen.findAllByRole('link', { name: /Demo Guest/ });
    await user.type(screen.getByLabelText('Search'), 'demo');
    await user.click(await screen.findByRole('button', { name: 'Filters (1)' }));
    await user.click(await screen.findByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(screen.getByLabelText('Search')).toHaveValue(''));
  });
  it('at 640 px and wider: the table is unchanged and there are no cards', async () => {
    media(false);
    view();
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="guest-card"]')).toBeNull();
    expect(screen.getByLabelText('Tier')).toBeInTheDocument();
  });
});

describe('Use per stay tab (lane U)', () => {
  it('is reachable for owner and admin and opens the ranking', async () => {
    for (const r of ['owner', 'admin']) {
      role.value = r; const { unmount } = view();
      await userEvent.setup().click(screen.getByRole('tab', { name: 'Use per stay' }));
      expect(await screen.findByText(/No stays with a meter reading yet/)).toBeInTheDocument();
      unmount();
    }
  });
  it('is absent for other roles', () => {
    role.value = 'finance'; view();
    expect(screen.queryByRole('tab', { name: 'Use per stay' })).not.toBeInTheDocument();
  });
});
