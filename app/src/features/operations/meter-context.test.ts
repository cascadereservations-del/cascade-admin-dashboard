import { describe, expect, it } from 'vitest';
import { assessMeter, bandOf, baselineFrom, flagLabel, stayNights } from './meter-context';

const hist = [7, 8, 9, 10, 11, 12, 12, 13, 14, 15, 16, 17, 18, 20, 24, 26];
const water = [0.06, 0.1, 0.12, 0.14, 0.17, 0.2, 0.2, 0.25, 0.3, 0.4, 0.45, 0.5];
const base = { kwh: hist, m3: water };
const r = (o: Record<string, unknown> = {}) => ({ electric_prev: 4016, electric_curr: 4029, electric_delta: 13, water_prev: 75.215, water_curr: 75.541, water_delta: 0.326, kwh_per_night: 13, m3_per_night: 0.326, ...o });
const stay = { nights_stayed: 1, checkin_date: '2026-09-27', checkout_date: '2026-09-28' };

describe('meter context', () => {
  it('needs a minimum history before it draws a band', () => {
    expect(bandOf([1, 2, 3, 4])).toBeNull();
    const b = bandOf(hist)!;
    expect(b.median).toBe(13.5);
    expect(b.low).toBeGreaterThan(0);
    expect(b.high).toBeGreaterThan(26);
  });
  it('calls an ordinary reading normal and says why', () => {
    const a = assessMeter(r(), stay, base);
    expect(a.status).toBe('normal');
    expect(a.why).toMatch(/both within/);
  });
  it('flags high and low per-night usage, worst meter wins', () => {
    expect(assessMeter(r({ electric_curr: 4116, electric_delta: 100, kwh_per_night: 100 }), stay, base).status).toBe('high');
    const low = assessMeter(r({ water_curr: 75.217, water_delta: 0.002, m3_per_night: 0.002 }), stay, base);
    expect(low.status).toBe('low');
    expect(low.why).toMatch(/^Water/);
  });
  it('treats bad arithmetic, zero use, a backwards meter and gaps as check reading', () => {
    expect(assessMeter(r({ electric_delta: 99 }), stay, base).status).toBe('check');
    expect(assessMeter(r({ electric_curr: 4016, electric_delta: 0, kwh_per_night: 0 }), stay, base).status).toBe('check');
    expect(assessMeter(r({ electric_curr: 4000, electric_delta: -16 }), stay, base).why).toMatch(/lower/);
    expect(assessMeter(r({ water_prev: null }), stay, base).status).toBe('check');
  });
  it('says so when there is no baseline', () => {
    expect(assessMeter(r(), stay, { kwh: [], m3: [] }).status).toBe('unknown');
  });
  it('derives per-night from nights when the stored value is missing', () => {
    const a = assessMeter(r({ kwh_per_night: null, electric_delta: 26, electric_curr: 4042 }), { nights_stayed: 2 }, base);
    expect(a.electric.perNight).toBe(13);
  });
  it('counts nights from the stored value or the dates', () => {
    expect(stayNights({ nights_stayed: 3 })).toBe(3);
    expect(stayNights({ checkin_date: '2026-08-27', checkout_date: '2026-09-02' })).toBe(6);
    expect(stayNights({})).toBeNull();
  });
  it('builds the baseline from ordinary recent stays only', () => {
    const rows = [
      { ...r(), session_id: 'this' }, { ...r({ meter_flag: 'misread' }), session_id: 'a' }, { ...r({ electric_prev: 0 }), session_id: 'b' },
      { ...r({ electric_delta: 0 }), session_id: 'c' }, { ...r({ kwh_per_night: 9 }), session_id: 'd' }, { ...r({ kwh_per_night: 8 }), session_id: 'e' },
    ];
    expect(baselineFrom(rows, 'this').kwh).toEqual([9, 8]);
    expect(baselineFrom(rows, 'this', 1).kwh).toEqual([9]);
  });
  it('words flags in plain language', () => {
    expect(flagLabel('misread')).toMatch(/numbers are wrong/);
    expect(flagLabel('something_new')).toBe('something new');
  });
});
