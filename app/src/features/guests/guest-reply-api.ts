import { supabase } from '@/lib/supabase';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/lib/env';
import { AppError, type AppErrorKind } from '@/lib/errors';

// "Cassy reply" (S76): paste what a guest sent, or a screenshot of it, and get one or two warm draft replies back.
// The Edge Function only drafts. Nothing is sent to the guest from here; the host copies a draft and sends it herself.

export type GuestPlatform = 'messenger' | 'airbnb';
export type ReplyImage = { base64: string; mime: 'image/jpeg' | 'image/png' | 'image/webp' };
export type GuestReplyInput = { text?: string; image?: ReplyImage; guestName?: string | null; platform?: GuestPlatform };
export type GuestReplyDraft = { guest_name: string | null; platform: GuestPlatform; guest_text: string; header: string; replies: string[] };

export const MAX_GUEST_TEXT = 4000;

const EXPIRED = 'Your session expired. Sign in again, then try once more.';
const TOO_LARGE = 'That screenshot is too large. Try a smaller one, or paste the text instead.';

const ERRORS: Record<string, [AppErrorKind, string]> = {
  authentication_required: ['forbidden', 'Sign in again, then try once more.'],
  invalid_or_expired_session: ['forbidden', EXPIRED],
  staff_access_denied: ['forbidden', 'Only owner and admin accounts can draft guest replies.'],
  empty: ['validation', 'Add the guest message first, either as text or as a screenshot.'],
  both: ['validation', 'Use either the text or the screenshot, not both at once.'],
  too_long: ['validation', `That message is longer than ${MAX_GUEST_TEXT.toLocaleString('en-US')} characters. Paste just the part that needs an answer.`],
  bad_image: ['validation', 'That image could not be read. Try another screenshot, or paste the text instead.'],
  bad_json: ['unknown', 'The request did not go through properly. Please try again.'],
  image_too_large: ['validation', TOO_LARGE],
  no_guest_message: ['validation', 'No guest message could be found there. Check the text or screenshot and try again.'],
  draft_failed: ['unavailable', 'Cassy could not write a draft just now. Please try again in a minute.'],
};

/** A function error code as the AppError the dialog shows. An unknown code falls back on the HTTP status. */
export function guestReplyError(code: string | undefined, status: number): AppError {
  const known = code ? ERRORS[code] : undefined;
  if (known) return new AppError(known[0], known[1], code);
  if (status === 401) return new AppError('forbidden', EXPIRED, code ?? `HTTP ${status}`);
  if (status === 403) return new AppError('forbidden', ERRORS.staff_access_denied![1], code ?? `HTTP ${status}`);
  if (status === 413) return new AppError('validation', TOO_LARGE, code ?? `HTTP ${status}`);
  return new AppError('unavailable', 'Cassy could not draft a reply this time. Please try again in a minute.', code ?? `HTTP ${status}`);
}

/** Exactly one of text or image goes to the function. Drafting is read-only, so a failed call is safe to repeat. */
export async function draftGuestReply(a: GuestReplyInput): Promise<GuestReplyDraft> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw guestReplyError('authentication_required', 401);
  const name = a.guestName?.trim();
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/guest-reply-draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({
      ...(a.image ? { image: a.image } : { text: a.text }),
      ...(name ? { guest_name: name } : {}),
      ...(a.platform ? { platform: a.platform } : {}),
    }),
  }).catch(() => null);
  if (!resp) throw new AppError('unavailable', 'Could not reach the server. Check your connection and try again.');
  const body = (await resp.json().catch(() => ({}))) as { ok?: boolean; error?: string } & Partial<GuestReplyDraft>;
  if (!resp.ok || body.ok === false) throw guestReplyError(body.error, resp.status);
  const replies = Array.isArray(body.replies) ? body.replies.filter((r): r is string => typeof r === 'string' && r.trim() !== '') : [];
  if (replies.length === 0) throw guestReplyError('draft_failed', 502);
  return {
    guest_name: body.guest_name ?? null,
    platform: body.platform === 'airbnb' ? 'airbnb' : 'messenger',
    guest_text: String(body.guest_text ?? ''),
    header: String(body.header ?? ''),
    replies,
  };
}
