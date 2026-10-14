import { supabase } from '@/lib/supabase';
import { toAppError } from '@/lib/errors';

// S84 D: calendar_events.guest_phone / raw_summary / raw_description are no longer granted for direct reads (cleaners lose them,
// and the column grant also reaches owners). Owner/admin reads go through two RPCs. The site may ship before the SQL: when an RPC
// is absent (PGRST202 / 42883 / 404) fall back to today's direct select. A 42501 is never a reason to fall back.
// All names and argument keys live here, in one place.
export const CAL_LIST_RPC = 'admin_calendar_events_v1';
export const CAL_ONE_RPC = 'admin_calendar_event_v1';
export const CAL_LIST_COLUMNS = 'id, uid, source, checkin_date, checkout_date, guest_name, status, linked_reservation_id, synced_at, raw_summary';

type Err = { code?: string; status?: number; message?: string };
const rpcMissing = (e: Err) => e.code === 'PGRST202' || e.code === '42883' || e.status === 404 || /could not find the function/i.test(e.message ?? '');

// The RPC may return the rows bare or wrapped as { ok, rows }.
function asRows<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  const b = data as { ok?: boolean; rows?: T[] } | null;
  if (b && b.ok === false) throw toAppError({ code: '42501', message: 'not authorized' });
  return b?.rows ?? [];
}

export async function readCalendarEvents<T>(propertyId: string): Promise<{ data: T[] | null; error: unknown }> {
  const res = await supabase.rpc(CAL_LIST_RPC, { p_property_id: propertyId });
  if (!res.error) return { data: asRows<T>(res.data), error: null };
  if (!rpcMissing(res.error as Err)) return { data: null, error: res.error };
  return supabase.from('calendar_events').select(CAL_LIST_COLUMNS).eq('property_id', propertyId).order('checkin_date', { ascending: false }).limit(1000) as unknown as Promise<{ data: T[] | null; error: unknown }>;
}

export async function readCalendarEvent<T>(id: string): Promise<{ data: T | null; error: unknown }> {
  const res = await supabase.rpc(CAL_ONE_RPC, { p_id: id });
  if (!res.error) {
    const d = res.data as (T & { ok?: boolean; row?: T }) | null;
    if (d && d.ok === false) return { data: null, error: { code: '42501', message: 'not authorized' } };
    return { data: (d && d.row ? d.row : d) as T | null, error: null };
  }
  if (!rpcMissing(res.error as Err)) return { data: null, error: res.error };
  return supabase.from('calendar_events').select('*').eq('id', id).maybeSingle() as unknown as Promise<{ data: T | null; error: unknown }>;
}
