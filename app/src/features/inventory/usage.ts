import { formatDay } from '@/lib/dates';
import type { Item } from './api';

// s120 usage learning: the words the inventory list and the item panel show. Pure, so the wording is tested without rendering.
// An item with no usage state (SQL not applied yet, or a durable) returns null everywhere and its screens keep the old layout.

type Num = string | number | null | undefined;
const num = (v: Num): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
/** Up to two decimals, no trailing zeros: "2.1", "0.17", "50". */
export const trimNumber = (v: Num): string | null => num(v)?.toLocaleString('en-PH', { maximumFractionDigits: 2 }) ?? null;
const counted = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export type UsageState = 'baseline' | 'learning' | 'measured';
export const usageStateOf = (i: Pick<Item, 'consumable' | 'usageState'>): UsageState | null =>
  i.consumable && (i.usageState === 'baseline' || i.usageState === 'learning' || i.usageState === 'measured') ? i.usageState : null;

/** `uses 2.1 per turnover`, or null when there is no rate. */
export function usesText(i: Item): string | null {
  if (!usageStateOf(i)) return null;
  const r = trimNumber(i.usagePerTurnover);
  return r === null ? null : `uses ${r} per turnover`;
}

/** `~7 turnovers`: quantity divided by the rate, only when the rate is above 0. */
export function turnoversText(i: Item): string | null {
  const rate = num(i.usagePerTurnover);
  const qty = num(i.qty);
  if (!usageStateOf(i) || rate === null || rate <= 0 || qty === null) return null;
  return `~${counted(Math.round(qty / rate), 'turnover', 'turnovers')}`;
}

export const USAGE_TONE = { measured: 'good', learning: 'warn', baseline: 'neutral' } as const;

/** The list pill: `measured · 3 counts`, `learning · 1 count`, `baseline · research`. The badge adds its own glyph, so colour is never the only signal. */
export function pillText(i: Item): string | null {
  const s = usageStateOf(i);
  if (!s) return null;
  if (s === 'baseline') return 'baseline · research';
  const n = num(i.usageCounts);
  return n === null ? s : `${s} · ${counted(n, 'count', 'counts')}`;
}

/** The item panel: the rate and state on one line, then the parts that have a value. */
export function panelUsage(i: Item): { state: UsageState; rate: string | null; details: string | null } | null {
  const state = usageStateOf(i);
  if (!state) return null;
  const rate = trimNumber(i.usagePerTurnover);
  const refillDay = formatDay(i.lastRefillAt);
  const refillQty = num(i.lastRefillQty);
  const countDay = formatDay(i.lastCountAt);
  const baseline = trimNumber(i.usageBaseline);
  const parts = [
    refillDay ? `last refill ${refillDay}${refillQty !== null && refillQty !== 0 ? ` (${refillQty > 0 ? '+' : ''}${trimNumber(refillQty)})` : ''}` : null,
    countDay ? `last count ${countDay}` : null,
    baseline ? `baseline ${baseline}` : null,
  ].filter((p): p is string => p !== null);
  // Joined parts read as one line: only the first begins with a capital, whichever parts are present.
  const line = parts.join(' · ');
  return { state, rate: rate === null ? null : `${rate} per turnover`, details: line ? line[0]!.toUpperCase() + line.slice(1) : null };
}
