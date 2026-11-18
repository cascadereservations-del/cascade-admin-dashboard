import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import type { Item, UsageKpi } from './api';

const h = vi.hoisted(() => ({
  items: [] as unknown[], kpi: null as unknown, kpiFail: false, kpiCalls: 0, can: true,
  receipts: [] as unknown[][], refill: [] as unknown[][], refillAnswer: { ok: true } as unknown,
}));
vi.mock('@/auth/session', () => ({ useSession: () => ({ propertyId: 'p1', session: null, caps: { can: () => h.can } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('./api', () => ({
  fetchCatalogue: () => Promise.resolve({ items: h.items, sourceAsOf: null, forecastNote: 'Demo note.', turnoverRatePerDay: 0.2 }),
  fetchUsageKpi: () => { h.kpiCalls += 1; return h.kpiFail ? Promise.reject(new Error('boom')) : Promise.resolve(h.kpi); },
  recordMissedRefill: (...a: unknown[]) => { h.refill.push(a); return Promise.resolve(h.refillAnswer); },
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
  { ...base, id: 'c', name: 'Demo spray', qty: '1', usageState: 'baseline', usagePerTurnover: '0.02', usageBaseline: '0.02', usageCounts: 0 },
  { ...base, id: 'd', name: 'Demo zero rate', qty: '9', usageState: 'learning', usagePerTurnover: '0', usageCounts: 2 },
  { ...base, id: 'e', name: 'Demo old', qty: '4' }, // no usage keys: the layout before the SQL
  { ...base, id: 'f', name: 'Demo plain', qty: '3', usageState: 'baseline', usagePerTurnover: '0.5', usageBaseline: null, usageCounts: 0 },
  { ...base, id: 'g', name: 'Demo ledger item', qty: '12', movementControlled: true, usageState: 'measured', usagePerTurnover: '1.5', usageBaseline: '1', lastCountAt: '2026-11-18T04:00:00Z', usageCounts: 4 },
  { ...base, id: 'h', name: 'Demo mop', qty: '2', consumable: false },
] as Item[];
const kpi = (): UsageKpi => ({ itemsTotal: 5, itemsMeasured: 1, itemsLearning: 2, medianForecastError: 0.2, forecastSamples: 3, underFourteenDays: { count: 0, items: [] },
  waitingForRefill: { count: 1, items: [{ id: 'b', name: 'Demo soap', since: '2026-10-27T04:00:00Z', qtyBefore: '2', qtyNow: '8' }] } });

const page = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={['/inventory']}><InventoryPage /></MemoryRouter></QueryClientProvider>);
beforeEach(() => {
  h.items = catalogue(); h.kpi = kpi(); h.kpiFail = false; h.kpiCalls = 0; h.can = true; h.receipts.length = 0; h.refill.length = 0; h.refillAnswer = { ok: true };
  vi.mocked(toast.success).mockClear();
});
afterEach(cleanup);

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
    expect(r.queryByText(/per turnover|turnover|measured|learning ·|baseline ·/)).toBeNull();
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

const openPrompt = async () => { fireEvent.click(await screen.findByRole('button', { name: 'Yes, record refill' })); return screen.findByLabelText('How much was added?'); };
const saveRefill = () => fireEvent.click(screen.getByRole('button', { name: 'Save refill' }));

describe('restock prompt', () => {
  it('shows the prompt with both buttons, and recount goes to the counts page', async () => {
    page();
    expect(await screen.findByText('Demo soap went 2 → 8')).toBeInTheDocument();
    expect(screen.getByText('Was stock added since 27 Oct? Without it this interval is skipped so usage stays accurate.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'No, recount' })).toHaveAttribute('href', '/inventory/counts');
  });
  it('Yes opens one empty focused field in the prompt with the record-only line; no item panel, no receipt form', async () => {
    page();
    const field = await openPrompt();
    expect(field).toHaveValue('');
    expect(field).toHaveFocus();
    expect(screen.getByText('This corrects the usage record. Stock stays at 8.')).toBeInTheDocument();
    expect(screen.getAllByText('pcs').length).toBeGreaterThan(0); // the item's base unit sits beside the field
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Receive stock')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save refill' })).toBeDisabled();
  });
  it('saving calls record_missed_refill with the typed quantity and never a receipt, then refreshes the prompts', async () => {
    page();
    fireEvent.change(await openPrompt(), { target: { value: '30' } });
    const before = h.kpiCalls;
    saveRefill();
    await waitFor(() => expect(h.refill).toEqual([['b', '30']]));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Refill recorded'));
    await waitFor(() => expect(h.kpiCalls).toBeGreaterThan(before));
    expect(h.receipts).toHaveLength(0);
    expect(screen.queryByText(/Count this item again|Go to counts/)).toBeNull();
  });
  it('replayed counts as success', async () => {
    h.refillAnswer = { ok: true, replayed: true };
    page();
    fireEvent.change(await openPrompt(), { target: { value: '30' } });
    saveRefill();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Refill recorded'));
    expect(screen.queryByRole('status')).toBeNull();
  });
  it('too_small shows the minimum and keeps the field and what was typed', async () => {
    h.refillAnswer = { ok: false, reason: 'too_small', minimum: '6.50' };
    page();
    fireEvent.change(await openPrompt(), { target: { value: '2' } });
    saveRefill();
    expect(await screen.findByText('At least 6.5 must have been added to reach this count.')).toBeInTheDocument();
    expect(screen.getByLabelText('How much was added?')).toHaveValue('2');
    expect(toast.success).not.toHaveBeenCalled();
  });
  it('not_waiting says it was settled and refreshes', async () => {
    h.refillAnswer = { ok: false, reason: 'not_waiting' };
    page();
    fireEvent.change(await openPrompt(), { target: { value: '30' } });
    const before = h.kpiCalls;
    saveRefill();
    expect(await screen.findByText('This was already settled.')).toBeInTheDocument();
    await waitFor(() => expect(h.kpiCalls).toBeGreaterThan(before));
  });
  it('no prompt when the KPI function is missing, and the list still loads', async () => {
    h.kpi = null;
    page();
    await screen.findByRole('button', { name: 'Demo detergent' });
    expect(screen.queryByText(/went/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Yes, record refill' })).toBeNull();
    expect(screen.queryByText(/could not be loaded/)).toBeNull();
  });
  it('a failed KPI read shows one muted line for managers, and nothing for others', async () => {
    h.kpiFail = true;
    page();
    expect(await screen.findByText('Refill prompts could not be loaded right now.')).toBeInTheDocument();
    cleanup();
    h.can = false;
    page();
    await screen.findByRole('button', { name: 'Demo detergent' });
    expect(screen.queryByText(/could not be loaded/)).toBeNull();
  });
  it('no prompt for a viewer who cannot manage inventory', async () => {
    h.can = false;
    page();
    await screen.findByRole('button', { name: 'Demo detergent' });
    expect(screen.queryByText(/went/)).toBeNull();
  });
});

describe('movement-controlled items and the baseline pill', () => {
  it('a controlled item shows no pill, uses or turnovers in the list and no Usage line in the panel', async () => {
    page();
    await screen.findByRole('button', { name: 'Demo ledger item' });
    expect(within(row('Demo ledger item')).queryByText(/per turnover|turnover|measured|learning ·|baseline ·/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Demo ledger item' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText('Usage')).toBeNull();
    expect(within(dialog).queryByText(/per turnover|last count|baseline 1/i)).toBeNull();
  });
  it('baseline with no baseline figure shows no pill; with one it reads baseline · research', async () => {
    page();
    await screen.findByRole('button', { name: 'Demo plain' });
    expect(within(row('Demo plain')).queryByText(/baseline ·/)).toBeNull();
    expect(within(row('Demo spray')).getByText('baseline · research')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Demo plain' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText('baseline')).toBeNull();
  });
});

describe('wording for a consumable that stays in learning', () => {
  it('shows Counted stock and the stock-count line, keeps the adjustment disabled, and never says baseline first', async () => {
    page();
    fireEvent.click(await screen.findByRole('button', { name: 'Demo soap' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Counted stock. Counts keep usage learning.')).toBeInTheDocument();
    expect(within(dialog).getByText('Use a stock count to correct this item.')).toBeInTheDocument();
    expect(within(dialog).queryByText('Needs a baseline count first.')).toBeNull();
    expect(within(dialog).queryByText(/switch this item to the movement ledger/)).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Record adjustment' })).toBeDisabled();
  });
  it('the list control badge agrees: learning for the consumable, legacy quantity for a durable, movement ledger when controlled', async () => {
    page();
    await screen.findByRole('button', { name: 'Demo soap' });
    expect(within(row('Demo soap')).getByText('learning')).toBeInTheDocument();
    expect(within(row('Demo mop')).getByText('legacy quantity')).toBeInTheDocument();
    expect(within(row('Demo ledger item')).getByText('movement ledger')).toBeInTheDocument();
  });
  it('a durable item keeps the old wording', async () => {
    page();
    fireEvent.click(await screen.findByRole('button', { name: 'Demo mop' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Legacy quantity. Reconcile a baseline count to switch this item to the movement ledger.')).toBeInTheDocument();
    expect(within(dialog).getByText('Needs a baseline count first.')).toBeInTheDocument();
  });
  it('a controlled item says Movement ledger and can be adjusted', async () => {
    page();
    fireEvent.click(await screen.findByRole('button', { name: 'Demo ledger item' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Movement ledger')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Record adjustment' })).toBeEnabled();
  });
});
