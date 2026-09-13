import { supabase } from './supabase';
import { toAppError } from './errors';
import { assertRpcEnabled } from './rollout';

// Every adapter call goes through here so PostgREST errors become structured
// AppErrors and a missing RPC surfaces as "unavailable", never as empty data.
// Mutating RPCs are also subject to the module-by-module rollout gate.
export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  assertRpcEnabled(fn);
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw toAppError(error);
  return data as T;
}

export function unwrap<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw toAppError(res.error);
  if (res.data === null) throw toAppError({ code: 'PGRST116', message: 'No data' });
  return res.data;
}

export function unwrapList<T>(res: { data: T[] | null; error: unknown; count?: number | null }): { rows: T[]; total: number } {
  if (res.error) throw toAppError(res.error);
  const rows = res.data ?? [];
  return { rows, total: res.count ?? rows.length };
}

export const PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export function pageRange(page: number, size = PAGE_SIZE): [number, number] {
  const s = Math.min(Math.max(1, size), MAX_PAGE_SIZE);
  const p = Math.max(1, page);
  return [(p - 1) * s, p * s - 1];
}
