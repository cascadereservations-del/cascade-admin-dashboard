// Shared by the offline preparation script and the browser. No I/O or network.
// Values remain source statements: no OCR, identity matching or date inference.
export type LocalField = { label: string; value: string; line: number };
export type LocalPhoto = { path: string; sha256: string; bytes: number; driveUrl?: string };
export type LocalRecord = {
  key: string;
  folder: string;
  kind: 'documented' | 'inquiry_only' | 'folder_only';
  displayName: string;
  stayDates: string | null;
  guestCount: string | null;
  contact: string | null;
  fields: LocalField[];
  notes: LocalField[];
  identity: LocalField[];
  sourceText: string;
  sourcePath: string | null;
  sourceHash: string | null;
  photos: LocalPhoto[];
};
export type LocalCollection = { schemaVersion: 1; generatedAt: string; records: LocalRecord[] };
export const MAX_COLLECTION_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export function safeRelativePath(path: string): boolean {
  return !!path && path.length <= 1024 && !path.startsWith('/') && !/[\\:\x00-\x1f]/.test(path) && path.split('/').every((s) => s !== '' && s !== '.' && s !== '..');
}

export function safeDriveUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.hostname !== 'drive.google.com' || u.port || u.username || u.password) return null;
    const valid = /^\/(?:file\/d|drive\/folders)\/[A-Za-z0-9_-]+(?:\/view)?\/?$/.test(u.pathname);
    return valid ? `https://drive.google.com${u.pathname}` : null;
  } catch { return null; }
}

export function safeMessengerUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.port && !u.username && !u.password && ['messenger.com', 'www.messenger.com', 'm.me', 'www.facebook.com', 'facebook.com', 'business.facebook.com'].includes(u.hostname) ? u.href : null;
  } catch { return null; }
}

const noteLabel = /birthday|special occasion|special request|courtesy|benefit|early check|purpose\/request|reservation change|security concern/i;
const identityLabel = /legal name|\bID\b|address|birth date|date of birth/i;
const blankValue = /^(?:not (?:provided|stated|recorded|available)|unknown|none|n\/a|—)(?:[.\s;(]|$)/i;
const valueOrNull = (s: string | undefined) => !s || blankValue.test(s) ? null : s;

export function parseGuestMarkdown(text: string, folder: string): Omit<LocalRecord, 'key' | 'photos' | 'sourceHash'> {
  if (text.length > 100_000 || !safeRelativePath(folder)) throw new Error('Invalid local source document.');
  const fields: LocalField[] = [], notes: LocalField[] = [], identity: LocalField[] = [];
  let section = '';
  for (const [index, line] of text.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    if (/^#{2,}\s/.test(line)) { section = line.replace(/^#+\s*/, ''); continue; }
    const match = line.match(/^\s*(?:[-*]\s+)?(?:\*\*)?([^:]{1,100}?)(?:\*\*)?:\s*(.*)$/);
    if (!match) continue;
    const field = { label: match[1]!.replace(/\*\*/g, '').trim(), value: match[2]!.replace(/^\*\*\s*/, '').trim(), line: index + 1 };
    if (noteLabel.test(field.label)) notes.push(field);
    else if (identityLabel.test(field.label) || /\bID\b|identity/i.test(section)) identity.push(field);
    else fields.push(field);
  }
  const find = (label: RegExp) => fields.find((f) => label.test(f.label))?.value;
  return {
    folder, kind: 'documented', displayName: valueOrNull(find(/^Booking guest$/i)) ?? folder.split('/').at(-1)!,
    stayDates: valueOrNull(find(/^Booking dates$/i)), guestCount: valueOrNull(find(/^Guest count$/i)),
    contact: valueOrNull(find(/^Main guest contact number$/i)), fields, notes, identity,
    sourceText: text, sourcePath: `${folder}/guest-details.md`,
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isString = (v: unknown, max = 4000): v is string => typeof v === 'string' && v.length <= max;
const nullableString = (v: unknown) => v === null || isString(v);
const isHash = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const validFields = (v: unknown) => Array.isArray(v) && v.length <= 200 && v.every((f: unknown) => isObject(f) && isString(f.label, 100) && isString(f.value) && Number.isInteger(f.line) && Number(f.line) > 0);

/** Fail closed on a malformed bundle, with errors that contain no input data. */
export function parseLocalCollection(text: string): LocalCollection {
  if (new TextEncoder().encode(text).length > MAX_COLLECTION_BYTES) throw new Error('The collection is too large (maximum 5 MB).');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('Choose a valid guest-records.local.json file.'); }
  const fail = () => { throw new Error('The collection format is invalid. Prepare it again from the original folder.'); };
  if (!isObject(value) || value.schemaVersion !== 1 || !isString(value.generatedAt, 40) || !Number.isFinite(Date.parse(value.generatedAt)) || !Array.isArray(value.records) || value.records.length > 2000) return fail();
  const keys = new Set<string>();
  for (const r of value.records) {
    if (!isObject(r) || !isString(r.key, 80) || !/^[a-z0-9-]+$/.test(r.key) || keys.has(r.key) || !isString(r.folder, 1024) || !safeRelativePath(r.folder) || !['documented', 'inquiry_only', 'folder_only'].includes(String(r.kind)) || !isString(r.displayName, 500) || !r.displayName.trim() || !nullableString(r.stayDates) || !nullableString(r.guestCount) || !nullableString(r.contact) || !validFields(r.fields) || !validFields(r.notes) || !validFields(r.identity) || !isString(r.sourceText, 100_000) || !(r.sourcePath === null || (isString(r.sourcePath, 1024) && safeRelativePath(r.sourcePath))) || !(r.sourceHash === null || isHash(r.sourceHash)) || !Array.isArray(r.photos) || r.photos.length > 50) return fail();
    keys.add(r.key);
    for (const p of r.photos) {
      if (!isObject(p) || !isString(p.path, 1024) || !safeRelativePath(p.path) || !p.path.startsWith(`${r.folder}/`) || !/\.(?:jpe?g|png|webp)$/i.test(p.path) || !isHash(p.sha256) || !Number.isSafeInteger(p.bytes) || Number(p.bytes) <= 0 || Number(p.bytes) > MAX_PHOTO_BYTES || !(p.driveUrl === undefined || (isString(p.driveUrl) && safeDriveUrl(p.driveUrl)))) return fail();
    }
  }
  return value as LocalCollection;
}

/** Magic-byte validation complements the size/type restriction; never accept SVG. */
export function photoMime(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)) return 'image/png';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

export async function validateIdPhoto(file: Blob): Promise<'image/jpeg' | 'image/png' | 'image/webp'> {
  if (!file.size || file.size > MAX_PHOTO_BYTES) throw new Error('Choose an ID photo up to 10 MB.');
  const mime = photoMime(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
  if (!mime || (file.type && file.type !== mime)) throw new Error('Choose a JPEG, PNG or WebP image.');
  return mime;
}
