import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AdvisorInputs, AdvisorMonth } from './advisor';
import PriceAdvisorPage from './advisor-page';

const mocks = vi.hoisted(() => ({ inputs: null as unknown, canPublish: true }));
vi.mock('@/auth/session', () => ({ useSession: () => ({ propertyId: 'synthetic-property', caps: { can: () => mocks.canPublish } }) }));
vi.mock('./advisor-api', () => ({ fetchAdvisorInputs: vi.fn(async () => mocks.inputs) }));
vi.mock('./api', () => ({ fetchCard: vi.fn(async () => ({ base: 1780, currency: 'PHP', deposit_pct: 50, tiers: [], version_id: 'v1', effective_from: '2026-01-01', promotions: [] })) }));

const m = (month: string, days: number, held: number, over: Partial<AdvisorMonth>): AdvisorMonth => ({
  month, days, heldNights: held, lyMonth: `2025${month.slice(4)}`, lyDaysCovered: days, lyAirbnbNights: 0, lyDirectNights: 0, lyHeldNights: 0, lyStays: 0, lyPayoutTotal: null, lyPaidNights: 0, ...over,
});
// Nov: last year 24 of 30 nights = 80%. Dec: last year 16 of 31 = 51.6%, which the test overwrites with 50. All through Airbnb, so the fee is the observed 15%.
const worked = (): AdvisorInputs => ({
  from: '2026-11-01', to: '2026-12-01', today: '2026-10-06', historyStart: '2025-01-01', accountingStart: null,
  months: [m('2026-11-01', 30, 0, { lyAirbnbNights: 24, lyStays: 5 }), m('2026-12-01', 31, 3, { lyAirbnbNights: 16, lyStays: 4 })],
  expenses: { windowStart: '2025-11-01', windowEnd: '2026-11-01', monthsCovered: 12, categories: [{ category: 'supplies', total: 120000, rows: 12, estimateTotal: 0 }, { category: 'unaccounted', total: 99999, rows: 1, estimateTotal: 0 }] },
  airbnbFee: { rate: 0.15, stays: 9 },
});
const none = (): AdvisorInputs => ({
  ...worked(), historyStart: null,
  months: [m('2026-11-01', 30, 0, { lyDaysCovered: 0, lyAirbnbNights: null, lyDirectNights: null, lyHeldNights: null }), m('2026-12-01', 31, 0, { lyDaysCovered: 0, lyAirbnbNights: null, lyDirectNights: null, lyHeldNights: null })],
  expenses: { windowStart: null, windowEnd: null, monthsCovered: null, categories: [] }, airbnbFee: { rate: null, stays: 0 },
});

function mount() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><PriceAdvisorPage /></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => { mocks.canPublish = true; mocks.inputs = worked(); try { localStorage.clear(); } catch { /* ignore */ } });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('works the hand-worked period end to end and links to Rate settings without publishing', async () => {
  mount();
  fireEvent.change(await screen.findByLabelText(/Net earning for the whole period/), { target: { value: '30000' } });
  fireEvent.change(screen.getByLabelText(/Fixed overheads per month/), { target: { value: '2000' } });
  fireEvent.change(screen.getByLabelText(/December 2026 expected occupancy|Dec 2026 expected occupancy/), { target: { value: '50' } });
  // 38 nights, costs 2 x (10,000 supplies + 2,000) = 24,000, need 54,000, / 0.85 / 38 = 1,671.83 -> 1,672 (unaccounted starts off)
  const link = await screen.findByRole('link', { name: /Open Rate settings with this price/ });
  expect(link.getAttribute('href')).toContain('/pricing?prefill=1672');
  expect(screen.getAllByText('₱1,672').length).toBeGreaterThan(0);
  expect(screen.getByText(/Built on 9 stays from last year/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /publish/i })).toBeNull(); // the advisor never publishes
});

it('with no history nothing is invented: months say so and no price is suggested', async () => {
  mocks.inputs = none();
  mount();
  expect((await screen.findAllByText('no history')).length).toBe(2);
  fireEvent.change(screen.getByLabelText(/Net earning for the whole period/), { target: { value: '30000' } });
  expect(screen.getByText(/No Airbnb fee is on record/)).toBeInTheDocument(); // unknown, so asked for rather than assumed 0
  fireEvent.change(screen.getByLabelText(/Platform fee/), { target: { value: '15' } });
  expect(screen.getByText(/No month has an expected occupancy yet/)).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Open Rate settings/ })).toBeNull();
});

it('a person who cannot publish rates sees the suggestion but no link', async () => {
  mocks.canPublish = false;
  mount();
  fireEvent.change(await screen.findByLabelText(/Net earning for the whole period/), { target: { value: '30000' } });
  await waitFor(() => expect(screen.getAllByText(/Only an owner or admin can open Rate settings/).length).toBeGreaterThan(0));
  expect(screen.queryByRole('link', { name: /Open Rate settings/ })).toBeNull();
});

it('still renders when browser storage is blocked', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  mount();
  expect(await screen.findByLabelText(/Net earning for the whole period/)).toBeInTheDocument();
});
