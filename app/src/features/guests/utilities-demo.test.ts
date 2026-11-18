import { expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', async () => {
  const { createDemoClient } = await import('@/lib/demo-client');
  return { supabase: createDemoClient(new Date('2026-11-18T02:00:00Z')) };
});

import { fetchStayUtilities } from './utilities-api';
import { averageOf, rankStays } from './utilities-math';
import { DEMO_PROPERTY_ID } from '@/lib/demo-data';

// Demo mode answers the new reads from the fixtures: 4 counted stays (36/3, 50/4, 44/2 kWh) and one estimate.
it('demo client answers the utilities reads, nothing is written', async () => {
  const stays = await fetchStayUtilities(DEMO_PROPERTY_ID);
  expect(stays.length).toBe(4);
  const r = rankStays(stays, 'kwh');
  expect(r.estimated.map((s) => s.guest)).toEqual(['Demo Guest Two']);
  expect(averageOf(stays, 'kwh')).toEqual({ avg: 130 / 9, nights: 9, stays: 3 });
  expect(r.ranked[0]!.stay.guest).toBe('Demo Guest One'); // 22 a night against 14.4: above average
  expect(r.ranked[0]!.high).toBe(true);
});
