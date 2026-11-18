import { supabase } from '@/lib/supabase';
import { unwrapList } from '@/lib/rpc';
import { isConsumptionReading } from '@/features/insights/api';
import { fetchMeterBaseline } from '@/features/operations/api';
import { stayNights, type BaselineRow } from '@/features/operations/meter-context';
import type { Stay } from './utilities-math';

// Per-guest utilities (s119 lane U). Reads only. The newest readings come from the existing fetchMeterBaseline
// (60 rows), and each is joined to its stay by meter_readings.session_id = cleaning_sessions.id.
// utility_rates has no client grant and is empty, so nothing here is a peso cost.
export const UTILITIES_KEY = (propertyId: string) => ['guest-utilities', propertyId] as const;

type SessionRow = { id: string; last_guest_name: string | null; checkin_date: string | null; checkout_date: string | null; nights_stayed: number | null };

const num = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Newest reading per session wins (rows arrive newest first); a reading with no session cannot be tied to a stay. */
export function joinStays(readings: BaselineRow[], sessions: SessionRow[]): Stay[] {
  const bySession = new Map(sessions.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const out: Stay[] = [];
  for (const r of readings) {
    const id = r.session_id;
    if (!id || seen.has(id)) continue;
    const s = bySession.get(id);
    if (!s) continue;
    seen.add(id);
    const flag = r.meter_flag?.trim() || null;
    // A reading with no flag that still breaks the photo chain (first entry, negative change) is not consumption either.
    const chain = isConsumptionReading({ electric_prev: r.electric_prev ?? null, water_prev: r.water_prev ?? null, electric_delta: r.electric_delta ?? null, water_delta: r.water_delta ?? null, meter_flag: null });
    out.push({
      sessionId: id,
      guest: s.last_guest_name?.trim() || null,
      date: s.checkout_date,
      nights: stayNights(s),
      kwh: num(r.electric_delta),
      m3: num(r.water_delta),
      estimate: flag ?? (chain ? null : 'chain_break'),
    });
  }
  return out;
}

export async function fetchStayUtilities(propertyId: string): Promise<Stay[]> {
  const readings = (await fetchMeterBaseline(propertyId)).filter((r) => r.session_id);
  if (!readings.length) return [];
  const ids = [...new Set(readings.map((r) => r.session_id as string))];
  const res = unwrapList<SessionRow>(await supabase.from('cleaning_sessions').select('id, last_guest_name, checkin_date, checkout_date, nights_stayed').eq('property_id', propertyId).in('id', ids));
  return joinStays(readings, res.rows);
}
