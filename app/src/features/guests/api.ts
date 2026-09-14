import { supabase } from '@/lib/supabase';
import { rpc, unwrapList } from '@/lib/rpc';
import { newIdempotencyKey } from '@/lib/idempotency';

// Guests adapter (P19/P20). Profiles extend `guests` via guest_profile_details;
// the timeline is server-assembled and permission-filtered.

export type GuestRow = { id: string; name: string; phone: string | null; email: string | null; source: string; tier: string | null; total_stays: number | null; total_nights_stayed: number | null; first_stay_date: string | null; last_stay_date: string | null; is_active: boolean; created_at: string; updated_at: string; notes: string | null };
export type ProfileDetails = { guest_id: string; display_name: string | null; preferred_channel: string | null; language: string | null; messenger_psid: string | null; messenger_link: string | null; stay_preferences: string | null; tags: string[]; vip: boolean; vip_reason: string | null; contact_provenance: Record<string, unknown>; updated_at: string; version: number };

export async function fetchGuests(propertyId: string, f: { q?: string; tier?: string; page?: string }) {
  let q = supabase.from('guests').select('*', { count: 'exact' }).eq('property_id', propertyId).eq('is_active', true).order('last_stay_date', { ascending: false, nullsFirst: false });
  if (f.q) q = q.or(`name.ilike.%${f.q}%,phone.ilike.%${f.q}%,email.ilike.%${f.q}%`);
  if (f.tier) q = q.eq('tier', f.tier);
  const page = Number(f.page) || 1;
  const res = await q.range((page - 1) * 25, page * 25 - 1);
  return { ...unwrapList<GuestRow>(res), page };
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

export function previewMerge(surviving: string, merged: string) {
  return rpc<Record<string, unknown>>('preview_guest_merge_v1', { p_surviving: surviving, p_merged: merged });
}
export function mergeGuests(surviving: string, merged: string, reason: string, key = newIdempotencyKey('merge')) {
  return rpc<{ ok: boolean }>('merge_guests_v1', { p_surviving: surviving, p_merged: merged, p_reason: reason, p_idempotency_key: key });
}
