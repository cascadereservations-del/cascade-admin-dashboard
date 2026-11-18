import { supabase } from '@/lib/supabase';
import { rpc } from '@/lib/rpc';
import { newIdempotencyKey } from '@/lib/idempotency';
import { toAppError } from '@/lib/errors';
import { readCalendarEvents } from '@/features/bookings/calendar-reads';
import type { TimelineEvent } from './api';

// s119 lane A: "Who is staying" per stay (stay key = calendar_events.uid). Writes go through set_stay_staying_v1 and
// confirm_stay_staying_suggestion_v1 (migration 20261119000000_s119_staying). The read is admin_stay_staying_v1, which the
// SQL lane has yet to add (docs/s119/admin_stay_staying_v1.sql); until it exists the whole feature stays hidden.

export type StayStaying = { stay_uid: string; names: string | null; source: 'admin' | 'staff' | null; suggestion: string | null; version: number };
export type StayRow = { uid: string; checkin: string; checkout: string; kind: string; code: string };

export const STAYING_KEY = (propertyId: string) => ['stay-staying', propertyId];
export const NAMES_MAX = 300;

const missing = (e: { code?: string; status?: number; message?: string }) => e.code === 'PGRST202' || e.code === '42883' || e.status === 404 || /could not find the function/i.test(e.message ?? '');

/** One row per stay that has a record; null when the read function is not deployed (the feature hides itself). */
export async function fetchStayStaying(propertyId: string, uids: string[]): Promise<Map<string, StayStaying> | null> {
  const res = await supabase.rpc('admin_stay_staying_v1', { p_property: propertyId, p_uids: uids });
  if (res.error) {
    if (missing(res.error)) return null;
    throw toAppError(res.error);
  }
  const rows = (Array.isArray(res.data) ? res.data : (res.data as { rows?: StayStaying[] } | null)?.rows ?? []) as StayStaying[];
  return new Map(rows.map((r) => [r.stay_uid, r]));
}

/** The guest's bookings that can carry a staying value: stay events with a calendar uid (from the event, else the linked calendar row). */
export async function fetchStayRows(propertyId: string, events: TimelineEvent[]): Promise<StayRow[]> {
  const stays = events.filter((e) => e.kind === 'stay' && !/^(cancel|declin|void)/i.test(String(e.body.status ?? '')));
  let byReservation: Map<string, string> | null = null;
  if (stays.some((e) => !e.body.uid)) {
    const { data } = await readCalendarEvents<{ uid: string; linked_reservation_id: string | null; status: string }>(propertyId);
    byReservation = new Map((data ?? []).filter((c) => c.linked_reservation_id && c.status === 'confirmed').map((c) => [c.linked_reservation_id as string, c.uid]));
  }
  const rows: StayRow[] = [];
  for (const e of stays) {
    const uid = e.body.uid ? String(e.body.uid) : byReservation?.get(String(e.body.id));
    if (uid) rows.push({ uid, checkin: String(e.body.checkin), checkout: String(e.body.checkout), kind: String(e.body.stayKind ?? ''), code: String(e.body.code ?? '') });
  }
  return rows.sort((a, b) => b.checkin.localeCompare(a.checkin));
}

/** A fresh key whenever the names differ from the last ones sent; a retry of the same names reuses its key (replay-safe). */
export function keyFor(last: { key: string; names: string } | null, names: string): { key: string; names: string } {
  return last && last.names === names ? last : { key: newIdempotencyKey('staying'), names };
}

export function setStayStaying(propertyId: string, uid: string, names: string, version: number, key: string) {
  return rpc<{ ok: boolean; version?: number; names?: string | null; source?: string | null }>('set_stay_staying_v1', {
    p_property: propertyId, p_uid: uid, p_names: names, p_source: 'admin', p_expected_version: version, p_reason: 'Names typed in the admin', p_idempotency_key: key,
  });
}
export function confirmStayStaying(propertyId: string, uid: string, accept: boolean, version: number) {
  return rpc<{ ok: boolean; error?: string; names?: string | null; version?: number }>('confirm_stay_staying_suggestion_v1', {
    p_property: propertyId, p_uid: uid, p_accept: accept, p_expected_version: version, p_reason: accept ? 'Suggestion accepted in the admin' : 'Suggestion declined in the admin',
  });
}

export const MSG_CONTACT = 'Please leave phone numbers and e-mail addresses out. Type names only.';
export const MSG_GONE = 'That suggestion is no longer there.';
export const MSG_STALE = 'These names changed since you opened them. The latest is shown.';

/** Plain words for a refusal. `stale` (40001) means reload and show what is there now. */
export function stayingError(err: unknown): { stale: boolean; text: string } {
  const e = toAppError(err);
  const m = `${e.message} ${e.detail ?? ''}`;
  if (e.kind === 'conflict') return { stale: true, text: MSG_STALE };
  if (/names_contact/.test(m)) return { stale: false, text: MSG_CONTACT };
  if (/names_too_long/.test(m)) return { stale: false, text: `Keep the names under ${NAMES_MAX} characters.` };
  if (/stay_not_found/.test(m)) return { stale: false, text: 'This stay is no longer on the calendar.' };
  if (e.kind === 'forbidden') return { stale: false, text: 'You are not permitted to change who is staying.' };
  return { stale: false, text: 'The names could not be saved. Try again.' };
}
