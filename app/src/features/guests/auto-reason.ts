// s118 (D-369): the reason is written for the person on normal edits. The server still wants 3-500 characters
// (save_guest_profile_v1) and 3-200 (admin_set_guest_tier_v1); every string here meets both.
export type ReasonKind = 'contact' | 'notes' | 'id_type' | 'photo_added' | 'photo_replaced' | 'photo_removed' | 'tier' | 'tier_auto' | 'tags' | 'channel' | 'name' | 'companion';

const BASE: Record<ReasonKind, string> = {
  contact: 'Contact details changed',
  notes: 'Notes changed',
  id_type: 'ID type changed',
  photo_added: 'ID photo added',
  photo_replaced: 'ID photo replaced',
  photo_removed: 'ID photo removed',
  tier: 'Tier set by hand',
  tier_auto: 'Tier set to automatic',
  tags: 'Tags changed',
  channel: 'Preferred channel changed',
  name: 'Display name changed',
  companion: 'Companion details saved',
};

/** Always 3-500 characters (3-200 for a tier). Field labels read "Edited contact number"; photo and tier text stays fixed. */
export function autoReason(kind: ReasonKind, fields?: string[]): string {
  const labels = (fields ?? []).map((f) => f.trim()).filter(Boolean);
  const fixed = kind.startsWith('photo') || kind.startsWith('tier');
  const text = !fixed && labels.length ? `Edited ${labels.join(', ').toLowerCase()}` : BASE[kind];
  return text.slice(0, kind.startsWith('tier') ? 200 : 500).trim() || BASE[kind];
}

/** Changes that ask for a one-tap reason instead of an automatic one. Merge asks too, in its own sheet. */
export const SENSITIVE_FIELDS = ['id_number', 'address', 'id_on_file_off', 'vip'] as const;
export const REASON_CHIPS = ['Guest sent it on Airbnb', 'Seen at check-in', 'Correction'] as const;

/** Which sensitive kind a single-field change is, or null when an automatic reason is enough. */
export function sensitiveKind(field: string, value: unknown): (typeof SENSITIVE_FIELDS)[number] | null {
  if (field === 'id_on_file') return value === false ? 'id_on_file_off' : null;
  return (SENSITIVE_FIELDS as readonly string[]).includes(field) ? (field as (typeof SENSITIVE_FIELDS)[number]) : null;
}
