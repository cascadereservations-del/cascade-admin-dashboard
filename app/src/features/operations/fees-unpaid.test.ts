import { describe, expect, it, vi } from 'vitest';

// Records every query-builder call so the Unpaid filter's PostgREST shape can be asserted without a server.
const calls: Array<[string, unknown[]]> = [];
const builder: Record<string, unknown> = {};
for (const m of ['select', 'eq', 'order', 'or', 'is', 'gt', 'gte', 'lt', 'range']) builder[m] = (...a: unknown[]) => { calls.push([m, a]); return builder; };
builder.then = (res: (v: unknown) => void) => res({ data: [], error: null, count: 0 });
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => builder } }));

import { feeState, fetchCleanings } from './api';

// Session 76: under SPEC-37 fee_amount stays NULL until the cleaner requests pay; an unpriced clean is still owed.
describe('cleaner fee state', () => {
  it('an unpriced, unpaid clean is unpaid, not "no fee"', () => {
    expect(feeState({ fee_amount: null, fee_paid_at: null })).toBe('unpaid');
    expect(feeState({ fee_amount: '500', fee_paid_at: null })).toBe('unpaid');
    expect(feeState({ fee_amount: 650, fee_paid_at: '2026-10-01T01:00:00Z' })).toBe('paid');
    expect(feeState({ fee_amount: 0, fee_paid_at: null })).toBe('none');
    expect(feeState({ fee_amount: '0', fee_paid_at: '2026-08-11T01:00:00Z' })).toBe('none');
  });

  it('?fees=unpaid sends the overview rule: fee_paid_at null and fee NULL or > 0', async () => {
    calls.length = 0;
    await fetchCleanings('p', { fees: 'unpaid' }, true);
    expect(calls).toContainEqual(['is', ['fee_paid_at', null]]);
    expect(calls).toContainEqual(['or', ['fee_amount.is.null,fee_amount.gt.0']]);
    expect(calls.some(([m]) => m === 'gt')).toBe(false);
  });
});
