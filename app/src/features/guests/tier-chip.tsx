import { Crown, Repeat, Sprout, Star } from 'lucide-react';

// s119 lane A: the guest tier as one chip shape (32 px, no animation) and a tier-graded name, from mockup-staff-staying-v4.
// The tier is the guests.tier value the admin already has (null = no tier yet = a first stay); the number is guests.total_stays. No thresholds live here.
export type TierKey = 'first' | 'returning' | 'regular' | 'vip';
const WORD: Record<TierKey, string> = { first: 'First', returning: 'Returning', regular: 'Regular', vip: 'VIP' };
const ICON = { first: Sprout, returning: Repeat, regular: Star, vip: Crown } as const;

/** Same rule as the Staff app tierBadge: a known tier wins, except first (or none) with more than one stay is Returning; no data shows First. */
export const tierKey = (tier: string | null | undefined, stays?: number | null): TierKey => {
  const n = stays && stays > 0 ? Math.round(stays) : 0;
  const t: TierKey = tier === 'returning' || tier === 'regular' || tier === 'vip' ? tier : 'first';
  return t === 'first' && n > 1 ? 'returning' : t;
};
const count = (k: TierKey, stays: number | null | undefined) => { const n = stays && stays > 0 ? Math.round(stays) : 0; return k === 'first' || n <= 1 ? 0 : n; };

/** Short chip text: 'First', 'Returning · 2', 'Regular · 5', 'VIP · 12'. A count of one (or none) is left off: 'VIP'. */
export function tierChipText(tier: string | null | undefined, stays: number | null | undefined): string {
  const k = tierKey(tier, stays);
  const n = count(k, stays);
  return n ? `${WORD[k]} · ${n}` : WORD[k];
}

/** Spoken form: 'Returning, 2 stays'. */
export function tierChipLabel(tier: string | null | undefined, stays: number | null | undefined): string {
  const k = tierKey(tier, stays);
  const n = count(k, stays);
  return n ? `${WORD[k]}, ${n} stays` : k === 'first' ? 'First stay' : WORD[k];
}

export function TierChip({ tier, stays }: { tier: string | null | undefined; stays?: number | null }) {
  const k = tierKey(tier, stays);
  const Icon = ICON[k];
  return (
    <span className="tier-chip" data-tier={k} role="img" aria-label={tierChipLabel(tier, stays)}>
      <Icon size={18} strokeWidth={1.75} aria-hidden />
      <span aria-hidden>{tierChipText(tier, stays)}</span>
    </span>
  );
}

/** The guest's name in the tier style: First and Returning plain ink, Regular bronze, VIP gold gradient (solid fallback in CSS). */
export function TierName({ tier, stays, children, className }: { tier: string | null | undefined; stays?: number | null; children: string; className?: string }) {
  return <span className={`tier-name ${className ?? ''}`} data-tier={tierKey(tier, stays)}>{children}</span>;
}
