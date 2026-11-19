import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import type { Item } from './api';

const h = vi.hoisted(() => ({ data: null as unknown, usageCalls: [] as unknown[][], undoCalls: [] as unknown[][] }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('./api', () => ({
  getItemMoves: () => Promise.resolve(h.data),
  moveUsage: (...a: unknown[]) => { h.usageCalls.push(a); return Promise.resolve({ ok: true, moveId: 'mu1' }); },
  undoMove: (...a: unknown[]) => { h.undoCalls.push(a); return Promise.resolve({ ok: true }); },
  moveStock: vi.fn(),
}));
import { ItemHistory } from './move-stock';

const base = {
  category: 'Toiletries', unit: 'pc', qty: '5', reorderBelow: null, consumable: true, active: true, status: null, unitCost: null, purchaseUnit: null, unitsPerPurchase: null, photo: null,
  movementControlled: false, baselineNote: null, usage30d: null, usageDays: null, avgDaily: null, coverageDays: null, attention: false, estDailyUsage: null, estCoverageDays: null, usageState: 'learning',
};
const kt = { ...base, id: 'kt', name: 'Kitchen towel', qty: '5.00' } as Item;
const bt = { ...base, id: 'bt', name: 'Bathroom tissue', qty: '12.00' } as Item;
const data = () => ({
  ok: true,
  counts: [{ at: '2026-11-18T03:18:00Z', qty: '14' }],
  moves: [
    { id: 'm1', kind: 'stock', direction: 'out', otherItem: 'Bathroom tissue', qty: '7', at: '2026-11-20T01:05:00Z', undone: false, undoOf: null, canUndo: true, actor: 'Lloyd' },
    { id: 'm0', kind: 'stock', direction: 'in', otherItem: 'Bathroom tissue', qty: '3', at: '2026-11-19T01:05:00Z', undone: true, undoOf: null, canUndo: false, actor: null },
  ],
  usage: [
    { id: 'u1', date: '2026-11-25T02:20:00Z', qty: '2', loggedBy: 'Marifel', movedFrom: null },
    { id: 'u2', date: '2026-11-25T02:41:00Z', qty: '1', loggedBy: 'Marifel', movedFrom: null },
  ],
});
const view = (canManage = true) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ItemHistory item={kt} items={[kt, bt]} canManage={canManage} /></QueryClientProvider>);
beforeEach(() => { h.data = data(); h.usageCalls.length = 0; h.undoCalls.length = 0; vi.mocked(toast.success).mockClear(); vi.mocked(toast.error).mockClear(); });
afterEach(cleanup);

describe('item History', () => {
  it('lists the count, moves with who did them, and usage rows, newest first', async () => {
    const { container } = view();
    await screen.findByText('Counted 14 pc');
    expect(screen.getByText('Moved 7 pc to Bathroom tissue · by Lloyd')).toBeInTheDocument();
    expect(screen.getByText('Moved 3 pc from Bathroom tissue · undone')).toBeInTheDocument();
    expect(screen.getByText('Used 2 pc · logged by Marifel')).toBeInTheDocument();
    const rows = Array.from(container.querySelectorAll('li')).map((li) => li.textContent ?? '');
    expect(rows[0]).toContain('Used 1 pc');
    expect(rows[rows.length - 1]).toContain('Counted 14 pc');
  });
  it('every usage row has Move, none says Can be moved after', async () => {
    const { container } = view();
    await screen.findByText('Used 1 pc · logged by Marifel');
    expect(screen.getAllByRole('button', { name: 'Move' })).toHaveLength(2);
    expect(container.textContent).not.toMatch(/Can be moved after/);
  });
  it('Undo shows only while canUndo, and calls undo_inventory_move with the move id', async () => {
    view();
    await screen.findByText('Counted 14 pc');
    expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(h.undoCalls).toHaveLength(1));
    expect(h.undoCalls[0]![0]).toBe('m1');
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Move undone'));
  });
  it('Move opens Which item was it, previews the shelves and moves the row', async () => {
    view();
    await screen.findByText('Used 2 pc · logged by Marifel');
    fireEvent.click(screen.getAllByRole('button', { name: 'Move' })[1]!); // u1, the older of the two rows
    const sel = await screen.findByLabelText('Which item was it?');
    expect(Array.from((sel as HTMLSelectElement).options).map((o) => o.textContent)).toEqual(['Choose an item', 'Bathroom tissue · 12 pc']);
    fireEvent.change(sel, { target: { value: 'bt' } });
    expect(screen.getByTestId('move-preview').textContent).toBe('Kitchen towel 5 → 7 · Bathroom tissue 12 → 10');
    fireEvent.click(screen.getByRole('button', { name: 'Move 2 pc to Bathroom tissue' }));
    await waitFor(() => expect(h.usageCalls).toHaveLength(1));
    expect(h.usageCalls[0]!.slice(0, 2)).toEqual(['u1', 'bt']);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Moved 2 pc to Bathroom tissue', expect.objectContaining({ duration: 8000 })));
  });
  it('a viewer who cannot manage inventory sees the list but no Move or Undo, and every History button is 44 px', async () => {
    const { unmount } = view(false);
    await screen.findByText('Counted 14 pc');
    expect(screen.queryByRole('button')).toBeNull();
    unmount();
    view();
    await screen.findByText('Counted 14 pc');
    for (const b of screen.getAllByRole('button')) expect(b.className).toContain('min-h-11');
  });
  it('shows a calm line when nothing was recorded', async () => {
    h.data = { ok: true, counts: [], moves: [], usage: [] };
    view();
    expect(await screen.findByText('Nothing recorded in the last 30 days.')).toBeInTheDocument();
  });
});
