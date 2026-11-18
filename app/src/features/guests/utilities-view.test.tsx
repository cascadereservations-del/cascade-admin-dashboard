import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';

const role = vi.hoisted(() => ({ value: 'owner' as string }));
const stays = vi.hoisted(() => ({ rows: [] as unknown[], fail: false }));
const fetchFn = vi.hoisted(() => vi.fn());
vi.mock('@/auth/session', () => ({ useSession: () => ({ caps: { can: () => role.value === 'owner' || role.value === 'admin' } }) }));
vi.mock('./utilities-api', () => ({
  UTILITIES_KEY: (p: string) => ['guest-utilities', p],
  fetchStayUtilities: (...a: unknown[]) => fetchFn(...a),
}));

import { UtilitiesRanking } from './utilities-ranking';
import { GuestUtilitiesCard } from './guest-utilities-card';
import type { Stay } from './utilities-math';

fetchFn.mockImplementation(async () => { if (stays.fail) throw new Error('boom'); return stays.rows; });
afterEach(() => { cleanup(); fetchFn.mockClear(); role.value = 'owner'; stays.rows = []; stays.fail = false; });
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const st = (o: Partial<Stay> & { sessionId: string }): Stay => ({ guest: 'Demo Guest One', date: '2026-11-03', nights: 2, kwh: 20, m3: 1, estimate: null, ...o });

// Live-shape worst case first: nulls everywhere, an estimate, a stay with no name.
it('ranking: shows dash-plus-reason states for absent data and never crashes on nulls', async () => {
  stays.rows = [st({ sessionId: 'a', guest: null, date: null, nights: null, kwh: null, m3: null, estimate: 'chain_break' }), st({ sessionId: 'b', estimate: 'typed_accepted' })];
  wrap(<UtilitiesRanking propertyId="p" />);
  expect(await screen.findByText(/No stays with a meter reading yet/)).toBeInTheDocument();
  expect(screen.getByText(/Estimated, left out of the average/)).toBeInTheDocument();
  expect(screen.getByText(/Typed in by hand, not read from a photo/)).toBeInTheDocument();
  expect(screen.getByText(/Guest not named/)).toBeInTheDocument();
});

it('ranking: average, highest stay, Above average badge at 1.4x, litres, and the toggle', async () => {
  // kWh/night: A 30, B 10, C 10 over 1+2+2 nights... totals 30+20+20 = 70 / 5 = 14; A is 30/14 = 2.14x
  stays.rows = [
    st({ sessionId: 'a', guest: 'Alpha', nights: 1, kwh: 30, m3: 0.5 }),
    st({ sessionId: 'b', guest: 'Bravo', nights: 2, kwh: 20, m3: 0.4 }),
    st({ sessionId: 'c', guest: 'Charlie', nights: 2, kwh: 20, m3: 0.4 }),
  ];
  wrap(<UtilitiesRanking propertyId="p" />);
  await screen.findByText('Alpha');
  expect(screen.getByText('3 stays · 5 nights')).toBeInTheDocument();
  expect(screen.getByText('14.0 kWh')).toBeInTheDocument();
  const items = screen.getAllByRole('listitem');
  expect(items.map((li) => li.textContent?.includes('Above average'))).toEqual([true, false, false]);
  expect(within(items[0]!).getByText('30.0 kWh', { exact: false })).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Water' }));
  expect((await screen.findAllByText('500 litres', { exact: false })).length).toBeGreaterThan(0); // Alpha 0.5 m3 in one night: tile and row
  expect(screen.getByRole('button', { name: 'Water' })).toHaveAttribute('aria-pressed', 'true');
});

it('both components render nothing, and fetch nothing, for a role without access', () => {
  role.value = 'finance';
  const { container } = wrap(<><UtilitiesRanking propertyId="p" /><GuestUtilitiesCard propertyId="p" guestName="Demo Guest One" /></>);
  expect(container).toBeEmptyDOMElement();
  expect(fetchFn).not.toHaveBeenCalled();
});

it('ranking: a failed read shows an alert', async () => {
  stays.fail = true;
  wrap(<UtilitiesRanking propertyId="p" />);
  expect(await screen.findByRole('alert')).toHaveTextContent(/./);
});

it('card: guest average against the house, badge, hint under 3 nights, first-name caveat', async () => {
  stays.rows = [
    st({ sessionId: 'a', guest: 'Alpha', nights: 1, kwh: 30, m3: 0.5 }),
    st({ sessionId: 'b', guest: 'Bravo', nights: 2, kwh: 20, m3: 0.4 }),
    st({ sessionId: 'c', guest: 'Charlie', nights: 2, kwh: 20, m3: 0.4 }),
  ];
  wrap(<GuestUtilitiesCard propertyId="p" guestName="Alpha Santos" />);
  expect(await screen.findByText(/Average across 1 stay, 1 night/)).toBeInTheDocument();
  expect(screen.getByText(/Under 3 nights, so read it as a hint/)).toBeInTheDocument();
  expect(screen.getByText(/another guest with the same first name may be included/)).toBeInTheDocument();
  expect(screen.getByText('Above average')).toBeInTheDocument();
  expect(screen.getByText('2.14 times the average of 14.0 kWh a night')).toBeInTheDocument();
});

it('card: a typical guest gets no badge, an estimated-only guest says so, an unknown guest says none yet', async () => {
  stays.rows = [st({ sessionId: 'a', guest: 'Alpha', nights: 2, kwh: 28 }), st({ sessionId: 'b', guest: 'Bravo', nights: 2, kwh: 28, estimate: 'misread' })];
  wrap(<GuestUtilitiesCard propertyId="p" guestName="Alpha" />);
  expect(await screen.findByText('Typical')).toBeInTheDocument();
  expect(screen.queryByText('Above average')).not.toBeInTheDocument();
  cleanup();
  wrap(<GuestUtilitiesCard propertyId="p" guestName="Bravo" />);
  expect(await screen.findByText(/Only estimated readings for this guest/)).toBeInTheDocument();
  expect(screen.getByText(/The numbers look wrong/)).toBeInTheDocument();
  cleanup();
  wrap(<GuestUtilitiesCard propertyId="p" guestName="Nobody Here" />);
  expect(await screen.findByText(/No meter readings are tied to this guest yet/)).toBeInTheDocument();
});

it('card: a one-word guest name gets the first-name caveat, a two-word exact match does not', async () => {
  stays.rows = [st({ sessionId: 'a', guest: 'Alpha', nights: 2, kwh: 28 }), st({ sessionId: 'b', guest: 'Alpha Demo', nights: 2, kwh: 28 })];
  wrap(<GuestUtilitiesCard propertyId="p" guestName="Alpha" />);
  expect(await screen.findByText(/same first name may be included/)).toBeInTheDocument();
  cleanup();
  stays.rows = [st({ sessionId: 'b', guest: 'Alpha Demo', nights: 2, kwh: 28 })];
  wrap(<GuestUtilitiesCard propertyId="p" guestName="Alpha Demo" />);
  await screen.findByText(/Average across 1 stay/);
  expect(screen.queryByText(/same first name/)).not.toBeInTheDocument();
});

it('ranking: a stay with unknown nights shows under estimated with the reason', async () => {
  stays.rows = [st({ sessionId: 'a', guest: 'Alpha', nights: null }), st({ sessionId: 'b', guest: 'Bravo', nights: 2, kwh: null })];
  wrap(<UtilitiesRanking propertyId="p" />);
  expect(await screen.findByText(/Nights not known/)).toBeInTheDocument();
  expect(screen.getByText(/Reading not known/)).toBeInTheDocument();
});
