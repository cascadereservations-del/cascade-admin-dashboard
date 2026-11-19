import { supabase } from '@/lib/supabase';
import { rpc, unwrapList } from '@/lib/rpc';
import { toAppError } from '@/lib/errors';
import { newIdempotencyKey } from '@/lib/idempotency';

// Inventory adapter (P16-P18). Catalogue via get_inventory_catalogue_v1
// (server-computed coverage); all stock changes via the one movement path.

export type Item = {
  id: string; name: string; category: string; unit: string; qty: string; reorderBelow: string | null; consumable: boolean; active: boolean; status: string | null;
  unitCost: string | null; purchaseUnit: string | null; unitsPerPurchase: string | null; photo: string | null; movementControlled: boolean; baselineNote: string | null;
  usage30d: string | null; usageDays: number | null; avgDaily: string | null; coverageDays: string | null; attention: boolean;
  // Estimated fallback (D-137 follow-up) for when coverageDays has no real
  // usage history yet: consumption_per_booking x the recent turnover rate.
  // Always label this as an estimate in the UI - never present it as measured.
  estDailyUsage: string | null; estCoverageDays: string | null;
  // s120 usage learning. All optional: before the SQL release the catalogue carries none of these keys and the screens keep their old layout.
  usageState?: 'baseline' | 'learning' | 'measured' | null; usagePerTurnover?: string | number | null; usageBaseline?: string | number | null;
  lastRefillAt?: string | null; lastRefillQty?: string | number | null; lastCountAt?: string | null; usageCounts?: number | null;
};
export type Catalogue = { items: Item[]; sourceAsOf: string | null; forecastNote: string; turnoverRatePerDay: number };

export function fetchCatalogue(propertyId: string) {
  return rpc<Catalogue>('get_inventory_catalogue_v1', { p_property_id: propertyId });
}

// Usage-learning KPI (s120). The admin may ship before the SQL: only a missing function (PGRST202, 42883) reads as null and the card stays hidden. A refusal (42501) is an error.
export type UsageKpi = {
  itemsTotal: number; itemsMeasured: number; itemsLearning: number; medianForecastError: number | null; forecastSamples: number;
  underFourteenDays: { count: number; items: Array<{ id: string; name: string; daysLeft: number | null }> };
  waitingForRefill: { count: number; items: Array<{ id: string; name: string; since: string | null; qtyBefore: string | number | null; qtyNow: string | number | null }> };
};
const rpcMissing = (e: { code?: string; status?: number; message?: string }) => e.code === 'PGRST202' || e.code === '42883' || e.status === 404 || /could not find the function/i.test(e.message ?? '');
const kpiMissing = (e: { code?: string }) => e.code === 'PGRST202' || e.code === '42883';
const count = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
export async function fetchUsageKpi(propertyId: string): Promise<UsageKpi | null> {
  const res = await supabase.rpc('get_inventory_usage_kpi_v1', { p_property_id: propertyId });
  if (res.error) {
    if (kpiMissing(res.error as { code?: string })) return null;
    throw toAppError(res.error);
  }
  const b = res.data as (Partial<UsageKpi> & { ok?: boolean }) | null;
  if (!b || b.ok === false) return null;
  const err = b.medianForecastError;
  return {
    itemsTotal: count(b.itemsTotal), itemsMeasured: count(b.itemsMeasured), itemsLearning: count(b.itemsLearning), forecastSamples: count(b.forecastSamples),
    medianForecastError: err === null || err === undefined || !Number.isFinite(Number(err)) ? null : Number(err),
    underFourteenDays: { count: count(b.underFourteenDays?.count), items: b.underFourteenDays?.items ?? [] },
    waitingForRefill: { count: count(b.waitingForRefill?.count), items: b.waitingForRefill?.items ?? [] },
  };
}

export type Movement = { id: string; item_id: string; sequence_no: number; kind: string; quantity_before: string; quantity_after: string; reason: string; actor_user_id: string | null; created_at: string };
export async function fetchMovements(itemId: string) {
  return unwrapList<Movement>(await supabase.from('inventory_stock_movements').select('*').eq('item_id', itemId).order('sequence_no', { ascending: false }).limit(100));
}

export function reconcileBaseline(itemId: string, countedQty: string, note: string, key = newIdempotencyKey('baseline')) {
  return rpc<{ ok: boolean; before: string; after: string; variance: string }>('reconcile_inventory_baseline_v1', { p_item_id: itemId, p_counted_qty: countedQty, p_note: note, p_idempotency_key: key });
}

// A missed refill is record-only: it corrects the usage record and never writes stock or a purchase (server: record_missed_refill_v1).
export type MissedRefillResult = { ok: boolean; reason?: string; minimum?: string | number | null; replayed?: boolean };
export function recordMissedRefill(itemId: string, qty: string) {
  return rpc<MissedRefillResult>('record_missed_refill_v1', { p_item_id: itemId, p_qty: qty });
}

export function recordAdjustment(itemId: string, delta: string, reason: string, key = newIdempotencyKey('adjust')) {
  return rpc<string>('record_inventory_movement', { p_item_id: itemId, p_kind: 'adjustment', p_quantity: delta, p_reason: reason, p_idempotency_key: key });
}

