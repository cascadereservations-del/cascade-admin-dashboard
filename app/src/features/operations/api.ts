import { supabase } from '@/lib/supabase';
import { rpc, unwrapList } from '@/lib/rpc';
import { newIdempotencyKey } from '@/lib/idempotency';
import { assertMutationEnabled } from '@/lib/rollout';

// Operations adapter (P13-P15). Cleaning reads use the RLS-protected
// cleaning_sessions / meter_readings / cleaning_verification_evidence tables;
// review and readiness writes go through the deployed and v1 RPCs.

export type CleaningRow = {
  id: string;
  submission_id: string;
  cleaner_name: string;
  cleaned_at: string;
  last_guest_name: string | null;
  checkin_date: string | null;
  checkout_date: string | null;
  cleaning_type: string | null;
  completion_pct: string | null;
  is_complete: boolean | null;
  incomplete_reasons: string[] | null;
  issue_count: number | null;
  total_photo_count: number | null;
  meter_photo_count: number | null;
  fee_amount: string | null;
  fee_paid_at: string | null;
  fee_txn_id: string | null;
  employee_id: string | null;
  notes: string | null;
};

export type CleaningFilters = { q?: string; state?: string; fees?: string; from?: string; to?: string; page?: string };

export async function fetchCleanings(propertyId: string, f: CleaningFilters, canFees: boolean) {
  const cols = 'id, submission_id, cleaner_name, cleaned_at, last_guest_name, checkin_date, checkout_date, cleaning_type, completion_pct, is_complete, incomplete_reasons, issue_count, total_photo_count, meter_photo_count, employee_id, notes' + (canFees ? ', fee_amount, fee_paid_at, fee_txn_id' : '');
  let q = supabase.from('cleaning_sessions').select(cols, { count: 'exact' }).eq('property_id', propertyId).order('cleaned_at', { ascending: false });
  if (f.q) q = q.or(`last_guest_name.ilike.%${f.q}%,cleaner_name.ilike.%${f.q}%,submission_id.ilike.%${f.q}%`);
  if (f.state === 'incomplete') q = q.eq('is_complete', false);
  if (f.state === 'complete') q = q.eq('is_complete', true);
  if (f.state === 'issues') q = q.gt('issue_count', 0);
  if (f.fees === 'unpaid' && canFees) q = q.gt('fee_amount', 0).is('fee_paid_at', null);
  if (f.from) q = q.gte('cleaned_at', f.from);
  if (f.to) q = q.lt('cleaned_at', f.to);
  const page = Number(f.page) || 1;
  q = q.range((page - 1) * 25, page * 25 - 1);
  const res = await q;
  const list = unwrapList<CleaningRow>(res as unknown as { data: CleaningRow[] | null; error: unknown; count: number | null });
  return { ...list, page, pageSize: 25, sourceAsOf: list.rows[0]?.cleaned_at ?? null };
}

export type CleaningDetail = {
  session: CleaningRow & { checklist_details: unknown; preclean_photo_count: number | null; afterclean_photo_count: number | null; other_photo_count: number | null };
  meters: Array<{ id: string; electric_prev: string | null; electric_curr: string | null; electric_delta: string | null; water_prev: string | null; water_curr: string | null; water_delta: string | null; kwh_per_night: string | null; m3_per_night: string | null; meter_flag: string | null; meter_override_note: string | null; recorded_at: string }>;
  evidence: Array<{ id: string; evidence_kind: string; advisory_result: string | null; advisory_reason_codes: string[] | null; created_at: string; reviews: Array<{ id: string; outcome: string; reason: string | null; reviewed_at: string; reviewer_user_id: string }> }>;
  readiness: Array<{ id: string; for_checkin_date: string; outcome: string; reason: string | null; reviewed_at: string; reviewer_user_id: string }>;
  photos: Array<{ name: string; created_at: string | null; size: number | null; url: string | null; section: 'before' | 'after' | 'meter' | 'other' }> | 'unavailable';
};

