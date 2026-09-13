import { supabase } from '@/lib/supabase';
import { unwrapList } from '@/lib/rpc';
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
// Actions the deployed function knows: disable, enable, update (name/role/password/note), delete.
export function staffAction(action: 'disable' | 'enable' | 'update', userId: string, extra: Record<string, unknown> = {}) {
  return staffCall({ action, userId, ...extra });
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

export type AuditRow = { id: string; actor_user_id: string | null; target_user_id: string | null; action: string; before_state: unknown; after_state: unknown; reason: string | null; created_at: string };
export async function fetchAudit() {
  return unwrapList<AuditRow>(await supabase.from('staff_access_audit').select('*').order('created_at', { ascending: false }).limit(200));
}
