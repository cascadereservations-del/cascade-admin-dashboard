import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import type { Item } from './api';

const h = vi.hoisted(() => ({ items: [] as unknown[] }));
vi.mock('@/auth/session', () => ({ useSession: () => ({ propertyId: 'p1', session: null, caps: { can: () => true } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('./api', () => ({
  fetchCatalogue: () => Promise.resolve({ items: h.items, sourceAsOf: null, forecastNote: '', turnoverRatePerDay: 0.2 }),
  reconcileBaseline: (_id: string, counted: string) => Promise.resolve({ ok: true, before: '5', after: counted, variance: '4' }),
}));
import CountsPage from './counts-page';

const base = {
  category: 'consumable', unit: 'pcs', qty: '5', reorderBelow: null, consumable: true, active: true, status: null, unitCost: null, purchaseUnit: null, unitsPerPurchase: null, photo: null,
  movementControlled: false, baselineNote: null, usage30d: null, usageDays: null, avgDaily: null, coverageDays: null, attention: false, estDailyUsage: null, estCoverageDays: null,
};
const items = (): Item[] => [
  { ...base, id: 'a', name: 'Demo soap' },
  { ...base, id: 'b', name: 'Demo ledger', movementControlled: true },
  { ...base, id: 'c', name: 'Demo mop', consumable: false },
] as Item[];

let client: QueryClient;
beforeEach(() => { h.items = items(); client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); vi.mocked(toast.success).mockClear(); });
afterEach(cleanup);
const page = () => render(<QueryClientProvider client={client}><CountsPage /></QueryClientProvider>);
const rowOf = (name: string) => screen.getByText(name).closest('tr')!;
const confirm = (name: string, qty: string) => {
  fireEvent.change(screen.getByLabelText(`Counted ${name}`), { target: { value: qty } });
  fireEvent.change(screen.getByLabelText(`Note ${name}`), { target: { value: 'Storeroom shelf' } });
  fireEvent.click(within(rowOf(name)).getByRole('button', { name: 'Confirm' }));
};

describe('count sheet', () => {
  it('labels an active consumable off the ledger as learning, a controlled one as ledger, a durable one as legacy', async () => {
    page();
    await screen.findByText('Demo soap');
    expect(within(rowOf('Demo soap')).getByText('learning')).toBeInTheDocument();
    expect(within(rowOf('Demo ledger')).getByText('ledger')).toBeInTheDocument();
    expect(within(rowOf('Demo mop')).getByText('legacy')).toBeInTheDocument();
  });
  it('a saved count refreshes the usage KPI as well as the catalogue', async () => {
    const spy = vi.spyOn(client, 'invalidateQueries');
    page();
    await screen.findByText('Demo soap');
    confirm('Demo soap', '9');
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ['usage-kpi'] }));
    expect(spy).toHaveBeenCalledWith({ queryKey: ['catalogue'] });
  });
  it('the toast for a learning item says Count recorded, not baseline; other items keep the baseline wording', async () => {
    page();
    await screen.findByText('Demo soap');
    confirm('Demo soap', '9');
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Count recorded: 9', { description: 'Variance 4' }));
    confirm('Demo mop', '7');
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Baseline set to 7', { description: 'Variance 4' }));
  });
  it('no text on the page says a count switches an item to the ledger', async () => {
    const { container } = page();
    await screen.findByText('Demo soap');
    expect(container.textContent).not.toMatch(/switch/i);
  });
});
