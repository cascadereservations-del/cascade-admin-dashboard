import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Item, UsageKpi } from './api';

const h = vi.hoisted(() => ({ items: [] as unknown[], kpi: null as unknown, can: true, receipts: [] as unknown[][] }));
vi.mock('@/auth/session', () => ({ useSession: () => ({ propertyId: 'p1', session: null, caps: { can: () => h.can } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('./api', () => ({
  fetchCatalogue: () => Promise.resolve({ items: h.items, sourceAsOf: null, forecastNote: 'Demo note.', turnoverRatePerDay: 0.2 }),
  fetchUsageKpi: () => Promise.resolve(h.kpi),
  fetchMovements: () => Promise.resolve({ rows: [], total: 0 }),
  fetchItemPurchases: () => Promise.resolve({ rows: [], total: 0 }),
  recordAdjustment: vi.fn(),
  recordReceipt: (...a: unknown[]) => { h.receipts.push(a); return Promise.resolve({ ok: true, purchaseId: 'x', movementId: null, unitsAdded: '10', controlled: false }); },
}));
import InventoryPage from './inventory-page';

const base = {
  category: 'consumable', unit: 'pcs', qty: '15', reorderBelow: null, consumable: true, active: true, status: null, unitCost: null, purchaseUnit: null, unitsPerPurchase: null, photo: null,
  movementControlled: false, baselineNote: null, usage30d: null, usageDays: null, avgDaily: null, coverageDays: null, attention: false, estDailyUsage: null, estCoverageDays: null,
};
const catalogue = (): Item[] => [
  { ...base, id: 'a', name: 'Demo detergent', qty: '15', usageState: 'measured', usagePerTurnover: '2.1', usageBaseline: '2', lastRefillAt: '2026-11-03T04:00:00Z', lastRefillQty: '10', lastCountAt: '2026-11-18T04:00:00Z', usageCounts: 3 },
  { ...base, id: 'b', name: 'Demo soap', qty: '2', usageState: 'learning', usagePerTurnover: '0.17', usageCounts: 1 },
  { ...base, id: 'c', name: 'Demo spray', qty: '1', usageState: 'baseline', usagePerTurnover: '0.02', usageCounts: 0 },
  { ...base, id: 'd', name: 'Demo zero rate', qty: '9', usageState: 'learning', usagePerTurnover: '0', usageCounts: 2 },
  { ...base, id: 'e', name: 'Demo old', qty: '4' }, // no usage keys: the layout before the SQL
] as Item[];
const kpi = (): UsageKpi => ({ itemsTotal: 5, itemsMeasured: 1, itemsLearning: 2, medianForecastError: 0.2, forecastSamples: 3, underFourteenDays: { count: 0, items: [] },
  waitingForRefill: { count: 1, items: [{ id: 'b', name: 'Demo soap', since: '2026-10-27T04:00:00Z', qtyBefore: '2', qtyNow: '8' }] } });

const page = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={['/inventory']}><InventoryPage /></MemoryRouter></QueryClientProvider>);
beforeEach(() => { h.items = catalogue(); h.kpi = kpi(); h.can = true; h.receipts.length = 0; });
afterEach(cleanup);

const REFILL_NOTE = 'Refill recorded. Count this item again so the stock number is right.';
const row = (name: string) => screen.getByRole('button', { name }).closest('tr')!;

describe('inventory list usage', () => {
  it('shows uses, turnovers and the pill for each state, with singular and plural counts', async () => {
    page();
    await screen.findByRole('button', { name: 'Demo detergent' });
    expect(within(row('Demo detergent')).getByText('uses 2.1 per turnover')).toBeInTheDocument();
    expect(within(row('Demo detergent')).getByText('~7 turnovers')).toBeInTheDocument();
    expect(within(row('Demo detergent')).getByText('measured · 3 counts')).toBeInTheDocument();
    expect(within(row('Demo soap')).getByText('~12 turnovers')).toBeInTheDocument();
    expect(within(row('Demo soap')).getByText('learning · 1 count')).toBeInTheDocument();
    expect(within(row('Demo spray')).getByText('~50 turnovers')).toBeInTheDocument();
    expect(within(row('Demo spray')).getByText('baseline · research')).toBeInTheDocument();
  });
  it('hides turnovers at rate 0 but keeps the pill', async () => {
    page();
    await screen.findByRole('button', { name: 'Demo zero rate' });
    expect(within(row('Demo zero rate')).queryByText(/turnovers/)).toBeNull();
    expect(within(row('Demo zero rate')).getByText('learning · 2 counts')).toBeInTheDocument();
  });
  it('an item without usage keys keeps the current layout', async () => {
    page();
    await screen.findByRole('button', { name: 'Demo old' });
    const r = within(row('Demo old'));
    expect(r.queryByText(/per turnover|turnover|measured|learning|baseline/)).toBeNull();
    expect(r.getByText('Not enough usage history').parentElement!.tagName).toBe('TD'); // no wrapper added
  });
});

describe('item panel', () => {
  it('shows the Usage line and the details line, and leaves out an absent part', async () => {
    page();
    fireEvent.click(await screen.findByRole('button', { name: 'Demo detergent' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('2.1 per turnover')).toBeInTheDocument();
    expect(within(dialog).getByText('Last refill 3 Nov (+10) · last count 18 Nov · baseline 2')).toBeInTheDocument();
  });
  it('an item with a state but no dates shows no details line', async () => {
    page();
    fireEvent.click(await screen.findByRole('button', { name: 'Demo soap' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('0.17 per turnover')).toBeInTheDocument();
    expect(within(dialog).queryByText(/Last refill|last count|baseline \d/)).toBeNull();
  });
  it('an item without usage keys has no Usage line', async () => {
    page();
    fireEvent.click(await screen.findByRole('button', { name: 'Demo old' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText('Usage')).toBeNull();
    expect(within(dialog).getByText('Usage (30d)')).toBeInTheDocument();
  });
});

describe('restock prompt and the refill message', () => {
  it('shows the prompt with both buttons', async () => {
    page();
    expect(await screen.findByText('Demo soap went 2 → 8')).toBeInTheDocument();
    expect(screen.getByText('Was stock added since 27 Oct? Without it this interval is skipped so usage stays accurate.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'No, recount' })).toHaveAttribute('href', '/inventory/counts');
  });
  it('Yes opens the item panel at the receipt form; a receipt from there shows the count-again message with a link', async () => {
    page();
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, record refill' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Receive stock')).toBeInTheDocument();
    expect(within(dialog).queryByText(REFILL_NOTE)).toBeNull();
    fireEvent.change(within(dialog).getByLabelText(/Packs/), { target: { value: '10' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record receipt' }));
    expect(await within(dialog).findByText(REFILL_NOTE)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Go to counts' })).toHaveAttribute('href', '/inventory/counts');
    expect(h.receipts).toHaveLength(1);
  });
  it('an ordinary receipt shows no such message', async () => {
    page();
    fireEvent.click(await screen.findByRole('button', { name: 'Demo detergent' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Packs/), { target: { value: '10' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record receipt' }));
    await waitFor(() => expect(h.receipts).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(REFILL_NOTE)).toBeNull();
  });
  it('a receipt on another item after a prompt Yes that was closed shows no message', async () => {
    page();
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, record refill' }));
    await screen.findByRole('dialog');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Demo soap' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Packs/), { target: { value: '3' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record receipt' }));
    await waitFor(() => expect(h.receipts).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(REFILL_NOTE)).toBeNull();
  });
  it('no prompt when the KPI function is missing, and the list still loads', async () => {
    h.kpi = null;
    page();
    await screen.findByRole('button', { name: 'Demo detergent' });
    expect(screen.queryByText(/went/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Yes, record refill' })).toBeNull();
  });
  it('no prompt for a viewer who cannot manage inventory (the receipt form and counts page are manager-only)', async () => {
    h.can = false;
    page();
    await screen.findByRole('button', { name: 'Demo detergent' });
    expect(screen.queryByText(/went/)).toBeNull();
  });
});
