import { beforeEach, describe, expect, it, vi } from 'vitest';

// Lane D fix 2: the shopping list comes from get_shopping_list_v1 (cost fields for finance sessions only); when the RPC is not
// deployed yet the old table select still works. Absent cost keys read as null, never 0.
const rpcCalls: Array<[string, Record<string, unknown>]> = [];
const state = vi.hoisted(() => ({ rpc: null as null | { data?: unknown; error?: unknown }, table: [] as unknown[], tableReads: 0 }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => { rpcCalls.push([fn, args]); return Promise.resolve({ data: null, error: null, ...state.rpc }); },
    from: (t: string) => {
      const chain: Record<string, unknown> = {};
      for (const n of ['select', 'eq', 'order', 'limit']) chain[n] = () => chain;
      chain.then = (ok: (v: unknown) => unknown) => { if (t === 'inventory_shopping_list') state.tableReads++; return Promise.resolve({ data: state.table, error: null }).then(ok); };
      return chain;
    },
  },
}));
import { fetchShoppingList, getItemMoves, moveStock, moveUsage, undoMove } from './api';

const row = { id: 'a', item_name: 'Soap', quantity: '2', status: 'proposed', proposed_at: '2026-10-13T00:00:00Z', version: 1 };
beforeEach(() => { rpcCalls.length = 0; state.tableReads = 0; state.table = []; });

describe('fetchShoppingList', () => {
  it('RPC present with costs: maps the rows and never reads the table', async () => {
    state.rpc = { data: { ok: true, rows: [{ ...row, estimated_cost: '120.00', supplier: 'Mart' }] } };
    const r = await fetchShoppingList('p1');
    expect(rpcCalls).toEqual([['get_shopping_list_v1', { p_property_id: 'p1' }]]);
    expect(r.rows[0]).toMatchObject({ item_name: 'Soap', estimated_cost: '120.00', supplier: 'Mart' });
    expect(state.tableReads).toBe(0);
  });
  it('RPC present without costs: the cost fields are null (a dash), not 0', async () => {
    state.rpc = { data: { ok: true, rows: [row] } };
    const r = await fetchShoppingList('p1');
    expect(r.rows[0]!.estimated_cost).toBeNull();
    expect(r.rows[0]!.supplier).toBeNull();
    expect(r.total).toBe(1);
  });
  it('RPC missing (PGRST202, then a 404): falls back to the old select', async () => {
    state.table = [{ ...row, estimated_cost: '5' }];
    state.rpc = { error: { code: 'PGRST202', message: 'Could not find the function' } };
    expect((await fetchShoppingList('p1')).rows[0]!.item_name).toBe('Soap');
    state.rpc = { error: { status: 404, message: 'Not Found' } };
    expect((await fetchShoppingList('p1')).rows).toHaveLength(1);
    expect(state.tableReads).toBe(2);
  });
  it('a real refusal is not swallowed by the fallback', async () => {
    state.rpc = { error: { code: '42501', message: 'permission denied' } };
    await expect(fetchShoppingList('p1')).rejects.toMatchObject({ kind: 'forbidden' });
    expect(state.tableReads).toBe(0);
  });
});

describe('s122 move RPCs send the contract argument names', () => {
  it('stock, usage, undo and the read', async () => {
    state.rpc = { data: { ok: true } };
    await moveStock('a', 'b', '7', null, 'move-key-0001');
    await moveUsage('u', 'b', 'moveuse-key-0001');
    await undoMove('m', 'undomove-key-0001');
    await getItemMoves('a');
    expect(rpcCalls).toEqual([
      ['move_inventory_stock_v1', { p_from: 'a', p_to: 'b', p_qty: '7', p_note: null, p_idempotency_key: 'move-key-0001' }],
      ['move_inventory_usage_v1', { p_usage_id: 'u', p_to: 'b', p_idempotency_key: 'moveuse-key-0001' }],
      ['undo_inventory_move_v1', { p_move_id: 'm', p_idempotency_key: 'undomove-key-0001' }],
      ['get_inventory_item_moves_v1', { p_item_id: 'a' }],
    ]);
  });
});
