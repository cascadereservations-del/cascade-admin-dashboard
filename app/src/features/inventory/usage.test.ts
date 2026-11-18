import { describe, expect, it } from 'vitest';
import type { Item } from './api';
import { panelUsage, pillText, staysLearning, trimNumber, turnoversText, usageStateOf, usesText } from './usage';

// Invented items. Hand-computed expectations (ML-17).
const base: Item = {
  id: 'i1', name: 'Demo detergent', category: 'consumable', unit: 'sachets', qty: '15', reorderBelow: null, consumable: true, active: true, status: null,
  unitCost: null, purchaseUnit: null, unitsPerPurchase: null, photo: null, movementControlled: false, baselineNote: null,
  usage30d: null, usageDays: null, avgDaily: null, coverageDays: null, attention: false, estDailyUsage: null, estCoverageDays: null,
};
const item = (o: Partial<Item>): Item => ({ ...base, ...o });

describe('pill wording', () => {
  it('measured: plural and singular counts', () => {
    expect(pillText(item({ usageState: 'measured', usageCounts: 3 }))).toBe('measured · 3 counts');
    expect(pillText(item({ usageState: 'measured', usageCounts: 1 }))).toBe('measured · 1 count');
  });
  it('learning: singular for one, plural for two and for zero', () => {
    expect(pillText(item({ usageState: 'learning', usageCounts: 1 }))).toBe('learning · 1 count');
    expect(pillText(item({ usageState: 'learning', usageCounts: 2 }))).toBe('learning · 2 counts');
    expect(pillText(item({ usageState: 'learning', usageCounts: 0 }))).toBe('learning · 0 counts');
  });
  it('baseline reads research, whatever the count, but only with a baseline figure', () => {
    expect(pillText(item({ usageState: 'baseline', usageBaseline: '0.02', usageCounts: 0 }))).toBe('baseline · research');
    expect(pillText(item({ usageState: 'baseline', usageBaseline: 0.5 }))).toBe('baseline · research');
    expect(pillText(item({ usageState: 'baseline', usageBaseline: null, usageCounts: 0 }))).toBeNull();
    expect(pillText(item({ usageState: 'baseline' }))).toBeNull();
  });
  it('a movement-controlled item has no state, pill, rate, turnovers or panel line', () => {
    const c = item({ movementControlled: true, usageState: 'measured', usageCounts: 3, usagePerTurnover: '2', usageBaseline: '1', qty: '10' });
    expect(usageStateOf(c)).toBeNull();
    expect(pillText(c)).toBeNull();
    expect(usesText(c)).toBeNull();
    expect(turnoversText(c)).toBeNull();
    expect(panelUsage(c)).toBeNull();
  });
  it('an active consumable off the ledger stays in learning; a controlled, inactive or durable item does not', () => {
    expect(staysLearning(item({}))).toBe(true);
    expect(staysLearning(item({ movementControlled: true }))).toBe(false);
    expect(staysLearning(item({ active: false }))).toBe(false);
    expect(staysLearning(item({ consumable: false }))).toBe(false);
  });
  it('an unknown count is left out, not shown as 0', () => {
    expect(pillText(item({ usageState: 'measured', usageCounts: null }))).toBe('measured');
  });
  it('no pill without a state, and none for a durable item', () => {
    expect(pillText(item({}))).toBeNull();
    expect(pillText(item({ usageState: null }))).toBeNull();
    expect(pillText(item({ usageState: 'measured', usageCounts: 3, consumable: false }))).toBeNull();
  });
});

