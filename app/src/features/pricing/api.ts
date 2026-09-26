import { supabase } from '@/lib/supabase';
import { rpc, unwrapList } from '@/lib/rpc';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/lib/env';

// Pricing adapter (SPEC-34, D-259, D-261, D-262). The rate card is the ONE price every module reads: the booking
// site and the concierge through the rate-card function, submit-booking through the same quote(). This tab edits
// it only through publish_rate_card_v1 / save_rate_promotion_v1 / end_rate_promotion_v1 (publish_rate_policy,
// audited). The Preview asks the live rate-card function, so it shows exactly what a guest would be charged.

export type Tier = { min_nights: number; pct: number };
export type Promotion = { name: string; first_night: string; last_night: string; nightly_rate: number };
export type RateCard = { base: number; currency: string; deposit_pct: number; tiers: Tier[]; version_id: string; effective_from: string; promotions: Promotion[];
  /** Cards published to start after today (release rate_card_upcoming_20260926). */
  upcoming?: Array<{ effective_from: string; base: number; deposit_pct: number; tiers: Tier[]; version_id: string }> };
export type CardVersion = { id: string; effective_from: string; effective_to: string | null; nightly_rate: string; terms: { tiers?: Tier[]; deposit_pct?: number }; approved_at: string };
export type PromotionRow = Promotion & { id: string; active: boolean; created_at: string; updated_at: string };
export type QuoteNight = { date: string; rate: number; source: 'promo' | 'tier'; promo?: string };
export type Quote = { nights: QuoteNight[]; n: number; total: number; standard_total: number; tier_pct: number; tier_rate: number; deposit: number; last_minute: boolean; promo_nights: number; promo_name: string | null; promo_rate: number | null };

/** The same rounding as pricing.ts and the site: a tier's nightly rate from the base and its % off. */
export const tierRate = (base: number, pct: number) => Math.round(base * (1 - pct / 100));
/** "% off the standard" converted to a promotion price per night. */
export const pctToPrice = (base: number, pct: number) => Math.round(base * (1 - pct / 100));

/** Mirrors publish_rate_card_v1's check, so a bad table is caught before the server refuses it. */
export function tierProblem(tiers: Tier[]): string | null {
  const seen = new Set<number>();
  for (const t of tiers) {
    if (!Number.isInteger(t.min_nights) || t.min_nights < 2) return 'Each discount starts at 2 nights or more (whole nights).';
    if (!(t.pct > 0 && t.pct < 100)) return 'Each discount is between 0% and 100%.';
    if (seen.has(t.min_nights)) return `Two discounts start at ${t.min_nights} nights.`;
    seen.add(t.min_nights);
  }
  const sorted = [...tiers].sort((a, b) => a.min_nights - b.min_nights);
  for (let i = 1; i < sorted.length; i++) if (sorted[i]!.pct < sorted[i - 1]!.pct) return 'A longer stay should never get a smaller discount.';
  return null;
}

export function promoStatus(p: { active: boolean; first_night: string; last_night: string }, today: string): 'active' | 'upcoming' | 'ended' {
  if (!p.active || p.last_night < today) return 'ended';
  return p.first_night <= today ? 'active' : 'upcoming';
}

export function fetchCard() {
  return rpc<RateCard>('get_rate_card_v1', {});
}
export async function fetchVersions(propertyId: string) {
  const res = await supabase.from('booking_rate_policy_versions').select('id, effective_from, effective_to, nightly_rate, terms, approved_at')
    .eq('property_id', propertyId).order('effective_from', { ascending: false }).limit(20);
  return unwrapList<CardVersion>(res).rows;
}
export async function fetchPromotions(propertyId: string) {
  const res = await supabase.from('rate_promotions').select('id, name, first_night, last_night, nightly_rate, active, created_at, updated_at')
    .eq('property_id', propertyId).order('first_night', { ascending: false }).limit(50);
  return unwrapList<PromotionRow>(res).rows.map((p) => ({ ...p, nightly_rate: Number(p.nightly_rate) }));
}
export function publishCard(input: { base: number; tiers: Tier[]; depositPct: number; effectiveFrom: string; reason: string; key: string }) {
  return rpc<string>('publish_rate_card_v1', { p_base: input.base, p_tiers: input.tiers, p_effective_from: input.effectiveFrom, p_reason: input.reason, p_idempotency_key: input.key, p_deposit_pct: input.depositPct });
}
export function savePromotion(input: { id: string | null; name: string; firstNight: string; lastNight: string; nightlyRate: number; reason: string }) {
  return rpc<string>('save_rate_promotion_v1', { p_id: input.id, p_name: input.name, p_first_night: input.firstNight, p_last_night: input.lastNight, p_nightly_rate: input.nightlyRate, p_reason: input.reason });
}
export function endPromotion(id: string, reason: string) {
  return rpc<boolean>('end_rate_promotion_v1', { p_id: id, p_reason: reason });
}
/** The live quote a guest gets on the booking site for these dates. */
export async function previewQuote(checkin: string, checkout: string): Promise<Quote> {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/rate-card?checkin=${encodeURIComponent(checkin)}&checkout=${encodeURIComponent(checkout)}`, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY } });
  const j = (await r.json().catch(() => ({}))) as { quote?: Quote; error?: string };
  if (!r.ok || !j.quote) throw { code: String(r.status), message: j.error === 'invalid_stay_length' ? 'A stay is 1 to 60 nights.' : 'The price could not be read just now.' };
  return j.quote;
}
