import { supabase } from '@/lib/supabase';
import { rpc, unwrapList } from '@/lib/rpc';
import { newIdempotencyKey } from '@/lib/idempotency';
import { guestPage, guestSearchPattern, validateProfilePatch } from './validation';
import { validateIdPhoto } from './local-records';

// Guests adapter (P19/P20). Profiles extend `guests` via guest_profile_details;
// the timeline is server-assembled and permission-filtered.

export type GuestRow = { id: string; name: string; phone: string | null; email: string | null; source: string; tier: string | null; total_stays: number | null; total_nights_stayed: number | null; first_stay_date: string | null; last_stay_date: string | null; is_active: boolean; created_at: string; updated_at: string; notes?: string | null; id_on_file?: boolean; birthday?: string | null; has_companions?: boolean; has_contact_number?: boolean };
export type ProfileDetails = { guest_id: string; display_name: string | null; preferred_channel: string | null; language: string | null; messenger_psid: string | null; messenger_link: string | null; stay_preferences: string | null; tags: string[]; vip: boolean; vip_reason: string | null; contact_provenance: Record<string, unknown>; updated_at: string; version: number; contact_number?: string | null; birthday?: string | null; address?: string | null; airbnb_profile_id?: string | null; id_on_file?: boolean; id_type?: string | null; id_number?: string | null; id_drive_url?: string | null; id_verified_at?: string | null };

export type GuestFlag = 'id_on_file' | 'missing_details' | 'upcoming_birthday' | 'repeat' | 'has_companions';
const GUEST_FLAGS: readonly GuestFlag[] = ['id_on_file', 'missing_details', 'upcoming_birthday', 'repeat', 'has_companions'];

export function daysToNextBirthday(birthday: string, today = new Date()): number {
  const parts = birthday.split('-');
  const m = Number(parts[1] ?? 1);
  const d = Number(parts[2] ?? 1);
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  let next = Date.UTC(today.getUTCFullYear(), m - 1, d);
  if (next < now) next = Date.UTC(today.getUTCFullYear() + 1, m - 1, d);
  return Math.round((next - now) / 86_400_000);
}

// Flags that need a row-set computed ahead of the paged fetch (PostgREST can't
// filter cleanly on an embedded to-one relation's boolean via the query builder,
// and birthday proximity needs date math). The property has well under a
// thousand guests, so one small unpaginated helper query per flag is cheap and
// keeps the total/page count exact rather than filtering only within one page.
async function guestIdsForFlag(propertyId: string, flag: GuestFlag): Promise<string[] | null> {
  if (flag === 'id_on_file' || flag === 'missing_details') {
    const { data, error } = await supabase.from('guest_profile_details').select('guest_id, id_on_file, contact_number');
    if (error) throw error;
    const hasDetails = new Set((data ?? []).filter((r) => r.id_on_file || r.contact_number).map((r) => r.guest_id));
    if (flag === 'id_on_file') return [...hasDetails];
    const { data: all, error: e2 } = await supabase.from('guests').select('id').eq('property_id', propertyId).eq('is_active', true);
    if (e2) throw e2;
    return (all ?? []).map((g) => g.id).filter((id) => !hasDetails.has(id));
  }
  if (flag === 'upcoming_birthday') {
    const { data, error } = await supabase.from('guest_profile_details').select('guest_id, birthday').not('birthday', 'is', null);
    if (error) throw error;
    return (data ?? []).filter((r) => r.birthday && daysToNextBirthday(r.birthday) <= 30).map((r) => r.guest_id);
  }
  if (flag === 'has_companions') {
    const { data, error } = await supabase.from('guest_companions').select('guest_id');
    if (error) throw error;
    return [...new Set((data ?? []).map((r) => r.guest_id))];
  }
  return null; // 'repeat' is a plain column filter on `guests`, no id-set needed
}

export async function fetchGuests(propertyId: string, f: { q?: string; tier?: string; page?: string; flag?: string }) {
  const page = guestPage(f.page);
  const pattern = f.q ? guestSearchPattern(f.q) : null;
  if (f.q?.trim() && !pattern) return { rows: [] as GuestRow[], total: 0, page };
  const flag = GUEST_FLAGS.find((v) => v === f.flag);
  let q = supabase.from('guests').select('id,name,phone,email,source,tier,total_stays,total_nights_stayed,first_stay_date,last_stay_date,is_active,created_at,updated_at,guest_profile_details(id_on_file,birthday,contact_number)', { count: 'exact' }).eq('property_id', propertyId).eq('is_active', true).order('last_stay_date', { ascending: false, nullsFirst: false }).order('id');
  if (pattern) q = q.or(`name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern}`);
  if (f.tier) q = q.eq('tier', f.tier);
  if (flag === 'repeat') q = q.gt('total_stays', 1);
  else if (flag) {
    const ids = await guestIdsForFlag(propertyId, flag);
    if (ids && ids.length === 0) return { rows: [] as GuestRow[], total: 0, page };
    if (ids) q = q.in('id', ids);
  }
  const res = await q.range((page - 1) * 25, page * 25 - 1);
  if (res.error) throw res.error;
  const companionIds = new Set(await guestIdsForFlag(propertyId, 'has_companions'));
  type Details = { id_on_file: boolean | null; birthday: string | null; contact_number: string | null };
  type RawRow = GuestRow & { guest_profile_details: Details | Details[] | null };
  const rows: GuestRow[] = ((res.data ?? []) as RawRow[]).map((r) => {
    const details = Array.isArray(r.guest_profile_details) ? r.guest_profile_details[0] : r.guest_profile_details;
    const { guest_profile_details: _drop, ...rest } = r;
    return { ...rest, id_on_file: details?.id_on_file ?? false, birthday: details?.birthday ?? null, has_companions: companionIds.has(r.id), has_contact_number: !!details?.contact_number };
  });
  return { rows, total: res.count ?? rows.length, page };
}

