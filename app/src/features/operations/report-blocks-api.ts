import { supabase } from '@/lib/supabase';
import { rpc } from '@/lib/rpc';

// s101: meter readings to check. A meter photo the reader could not match to the typed numbers
// only flags the report now (D-354); submit-cleaning no longer blocks on it, and someone answers it here.
// Contract: docs/s101/CONTRACT-report-blocks.md (admin_report_blocks_v1, admin_resolve_report_block_v1).

export type ReportBlock = {
  reading_id: string; session_id: string | null; cleaner_name: string | null; checkout_date: string | null; recorded_at: string;
  typed_electric: number | null; typed_water: number | null; prev_electric: number | null; prev_water: number | null;
  photo_electric: number | null; photo_water: number | null; photo_note_electric: string | null; photo_note_water: string | null;
  photo_path_electric: string | null; photo_path_water: string | null;
};
export type ReportBlockRow = ReportBlock & { electric_url: string | null; water_url: string | null };

export type ReportBlockAction = 'typed_is_right' | 'correct_numbers';

/** numeric columns may arrive as numbers or strings; unknown stays null, never 0. */
export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function fetchReportBlocks(propertyId: string): Promise<ReportBlockRow[]> {
  const rows = await rpc<ReportBlock[] | null>('admin_report_blocks_v1', { p_property_id: propertyId });
  const list = rows ?? [];
  const paths = list.flatMap((r) => [r.photo_path_electric, r.photo_path_water]).filter((p): p is string => !!p);
  const urlByPath = new Map<string, string>();
  if (paths.length) {
    try {
      const { data } = await supabase.storage.from('cleaning-photos').createSignedUrls(paths, 900);
      for (const s of data ?? []) if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
    } catch { /* photos are a help, not a gate: the card still works without them */ }
  }
  return list.map((r) => ({
    ...r,
    typed_electric: num(r.typed_electric), typed_water: num(r.typed_water), prev_electric: num(r.prev_electric), prev_water: num(r.prev_water),
    photo_electric: num(r.photo_electric), photo_water: num(r.photo_water),
    electric_url: r.photo_path_electric ? (urlByPath.get(r.photo_path_electric) ?? null) : null,
    water_url: r.photo_path_water ? (urlByPath.get(r.photo_path_water) ?? null) : null,
  }));
}

export type ResolveResult = { ok: boolean; action?: string; reading_id?: string; reason?: string; message?: string };

export async function resolveReportBlock(readingId: string, action: ReportBlockAction, electric: number | null, water: number | null, note: string): Promise<ResolveResult> {
  const res = await rpc<ResolveResult>('admin_resolve_report_block_v1', { p_reading_id: readingId, p_action: action, p_electric: electric, p_water: water, p_note: note.trim() || null });
  // The RPC may report a refusal as {ok:false} without raising; show its own message.
  if (!res?.ok) throw new Error(res?.message ?? 'The server did not accept this. Nothing was changed.');
  return res;
}

/** Corrected numbers must be present and not below the last reading (a meter does not run backwards). Returns a plain problem or null. */
export function correctionProblem(row: Pick<ReportBlock, 'prev_electric' | 'prev_water'>, electric: string, water: string): string | null {
  const e = num(electric.trim()), w = num(water.trim());
  if (e === null || w === null) return 'Enter both the electric and the water number.';
  if (row.prev_electric !== null && e < row.prev_electric) return 'The electric number cannot be below the last reading.';
  if (row.prev_water !== null && w < row.prev_water) return 'The water number cannot be below the last reading.';
  return null;
}