export function recordReceipt(itemId: string, packs: string, unitCost: string | null, supplier: string | null, purchasedAt: string, shoppingListId: string | null, key = newIdempotencyKey('receipt')) {
  return rpc<{ ok: boolean; purchaseId: string; movementId: string | null; unitsAdded: string; controlled: boolean }>('record_inventory_receipt_v1', {
    p_item_id: itemId, p_packs: packs, p_unit_cost: unitCost, p_supplier: supplier, p_purchased_at: purchasedAt, p_receipt_path: null, p_shopping_list_id: shoppingListId, p_idempotency_key: key,
  });
}

export type ShoppingItem = { id: string; item_id: string | null; item_name: string; quantity: string; purchase_unit: string | null; estimated_cost: string | null; reason: string | null; status: string; proposed_at: string; approved_at: string | null; approval_note: string | null; received_at: string | null; received_quantity: string | null; supplier: string | null; version: number };
// S82: the cost columns (estimated_cost, supplier) are no longer granted for direct reads; get_shopping_list_v1 returns them to finance sessions only.
// The dashboard may ship before the database: when the RPC is missing (PGRST202 / 404) fall back to the old select. Absent cost keys read as null (the page shows a dash).
export async function fetchShoppingList(propertyId: string) {
  const res = await supabase.rpc('get_shopping_list_v1', { p_property_id: propertyId });
  if (res.error && !rpcMissing(res.error as { code?: string; status?: number; message?: string })) throw toAppError(res.error);
  if (!res.error) {
    const body = res.data as { ok?: boolean; rows?: Array<Partial<ShoppingItem>> } | null;
    if (!body || body.ok === false) throw toAppError({ code: '42501', message: 'not authorized' });
    const rows = (body.rows ?? []).map((r) => ({ ...r, estimated_cost: r.estimated_cost ?? null, supplier: r.supplier ?? null }) as ShoppingItem);
    return { rows, total: rows.length };
  }
  return unwrapList<ShoppingItem>(await supabase.from('inventory_shopping_list').select('*').eq('property_id', propertyId).order('proposed_at', { ascending: false }).limit(200));
}
export function saveShoppingItem(propertyId: string, item: Record<string, unknown>, key = newIdempotencyKey('shop')) {
  return rpc<{ ok: boolean; id: string; status: string }>('save_shopping_item_v1', { p_property_id: propertyId, p_item: item, p_idempotency_key: key });
}

export type Purchase = { id: string; item_id: string | null; purchased_at: string; qty: string; unit_cost: string | null; total_cost: string | null; supplier: string | null; notes: string | null; purchase_unit: string | null; units_per_purchase: number };
export async function fetchItemPurchases(itemId: string) {
  return unwrapList<Purchase>(await supabase.from('inventory_purchases').select('*').eq('item_id', itemId).order('purchased_at', { ascending: false }).limit(50));
}
export async function fetchPurchases(propertyId: string) {
  const items = await supabase.from('inventory_items').select('id, name').eq('property_id', propertyId);
  const ids = (items.data ?? []).map((i) => i.id);
  const res = await supabase.from('inventory_purchases').select('*').in('item_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']).order('purchased_at', { ascending: false }).limit(200);
  const names = new Map((items.data ?? []).map((i) => [i.id, i.name]));
  const list = unwrapList<Purchase>(res);
  return { ...list, names };
}

// s122 move stock to another item (D-383). A refusal comes back as { ok:false, reason } and writes nothing; only a thrown error is a transport or permission failure.
type Num = string | number;
export type MoveSide = { id: string; name: string; before: Num; after: Num };
export type MoveResult = { ok: boolean; reason?: string; item?: 'from' | 'to'; on_hand?: Num; onHand?: Num; moveId?: string; from?: MoveSide; to?: MoveSide; qty?: Num; replayed?: boolean };
export function moveStock(fromId: string, toId: string, qty: string, note: string | null, key = newIdempotencyKey('move')) {
  return rpc<MoveResult>('move_inventory_stock_v1', { p_from: fromId, p_to: toId, p_qty: qty, p_note: note, p_idempotency_key: key });
}
export function moveUsage(usageId: string, toId: string, key = newIdempotencyKey('moveuse')) {
  return rpc<MoveResult>('move_inventory_usage_v1', { p_usage_id: usageId, p_to: toId, p_idempotency_key: key });
}
export function undoMove(moveId: string, key = newIdempotencyKey('undomove')) {
  return rpc<MoveResult>('undo_inventory_move_v1', { p_move_id: moveId, p_idempotency_key: key });
}
export type ItemMove = { id: string; kind: 'stock' | 'usage'; direction: 'in' | 'out'; otherItem: string; qty: Num; at: string; undone: boolean; undoOf: string | null; canUndo: boolean; actor: string | null };
export type ItemUsageRow = { id: string; date: string; qty: Num; loggedBy: string | null; movedFrom: string | null };
export type ItemMoves = { ok: boolean; moves: ItemMove[]; usage: ItemUsageRow[]; counts: Array<{ at: string; qty: Num }> };
export function getItemMoves(itemId: string) {
  return rpc<ItemMoves>('get_inventory_item_moves_v1', { p_item_id: itemId });
}
