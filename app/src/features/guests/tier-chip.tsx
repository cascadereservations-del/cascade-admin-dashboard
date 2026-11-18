import { Crown, Repeat, Sprout, Star } from 'lucide-react';

// s119 lane A: the guest tier as one chip shape (32 px, no animation) and a tier-graded name, from mockup-staff-staying-v4.
// The tier is the guests.tier value the admin already has (null = no tier yet = a first stay); the number is guests.total_stays. No thresholds live here.
export type TierKey = 'first' | 'returning' | 'regular' | 'vip';
const WORD: Record<TierKey, string> = { first: 'First', returning: 'Returning', regular: 'Regular', vip: 'VIP' };
const ICON = { first: Sprout, returning: Repeat, regular: Star, vip: Crown } as const;

export const tierKey = (tier: string | null | undefined): TierKey => (tier === 'returning' || tier === 'regular' || tier === 'vip' ? tier : 'first');

/** Short chip text: 'First', 'Returning · 2', 'Regular · 5', 'VIP · 12'. A first stay carries no count. */
export function tierChipText(tier: string | null | undefined, stays: number | null | undefined): string {
  const k = tierKey(tier);
  return k !== 'first' && stays ? `${WORD[k]} · ${stays}` : WORD[k];
}

/** Spoken form: 'Returning, 2 stays'. */
export function tierChipLabel(tier: string | null | undefined, stays: number | null | undefined): string {
  const k = tierKey(tier);
  return k !== 'first' && stays ? `${WORD[k]}, ${stays} ${stays === 1 ? 'stay' : 'stays'}` : k === 'first' ? 'First stay' : WORD[k];
}

export function TierChip({ tier, stays }: { tier: string | null | undefined; stays?: number | null }) {
  const k = tierKey(tier);
  const Icon = ICON[k];
  return (
    <span className="tier-chip" data-tier={k} role="img" aria-label={tierChipLabel(tier, stays)}>
      <Icon size={18} strokeWidth={1.75} aria-hidden />
      <span aria-hidden>{tierChipText(tier, stays)}</span>
    </span>
  );
}

/** The guest's name in the tier style: First and Returning plain ink, Regular bronze, VIP gold gradient (solid fallback in CSS). */
export function TierName({ tier, children, className }: { tier: string | null | undefined; children: string; className?: string }) {
  return <span className={`tier-name ${className ?? ''}`} data-tier={tierKey(tier)}>{children}</span>;
}
