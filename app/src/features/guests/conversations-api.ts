import { supabase } from '@/lib/supabase';
import { rpc } from '@/lib/rpc';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/lib/env';
import { AppError, type AppErrorKind } from '@/lib/errors';
import type { ThreadHandoff, Turn } from './conversations-window';

// Conversations panel adapter (SPEC-42 section 7). Reads go through two owner/admin RPCs (the threads table has no client grant);
// the only write is the host-reply Edge Function, called once per explicit Send.

export type ConversationRow = {
  psid: string; psid_short: string; guest_name: string | null; updated_at: string;
  last_role: 'guest' | 'bot' | null; last_text: string | null; last_guest_at: string | null;
  open_handoffs: number; human_until: string | null; last_risk: string | null;
};
export type ThreadDetail = {
  psid: string; psid_short: string; guest_name: string | null; updated_at: string; human_until: string | null; last_risk: string | null;
  history: Turn[]; handoffs: ThreadHandoff[];
};

export async function fetchConversations(limit = 30): Promise<ConversationRow[]> {
  return (await rpc<ConversationRow[] | null>('concierge_conversations_v1', { p_limit: limit })) ?? [];
}

export async function fetchThread(psid: string): Promise<ThreadDetail | null> {
  const t = await rpc<ThreadDetail | null>('concierge_thread_v1', { p_psid: psid });
  return t ? { ...t, history: Array.isArray(t.history) ? t.history : [], handoffs: Array.isArray(t.handoffs) ? t.handoffs : [] } : null;
}

const REPLY_ERRORS: Record<string, [AppErrorKind, string]> = {
  authentication_required: ['forbidden', 'Sign in again, then send.'],
  invalid_or_expired_session: ['forbidden', 'Your session expired. Sign in again, then send.'],
  staff_access_denied: ['forbidden', 'Only an owner or admin can reply to guests from here.'],
  explicit_send_required: ['validation', 'The reply was not sent. Tap Send to send it.'],
  invalid_text: ['validation', 'Write a reply first.'],
  text_too_long: ['validation', 'The reply is too long for one Messenger message. Shorten it.'],
  thread_not_found: ['not_found', 'This conversation no longer exists.'],
  handoff_not_found: ['not_found', 'That handoff no longer exists. Refresh and try again.'],
  handoff_not_open: ['conflict', 'Someone already answered this handoff. Nothing was sent. Refresh to see the reply.'],
  reply_window_closed: ['conflict', 'The 7-day reply window has closed. Nothing was sent. Reply from the Page inbox instead.'],
  messenger_refused: ['unavailable', 'Messenger did not accept the reply, so nothing was sent and nothing was marked. Try again in a minute.'],
  host_reply_unavailable: ['unavailable', 'Sending is not available right now. Nothing was sent.'],
};

/** A host-reply error code as the AppError the page shows. Unknown codes keep the HTTP status's meaning and never claim a send. */
export function replyError(code: string | undefined, status: number): AppError {
  const known = code ? REPLY_ERRORS[code] : undefined;
  if (known) return new AppError(known[0], known[1], code);
  const kind: AppErrorKind = status === 401 || status === 403 ? 'forbidden' : status === 409 ? 'conflict' : status === 404 ? 'not_found' : status === 400 ? 'validation' : 'unavailable';
  return new AppError(kind, 'The reply was not sent.', code ?? `HTTP ${status}`);
}

export type SendResult = { sent_text: string; recorded: boolean; handoff_marked: boolean };

/** One tap on Send = one call. Nothing here retries or sends on its own. */
export async function sendHostReply(a: { psid: string; text: string; handoffId: string | null }): Promise<SendResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw replyError('authentication_required', 401);
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/host-reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ action: 'send', psid: a.psid, text: a.text, ...(a.handoffId ? { handoff_id: a.handoffId } : {}) }),
  }).catch(() => null);
  if (!resp) throw new AppError('unavailable', 'Could not reach the server. Nothing was sent.');
  const body = (await resp.json().catch(() => ({}))) as { ok?: boolean; error?: string } & Partial<SendResult>;
  if (!resp.ok || body.ok === false) throw replyError(body.error, resp.status);
  return { sent_text: String(body.sent_text ?? ''), recorded: body.recorded === true, handoff_marked: body.handoff_marked === true };
}
