import { describe, expect, it } from 'vitest';
import { buildTimeline, newestOpenHandoff, replyWindow, speakerOf, turnRisk, windowLabel, type ThreadHandoff, type Turn } from './conversations-window';

const NOW = new Date('2026-10-06T00:00:00Z');
const g = (at: string, text = 'hello', route?: Record<string, unknown>): Turn => ({ role: 'guest', text, at, ...(route ? { route } : {}) });
const b = (at: string, text = 'hi'): Turn => ({ role: 'bot', text, at });
const h = (id: string, created_at: string, status = 'open'): ThreadHandoff => ({ id, status, risk: 'priority', guest_text: 'x', sent_text: null, resolved_by: null, resolved_at: null, created_at });

describe('replyWindow', () => {
  it('is open for a guest turn under 7 days old and reports when it closes', () => {
    const w = replyWindow([g('2026-10-05T10:00:00Z')], NOW);
    expect(w.open).toBe(true);
    expect(w.closesAt).toBe('2026-10-12T10:00:00.000Z');
    expect(w.msLeft).toBe(6 * 86_400_000 + 10 * 3_600_000);
  });
  it('closes at exactly 7 days', () => {
    expect(replyWindow([g('2026-09-29T00:00:00Z')], NOW).open).toBe(false);
    expect(replyWindow([g('2026-09-29T00:00:01Z')], NOW).open).toBe(true);
  });
  it('uses the latest guest turn, ignores bot turns and unreadable times', () => {
    expect(replyWindow([g('2026-09-01T00:00:00Z'), g('2026-10-05T10:00:00Z'), b('2026-10-05T10:00:05Z')], NOW).lastGuestAt).toBe('2026-10-05T10:00:00.000Z');
    expect(replyWindow([g('garbage'), b('2026-10-05T10:00:05Z')], NOW).open).toBe(false);
  });
  it('is closed with no history', () => {
    expect(replyWindow([], NOW)).toEqual({ open: false, lastGuestAt: null, closesAt: null, msLeft: 0 });
    expect(replyWindow(null, NOW).open).toBe(false);
    expect(replyWindow(undefined, NOW).open).toBe(false);
  });
});

describe('windowLabel', () => {
  it('reads in days and hours', () => {
    expect(windowLabel(6 * 86_400_000 + 4 * 3_600_000)).toBe('6 days 4 hours left');
    expect(windowLabel(86_400_000)).toBe('1 day left');
    expect(windowLabel(3 * 3_600_000)).toBe('3 hours left');
    expect(windowLabel(59 * 60_000)).toBe('under 1 hour left');
    expect(windowLabel(0)).toBe('closed');
  });
});

describe('speakerOf and turnRisk', () => {
  it('tells a host reply from Cassy by the sign-off', () => {
    expect(speakerOf(g('2026-10-05T10:00:00Z'))).toBe('guest');
    expect(speakerOf(b('2026-10-05T10:00:00Z', 'Parking is free.'))).toBe('cassy');
    expect(speakerOf(b('2026-10-05T10:00:00Z', 'We can do 1 pm.\n\n— Lloyd, Cascade Hideaway'))).toBe('host');
    expect(speakerOf(b('2026-10-05T10:00:00Z', 'Cascade Hideaway welcomes you'))).toBe('cassy');
  });
  it('shows a risk only for a guest turn whose regex risk was not routine', () => {
    expect(turnRisk(g('2026-10-05T10:00:00Z', 'x', { re: 'refund' }))).toBe('refund');
    expect(turnRisk(g('2026-10-05T10:00:00Z', 'x', { re: 'routine' }))).toBeNull();
    expect(turnRisk(g('2026-10-05T10:00:00Z', 'x', { chip: 'y' }))).toBeNull();
    expect(turnRisk({ ...b('2026-10-05T10:00:00Z'), route: { re: 'refund' } })).toBeNull();
    expect(turnRisk(g('2026-10-05T10:00:00Z'))).toBeNull();
  });
});

describe('buildTimeline', () => {
  it('puts a handoff before the first later turn and leftovers at the end', () => {
    const items = buildTimeline(
      [g('2026-10-01T01:00:00Z'), b('2026-10-01T01:00:00Z'), g('2026-10-02T01:00:00Z')],
      [h('late', '2026-10-09T00:00:00Z'), h('mid', '2026-10-01T01:00:05Z')],
    );
    expect(items.map((i) => i.key)).toEqual(['t-0', 't-1', 'h-mid', 't-2', 'h-late']);
  });
  it('keeps a handoff whose time is unreadable and tolerates empty input', () => {
    expect(buildTimeline([g('2026-10-01T01:00:00Z')], [h('bad', 'nope')]).map((i) => i.key)).toEqual(['t-0', 'h-bad']);
    expect(buildTimeline([], [h('only', '2026-10-01T00:00:00Z')]).map((i) => i.key)).toEqual(['h-only']);
    expect(buildTimeline(null, null)).toEqual([]);
  });
  it('does not move a turn with an unreadable time', () => {
    expect(buildTimeline([g('2026-10-01T01:00:00Z'), b('garbage')], [h('a', '2026-10-01T02:00:00Z')]).map((i) => i.key)).toEqual(['t-0', 't-1', 'h-a']);
  });
});

describe('newestOpenHandoff', () => {
  it('returns the newest open one, or null', () => {
    expect(newestOpenHandoff([h('a', '2026-10-01T00:00:00Z'), h('b', '2026-10-03T00:00:00Z'), h('c', '2026-10-04T00:00:00Z', 'sent')])?.id).toBe('b');
    expect(newestOpenHandoff([h('c', '2026-10-04T00:00:00Z', 'dismissed')])).toBeNull();
    expect(newestOpenHandoff(null)).toBeNull();
  });
});
