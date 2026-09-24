import { supabase } from '@/lib/supabase';
import { rpc, unwrapList } from '@/lib/rpc';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/lib/env';

// Settings adapter (P29). Staff management keeps the deployed staff-users
// Edge Function contract (owner/admin only, MFA on the server). Health reads
// job heartbeats and sync logs; audit reads staff_access_audit.

// Shape returned by the deployed staff-users `list` action (same contract the legacy admin reads).
export type StaffUser = { user_id: string; name: string; role: string; disabled: boolean; sign_in_name: string | null; is_mailbox_login: boolean; note: string | null; last_sign_in_at: string | null; created_at: string };

async function staffCall(payload: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw { code: '42501', message: 'Not signed in' };
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/staff-users`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(payload) });
  const body = (await resp.json().catch(() => ({}))) as { ok?: boolean; error?: string; staff?: StaffUser[] } & Record<string, unknown>;
  if (!resp.ok || body.ok === false) throw { code: resp.status === 403 ? '42501' : String(resp.status), message: body.error ?? `HTTP ${resp.status}`, status: resp.status };
  return body;
}
export async function listStaff() {
  const r = await staffCall({ action: 'list' });
  return (r.staff ?? []) as StaffUser[];
}
// Actions the deployed function knows: create, disable, enable, update (name/role/password/note), delete.
export function staffAction(action: 'disable' | 'enable' | 'update' | 'delete', userId: string, extra: Record<string, unknown> = {}) {
  return staffCall({ action, userId, ...extra });
}
// Supabase Auth needs 8+ characters; staff type only 4 digits and the PWA prepends
// the same fixed prefix at sign-in (D-059). Staff never see it.
export const STAFF_PIN_PREFIX = '8888';
export const STAFF_PIN_RE = /^\d{4}$/;
export const STAFF_ROLES = ['cleaner', 'inspector', 'maintenance', 'finance', 'admin'] as const;
export function createStaff(propertyId: string, name: string, role: string, pin: string) {
  return staffCall({ action: 'create', name, role, password: STAFF_PIN_PREFIX + pin, propertyId }) as Promise<{ ok?: boolean; sign_in_name?: string; user_id?: string }>;
}

// staff_details (session-13 step 3): contact, ID and fee-structure fields staff_access_profiles
// lacks. Written only through save_staff_details_v1, audited via staff_details_history.
export type StaffDetails = {
  user_id: string; contact_number: string | null; alternate_contact: string | null; address: string | null;
  id_type: string | null; id_number: string | null; id_drive_url: string | null;
  emergency_contact_name: string | null; emergency_contact_number: string | null; start_date: string | null;
  fee_turnover: string | null; fee_transport: string | null; fee_deep_clean: string | null; version: number;
};
export async function listStaffDetails() {
  return rpc<StaffDetails[]>('list_staff_details_v1', {});
}
export function saveStaffDetails(userId: string, patch: Record<string, unknown>, expectedVersion: number | undefined, reason: string) {
  return rpc<{ ok: boolean; userId: string; version: number }>('save_staff_details_v1', { p_user_id: userId, p_patch: patch, p_expected_version: expectedVersion ?? null, p_reason: reason });
}

export type Heartbeat = { job_name: string; expected_interval_seconds: number; last_started_at: string | null; last_succeeded_at: string | null; last_error_code: string | null; consecutive_failures: number; ops_risk: boolean; updated_at: string };
export async function fetchHealth(propertyId: string) {
  const [hb, sync, email, integrity] = await Promise.all([
    supabase.from('job_heartbeats').select('*').order('job_name'),
    supabase.from('calendar_sync_log').select('*').eq('property_id', propertyId).order('synced_at', { ascending: false }).limit(10),
    supabase.from('airbnb_email_events').select('id, email_type, email_date, processed_at').eq('property_id', propertyId).order('email_date', { ascending: false }).limit(5),
    supabase.rpc('get_data_integrity_report', { p_property_id: propertyId }),
  ]);
  return {
    heartbeats: hb.error ? { error: hb.error.message } : { rows: (hb.data ?? []) as Heartbeat[] },
    sync: sync.error ? { error: sync.error.message } : { rows: (sync.data ?? []) as Array<{ id: string; synced_at: string; status: string; event_count: number | null; error_msg: string | null; source: string }> },
    email: email.error ? { error: email.error.message } : { rows: (email.data ?? []) as Array<{ id: string; email_type: string; email_date: string; processed_at: string | null }> },
    integrity: integrity.error ? { error: integrity.error.message } : { data: integrity.data as Record<string, unknown> },
  };
}

// One feed (admin_audit_feed_v1): admin row writes with undo, staff changes,
// booking lifecycle, inventory movements, journals, readiness and evidence
// reviews, guest profile history. Finance and staff rows are server-filtered.
export type AuditFeedRow = { id: string; at: string; src: string; entity_table: string; entity_id: string; action: string; actor: string | null; reason: string | null; before_state: unknown; after_state: unknown; undoable: boolean; undo_of: string | null };
export function fetchAuditFeed(propertyId: string, limit = 300) {
  return rpc<{ rows: AuditFeedRow[]; financeVisible: boolean; staffVisible: boolean }>('admin_audit_feed_v1', { p_property_id: propertyId, p_limit: limit });
}

export type HealthCheck = { check_key: string; label: string; status: 'pass' | 'warn' | 'fail'; count: number; detail: unknown; ran_at: string; ran_by: string | null };
export async function fetchHealthRuns(propertyId: string) {
  return unwrapList<HealthCheck>(await supabase.from('admin_health_check_runs').select('*').eq('property_id', propertyId).order('check_key'));
}
export function runHealthChecks(propertyId: string) {
  return rpc<{ ranAt: string; checks: HealthCheck[] }>('run_health_checks_v1', { p_property_id: propertyId });
}

// SPEC-25 (D-226): the system verifier's open and acknowledged findings, and the dashboard's own
// "Known, stop reminding". The read goes through the verifier_findings read_operations policy; the
// ack RPC is owner/admin only on the server (42501 otherwise) and stamps who and when.
export type VerifierFinding = { key: string; check_id: string; severity: 'red' | 'yellow'; title: string; status: 'open' | 'acknowledged'; first_seen: string; last_alerted_at: string | null; acknowledged_at: string | null; acknowledged_by: string | null };
export async function fetchVerifierFindings() {
  return unwrapList<VerifierFinding>(await supabase.from('verifier_findings')
    .select('key,check_id,severity,title,status,first_seen,last_alerted_at,acknowledged_at,acknowledged_by')
    .neq('status', 'resolved').order('severity').order('first_seen'));
}
export function ackVerifierFinding(key: string) {
  return rpc<{ ok: boolean; outcome: 'acknowledged' | 'not_open' }>('ack_verifier_finding_v1', { p_key: key });
}
