// Pure helpers for the Conversations panel (SPEC-42 section 7): the 7-day HUMAN_AGENT reply window, who spoke, and one timeline
// that puts handoff cards between the turns. The window rule matches the host-reply Edge Function, which enforces it again.

export type Turn = { role: 'guest' | 'bot'; text: string; at: string; route?: Record<string, unknown> | null };
export type ThreadHandoff = { id: string; status: string; risk: string | null; guest_text: string | null; sent_text: string | null; resolved_by: string | null; resolved_at: string | null; created_at: string };

/** The ONE place the reply window is set: 168 h = 7 days with Meta's Human Agent tag (what host-reply enforces today).
 *  Switch to 24 for Meta's standard messaging window if the tag is ever withdrawn. */
export const REPLY_WINDOW_HOURS = 168;
export const WINDOW_MS = REPLY_WINDOW_HOURS * 3_600_000;
const HOST_SIGNOFF = /\n\n— .{1,40}, Cascade Hideaway\s*$/;

export type ReplyWindow = { open: boolean; lastGuestAt: string | null; closesAt: string | null; msLeft: number };

/** The latest guest turn decides. A turn with an unreadable time does not count; no usable guest turn = closed. */
export function replyWindow(history: Turn[] | null | undefined, now: Date, windowMs: number = WINDOW_MS): ReplyWindow {
  let last = 0;
  for (const t of history ?? []) {
    if (t?.role !== 'guest') continue;
    const ms = Date.parse(t.at);
    if (Number.isFinite(ms) && ms > last) last = ms;
  }
  if (!last) return { open: false, lastGuestAt: null, closesAt: null, msLeft: 0 };
  const msLeft = Math.max(0, last + windowMs - now.getTime());
  return { open: msLeft > 0, lastGuestAt: new Date(last).toISOString(), closesAt: new Date(last + windowMs).toISOString(), msLeft };
}

/** Time left as "6 d 4 h", "5 h 20 min" or "45 min" (days and hours, then hours and minutes, then minutes). Null once closed. */
export function windowLeft(msLeft: number): string | null {
  if (msLeft <= 0) return null;
  const mins = Math.max(1, Math.floor(msLeft / 60_000));
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  if (d > 0) return h ? `${d} d ${h} h` : `${d} d`;
  if (h > 0) return m ? `${h} h ${m} min` : `${h} h`;
  return `${m} min`;
}

/** The sentence on the reply box. */
export function windowSentence(msLeft: number): string {
  const left = windowLeft(msLeft);
  return left ? `You can reply for ${left} more` : 'The reply window has closed';
}

/** Under an hour left: the page shows it as a warning. */
export const windowLastHour = (msLeft: number) => msLeft > 0 && msLeft < 3_600_000;

/** Cassy's turns and the host's are both stored with role "bot"; a host reply always ends with the sign-off the function adds. */
export type Speaker = 'guest' | 'cassy' | 'host';
export function speakerOf(t: Pick<Turn, 'role' | 'text'>): Speaker {
  if (t.role === 'guest') return 'guest';
  return HOST_SIGNOFF.test(t.text ?? '') ? 'host' : 'cassy';
}

/** The regex risk Cassy gave a guest turn, when it was not routine. Null for anything else. */
export function turnRisk(t: Turn): string | null {
  const re = t.route?.re;
  return t.role === 'guest' && typeof re === 'string' && re && re !== 'routine' ? re : null;
}

export type TimelineItem = { kind: 'turn'; turn: Turn; key: string } | { kind: 'handoff'; handoff: ThreadHandoff; key: string };

/** Turns in order; a handoff sits before the first turn that is later than it (a bad turn time never moves it), the rest at the end. */
export function buildTimeline(history: Turn[] | null | undefined, handoffs: ThreadHandoff[] | null | undefined): TimelineItem[] {
  const pending = [...(handoffs ?? [])].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const out: TimelineItem[] = [];
  const flushBefore = (ms: number) => {
    while (pending.length && Date.parse(pending[0]!.created_at) < ms) { const h = pending.shift()!; out.push({ kind: 'handoff', handoff: h, key: `h-${h.id}` }); }
  };
  (history ?? []).filter((t) => t && typeof t.text === 'string').forEach((t, i) => {
    const ms = Date.parse(t.at);
    if (Number.isFinite(ms)) flushBefore(ms);
    out.push({ kind: 'turn', turn: t, key: `t-${i}` });
  });
  for (const h of pending) out.push({ kind: 'handoff', handoff: h, key: `h-${h.id}` });
  return out;
}

/** The newest handoff still open, which a reply should normally answer. */
export function newestOpenHandoff(handoffs: ThreadHandoff[] | null | undefined): ThreadHandoff | null {
  const open = (handoffs ?? []).filter((h) => h.status === 'open');
  return open.length ? open.reduce((a, b) => (Date.parse(b.created_at) > Date.parse(a.created_at) ? b : a)) : null;
}
