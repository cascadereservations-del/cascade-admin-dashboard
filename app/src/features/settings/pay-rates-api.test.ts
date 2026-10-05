import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.fn();
vi.mock('@/lib/rpc', () => ({ rpc: (...a: unknown[]) => rpcMock(...a) }));

import { addPayRate, describeRate, earliestStart, fetchPayRates, rateNumber, rateProblem } from './pay-rates-api';

// D-301: the Pay rates page's own data layer. The server (admin_add_pay_rate_v1) is the authority; these mirror its checks.
const add = (d: string, n: number) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const today = '2026-10-06';
const ok = { effectiveFrom: '2026-10-10', regular: 500, general: 1000, transport: 150 as number | null, note: 'Honey agreed' };

beforeEach(() => rpcMock.mockReset());

describe('rateNumber: unknown stays null, never 0', () => {
  it('keeps real numbers and numeric strings', () => {
    expect(rateNumber(500)).toBe(500);
    expect(rateNumber('150.00')).toBe(150);
    expect(rateNumber(0)).toBe(0);
  });
  it('turns missing and junk into null', () => {
    expect(rateNumber(null)).toBeNull();
    expect(rateNumber(undefined)).toBeNull();
    expect(rateNumber('')).toBeNull();
    expect(rateNumber('abc')).toBeNull();
    expect(rateNumber(NaN)).toBeNull();
  });
});

describe('describeRate', () => {
  it('names the transport toggle when a transport rate exists', () => {
    expect(describeRate({ regular_rate: 500, general_rate: 1000, transport_rate: 150 })).toBe('₱500 per clean · ₱1,000 per deep clean · ₱150 transport when ticked');
  });
  it('says transport is included when the rate is null (the 650 era)', () => {
    expect(describeRate({ regular_rate: 650, general_rate: 1000, transport_rate: null })).toContain('transport included');
  });
  it('a missing deep clean rate falls back to the cleaning rate, a missing cleaning rate is a dash', () => {
    expect(describeRate({ regular_rate: 500, general_rate: null, transport_rate: null })).toContain('₱500 per deep clean');
    expect(describeRate({ regular_rate: null, general_rate: null, transport_rate: null })).toContain('— per clean');
  });
});

describe('earliestStart: a new rate starts after the latest row and not in the past', () => {
  it('is today when every row is older than today', () => {
    expect(earliestStart([{ effective_from: '2026-09-30' }, { effective_from: '2026-05-07' }], today, add)).toBe(today);
  });
  it('is the day after a row that starts today or later', () => {
    expect(earliestStart([{ effective_from: '2026-10-06' }], today, add)).toBe('2026-10-07');
    expect(earliestStart([{ effective_from: '2026-10-20' }, { effective_from: '2026-09-30' }], today, add)).toBe('2026-10-21');
  });
  it('is today with no history', () => {
    expect(earliestStart([], today, add)).toBe(today);
  });
});

describe('rateProblem mirrors admin_add_pay_rate_v1', () => {
  const e = '2026-10-06';
  it('accepts a good rate, with or without transport', () => {
    expect(rateProblem(ok, e, today, add)).toBeNull();
    expect(rateProblem({ ...ok, transport: null }, e, today, add)).toBeNull();
    expect(rateProblem({ ...ok, transport: 0 }, e, today, add)).toBeNull();
  });
  it('refuses a start before the earliest date or more than a year away', () => {
    expect(rateProblem({ ...ok, effectiveFrom: '2026-10-05' }, e, today, add)).toMatch(/or later/);
    expect(rateProblem({ ...ok, effectiveFrom: '2027-12-01' }, e, today, add)).toMatch(/year/);
    expect(rateProblem({ ...ok, effectiveFrom: '' }, e, today, add)).toMatch(/date/);
  });
  it('refuses fees outside 1 to 10,000, blanks and more than two decimals', () => {
    expect(rateProblem({ ...ok, regular: 0 }, e, today, add)).toMatch(/cleaning fee/);
    expect(rateProblem({ ...ok, regular: NaN }, e, today, add)).toMatch(/cleaning fee/);
    expect(rateProblem({ ...ok, general: 10001 }, e, today, add)).toMatch(/deep clean/);
    expect(rateProblem({ ...ok, regular: 500.555 }, e, today, add)).toMatch(/cleaning fee/);
    expect(rateProblem({ ...ok, regular: 500.5 }, e, today, add)).toBeNull();
  });
  it('refuses a transport above 2,000 or negative', () => {
    expect(rateProblem({ ...ok, transport: 2001 }, e, today, add)).toMatch(/transport/);
    expect(rateProblem({ ...ok, transport: -1 }, e, today, add)).toMatch(/transport/);
    expect(rateProblem({ ...ok, transport: NaN }, e, today, add)).toMatch(/transport/);
  });
  it('needs a note of 3 to 500 characters', () => {
    expect(rateProblem({ ...ok, note: ' ab ' }, e, today, add)).toMatch(/why/i);
    expect(rateProblem({ ...ok, note: 'x'.repeat(501) }, e, today, add)).toMatch(/500/);
  });
});

describe('the RPC calls', () => {
  it('addPayRate sends the exact RPC arguments, trimming the note and passing a null transport through', async () => {
    rpcMock.mockResolvedValue({ ok: true, id: 'r1', effective_from: '2026-10-10', replayed: false });
    await addPayRate('prop-1', { ...ok, transport: null, note: '  Honey agreed  ' });
    expect(rpcMock).toHaveBeenCalledWith('admin_add_pay_rate_v1', {
      p_property_id: 'prop-1', p_effective_from: '2026-10-10', p_regular: 500, p_general: 1000, p_transport: null, p_note: 'Honey agreed',
    });
  });
  it('fetchPayRates cleans the numbers it gets back and keeps null transport null', async () => {
    rpcMock.mockResolvedValue({
      ok: true, today: '2026-10-06', next: null,
      in_force: { id: 'a', effective_from: '2026-09-30', regular_rate: '500', general_rate: 1000, transport_rate: null, note: null, created_at: 'x' },
      history: [{ id: 'a', effective_from: '2026-09-30', regular_rate: 500, general_rate: 1000, transport_rate: 150, note: 'n', created_at: 'x' }],
    });
    const r = await fetchPayRates('prop-1');
    expect(rpcMock).toHaveBeenCalledWith('admin_pay_rates_v1', { p_property_id: 'prop-1' });
    expect(r.in_force?.regular_rate).toBe(500);
    expect(r.in_force?.transport_rate).toBeNull();
    expect(r.next).toBeNull();
    expect(r.history[0]?.transport_rate).toBe(150);
  });
});
