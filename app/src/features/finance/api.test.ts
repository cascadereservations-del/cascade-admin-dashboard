import { describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ log: [] as string[], result: { data: [] as unknown[], error: null as unknown, count: 0 } }));
vi.mock('@/lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'is', 'not', 'gte', 'lt', 'or', 'order']) chain[m] = (...a: unknown[]) => { calls.log.push(`${m}(${a.map((x) => (typeof x === 'object' ? 'obj' : String(x))).join(',')})`); return chain; };
  chain.range = (a: number, b: number) => { calls.log.push(`range(${a},${b})`); return Promise.resolve(calls.result); };
  return { supabase: { from: () => chain } };
});
vi.mock('@/lib/rpc', async () => {
  const real = await vi.importActual<typeof import('@/lib/rpc')>('@/lib/rpc');
  return { ...real, rpc: vi.fn() };
});

import { applyTxnFilters, EXPORT_CAP, exportCompleteness, fetchTransactionsForExport, hidePendingInquiryRows } from './api';

function filtered(f: Parameters<typeof applyTxnFilters>[1]) {
  const log: string[] = [];
  const q: Record<string, unknown> = {};
  for (const m of ['or', 'eq', 'neq', 'is', 'not', 'gte', 'lt']) q[m] = (...a: unknown[]) => { log.push(`${m}(${a.join(',')})`); return q; };
  applyTxnFilters(q as never, f);
  return log;
}

describe('applyTxnFilters', () => {
  it('hides void and hidden rows by default', () => {
    const l = filtered({});
    expect(l).toContain('neq(status,void)');
    expect(l).toContain('is(hidden_at,)');
  });
  it('Show hidden stops excluding hidden rows', () => {
    expect(filtered({ hidden: '1' })).not.toContain('is(hidden_at,)');
  });
  it('Show voided or archived lets void rows back in, one kind at a time', () => {
    expect(filtered({ voided: '1' })).toContain('or(status.neq.void,archived_at.is.null)');
    expect(filtered({ archived: '1' })).toContain('or(status.neq.void,archived_at.not.is.null)');
    const both = filtered({ voided: '1', archived: '1' });
    expect(both.some((x) => x.startsWith('neq(status,void)') || x.startsWith('or(status'))).toBe(false);
  });
  it('applies search, type, status, source and date filters', () => {
    const l = filtered({ q: 'ink', type: 'expense', status: 'confirmed', source: 'ocr', from: '2026-10-01', to: '2026-11-01' });
    expect(l).toContain('eq(txn_type,expense)');
    expect(l).toContain('eq(status,confirmed)');
    expect(l).toContain('eq(source,ocr)');
    expect(l).toContain('gte(transaction_date,2026-10-01)');
    expect(l).toContain('lt(transaction_date,2026-11-01)');
    expect(l.some((x) => x.startsWith('or(payee_name.ilike.%ink%'))).toBe(true);
  });
  it('excludes mirror sources unless asked', () => {
    expect(filtered({}).some((x) => x.startsWith('not(source,in,'))).toBe(true);
    expect(filtered({ mirror: 'show' }).some((x) => x.startsWith('not(source,in,'))).toBe(false);
  });
});

describe('fetchTransactionsForExport', () => {
  it('asks for rows 0..999, not the visible page, and reports not capped when all fit', async () => {
    calls.log.length = 0;
    calls.result = { data: [{ id: 'a' }, { id: 'b' }], error: null, count: 2 };
    const r = await fetchTransactionsForExport('p1', { page: '3' });
    expect(calls.log).toContain(`range(0,${EXPORT_CAP - 1})`);
    expect(r).toEqual({ rows: [{ id: 'a' }, { id: 'b' }], total: 2, capped: false });
  });
  it('reports capped when more rows match than came back', async () => {
    calls.result = { data: new Array(EXPORT_CAP).fill({ id: 'x' }), error: null, count: 1400 };
    const r = await fetchTransactionsForExport('p1', {});
    expect(r.capped).toBe(true);
    expect(r.total).toBe(1400);
  });
  it('passes the Show hidden toggle through unchanged', async () => {
    calls.log.length = 0;
    calls.result = { data: [], error: null, count: 0 };
    await fetchTransactionsForExport('p1', { hidden: '1' });
    expect(calls.log).not.toContain('is(hidden_at,obj)');
    calls.log.length = 0;
    await fetchTransactionsForExport('p1', {});
    expect(calls.log).toContain('is(hidden_at,obj)');
  });
});

describe('exportCompleteness', () => {
  const all = { rows: [{}, {}], total: 2, capped: false };
  it('says hidden rows are excluded, and how to include them, when Show hidden is off', () => {
    expect(exportCompleteness(all, {})).toBe('all 2 matching rows; hidden rows excluded; turn on Show hidden to include them');
    expect(exportCompleteness({ ...all, total: 1400, capped: true }, {})).toContain('(export cap); narrow the dates or filters for the rest; hidden rows excluded; turn on Show hidden to include them');
  });
  it('stays silent about hidden rows when Show hidden is on', () => {
    expect(exportCompleteness(all, { hidden: '1' })).toBe('all 2 matching rows');
  });
});

describe('hidePendingInquiryRows (SPEC-44: Inquiries is the one place to confirm a direct booking)', () => {
  const rows = [
    { id: '1', source: 'direct_booking', booking_id: 'pending-1' },
    { id: '2', source: 'direct_booking', booking_id: 'confirmed-1' },
    { id: '3', source: 'ocr', booking_id: 'pending-1' },
    { id: '4', source: 'direct_booking', booking_id: null },
  ];
  it('hides direct_booking rows whose booking is still pending and keeps every other row', () => {
    expect(hidePendingInquiryRows(rows, new Set(['pending-1'])).map((r) => r.id)).toEqual(['2', '3', '4']);
  });
  it('holds back every direct_booking row while the list is still loading', () => {
    expect(hidePendingInquiryRows(rows, null, true).map((r) => r.id)).toEqual(['3']);
  });
  it('hides nothing when the pending list could not be read', () => {
    expect(hidePendingInquiryRows(rows, null)).toHaveLength(4);
  });
  it('hides nothing when no booking is pending', () => {
    expect(hidePendingInquiryRows(rows, new Set())).toHaveLength(4);
  });
});