export async function fetchGuest(id: string) {
  const [g, d] = await Promise.all([supabase.from('guests').select('*').eq('id', id).single(), supabase.from('guest_profile_details').select('*').eq('guest_id', id).maybeSingle()]);
  if (g.error) throw g.error;
  return { guest: g.data as GuestRow, details: (d.data as ProfileDetails | null) ?? null, detailsError: d.error ? d.error.message : null };
}

export type TimelineEvent = { kind: string; at: string; source: string; body: Record<string, unknown> };
export function fetchTimeline(guestId: string) {
  return rpc<{ guestId: string; financeVisible: boolean; events: TimelineEvent[] }>('get_guest_timeline_v1', { p_guest_id: guestId });
}

export function saveProfile(guestId: string, patch: Record<string, unknown>, expectedVersion: number | null, reason: string) {
  validateProfilePatch(patch, reason);
  return rpc<{ ok: boolean; version: number; updatedAt: string }>('save_guest_profile_v1', { p_guest_id: guestId, p_patch: patch, p_expected_version: expectedVersion, p_reason: reason });
}

export type FollowUp = { id: string; guest_id: string | null; booking_kind: string | null; booking_id: string | null; purpose: string; title: string; detail: string | null; assignee_user_id: string | null; due_at: string | null; priority: string; status: string; completion_note: string | null; completed_at: string | null; created_at: string; version: number };
export async function fetchFollowUps(propertyId: string, guestId?: string) {
  let q = supabase.from('follow_up_tasks').select('*').eq('property_id', propertyId).order('status').order('due_at', { ascending: true, nullsFirst: false });
  if (guestId) q = q.eq('guest_id', guestId);
  return unwrapList<FollowUp>(await q.limit(200));
}
export function saveFollowUp(propertyId: string, task: Record<string, unknown>, key = newIdempotencyKey('task')) {
  return rpc<{ ok: boolean; id: string; version: number; status: string; completedAt: string | null }>('save_follow_up_v1', { p_property_id: propertyId, p_task: task, p_idempotency_key: key });
}

export type Handoff = { id: string; psid: string; guest_name: string | null; guest_text: string | null; risk: string | null; status: string; created_at: string; resolved_by: string | null; resolved_at: string | null };
export async function fetchHandoffs() {
  return unwrapList<Handoff>(await supabase.from('concierge_handoffs').select('*').order('created_at', { ascending: false }).limit(50));
}

// Guests tab sub-tabs (session-13 step 4): Inquiries reads booking_inquiries directly rather than
// duplicating the Bookings adapter; the Inquiries tab links out to Bookings for full management.
export type Inquiry = { id: string; guest_name: string; guest_phone: string | null; guest_email: string | null; checkin_date: string; checkout_date: string; nights: number | null; pax: number | null; total_amount: string | null; status: string; submitted_at: string; guest_id: string | null };
export async function fetchInquiries(propertyId: string) {
  return unwrapList<Inquiry>(await supabase.from('booking_inquiries').select('id, guest_name, guest_phone, guest_email, checkin_date, checkout_date, nights, pax, total_amount, status, submitted_at, guest_id').eq('property_id', propertyId).order('submitted_at', { ascending: false }).limit(100));
}

// Companions (Lloyd, 2026-09-14): people on a stay besides the booker. ID
// photo bytes are uploaded straight from the browser to the private
// guest-id-photos bucket; only the resulting storage path is saved on the row.
export type Companion = { id: string; guest_id: string; name: string; contact_number: string | null; id_type: string | null; id_number: string | null; id_photo_path: string | null; notes: string | null; created_at: string; updated_at: string; version: number };
export async function listGuestCompanions(guestId: string) {
  return rpc<Companion[]>('list_guest_companions_v1', { p_guest_id: guestId });
}
export function saveGuestCompanion(guestId: string, companionId: string | null, patch: Record<string, unknown>, expectedVersion: number | undefined, reason: string) {
  return rpc<{ ok: boolean; id: string; version: number }>('save_guest_companion_v1', { p_guest_id: guestId, p_companion_id: companionId, p_patch: patch, p_expected_version: expectedVersion ?? null, p_reason: reason });
}
export function deleteGuestCompanion(companionId: string, reason: string) {
  return rpc<{ ok: boolean; id: string }>('delete_guest_companion_v1', { p_companion_id: companionId, p_reason: reason });
}
export async function uploadCompanionIdPhoto(companionId: string, file: File) {
  const mime = await validateIdPhoto(file);
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mime];
  const path = `${companionId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('guest-id-photos').upload(path, file, { upsert: false, contentType: mime });
  if (error) throw error;
  return path;
}
export async function companionIdPhotoUrl(path: string) {
  const { data, error } = await supabase.storage.from('guest-id-photos').createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}

export function previewMerge(surviving: string, merged: string) {
  return rpc<Record<string, unknown>>('preview_guest_merge_v1', { p_surviving: surviving, p_merged: merged });
}
export function mergeGuests(surviving: string, merged: string, reason: string, key = newIdempotencyKey('merge')) {
  return rpc<{ ok: boolean }>('merge_guests_v1', { p_surviving: surviving, p_merged: merged, p_reason: reason, p_idempotency_key: key });
}
