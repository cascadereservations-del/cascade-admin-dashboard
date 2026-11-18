import { describe, expect, it } from 'vitest';
import { averageOf, estimateWords, fmtValue, guestMatch, isHigh, litres, perNight, rankStays, READ_AS_HINT_UNDER, type Stay } from './utilities-math';

const stay = (o: Partial<Stay> & { sessionId: string }): Stay => ({ guest: 'Demo', date: '2026-11-01', nights: 1, kwh: 10, m3: 0.2, estimate: null, ...o });

describe('perNight', () => {
  it('divides by nights and returns null when unknown', () => {
    expect(perNight(30, 3)).toBe(10);
    expect(perNight(null, 3)).toBeNull();
    expect(perNight(30, null)).toBeNull();
    expect(perNight(30, 0)).toBeNull();
    expect(perNight(0, 2)).toBe(0); // zero use is a value, not unknown
  });
});

describe('isHigh', () => {
  it('flags at exactly 1.4 times the average, not below', () => {
    expect(isHigh(14, 10)).toBe(true);
    expect(isHigh(13.99, 10)).toBe(false);
    expect(isHigh(20, 10)).toBe(true);
  });
  it('is unrounded: 1.39999 stays unflagged although it displays like 1.4', () => {
    expect(isHigh(13.9999, 10)).toBe(false);
  });
  it('never flags without a usable average', () => {
    expect(isHigh(5, null)).toBe(false);
    expect(isHigh(5, 0)).toBe(false);
    expect(isHigh(null, 10)).toBe(false);
  });
});

describe('averageOf', () => {
  it('is total over total nights, not an average of averages', () => {
    const a = averageOf([stay({ sessionId: 'a', nights: 1, kwh: 30 }), stay({ sessionId: 'b', nights: 3, kwh: 30 })], 'kwh');
    expect(a).toEqual({ avg: 15, nights: 4, stays: 2 }); // 60/4; an average of averages (30, 10) would be 20
  });
  it('leaves out estimated rows and rows with an unknown value or nights', () => {
    const a = averageOf([
      stay({ sessionId: 'a', nights: 2, kwh: 20 }),
      stay({ sessionId: 'b', nights: 1, kwh: 500, estimate: 'misread' }),
      stay({ sessionId: 'c', nights: null, kwh: 99 }),
      stay({ sessionId: 'd', nights: 2, kwh: null }),
    ], 'kwh');
    expect(a).toEqual({ avg: 10, nights: 2, stays: 1 });
  });
  it('is null with nothing to average', () => {
    expect(averageOf([], 'kwh')).toEqual({ avg: null, nights: 0, stays: 0 });
  });
});

describe('rankStays', () => {
  const list = [
    stay({ sessionId: 'a', guest: 'A', nights: 2, kwh: 20 }), // 10 a night
    stay({ sessionId: 'b', guest: 'B', nights: 1, kwh: 30 }), // 30
    stay({ sessionId: 'c', guest: 'C', nights: 1, kwh: 500, estimate: 'typed_accepted' }),
    stay({ sessionId: 'd', guest: 'D', nights: 1, kwh: 20 }), // 20
    stay({ sessionId: 'e', guest: 'E', nights: null, kwh: 20 }),
  ];
  it('sorts counted stays by use per night, highest first, and lists estimated ones apart', () => {
    const r = rankStays(list, 'kwh');
    expect(r.ranked.map((x) => [x.stay.guest, x.value])).toEqual([['B', 30], ['D', 20], ['A', 10]]);
    expect(r.estimated.map((s) => [s.guest, s.estimate])).toEqual([['C', 'typed_accepted'], ['E', 'nights_unknown']]);
    expect(estimateWords('nights_unknown')).toBe('Nights not known');
    expect(rankStays([stay({ sessionId: 'x', kwh: null })], 'kwh').estimated[0]?.estimate).toBe('reading_unknown');
    expect(r.avg).toEqual({ avg: 17.5, nights: 4, stays: 3 });
  });
  it('marks high with the same unrounded rule', () => {
    const r = rankStays(list, 'kwh'); // average 17.5: 30 is 1.71x, 20 is 1.14x
    expect(r.ranked.map((x) => x.high)).toEqual([true, false, false]);
  });
  it('uses the water value for the water metric', () => {
    const r = rankStays([stay({ sessionId: 'a', nights: 2, m3: 1 }), stay({ sessionId: 'b', nights: 1, m3: 0.1 })], 'm3');
    expect(r.ranked.map((x) => x.value)).toEqual([0.5, 0.1]);
  });
});

describe('formatting', () => {
  it('rounds litres to the nearest 10', () => {
    expect(litres(0.493)).toBe(490);
    expect(litres(0.496)).toBe(500);
    expect(litres(1.11)).toBe(1110);
    expect(litres(0.004)).toBe(0);
  });
  it('prints each metric with its unit', () => {
    expect(fmtValue(16.84, 'kwh')).toBe('16.8 kWh');
    expect(fmtValue(0.493, 'm3')).toBe('490 litres');
  });
  it('hints under 3 nights', () => {
    expect(READ_AS_HINT_UNDER).toBe(3);
  });
  it('explains an estimate in plain words and falls back to the code with spaces', () => {
    expect(estimateWords('typed_accepted')).toMatch(/typed/i);
    expect(estimateWords('misread')).toMatch(/wrong/i);
    expect(estimateWords('chain_break')).toMatch(/last photo/i);
    expect(estimateWords('some_new_flag')).toBe('some new flag');
  });
});

describe('guestMatch', () => {
  it('matches the full name in any order, ignoring case and punctuation', () => {
    expect(guestMatch('Juan dela Cruz', 'Juan Dela Cruz')).toBe('exact');
    expect(guestMatch('Cruz, Juan', 'Juan Cruz')).toBe('exact');
    expect(guestMatch('Mr. Juan Cruz', 'Juan Cruz')).toBe('exact');
  });
  it('never calls a one-word name exact', () => {
    expect(guestMatch('Alpha', 'Alpha')).toBe('first');
    expect(guestMatch('Alpha', 'Dr Alpha')).toBe('first');
    expect(guestMatch('Alpha Demo', 'Alpha')).toBeNull();
  });
  it('matches a first-name-only report as a weaker match', () => {
    expect(guestMatch('Alpha', 'Alpha Demo')).toBe('first');
    expect(guestMatch('Alpha', 'Demo, Alpha')).toBe('first');
  });
  it('does not match a surname-only or different name, or empty input', () => {
    expect(guestMatch('Demo', 'Alpha Demo')).toBeNull();
    expect(guestMatch('Bravo', 'Bravon Reyes')).toBeNull();
    expect(guestMatch('', 'Bravo')).toBeNull();
    expect(guestMatch(null, 'Bravo')).toBeNull();
  });
});
