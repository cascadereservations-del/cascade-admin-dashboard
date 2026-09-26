import { describe, expect, it } from 'vitest';
import { pctToPrice, promoStatus, tierProblem, tierRate } from './api';

// SPEC-34: the Pricing tab's own arithmetic must agree with pricing.ts (the server) and the site.
describe('pricing helpers', () => {
  it('tier rates round exactly as the server does (seed card)', () => {
    expect([5, 10, 15, 20, 25].map((p) => tierRate(1780, p))).toEqual([1691, 1602, 1513, 1424, 1335]);
  });
  it('a % off promotion becomes a whole-peso price', () => {
    expect(pctToPrice(1780, 20)).toBe(1424);
    expect(pctToPrice(1780, 13.3)).toBe(1543);
  });
  it('tierProblem mirrors publish_rate_card_v1', () => {
    expect(tierProblem([{ min_nights: 2, pct: 5 }, { min_nights: 5, pct: 10 }])).toBeNull();
    expect(tierProblem([{ min_nights: 1, pct: 5 }])).toMatch(/2 nights/);
    expect(tierProblem([{ min_nights: 2, pct: 0 }])).toMatch(/between/);
    expect(tierProblem([{ min_nights: 2, pct: 5 }, { min_nights: 2, pct: 6 }])).toMatch(/Two discounts/);
    expect(tierProblem([{ min_nights: 2, pct: 10 }, { min_nights: 5, pct: 5 }])).toMatch(/smaller/);
    expect(tierProblem([{ min_nights: 2.5, pct: 5 }])).toMatch(/whole/);
  });
  it('promoStatus: upcoming, active, ended (by last night or ended early)', () => {
    const p = { active: true, first_night: '2026-10-11', last_night: '2026-10-17' };
    expect(promoStatus(p, '2026-09-26')).toBe('upcoming');
    expect(promoStatus(p, '2026-10-11')).toBe('active');
    expect(promoStatus(p, '2026-10-17')).toBe('active');
    expect(promoStatus(p, '2026-10-18')).toBe('ended');
    expect(promoStatus({ ...p, active: false }, '2026-10-12')).toBe('ended');
  });
});
