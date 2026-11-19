import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Item } from './api';

const h = vi.hoisted(() => ({ caps: ['manage_inventory', 'read_operations'] as string[], items: [] as unknown[] }));
vi.mock('@/auth/session', () => ({ useSession: () => ({ propertyId: 'p1', session: null, caps: { can: (c: string) => h.caps.includes(c) } }) }));
vi.mock('./api', () => ({
  fetchCatalogue: () => Promise.resolve({ items: h.items, sourceAsOf: null, forecastNote: '', turnoverRatePerDay: 0.2 }),
  fetchUsageKpi: () => Promise.resolve(null),
  fetchMovements: () => Promise.resolve({ rows: [], total: 0 }),
  fetchItemPurchases: () => Promise.resolve({ rows: [], total: 0 }),
  getItemMoves: () => Promise.resolve({ ok: true, moves: [], usage: [], counts: [] }),
  recordAdjustment: vi.fn(), recordReceipt: vi.fn(), moveStock: vi.fn(), undoMove: vi.fn(), moveUsage: vi.fn(),
}));

import InventoryPage, { StockCount } from './inventory-page';

afterEach(cleanup);

describe('StockCount (lazy NumberFlow)', () => {
  it('shows the plain count first, then the animated number with the same two-decimal text', async () => {
    const { container } = render(<StockCount value="12.5" unit="pack" />);
    expect(container).toHaveTextContent('12.50 pack'); // fallback while the chunk loads
    await waitFor(() => expect(container.querySelector('number-flow-react')).not.toBeNull());
    const el = container.querySelector('number-flow-react')!;
    expect(el.getAttribute('aria-label') ?? container.textContent).toContain('12.50');
  });
  it('shows a dash, not 0, when the quantity is unknown (ML-05)', () => {
    const { container } = render(<StockCount value={null} unit="pack" />);
    expect(container).toHaveTextContent('— pack');
    expect(screen.queryByText(/^0/)).toBeNull();
  });
  it('shows a dash for an unparseable string and keeps zero as a real zero', () => {
    const { container, rerender } = render(<StockCount value="n/a" unit="pc" />);
    expect(container).toHaveTextContent('— pc');
    rerender(<StockCount value="0" unit="pc" />);
    expect(container).toHaveTextContent('0.00 pc');
  });
});

const base = {
  category: 'Toiletries', unit: 'pc', qty: '14', reorderBelow: null, consumable: true, active: true, status: null, unitCost: null, purchaseUnit: null, unitsPerPurchase: null, photo: null,
  movementControlled: false, baselineNote: null, usage30d: null, usageDays: null, avgDaily: null, coverageDays: null, attention: false, estDailyUsage: null, estCoverageDays: null,
};
const open = async (name: string) => {
  h.items = [
    { ...base, id: 'a', name: 'Demo towel', usageState: 'learning' },
    { ...base, id: 'b', name: 'Demo tissue', usageState: 'learning', qty: '5' },
    { ...base, id: 'g', name: 'Demo ledger', movementControlled: true, usageState: 'measured' },
    { ...base, id: 'o', name: 'Demo old' }, // no usage keys: the server before the release
  ] as Item[];
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={['/inventory']}><InventoryPage /></MemoryRouter></QueryClientProvider>);
  fireEvent.click(await screen.findByRole('button', { name }));
  return screen.findByRole('dialog');
};

describe('item panel: Move to another item (s122)', () => {
  it('a counted consumable shows Move to another item and History, not the dead Adjust box', async () => {
    h.caps = ['manage_inventory', 'read_operations'];
    const d = await open('Demo towel');
    expect(within(d).getByText('Move to another item')).toBeInTheDocument();
    expect(within(d).queryByText(/Adjust \(movement ledger only\)/)).toBeNull();
    expect(within(d).queryByRole('button', { name: 'Record adjustment' })).toBeNull();
    expect(await within(d).findByText('History')).toBeInTheDocument();
    expect(within(d).queryByText('Movement history')).toBeNull();
    expect(within(d).getByRole('button', { name: 'Record receipt' })).toBeInTheDocument(); // Receive stock is unchanged
  });
  it('a ledger item keeps Adjust and its movement list, and has no Move', async () => {
    h.caps = ['manage_inventory', 'read_operations'];
    const d = await open('Demo ledger');
    expect(within(d).getByRole('button', { name: 'Record adjustment' })).toBeEnabled();
    expect(within(d).queryByText('Move to another item')).toBeNull();
    expect(within(d).getByText('Movement history')).toBeInTheDocument();
  });
  it('an item with no usage keys (SQL not released) keeps the old Adjust box', async () => {
    h.caps = ['manage_inventory', 'read_operations'];
    const d = await open('Demo old');
    expect(within(d).queryByText('Move to another item')).toBeNull();
    expect(within(d).getByRole('button', { name: 'Record adjustment' })).toBeDisabled();
  });
  it('without manage_inventory there is neither Adjust nor Move', async () => {
    h.caps = ['read_operations'];
    const d = await open('Demo towel');
    expect(within(d).queryByText('Move to another item')).toBeNull();
    expect(within(d).queryByRole('button', { name: 'Record adjustment' })).toBeNull();
  });
});
