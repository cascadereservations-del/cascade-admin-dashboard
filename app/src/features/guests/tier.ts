import type { TimelineEvent } from './api';

export type Tier = 'returning' | 'regular' | 'vip';
export const TIER_LABEL: Record<Tier, string> = { returning: 'Returning', regular: 'Regular', vip: 'VIP' };
export const TIER_OPTIONS = [{ value: 'auto', label: 'Automatic' }, ...(Object.keys(TIER_LABEL) as Tier[]).map((value) => ({ value, label: TIER_LABEL[value] }))];

/** Label for a tier value; unknown values (old data) show as stored, none shows null. */
export const tierLabel = (t: string | null | undefined) => (t ? TIER_LABEL[t as Tier] ?? t : null);

// Staff-facing benefits per tier. Wording must match public.guest_tier_line_v1 (stay-site release
// 20261028_s95_guest_tiers) after its "<Label> guest (<N+1>th stay): " prefix; the admin has no
// completed-stay count, so the ordinal is left out here.
export const TIER_BENEFITS: Record<Tier, string> = {
  returning: 'welcome treat (local coffee sachets + snack); first hour of early check-in or late check-out free if the calendar allows.',
  regular: 'welcome treat (local coffee sachets + snack); up to 2 hours early check-in or late check-out free if the calendar allows; set up their saved preferences.',
  vip: 'welcome treat (local coffee sachets + snack) and a handwritten welcome note; up to 2 hours early or late free if the calendar allows; mid-stay refresh at any stay length; set up their saved preferences.',
};
export const tierBenefits = (t: string | null | undefined) => (t && t in TIER_BENEFITS ? `${TIER_LABEL[t as Tier]} guest: ${TIER_BENEFITS[t as Tier]}` : null);

/** The reason a manual change must carry: 3-200 characters once trimmed (matches admin_set_guest_tier_v1). */
export const tierReasonProblem = (reason: string) => {
  const n = reason.trim().length;
  return n < 3 || n > 200 ? 'Give a reason of 3 to 200 characters.' : null;
};

/** Timeline rows written by refresh_guest_stats ("Tier: ...") and admin_set_guest_tier_v1 ("Manual tier: ..."). */
export const tierHistory = (events: TimelineEvent[]) =>
  events.filter((e) => e.kind === 'profile_change' && /^(Tier|Manual tier):/.test(String(e.body.reason ?? '')));
