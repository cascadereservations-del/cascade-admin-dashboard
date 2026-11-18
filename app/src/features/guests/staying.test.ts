import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchStayRows } from './staying';
import type { TimelineEvent } from './api';

const cal = vi.hoisted(() => ({ readCalendarEvents: vi.fn() }));
vi.mock('@/features/bookings/calendar-reads', () => cal);
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const ev = (body: Record<string, unknown>): TimelineEvent => ({ kind: 'stay', at: '2026-01-01', source: 'x', body: { checkin: '2026-01-01', checkout: '2026-01-03', code: 'C', ...body } }) as TimelineEvent;
const calendar = [
  { uid: 'ics-1', linked_reservation_id: 'res-1', status: 'confirmed' },
  { uid: 'ics-2', linked_reservation_id: 'res-2', status: 'cancelled' },
  { uid: 'cascade-direct-inq-1', linked_reservation_id: 'mirror-1', status: 'confirmed' },
  { uid: 'cascade-direct-inq-3', linked_reservation_id: 'mirror-3', status: 'cancelled' },
];
beforeEach(() => { cal.readCalendarEvents.mockReset(); cal.readCalendarEvents.mockResolvedValue({ data: calendar, error: null }); });

describe('fetchStayRows', () => {
  it('maps airbnb via linked_reservation_id, direct via cascade-direct-<id>, and drops unmatched or unconfirmed', async () => {
    const qc = new QueryClient();
    const rows = await fetchStayRows('p1', [
      ev({ id: 'res-1', stayKind: 'airbnb', checkin: '2026-02-01' }),
      ev({ id: 'inq-1', stayKind: 'direct', checkin: '2026-03-01' }),
      ev({ id: 'res-9', stayKind: 'airbnb' }), // no calendar row
      ev({ id: 'res-2', stayKind: 'airbnb' }), // calendar row cancelled
      ev({ id: 'inq-3', stayKind: 'direct' }), // direct, calendar row cancelled
      ev({ id: 'x', stayKind: 'airbnb', uid: 'given-uid', checkin: '2026-01-15' }),
      ev({ id: 'res-1', stayKind: 'airbnb', status: 'cancelled' }),
    ], qc);
    expect(rows.map((r) => r.uid)).toEqual(['cascade-direct-inq-1', 'ics-1', 'given-uid']);
  });
  it('reads the calendar once for several guests', async () => {
    const qc = new QueryClient();
    await fetchStayRows('p1', [ev({ id: 'res-1', stayKind: 'airbnb' })], qc);
    await fetchStayRows('p1', [ev({ id: 'inq-1', stayKind: 'direct' })], qc);
    expect(cal.readCalendarEvents).toHaveBeenCalledTimes(1);
  });
});