describe('uses and turnovers', () => {
  it('uses N per turnover, trimmed to two decimals', () => {
    expect(usesText(item({ usageState: 'measured', usagePerTurnover: '2.10' }))).toBe('uses 2.1 per turnover');
    expect(usesText(item({ usageState: 'learning', usagePerTurnover: 0.17 }))).toBe('uses 0.17 per turnover');
    expect(usesText(item({ usageState: 'baseline', usagePerTurnover: '0.02' }))).toBe('uses 0.02 per turnover');
  });
  it('turnovers are quantity over rate, rounded: 15 / 2.1 = 7, 2 / 0.17 = 12, 1 / 0.02 = 50', () => {
    expect(turnoversText(item({ usageState: 'measured', qty: '15', usagePerTurnover: '2.1' }))).toBe('~7 turnovers');
    expect(turnoversText(item({ usageState: 'learning', qty: '2', usagePerTurnover: '0.17' }))).toBe('~12 turnovers');
    expect(turnoversText(item({ usageState: 'baseline', qty: '1', usagePerTurnover: '0.02' }))).toBe('~50 turnovers');
  });
  it('one turnover is singular', () => {
    expect(turnoversText(item({ usageState: 'measured', qty: '2', usagePerTurnover: '2' }))).toBe('~1 turnover');
  });
  it('turnovers are hidden at rate 0, with no rate, and with no quantity', () => {
    expect(turnoversText(item({ usageState: 'measured', qty: '15', usagePerTurnover: '0' }))).toBeNull();
    expect(turnoversText(item({ usageState: 'measured', qty: '15', usagePerTurnover: 0 }))).toBeNull();
    expect(turnoversText(item({ usageState: 'measured', qty: '15', usagePerTurnover: null }))).toBeNull();
    expect(turnoversText(item({ usageState: 'measured', qty: 'n/a', usagePerTurnover: '2' }))).toBeNull();
  });
  it('nothing for an item without a state', () => {
    expect(usesText(item({ usagePerTurnover: '2' }))).toBeNull();
    expect(turnoversText(item({ usagePerTurnover: '2' }))).toBeNull();
  });
});

describe('item panel line', () => {
  const full = item({ usageState: 'measured', usagePerTurnover: '2.1', usageBaseline: '2.0', lastRefillAt: '2026-11-03T04:00:00Z', lastRefillQty: '10', lastCountAt: '2026-11-18T04:00:00Z' });
  it('shows every part', () => {
    expect(panelUsage(full)).toEqual({ state: 'measured', rate: '2.1 per turnover', details: 'Last refill 3 Nov (+10) · last count 18 Nov · baseline 2' });
  });
  it('dates are Manila days: 17:30 UTC on 2 Nov is 3 Nov in Manila', () => {
    expect(panelUsage({ ...full, lastRefillAt: '2026-11-02T17:30:00Z', lastCountAt: null, usageBaseline: null })!.details).toBe('Last refill 3 Nov (+10)');
  });
  it('leaves out every part with no value', () => {
    expect(panelUsage({ ...full, lastRefillAt: null })!.details).toBe('Last count 18 Nov · baseline 2');
    expect(panelUsage({ ...full, lastRefillQty: null })!.details).toBe('Last refill 3 Nov · last count 18 Nov · baseline 2');
    expect(panelUsage({ ...full, lastCountAt: null })!.details).toBe('Last refill 3 Nov (+10) · baseline 2');
    expect(panelUsage({ ...full, usageBaseline: null })!.details).toBe('Last refill 3 Nov (+10) · last count 18 Nov');
    expect(panelUsage({ ...full, lastRefillAt: null, lastCountAt: null, usageBaseline: null })!.details).toBeNull();
  });
  it('an unparseable date is left out, not shown as Invalid', () => {
    expect(panelUsage({ ...full, lastRefillAt: 'not a date' })!.details).toBe('Last count 18 Nov · baseline 2');
  });
  it('no rate: the rate part is null and the state still shows', () => {
    expect(panelUsage({ ...full, usagePerTurnover: null })).toMatchObject({ state: 'measured', rate: null });
  });
  it('null without a state', () => {
    expect(panelUsage(item({}))).toBeNull();
  });
});

describe('trimNumber', () => {
  it('trims and refuses junk', () => {
    expect(trimNumber('17.00')).toBe('17');
    expect(trimNumber(0)).toBe('0');
    expect(trimNumber(null)).toBeNull();
    expect(trimNumber('')).toBeNull();
    expect(trimNumber('x')).toBeNull();
  });
});
