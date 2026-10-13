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
};
export type Catalogue = { items: Item[]; sourceAsOf: string | null; forecastNote: string; turnoverRatePerDay: number };

export function fetchCatalogue(propertyId: string) {
  return rpc<Catalogue>('get_inventory_catalogue_v1', { p_property_id: propertyId });
}

export type Movement = { id: string; item_id: string; sequence_no: number; kind: string; quantity_before: string; quantity_after: string; reason: string; actor_user_id: string | null; created_at: string };
export async function fetchMovements(itemId: string) {
  return unwrapList<Movement>(await supabase.from('inventory_stock_movements').select('*').eq('item_id', itemId).order('sequence_no', { ascending: false }).limit(100));
}

export function reconcileBaseline(itemId: string, countedQty: string, note: string, key = newIdempotencyKey('baseline')) {
  return rpc<{ ok: boolean; before: string; after: string; variance: string }>('reconcile_inventory_baseline_v1', { p_item_id: itemId, p_counted_qty: countedQty, p_note: note, p_idempotency_key: key });
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
const rpcMissing = (e: { code?: string; status?: number; message?: string }) => e.code === 'PGRST202' || e.code === '42883' || e.status === 404 || /could not find the function/i.test(e.message ?? '');
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
