import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import type { Item, UsageKpi } from './api';

const h = vi.hoisted(() => ({
  items: [] as unknown[], kpi: null as unknown, kpiFail: false, kpiCalls: 0, can: true,
  receipts: [] as unknown[][], refill: [] as unknown[][], refillAnswer: { ok: true } as unknown,
  catalogueCalls: 0, refillMode: 'answer' as 'answer' | 'reject' | 'hold', release: null as null | (() => void),
}));
vi.mock('@/auth/session', () => ({ useSession: () => ({ propertyId: 'p1', session: null, caps: { can: () => h.can } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('./api', () => ({
  fetchCatalogue: () => { h.catalogueCalls += 1; return Promise.resolve({ items: h.items, sourceAsOf: null, forecastNote: 'Demo note.', turnoverRatePerDay: 0.2 }); },
  fetchUsageKpi: () => { h.kpiCalls += 1; return h.kpiFail ? Promise.reject(new Error('boom')) : Promise.resolve(h.kpi); },
  recordMissedRefill: (...a: unknown[]) => {
    h.refill.push(a);
    if (h.refillMode === 'reject') return Promise.reject(new Error('Refill failed on the server'));
    if (h.refillMode === 'hold') return new Promise((res) => { h.release = () => res(h.refillAnswer); });
    return Promise.resolve(h.refillAnswer);
  },
  fetchMovements: () => Promise.resolve({ rows: [], total: 0 }),
  getItemMoves: () => Promise.resolve({ ok: true, moves: [], usage: [], counts: [] }),
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
  h.items = catalogue(); h.kpi = kpi(); h.kpiFail = false; h.kpiCalls = 0; h.can = true; h.receipts.length = 0; h.refill.length = 0; h.refillAnswer = { ok: true }; h.catalogueCalls = 0; h.refillMode = 'answer'; h.release = null;
  vi.mocked(toast.success).mockClear(); vi.mocked(toast.info).mockClear();
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
    expect(screen.getByText('This corrects the usage record. Stock stays at 2.')).toBeInTheDocument(); // the catalogue quantity, not the KPI qtyNow (8)
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
  it('not_waiting is a toast that outlives the card, and the card goes when the KPI drops the item', async () => {
    h.refillAnswer = { ok: false, reason: 'not_waiting' };
    page();
    fireEvent.change(await openPrompt(), { target: { value: '30' } });
    const before = h.kpiCalls;
    h.kpi = { ...kpi(), waitingForRefill: { count: 0, items: [] } };
    saveRefill();
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith('This was already settled.'));
    await waitFor(() => expect(h.kpiCalls).toBeGreaterThan(before));
    await waitFor(() => expect(screen.queryByText('Demo soap went 2 → 8')).toBeNull());
    expect(toast.info).toHaveBeenCalledTimes(1);
  });
  it('not_learning is a toast too', async () => {
    h.refillAnswer = { ok: false, reason: 'not_learning' };
    page();
    fireEvent.change(await openPrompt(), { target: { value: '30' } });
    h.kpi = { ...kpi(), waitingForRefill: { count: 0, items: [] } };
    saveRefill();
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith('This item is not in usage learning.'));
    await waitFor(() => expect(screen.queryByText('Demo soap went 2 → 8')).toBeNull());
  });
  it('Stock stays at shows the real catalogue stock, not the count-time quantity', async () => {
    h.items = catalogue().map((i) => (i.id === 'b' ? { ...i, qty: '18' } : i));
    page();
    await openPrompt();
    expect(screen.getByText('This corrects the usage record. Stock stays at 18.')).toBeInTheDocument();
  });
  it('a successful refill refetches the catalogue', async () => {
    page();
    fireEvent.change(await openPrompt(), { target: { value: '30' } });
    await waitFor(() => expect(h.catalogueCalls).toBeGreaterThan(0));
    const before = h.catalogueCalls;
    saveRefill();
    await waitFor(() => expect(h.catalogueCalls).toBeGreaterThan(before));
  });
  it('Save stays disabled at 0 and at 0.00', async () => {
    page();
    const field = await openPrompt();
    for (const v of ['0', '0.00']) {
      fireEvent.change(field, { target: { value: v } });
      expect(screen.getByRole('button', { name: 'Save refill' })).toBeDisabled();
    }
    expect(h.refill).toHaveLength(0);
  });
  it('Save is disabled while the call is pending, so a second tap sends nothing', async () => {
    h.refillMode = 'hold';
    page();
    fireEvent.change(await openPrompt(), { target: { value: '30' } });
    saveRefill();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save refill' })).toBeDisabled());
    saveRefill();
    expect(h.refill).toHaveLength(1);
    h.release!();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Refill recorded'));
  });
  it('a rejected call shows its message and keeps the field', async () => {
    h.refillMode = 'reject';
    page();
    fireEvent.change(await openPrompt(), { target: { value: '30' } });
    saveRefill();
    expect(await screen.findByText('Refill failed on the server')).toBeInTheDocument();
    expect(screen.getByLabelText('How much was added?')).toHaveValue('30');
    expect(toast.success).not.toHaveBeenCalled();
  });
  it('commas are removed and the cleaned value is sent', async () => {
    page();
    fireEvent.change(await openPrompt(), { target: { value: '1,200.5' } });
    saveRefill();
    await waitFor(() => expect(h.refill).toEqual([['b', '1200.5']]));
  });
  it.each(['1e2', 'abc', '12.345', '-5', '1.2.3', '.5'])('%s is refused with the hint tied to the field, and Save stays off', async (bad) => {
    page();
    const field = await openPrompt();
    fireEvent.change(field, { target: { value: bad } });
    const hint = screen.getByText('Enter a number, like 12 or 12.5.');
    expect(field.getAttribute('aria-describedby')!.split(' ')).toContain(hint.id);
    expect(screen.getByRole('button', { name: 'Save refill' })).toBeDisabled();
    expect(h.refill).toHaveLength(0);
  });
  it('a valid number shows no hint', async () => {
    page();
    fireEvent.change(await openPrompt(), { target: { value: '12.5' } });
    expect(screen.queryByText('Enter a number, like 12 or 12.5.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save refill' })).toBeEnabled();
  });
  it('after a refill, focus goes to the next prompt heading, and to the Inventory heading when none is left', async () => {
    h.kpi = { ...kpi(), waitingForRefill: { count: 2, items: [
      { id: 'b', name: 'Demo soap', since: '2026-10-27T04:00:00Z', qtyBefore: '2', qtyNow: '8' },
      { id: 'a', name: 'Demo detergent', since: '2026-10-27T04:00:00Z', qtyBefore: '9', qtyNow: '15' },
    ] } };
    page();
    await screen.findByText('Demo detergent went 9 → 15');
    fireEvent.click(screen.getAllByRole('button', { name: 'Yes, record refill' })[0]!);
    fireEvent.change(await screen.findByLabelText('How much was added?'), { target: { value: '30' } });
    h.kpi = { ...kpi(), waitingForRefill: { count: 1, items: [{ id: 'a', name: 'Demo detergent', since: '2026-10-27T04:00:00Z', qtyBefore: '9', qtyNow: '15' }] } };
    saveRefill();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Demo detergent went 9 → 15' })).toHaveFocus());
    await waitFor(() => expect(screen.queryByText('Demo soap went 2 → 8')).toBeNull());
    // the last prompt: the KPI drops it, focus lands on the page heading rather than body
    h.kpi = { ...kpi(), waitingForRefill: { count: 0, items: [] } };
    fireEvent.click(screen.getByRole('button', { name: 'Yes, record refill' }));
    fireEvent.change(await screen.findByLabelText('How much was added?'), { target: { value: '5' } });
    saveRefill();
    await waitFor(() => expect(screen.queryByText('Demo detergent went 9 → 15')).toBeNull());
    expect(screen.getByRole('heading', { level: 1, name: 'Inventory' })).toHaveFocus();
    expect(document.body).not.toHaveFocus();
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
  it('shows Counted stock and the Move box in place of the dead adjustment, and never says baseline first', async () => {
    page();
    fireEvent.click(await screen.findByRole('button', { name: 'Demo soap' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Counted stock. Counts keep usage learning.')).toBeInTheDocument();
    expect(within(dialog).getByText('Move to another item')).toBeInTheDocument();
    expect(within(dialog).queryByText('Needs a baseline count first.')).toBeNull();
    expect(within(dialog).queryByText(/switch this item to the movement ledger/)).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Record adjustment' })).toBeNull();
  });
  it('the list control badge agrees: learning for the consumable, legacy quantity for a durable, movement ledger when controlled', async () => {
    page();
    await screen.findByRole('button', { name: 'Demo soap' });
    expect(within(row('Demo soap')).getByText('learning')).toBeInTheDocument();
    expect(within(row('Demo mop')).getByText('legacy quantity')).toBeInTheDocument();
    expect(within(row('Demo old')).getByText('legacy quantity')).toBeInTheDocument(); // no usage keys: the old wording until the server release
    expect(within(row('Demo ledger item')).getByText('movement ledger')).toBeInTheDocument();
  });
  it('an item with no usage keys keeps the old legacy wording', async () => {
    page();
    fireEvent.click(await screen.findByRole('button', { name: 'Demo old' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Legacy quantity. Reconcile a baseline count to switch this item to the movement ledger.')).toBeInTheDocument();
    expect(within(dialog).getByText('Needs a baseline count first.')).toBeInTheDocument();
  });
  const receive = async (name: string) => {
    fireEvent.click(await screen.findByRole('button', { name }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Packs/), { target: { value: '10' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record receipt' }));
  };
  it('a receipt on an item that stays in learning says Stock updated, never Legacy', async () => {
    page();
    await receive('Demo soap');
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const [, opts] = vi.mocked(toast.success).mock.calls[0] as [string, { description: string }];
    expect(opts.description).toMatch(/^Stock updated/);
    expect(opts.description).not.toMatch(/Legacy/);
  });
  it('a receipt on an item with no usage keys keeps the Legacy wording', async () => {
    page();
    await receive('Demo old');
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const [, opts] = vi.mocked(toast.success).mock.calls[0] as [string, { description: string }];
    expect(opts.description).toMatch(/^Legacy quantity update recorded/);
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
