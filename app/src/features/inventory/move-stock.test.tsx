import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import type { Item } from './api';

const h = vi.hoisted(() => ({ calls: [] as unknown[][], undo: [] as unknown[][], answers: [] as Array<unknown>, undoAnswer: { ok: true } as unknown }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('./api', () => ({
  moveStock: (...a: unknown[]) => { h.calls.push(a); const next = h.answers.shift(); return next instanceof Error ? Promise.reject(next) : Promise.resolve(next ?? { ok: true, moveId: 'm1' }); },
  undoMove: (...a: unknown[]) => { h.undo.push(a); return Promise.resolve(h.undoAnswer); },
  moveUsage: vi.fn(), getItemMoves: vi.fn(),
}));
import { MoveStockForm, refusalText } from './move-stock';

const base = {
  category: 'Toiletries', unit: 'pc', qty: '5', reorderBelow: null, consumable: true, active: true, status: null, unitCost: null, purchaseUnit: null, unitsPerPurchase: null, photo: null,
  movementControlled: false, baselineNote: null, usage30d: null, usageDays: null, avgDaily: null, coverageDays: null, attention: false, estDailyUsage: null, estCoverageDays: null, usageState: 'learning',
};
const kt = { ...base, id: 'kt', name: 'Kitchen towel', qty: '14.00' } as Item;
const bt = { ...base, id: 'bt', name: 'Bathroom tissue', qty: '5.00' } as Item;
const items = (): Item[] => [
  kt, bt,
  { ...base, id: 'dt', name: 'Demo detergent', unit: 'roll' }, // other unit
  { ...base, id: 'in', name: 'Demo inactive', active: false },
  { ...base, id: 'lg', name: 'Demo ledger', movementControlled: true },
  { ...base, id: 'mp', name: 'Demo mop', consumable: false },
] as Item[];

let client: QueryClient;
const form = (from: Item | null = kt) => render(<QueryClientProvider client={client}><MoveStockForm items={items()} from={from} /></QueryClientProvider>);
const pick = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const amount = (v: string) => fireEvent.change(screen.getByLabelText('Amount'), { target: { value: v } });
const submit = () => fireEvent.click(screen.getByRole('button', { name: /^Move \d/ }));

beforeEach(() => { client = new QueryClient(); h.calls.length = 0; h.undo.length = 0; h.answers.length = 0; h.undoAnswer = { ok: true }; vi.mocked(toast.success).mockClear(); vi.mocked(toast.error).mockClear(); });
afterEach(cleanup);

describe('move stock form', () => {
  it('lists only active, counted consumables with the same unit, without the item itself', () => {
    form();
    const names = Array.from((screen.getByLabelText('Move to') as HTMLSelectElement).options).map((o) => o.textContent);
    expect(names).toEqual(['Choose an item', 'Bathroom tissue · 5 pc']);
  });
  it('the preview reads Kitchen towel 14 → 7 · Bathroom tissue 5 → 12', () => {
    form();
    pick('Move to', 'bt'); amount('7');
    expect(screen.getByTestId('move-preview').textContent).toBe('Kitchen towel 14 → 7 · Bathroom tissue 5 → 12');
    expect(screen.getByRole('button', { name: 'Move 7 pc' })).toBeEnabled();
  });
  it('no preview above what is on hand: a warn line says how much can move', () => {
    form();
    pick('Move to', 'bt'); amount('20');
    expect(screen.queryByTestId('move-preview')).toBeNull();
    expect(screen.getByText('Kitchen towel has 14 pc. Move 14 or fewer.')).toHaveClass('text-warn');
    amount('14'); expect(screen.getByTestId('move-preview').textContent).toBe('Kitchen towel 14 → 0 · Bathroom tissue 5 → 19');
    amount('0'); expect(screen.queryByTestId('move-preview')).toBeNull();
  });
  it('a transport error rereads the shelves, since the move may have committed', async () => {
    h.answers.push(new Error('network'));
    const spy = vi.spyOn(client, 'invalidateQueries');
    form();
    pick('Move to', 'bt'); amount('7'); submit();
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(spy).toHaveBeenCalledWith({ queryKey: ['catalogue'] });
  });
  it('starts at 1, the + stops at what is on hand, and the button is off at 0, above on-hand and with no target', () => {
    form();
    expect(screen.getByLabelText('Amount')).toHaveValue('1');
    expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled(); // no target yet
    pick('Move to', 'bt');
    amount('13');
    fireEvent.click(screen.getByRole('button', { name: 'One more' }));
    expect(screen.getByLabelText('Amount')).toHaveValue('14');
    expect(screen.getByRole('button', { name: 'One more' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'One less' }));
    expect(screen.getByLabelText('Amount')).toHaveValue('13');
    amount('0'); expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled();
    amount('15'); expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled();
    amount('1.234'); expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled();
    amount('2.5'); expect(screen.getByRole('button', { name: 'Move 2.5 pc' })).toBeEnabled();
  });
  it('sends the ids, amount and key; keeps the same key on a retry after an error; renews it after success', async () => {
    h.answers.push(new Error('network'), { ok: true, moveId: 'm1' }, { ok: true, moveId: 'm2' });
    form();
    pick('Move to', 'bt'); amount('7');
    submit();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('The server did not answer. Try again.'));
    submit();
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(h.calls[0]!.slice(0, 4)).toEqual(['kt', 'bt', '7', null]);
    expect(h.calls[1]![4]).toBe(h.calls[0]![4]);
    expect(String(h.calls[0]![4]).length).toBeGreaterThanOrEqual(8);
    amount('7'); submit();
    await waitFor(() => expect(h.calls).toHaveLength(3));
    expect(h.calls[2]![4]).not.toBe(h.calls[0]![4]);
  });
  it('a refusal shows the sentence in red, and a changed amount gets a new key', async () => {
    h.answers.push({ ok: false, reason: 'not_enough', on_hand: '5' }, { ok: true, moveId: 'm1' });
    form();
    pick('Move to', 'bt'); amount('7'); submit();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Kitchen towel has 5 pc now. Move 5 or fewer.'));
    expect(screen.getByRole('alert')).toHaveClass('text-destructive');
    amount('5'); submit();
    await waitFor(() => expect(h.calls).toHaveLength(2));
    expect(h.calls[1]![4]).not.toBe(h.calls[0]![4]);
  });
  it('the toast says what moved and its Undo calls undo_inventory_move with the move id', async () => {
    h.answers.push({ ok: true, moveId: 'm9' });
    form();
    pick('Move to', 'bt'); amount('7'); submit();
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const [text, opts] = vi.mocked(toast.success).mock.calls[0] as unknown as [string, { duration: number; action: { label: string; onClick: () => void } }];
    expect(text).toBe('Moved 7 pc to Bathroom tissue');
    expect(opts.duration).toBe(8000);
    expect(opts.action.label).toBe('Undo');
    opts.action.onClick();
    await waitFor(() => expect(h.undo).toHaveLength(1));
    expect(h.undo[0]![0]).toBe('m9');
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Move undone'));
  });
  it('an undo the server refuses reads as the contract sentence', async () => {
    h.answers.push({ ok: true, moveId: 'm9' });
    h.undoAnswer = { ok: false, reason: 'not_enough', on_hand: '4' };
    form();
    pick('Move to', 'bt'); amount('7'); submit();
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    (vi.mocked(toast.success).mock.calls[0]![1] as unknown as { action: { onClick: () => void } }).action.onClick();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Bathroom tissue has 4 pc now, so the 7 cannot go back. Make a new move or count it.'));
  });
  it('the Counts version asks for From and To, and To follows the From unit', () => {
    form(null);
    expect(screen.getByLabelText('To')).toBeDisabled();
    pick('From', 'kt');
    const to = Array.from((screen.getByLabelText('To') as HTMLSelectElement).options).map((o) => o.textContent);
    expect(to).toEqual(['Choose an item', 'Bathroom tissue · 5 pc']);
    expect(screen.getByText('Only items with the same unit (pc) are listed.')).toHaveClass('text-warn');
  });
  it('every new control is at least 44 px high', () => {
    const { container } = form(null);
    pick('From', 'kt'); pick('To', 'bt');
    const controls = container.querySelectorAll('button, select, input');
    expect(controls.length).toBeGreaterThanOrEqual(6);
    for (const c of Array.from(controls)) expect(c.className, c.outerHTML.slice(0, 80)).toContain('min-h-11');
  });
  it('no exclamation mark anywhere in the form or its sentences', () => {
    const { container } = form(null);
    pick('From', 'kt'); pick('To', 'bt');
    expect(container.textContent).not.toContain('!');
    const ctx = { from: kt, to: bt, undo: { giver: 'Bathroom tissue', qty: '7', unit: 'pc' } };
    for (const reason of ['not_enough', 'unit_mismatch', 'inactive', 'movement_controlled', 'not_consumable', 'same_item', 'bad_qty', 'moved_since', 'key_conflict', 'item_not_found', 'something_new'])
      for (const c of [{ from: kt, to: bt }, ctx]) expect(refusalText({ ok: false, reason, on_hand: '4', item: 'to' }, c)).not.toContain('!');
  });
});

describe('refusal sentences (R1.9)', () => {
  const roll = { ...bt, unit: 'roll' } as Item;
  it('maps each reason to its sentence', () => {
    expect(refusalText({ ok: false, reason: 'not_enough', on_hand: '5' }, { from: kt, to: bt })).toBe('Kitchen towel has 5 pc now. Move 5 or fewer.');
    expect(refusalText({ ok: false, reason: 'unit_mismatch' }, { from: kt, to: roll })).toBe('These items use different units (pc and roll).');
    expect(refusalText({ ok: false, reason: 'inactive', item: 'to' }, { from: kt, to: bt })).toBe('Bathroom tissue is inactive.');
    expect(refusalText({ ok: false, reason: 'not_enough', on_hand: '4' }, { from: kt, to: bt, undo: { giver: 'Bathroom tissue', qty: '7', unit: 'pc' } })).toBe('Bathroom tissue has 4 pc now, so the 7 cannot go back. Make a new move or count it.');
    expect(refusalText({ ok: false, reason: 'moved_since' })).toBe('This row was moved again after. Undo the newest move first.');
    expect(refusalText({ ok: false, reason: 'key_conflict' })).toBe('Something changed. Close the panel and try again.');
  });
  it('an unknown reason gets a calm generic line', () => {
    expect(refusalText({ ok: false, reason: 'something_new' })).toBe('This could not be done. Nothing was changed.');
    expect(refusalText({ ok: false })).toBe('This could not be done. Nothing was changed.');
  });
});
