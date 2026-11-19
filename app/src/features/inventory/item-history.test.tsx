import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import type { Item } from './api';

const h = vi.hoisted(() => ({ data: null as unknown, usageCalls: [] as unknown[][], undoCalls: [] as unknown[][], usageAnswer: null as unknown, usageAfter: null as unknown, gate: null as Promise<void> | null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('./api', () => ({
  getItemMoves: () => (h.gate ? h.gate.then(() => h.data) : Promise.resolve(h.data)),
  moveUsage: (...a: unknown[]) => { h.usageCalls.push(a); const r = h.usageAnswer; if (r instanceof Error) return Promise.reject(r); if (h.usageAfter) h.data = h.usageAfter; return Promise.resolve(r ?? { ok: true, moveId: 'mu1' }); },
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
    { id: 'm2', kind: 'stock', direction: 'in', otherItem: 'Bathroom tissue', qty: '4', at: '2026-11-25T05:00:00Z', undone: true, undoOf: null, canUndo: false, actor: null },
  ],
  usage: [
    { id: 'u1', date: '2026-11-25', at: '2026-11-25T02:20:00Z', qty: '2', loggedBy: 'Marifel', movedFrom: null },
    { id: 'u2', date: '2026-11-25', at: '2026-11-25T02:41:00Z', qty: '1', loggedBy: 'Marifel', movedFrom: null },
    { id: 'u3', date: '2026-11-25', at: null, qty: '6', loggedBy: null, movedFrom: null },
  ],
});
let client: QueryClient;
const view = (canManage = true) => render(<QueryClientProvider client={client}><ItemHistory item={kt} items={[kt, bt]} canManage={canManage} /></QueryClientProvider>);
beforeEach(() => { client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); h.usageAnswer = null; h.usageAfter = null; h.gate = null; h.data = data(); h.usageCalls.length = 0; h.undoCalls.length = 0; vi.mocked(toast.success).mockClear(); vi.mocked(toast.error).mockClear(); });
afterEach(cleanup);

describe('item History', () => {
  it('lists the count, moves with who did them, and usage rows, newest first', async () => {
    const { container } = view();
    await screen.findByText('Counted 14 pc');
    expect(screen.getByText('Moved 7 pc to Bathroom tissue · by Lloyd')).toBeInTheDocument();
    expect(screen.getByText('Moved 3 pc from Bathroom tissue · undone')).toBeInTheDocument();
    expect(screen.getByText('Used 2 pc · logged by Marifel')).toBeInTheDocument();
    const rows = Array.from(container.querySelectorAll('li')).map((li) => li.textContent ?? '');
    expect(rows[0]).toContain('Moved 4 pc from Bathroom tissue'); // same day, later than every usage row
    expect(rows[1]).toContain('Used 1 pc');
    expect(rows[rows.length - 1]).toContain('Counted 14 pc');
  });
  it('a usage row shows its created_at time and sorts by it; a row without one falls back to its date', async () => {
    const { container } = view();
    await screen.findByText('Used 1 pc · logged by Marifel');
    const rows = Array.from(container.querySelectorAll('li')).map((li) => li.textContent ?? '');
    const used = (n: string) => rows.find((r) => r.includes(`Used ${n} pc`))!;
    expect(used('2')).toContain('25 Nov 2026, 10:20'); // 02:20Z is 10:20 in Manila, not the 08:00 of the bare date
    expect(used('1')).toContain('25 Nov 2026, 10:41');
    expect(used('6')).toContain('25 Nov 2026'); // no created_at: the date alone
    expect(rows.indexOf(used('1'))).toBeLessThan(rows.indexOf(used('2')));
    expect(rows.indexOf(used('2'))).toBeLessThan(rows.indexOf(used('6')));
  });
  it('every usage row has Move, none says Can be moved after', async () => {
    const { container } = view();
    await screen.findByText('Used 1 pc · logged by Marifel');
    expect(screen.getAllByRole('button', { name: 'Move' })).toHaveLength(3);
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
    fireEvent.click(screen.getAllByRole('button', { name: 'Move' })[1]!); // u1, the second newest row
    const sel = await screen.findByLabelText('Which item was it?');
    expect(Array.from((sel as HTMLSelectElement).options).map((o) => o.textContent)).toEqual(['Choose an item', 'Bathroom tissue · 12 pc']);
    fireEvent.change(sel, { target: { value: 'bt' } });
    expect(screen.getByTestId('move-preview').textContent).toBe('Kitchen towel 5 → 7 · Bathroom tissue 12 → 10');
    fireEvent.click(screen.getByRole('button', { name: 'Move 2 pc to Bathroom tissue' }));
    await waitFor(() => expect(h.usageCalls).toHaveLength(1));
    expect(h.usageCalls[0]!.slice(0, 2)).toEqual(['u1', 'bt']);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Moved 2 pc to Bathroom tissue', expect.objectContaining({ duration: 8000 })));
  });
  it('a usage move the server refuses for stock names the target, not the source', async () => {
    h.usageAnswer = { ok: false, reason: 'not_enough', on_hand: '1.00', item: 'to' };
    view();
    await screen.findByText('Used 2 pc · logged by Marifel');
    fireEvent.click(screen.getAllByRole('button', { name: 'Move' })[1]!);
    fireEvent.change(await screen.findByLabelText('Which item was it?'), { target: { value: 'bt' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move 2 pc to Bathroom tissue' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Bathroom tissue has 1 pc now, which is less than 2.'));
  });
  it('a transport error on a usage move rereads the shelves', async () => {
    h.usageAnswer = new Error('network');
    const spy = vi.spyOn(client, 'invalidateQueries');
    view();
    await screen.findByText('Used 2 pc · logged by Marifel');
    fireEvent.click(screen.getAllByRole('button', { name: 'Move' })[1]!);
    fireEvent.change(await screen.findByLabelText('Which item was it?'), { target: { value: 'bt' } });
    spy.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Move 2 pc to Bathroom tissue' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(spy).toHaveBeenCalledWith({ queryKey: ['catalogue'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['item-moves'] });
  });
  it('Cancel puts focus back on the row Move button', async () => {
    view();
    await screen.findByText('Used 2 pc · logged by Marifel');
    const btn = screen.getAllByRole('button', { name: 'Move' })[1]!;
    fireEvent.click(btn);
    await screen.findByLabelText('Which item was it?');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(document.activeElement).toBe(btn));
  });
  it('after a usage move the row is gone, so focus lands on the History heading', async () => {
    h.usageAfter = { ...data(), usage: data().usage.filter((u) => u.id !== 'u1') };
    view();
    await screen.findByText('Used 2 pc · logged by Marifel');
    fireEvent.click(screen.getAllByRole('button', { name: 'Move' })[1]!);
    fireEvent.change(await screen.findByLabelText('Which item was it?'), { target: { value: 'bt' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move 2 pc to Bathroom tissue' }));
    await waitFor(() => expect(screen.queryByText('Used 2 pc · logged by Marifel')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByText('History')));
  });
  it('a refetch finishing after Cancel does not steal focus from another opened row', async () => {
    view();
    await screen.findByText('Used 2 pc · logged by Marifel');
    fireEvent.click(screen.getAllByRole('button', { name: 'Move' })[1]!);
    await screen.findByLabelText('Which item was it?');
    let release!: () => void;
    h.gate = new Promise<void>((r) => { release = r; });
    void client.invalidateQueries({ queryKey: ['item-moves'] });
    await waitFor(() => expect(client.isFetching()).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Move' })[0]!);
    const sel = await screen.findByLabelText('Which item was it?');
    sel.focus();
    release();
    await waitFor(() => expect(client.isFetching()).toBe(0));
    await new Promise((r) => setTimeout(r, 20));
    expect(document.activeElement).toBe(sel);
  });
  it('a usage row larger than the target shelf shows the warning and no negative preview', async () => {
    h.data = { ...data(), usage: [{ id: 'u1', date: '2026-11-25', at: '2026-11-25T02:20:00Z', qty: '20', loggedBy: 'Marifel', movedFrom: null }] };
    view();
    await screen.findByText('Used 20 pc · logged by Marifel');
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    fireEvent.change(await screen.findByLabelText('Which item was it?'), { target: { value: 'bt' } });
    expect(screen.getByText('Bathroom tissue has 12 pc, which is less than 20.')).toBeInTheDocument();
    expect(screen.queryByTestId('move-preview')).toBeNull();
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
