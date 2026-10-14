import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeStays } from './model';

// S84 D: owner/admin calendar reads go through admin_calendar_events_v1 / admin_calendar_event_v1; absent RPC falls back to the old
// select; a 42501 never falls back. Fixed dates only, no real clock.
const rpcCalls: Array<[string, Record<string, unknown>]> = [];
const selects: string[] = [];
const state = vi.hoisted(() => ({ rpc: {} as { data?: unknown; error?: unknown }, table: [] as unknown[], one: null as unknown }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => { rpcCalls.push([fn, args]); return Promise.resolve({ data: null, error: null, ...state.rpc }); },
    from: (t: string) => {
      const chain: Record<string, unknown> = {};
      for (const n of ['eq', 'order', 'limit']) chain[n] = () => chain;
      chain.select = (cols: string) => { if (t === 'calendar_events') selects.push(cols); return chain; };
      chain.maybeSingle = () => Promise.resolve({ data: state.one, error: null });
      chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: state.table, error: null }).then(ok);
      return chain;
    },
  },
}));
import { fetchStays } from './api';
import { readCalendarEvent, readCalendarEvents } from './calendar-reads';

const ev = { id: 'c1', uid: 'u', source: 'airbnb', checkin_date: '2026-10-20', checkout_date: '2026-10-22', guest_name: null, status: 'confirmed', linked_reservation_id: null, synced_at: '2026-10-14T00:00:00Z', raw_summary: 'Reserved - Ana' };
beforeEach(() => { rpcCalls.length = 0; selects.length = 0; state.table = []; state.one = null; state.rpc = {}; });

describe('readCalendarEvents', () => {
  it('uses the RPC with p_property_id and never selects the table', async () => {
    state.rpc = { data: [ev] };
    const r = await readCalendarEvents('p1');
    expect(rpcCalls).toEqual([['admin_calendar_events_v1', { p_property_id: 'p1' }]]);
    expect(r.data).toEqual([ev]);
    expect(selects).toEqual([]);
  });
  it('accepts a wrapped { ok, rows } body', async () => {
    state.rpc = { data: { ok: true, rows: [ev] } };
    expect((await readCalendarEvents('p1')).data).toEqual([ev]);
  });
  it('falls back to the old select on PGRST202 and on a 404', async () => {
    state.table = [ev];
    state.rpc = { error: { code: 'PGRST202', message: 'Could not find the function' } };
    expect((await readCalendarEvents('p1')).data).toEqual([ev]);
    state.rpc = { error: { status: 404, message: 'Not Found' } };
    expect((await readCalendarEvents('p1')).data).toEqual([ev]);
    expect(selects).toHaveLength(2);
    expect(selects[0]).toContain('raw_summary');
  });
  it('does not fall back on 42501', async () => {
    state.rpc = { error: { code: '42501', message: 'permission denied' } };
    const r = await readCalendarEvents('p1');
    expect(r.error).toMatchObject({ code: '42501' });
    expect(selects).toEqual([]);
  });
  it('model guest-name fallback is unchanged: raw_summary still names the guest', () => {
    const stays = mergeStays([], [], [ev], '2026-10-14');
    expect(JSON.stringify(stays)).toContain('Ana');
  });
});

describe('readCalendarEvent', () => {
  it('uses the RPC with p_id', async () => {
    state.rpc = { data: ev };
    expect((await readCalendarEvent('c1')).data).toEqual(ev);
    expect(rpcCalls).toEqual([['admin_calendar_event_v1', { p_id: 'c1' }]]);
    expect(selects).toEqual([]);
  });
  it('falls back to select(*) on PGRST202, not on 42501', async () => {
    state.one = ev;
    state.rpc = { error: { code: 'PGRST202', message: 'x' } };
    expect((await readCalendarEvent('c1')).data).toEqual(ev);
    expect(selects).toEqual(['*']);
    state.rpc = { error: { code: '42501', message: 'denied' } };
    expect((await readCalendarEvent('c1')).error).toMatchObject({ code: '42501' });
    expect(selects).toEqual(['*']);
  });
});

describe('fetchStays wiring', () => {
  it('reads calendar events through the RPC, not the table, and keeps the raw_summary guest name', async () => {
    state.rpc = { data: [ev] };
    const r = await fetchStays('p1');
    expect(rpcCalls).toEqual([['admin_calendar_events_v1', { p_property_id: 'p1' }]]);
    expect(selects).toEqual([]);
    expect(JSON.stringify(r.stays)).toContain('Ana');
  });
});