// Photos upload under {propertyId}/{uploaderUserId}/{submissionId}/... (see
// upload-photo/index.ts) but cleaning_sessions doesn't reliably record the
// uploader (employee_id is null on 38/39 sessions). Staff are few, so probe
// each property-level subfolder for one holding this submission's id.
async function findPhotoFolder(propertyId: string, submissionId: string): Promise<string | null> {
  const { data: dirs } = await supabase.storage.from('cleaning-photos').list(propertyId, { limit: 100 });
  for (const dir of dirs ?? []) {
    if (dir.id) continue; // a file, not a subfolder
    const path = `${propertyId}/${dir.name}/${submissionId}`;
    const { data } = await supabase.storage.from('cleaning-photos').list(path, { limit: 1 });
    if (data && data.length > 0) return path;
  }
  return null;
}

// ponytail: filenames carry a readable keyword (e.g. "afterclean_2026-...",
// "kitchen_2026-...") but not the exact section_* key submit-cleaning grouped
// them under. A substring match is enough to tell meter photos apart from the
// rest, which is the only distinction the Meters review UI actually needs.
function classifyPhoto(name: string): 'before' | 'after' | 'meter' | 'other' {
  const n = name.toLowerCase();
  if (n.includes('meter')) return 'meter';
  if (n.includes('afterclean')) return 'after';
  if (n.includes('preclean') || n.includes('before')) return 'before';
  return 'other';
}

export async function fetchCleaningDetail(propertyId: string, id: string, canFees: boolean): Promise<CleaningDetail> {
  const { data: session, error } = await supabase.from('cleaning_sessions').select('*').eq('id', id).eq('property_id', propertyId).single();
  if (error) throw error;
  const sess = session as unknown as CleaningDetail['session'];
  if (!canFees) {
    sess.fee_amount = null;
    sess.fee_paid_at = null;
    sess.fee_txn_id = null;
  }
  const [m, e, r] = await Promise.all([
    supabase.from('meter_readings').select('id, electric_prev, electric_curr, electric_delta, water_prev, water_curr, water_delta, kwh_per_night, m3_per_night, meter_flag, meter_override_note, recorded_at').eq('session_id', id).order('recorded_at', { ascending: false }),
    supabase.from('cleaning_verification_evidence').select('id, evidence_kind, advisory_result, advisory_reason_codes, created_at, reviews:cleaning_verification_reviews(id, outcome, reason, reviewed_at, reviewer_user_id)').eq('cleaning_session_id', id).order('created_at', { ascending: false }),
    supabase.from('readiness_reviews').select('id, for_checkin_date, outcome, reason, reviewed_at, reviewer_user_id').eq('cleaning_session_id', id).order('reviewed_at', { ascending: false }),
  ]);
  // Photos are linked by submission identity, never by date. The real folder
  // is {propertyId}/{uploaderUserId}/{submissionId} (see findPhotoFolder).
  let photos: CleaningDetail['photos'] = 'unavailable';
  try {
    const folder = await findPhotoFolder(propertyId, sess.submission_id);
    if (folder) {
      const { data } = await supabase.storage.from('cleaning-photos').list(folder, { limit: 200 });
      if (data) {
        const paths = data.map((o) => `${folder}/${o.name}`);
        const { data: signed } = await supabase.storage.from('cleaning-photos').createSignedUrls(paths, 900);
        const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
        photos = data.map((o) => ({
          name: o.name,
          created_at: o.created_at ?? null,
          size: (o.metadata as { size?: number } | null)?.size ?? null,
          url: urlByPath.get(`${folder}/${o.name}`) ?? null,
          section: classifyPhoto(o.name),
        }));
      } else photos = [];
    } else {
      photos = [];
    }
  } catch {
    photos = 'unavailable';
  }
  return {
    session: sess,
    meters: (m.data ?? []) as CleaningDetail['meters'],
    evidence: (e.data ?? []) as unknown as CleaningDetail['evidence'],
    readiness: (r.error ? [] : (r.data ?? [])) as CleaningDetail['readiness'],
    photos,
  };
}

