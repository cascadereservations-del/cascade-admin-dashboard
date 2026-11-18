import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: Array<[string, Record<string, unknown>]> = [];
const state = vi.hoisted(() => ({ rpc: {} as { data?: unknown; error?: unknown } }));
vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => { calls.push([fn, args]); return Promise.resolve({ data: null, error: null, ...state.rpc }); } },
}));
import { fetchUsageKpi, recordMissedRefill } from './api';

beforeEach(() => { calls.length = 0; });

describe('fetchUsageKpi', () => {
  it('maps the server body', async () => {
    state.rpc = { data: { ok: true, itemsTotal: 22, itemsMeasured: 9, itemsLearning: 5, medianForecastError: 0.18, forecastSamples: 7, underFourteenDays: { count: 1, items: [{ id: 'a', name: 'Demo soap', daysLeft: 9.5 }] }, waitingForRefill: { count: 0, items: [] } } };
    const k = await fetchUsageKpi('p1');
    expect(calls).toEqual([['get_inventory_usage_kpi_v1', { p_property_id: 'p1' }]]);
    expect(k).toMatchObject({ itemsTotal: 22, itemsMeasured: 9, medianForecastError: 0.18, underFourteenDays: { count: 1 }, waitingForRefill: { count: 0, items: [] } });
  });
  it('a null error stays null, never 0', async () => {
    state.rpc = { data: { ok: true, itemsTotal: 3, itemsMeasured: 0, itemsLearning: 0, medianForecastError: null, forecastSamples: 0 } };
    expect((await fetchUsageKpi('p1'))!.medianForecastError).toBeNull();
  });
  it('missing sections read as zero counts', async () => {
    state.rpc = { data: { ok: true } };
    expect(await fetchUsageKpi('p1')).toMatchObject({ itemsTotal: 0, underFourteenDays: { count: 0, items: [] }, waitingForRefill: { count: 0, items: [] } });
  });
  it('a missing function (PGRST202 or 42883) reads as null, not an error', async () => {
    for (const error of [{ code: 'PGRST202', message: 'x' }, { code: '42883', message: 'x' }]) {
      state.rpc = { error };
      expect(await fetchUsageKpi('p1')).toBeNull();
    }
  });
  it('a refusal (42501) and a 404 status are errors, as is any other failure', async () => {
    for (const error of [{ code: '42501', message: 'permission denied' }, { status: 404, message: 'Not Found' }, { code: '57014', message: 'canceling statement due to statement timeout' }]) {
      state.rpc = { error };
      await expect(fetchUsageKpi('p1')).rejects.toBeDefined();
    }
  });
  it('an ok:false body reads as null', async () => {
    state.rpc = { data: { ok: false } };
    expect(await fetchUsageKpi('p1')).toBeNull();
  });
});

describe('recordMissedRefill', () => {
  it('calls record_missed_refill_v1 with the item and the quantity, and nothing else', async () => {
    state.rpc = { data: { ok: true } };
    expect(await recordMissedRefill('i1', '30')).toEqual({ ok: true });
    expect(calls).toEqual([['record_missed_refill_v1', { p_item_id: 'i1', p_qty: '30' }]]);
  });
});
