import { beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { table: string; eq: Array<[string, unknown]>; in: Array<[string, unknown[]]> };
const calls = vi.hoisted(() => [] as Call[]);
const data = vi.hoisted(() => ({ meter_readings: [] as unknown[], cleaning_sessions: [] as unknown[] }));

// A live-shaped fake: string numerics, nulls, a reading with no session, a session that has no reading.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: 'meter_readings' | 'cleaning_sessions') => {
      const call: Call = { table, eq: [], in: [] };
      calls.push(call);
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => { call.eq.push([c, v]); return q; },
        in: (c: string, v: unknown[]) => { call.in.push([c, v]); return q; },
        order: () => q,
        limit: () => q,
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: data[table], error: null }).then(ok),
      };
      return q;
    },
  },
}));

import { fetchStayUtilities, joinStays } from './utilities-api';

const reading = (o: Record<string, unknown>) => ({ session_id: 's1', electric_prev: '1000.0', electric_curr: '1030.0', electric_delta: '30.0', water_prev: '300.0', water_curr: '301.5', water_delta: '1.5', kwh_per_night: '15', m3_per_night: '0.75', meter_flag: null, ...o });
const session = (o: Record<string, unknown>) => ({ id: 's1', last_guest_name: 'Demo Guest', checkin_date: '2026-11-01', checkout_date: '2026-11-03', nights_stayed: null, ...o });

beforeEach(() => { calls.length = 0; data.meter_readings = []; data.cleaning_sessions = []; });

describe('joinStays', () => {
  it('joins by session id and takes nights from the dates when nights_stayed is empty', () => {
    const [s] = joinStays([reading({}) as never], [session({}) as never]);
    expect(s).toEqual({ sessionId: 's1', guest: 'Demo Guest', date: '2026-11-03', nights: 2, kwh: 30, m3: 1.5, estimate: null });
  });
  it('keeps only the newest reading of a session and drops readings with no session or no stay', () => {
    const rows = [reading({ electric_delta: '30.0' }), reading({ electric_delta: '99.0' }), reading({ session_id: null }), reading({ session_id: 'gone' })];
    const out = joinStays(rows as never[], [session({}) as never]);
    expect(out.map((s) => s.kwh)).toEqual([30]);
  });
  it('marks a flagged reading as an estimate with its flag, and an unflagged chain break as chain_break', () => {
    const out = joinStays(
      [reading({ session_id: 'a', meter_flag: 'typed_accepted' }), reading({ session_id: 'b', electric_prev: '0', water_prev: '0' }), reading({ session_id: 'c', electric_delta: '-4.0' })] as never[],
      [session({ id: 'a' }), session({ id: 'b' }), session({ id: 'c' })] as never[],
    );
    expect(out.map((s) => s.estimate)).toEqual(['typed_accepted', 'chain_break', 'chain_break']);
  });
  it('keeps unknown as null, not 0: missing deltas, no nights, blank guest', () => {
    const [s] = joinStays([reading({ electric_delta: null, water_delta: '' }) as never], [session({ last_guest_name: '  ', checkin_date: null, checkout_date: null }) as never]);
    expect(s).toMatchObject({ guest: null, nights: null, kwh: null, m3: null });
  });
});

describe('fetchStayUtilities', () => {
  it('reads readings then the matching sessions of the same property, and returns joined stays', async () => {
    data.meter_readings = [reading({ session_id: 's1' }), reading({ session_id: null })];
    data.cleaning_sessions = [session({})];
    const out = await fetchStayUtilities('prop-1');
    expect(out).toHaveLength(1);
    expect(calls.map((c) => c.table)).toEqual(['meter_readings', 'cleaning_sessions']);
    expect(calls[1]!.eq).toEqual([['property_id', 'prop-1']]);
    expect(calls[1]!.in).toEqual([['id', ['s1']]]);
  });
  it('makes no second call when there are no readings', async () => {
    expect(await fetchStayUtilities('prop-1')).toEqual([]);
    expect(calls.map((c) => c.table)).toEqual(['meter_readings']);
  });
});