// CLN04: human review of advisory evidence through the deployed RPC.
export function reviewEvidence(evidenceId: string, outcome: 'reviewed' | 'follow_up_required' | 'resolved', reason: string, key = newIdempotencyKey('evreview')) {
  return rpc('review_cleaning_verification', { p_evidence_id: evidenceId, p_outcome: outcome, p_reason: reason, p_idempotency_key: key });
}

// Meter review (session 12): a flag with a reason on the reading, never an edit
// of the numbers. The utilities chart leaves flagged rows out of its sums.
export const METER_FLAGS = ['first_reading', 're_entry', 'misread', 'duplicate', 'under_review'] as const;
export function reviewMeterReading(readingId: string, flag: string | null, reason: string) {
  return rpc<{ ok: boolean; id: string; flag: string | null; auditId: string | null }>('review_meter_reading_v1', { p_reading_id: readingId, p_flag: flag, p_reason: reason });
}

// CLN05: readiness decision through the v1 RPC (advisory findings never decide).
export function reviewReadiness(propertyId: string, forCheckin: string, outcome: 'ready' | 'not_ready' | 'override_ready', reason: string, sessionId: string | null, key = newIdempotencyKey('readiness')) {
  return rpc<{ ok: boolean; id: string; outcome: string; openBlockers: number }>('review_property_readiness_v1', { p_property_id: propertyId, p_for_checkin: forCheckin, p_outcome: outcome, p_reason: reason || null, p_cleaning_session_id: sessionId, p_idempotency_key: key });
}

export type WorkOrder = {
  id: string; source_kind: string; source_ref: string | null; title: string; description: string | null; priority: string; assignee_user_id: string | null; due_at: string | null;
  blocks_arrival: boolean; status: string; evidence: unknown[]; resolution: string | null; resolved_at: string | null; created_at: string; updated_at: string; version: number;
};

export async function fetchWorkOrders(propertyId: string, status?: string) {
  let q = supabase.from('work_orders').select('*').eq('property_id', propertyId).order('blocks_arrival', { ascending: false }).order('due_at', { ascending: true, nullsFirst: false });
  if (status && status !== 'all') q = status === 'open' ? q.not('status', 'in', '("resolved","cancelled")') : q.eq('status', status);
  return unwrapList<WorkOrder>(await q);
}

export function saveWorkOrder(propertyId: string, order: Record<string, unknown>, key = newIdempotencyKey('wo')) {
  return rpc<{ ok: boolean; id: string; version: number; status: string }>('save_work_order_v1', { p_property_id: propertyId, p_order: order, p_idempotency_key: key });
}

export type Notice = { id: string; notice_type: string; title: string; description: string | null; effective_date: string; effective_time: string | null; duration_hours: string | null; is_active: boolean; audience?: string; expires_at?: string | null; posted_by_name: string | null; created_at: string };

export async function fetchNotices(propertyId: string) {
  return unwrapList<Notice>(await supabase.from('ops_notices').select('*').eq('property_id', propertyId).order('effective_date', { ascending: false }).limit(200));
}

// Notices keep the existing table contract (used by Telegram flows and the guest
// guide); the row-audit trigger records the write and returns its audit id.
export async function saveNotice(propertyId: string, n: Partial<Notice>) {
  assertMutationEnabled('operations');
  const { id, created_at: _c, ...rest } = n;
  void _c;
  const payload = { ...rest, property_id: propertyId };
  const res = id ? await supabase.from('ops_notices').update(payload).eq('id', id).select().single() : await supabase.from('ops_notices').insert(payload).select().single();
  if (res.error) throw res.error;
  const saved = res.data as Notice;
  return { ...saved, auditId: await latestAuditId('ops_notices', saved.id) };
}

// The trigger writes admin_audit_log; direct-table writes read their audit id back.
export async function latestAuditId(table: string, id: string): Promise<string | null> {
  const { data } = await supabase.from('admin_audit_log').select('id').eq('entity_table', table).eq('entity_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}
