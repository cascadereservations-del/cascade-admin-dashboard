import { safeDriveUrl, safeMessengerUrl } from './local-records';

export function guestSearchPattern(query: string): string | null {
  // Treat filter grammar and wildcard characters as word separators. Retain
  // Unicode names, phone prefixes, email punctuation and apostrophes.
  const words = query.slice(0, 120).replace(/[^\p{L}\p{N}\s@+.'-]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return words.length ? `%${words.join('%')}%` : null;
}

export function guestPage(value: string | undefined): number {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 1 ? Math.min(n, 100_000) : 1;
}

export function validateProfilePatch(patch: Record<string, unknown>, reason: string) {
  if (reason.trim().length < 3 || reason.length > 500) throw new Error('Add a reason between 3 and 500 characters.');
  if (patch.messenger_link && !safeMessengerUrl(String(patch.messenger_link))) throw new Error('Use an HTTPS Messenger or Facebook link.');
  if (patch.id_drive_url && !safeDriveUrl(String(patch.id_drive_url))) throw new Error('Use an HTTPS Google Drive file or folder link.');
  if (patch.birthday) {
    const value = String(patch.birthday);
    const date = new Date(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || date.getTime() > Date.now()) throw new Error('Enter a valid birthday that is not in the future.');
  }
  if (Object.values(patch).some((v) => typeof v === 'string' && v.length > 4000)) throw new Error('Keep each profile field within 4,000 characters.');
  if (Array.isArray(patch.tags) && (patch.tags.length > 20 || patch.tags.some((t) => typeof t !== 'string' || t.length > 50))) throw new Error('Use up to 20 tags, each at most 50 characters.');
}
