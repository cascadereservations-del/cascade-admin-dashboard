import type { Companion, ProfileDetails } from './api';

// The primary guest has no photo column of their own (D-129): their ID photo is a companion row
// whose name equals the guest name. These are the pure rules around that convention.

export const ID_TYPES = [['passport', 'Passport'], ['drivers_license', 'Driver’s license'], ['national_id', 'National ID'], ['other', 'Other']] as const;

// Airbnb names can carry invisible direction marks (U+2066-U+2069), e.g. "⁨Dino Jr.⁩ Tan".
const norm = (s: string) => s.replace(/[⁦-⁩]/g, '').trim().toLowerCase();
export const sameName = (a: string, b: string) => norm(a) === norm(b);

/** The companion row that stands for the guest themself; prefers one that already holds a photo. */
export function findSelfCompanion(rows: Companion[] | undefined, guestName: string): Companion | undefined {
  const same = (rows ?? []).filter((c) => sameName(c.name, guestName));
  return same.find((c) => c.id_photo_path) ?? same[0];
}

/** Real companions: every row except the one that holds the guest's own ID (shown on the guest card instead). */
export function otherCompanions(rows: Companion[] | undefined, guestName: string): Companion[] {
  const self = findSelfCompanion(rows, guestName);
  return (rows ?? []).filter((c) => c.id !== self?.id);
}

/** What the guest card says about the guest's ID. Some bookers' IDs were never sent - only the people who
 *  stayed (companions) sent theirs; that counts as an ID photo, as the guests list says. "Marked" means the
 *  profile box is ticked but no photo is saved for anyone on the stay. */
export type GuestIdStatus = 'photo' | 'companion_photos' | 'marked_no_photo' | 'none';
export function guestIdStatus(self: Pick<Companion, 'id_photo_path'> | undefined, details: Pick<ProfileDetails, 'id_on_file'> | null | undefined, companionPhotos = 0): GuestIdStatus {
  if (self?.id_photo_path) return 'photo';
  if (companionPhotos > 0) return 'companion_photos';
  return details?.id_on_file ? 'marked_no_photo' : 'none';
}

/** Guests list: which guests have real companions and which have any ID photo, from all companion rows at once. */
export function companionFlags(rows: { guest_id: string; name: string; id_photo_path: string | null; guest_name: string | null }[]) {
  const companions = new Set<string>(), photos = new Set<string>();
  for (const r of rows) {
    if (r.id_photo_path) photos.add(r.guest_id);
    if (!r.guest_name || !sameName(r.name, r.guest_name)) companions.add(r.guest_id);
  }
  return { companions, photos };
}

export type IdPhotoRef = { companionId: string; path: string; name: string; idType: string | null; isSelf: boolean };

/** Every ID photo for the viewer: the guest's own first, then companions in list order. */
export function idPhotoRefs(rows: Companion[] | undefined, guestName: string): IdPhotoRef[] {
  const self = findSelfCompanion(rows, guestName);
  const withPhoto = (rows ?? []).filter((c) => c.id_photo_path);
  const ordered = [...withPhoto.filter((c) => c.id === self?.id), ...withPhoto.filter((c) => c.id !== self?.id)];
  return ordered.map((c) => ({ companionId: c.id, path: c.id_photo_path!, name: c.name, idType: c.id_type, isSelf: c.id === self?.id }));
}

/** Patch for the audited companion save that creates or updates the guest's own row. */
export function selfCompanionPatch(guestName: string, idType: string, existing: Companion | undefined): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (!existing) patch.name = guestName.trim();
  if (idType) patch.id_type = idType;
  return patch;
}

export const needsIdOnFile = (details: Pick<ProfileDetails, 'id_on_file'> | null | undefined) => !details?.id_on_file;

/** First problem with the dialog inputs, or null. File content is checked separately by validateIdPhoto. */
export function idPhotoFormError(file: File | null, reason: string): string | null {
  if (!file) return 'Choose a photo of the ID.';
  if (reason.trim().length < 3) return 'Add a reason for this change.';
  if (reason.length > 500) return 'Keep the reason within 500 characters.';
  return null;
}

export function idPhotoLabel(ref: Pick<IdPhotoRef, 'name' | 'isSelf'>) {
  return ref.isSelf ? `${ref.name.trim()} (guest)` : ref.name.trim();
}
