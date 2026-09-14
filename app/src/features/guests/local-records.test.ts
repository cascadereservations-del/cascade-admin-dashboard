import { describe, expect, it } from 'vitest';
import { parseGuestMarkdown, parseLocalCollection, photoMime, safeDriveUrl, safeMessengerUrl, safeRelativePath, validateIdPhoto, type LocalCollection } from './local-records';
import { guestPage, guestSearchPattern, validateProfilePatch } from './validation';

const source = '# Example source\n- Booking guest: Test Guest\n- Booking dates: September 20–22 (year not stated)\n- Guest count: 2\n- Main guest contact number: Not provided\n## ID observations\n- Example ID holder: ID observation retained as source\n## Stay notes\n- Birthday or special occasion: Not found in the checked thread.\n- Early check-in request: Asked for 10 am; awaiting confirmation.\n- Courtesy/benefit: Late departure offered for this stay only.\nSource: Local collected record';
export function syntheticCollection(): LocalCollection {
  return { schemaVersion: 1, generatedAt: '2026-09-14T12:00:00Z', records: [{ ...parseGuestMarkdown(source, 'Collected/Example guest'), key: 'record-example', sourceHash: 'a'.repeat(64), photos: [{ path: 'Collected/Example guest/photo.jpeg', sha256: 'b'.repeat(64), bytes: 128 }] }] };
}

describe('private record preparation', () => {
  it('preserves uncertainty, source wording and line provenance without inferring identity or dates', () => {
    const r = parseGuestMarkdown(source, 'Collected/Example guest');
    expect(r.displayName).toBe('Test Guest');
    expect(r.stayDates).toBe('September 20–22 (year not stated)');
    expect(r.contact).toBeNull();
    expect(r.notes).toHaveLength(3);
    expect(r.notes[1]).toMatchObject({ value: 'Asked for 10 am; awaiting confirmation.', line: 10 });
    expect(r.identity[0]?.label).toBe('Example ID holder');
    expect(r.sourceText).toBe(source);
  });
  it('keeps same-name records distinct and rejects duplicate source keys', () => {
    const c = syntheticCollection();
    c.records.push({ ...c.records[0]!, key: 'record-second' });
    expect(parseLocalCollection(JSON.stringify(c)).records).toHaveLength(2);
    c.records[1]!.key = c.records[0]!.key;
    expect(() => parseLocalCollection(JSON.stringify(c))).toThrow('format is invalid');
  });
  it('rejects unexpected formats, path traversal and external document links', () => {
    expect(() => parseLocalCollection('{SECRET_DO_NOT_ECHO')).toThrow('Choose a valid');
    for (const url of ['javascript:alert(1)', 'https://evil.test/photo', 'https://drive.google.com.evil.test/file/d/test/view']) {
      const c = syntheticCollection(); c.records[0]!.photos[0]!.driveUrl = url;
      expect(() => parseLocalCollection(JSON.stringify(c))).toThrow('format is invalid');
    }
    for (const path of ['../escape.jpg', '/absolute.jpg', 'C:/secret.jpg', 'a/../escape.jpg', 'a\\b.jpg']) expect(safeRelativePath(path)).toBe(false);
    const c = syntheticCollection(); c.records[0]!.photos[0]!.path = 'OtherGuest/photo.jpeg';
    expect(() => parseLocalCollection(JSON.stringify(c))).toThrow('format is invalid');
  });
  it('enforces collection size and removes tracking parameters from allowed Drive links', () => {
    expect(() => parseLocalCollection(' '.repeat(5 * 1024 * 1024 + 1))).toThrow('too large');
    expect(safeDriveUrl('https://drive.google.com/file/d/example/view?usp=sharing')).toBe('https://drive.google.com/file/d/example/view');
    expect(safeMessengerUrl('https://www.messenger.com/t/example')).not.toBeNull();
    expect(safeMessengerUrl('https://messenger.com@evil.test')).toBeNull();
  });
});

describe('photo and CRM validation', () => {
  it('validates bytes and size, rejecting SVG and a forged MIME type', async () => {
    const file = (bytes: number[], size = 100, type = 'image/jpeg') => ({ size, type, slice: () => ({ arrayBuffer: async () => new Uint8Array(bytes).buffer }) }) as unknown as Blob;
    expect(photoMime(new Uint8Array([255, 216, 255]))).toBe('image/jpeg');
    await expect(validateIdPhoto(file([255, 216, 255]))).resolves.toBe('image/jpeg');
    await expect(validateIdPhoto(file([60, 115, 118, 103]))).rejects.toThrow('JPEG, PNG or WebP');
    await expect(validateIdPhoto(file([255, 216, 255], 11 * 1024 * 1024))).rejects.toThrow('10 MB');
    await expect(validateIdPhoto(file([255, 216, 255], 100, 'image/svg+xml'))).rejects.toThrow('JPEG, PNG or WebP');
  });
  it('does not allow search text to inject filter syntax, preserves Unicode names and validates pages', () => {
    expect(guestSearchPattern('Montaño, Dela Cruz')).toBe('%Montaño%Dela%Cruz%');
    expect(guestSearchPattern('x),is_active.eq.false,(name.ilike.*')).not.toMatch(/[(),*]/);
    expect(guestSearchPattern('***')).toBeNull();
    expect(guestSearchPattern("O'Neil")).toBe("%O'Neil%");
    for (const n of ['-1', 'Infinity', 'NaN', '2.5', '0']) expect(guestPage(n)).toBe(1);
  });
  it('rejects invalid birthdays, unsafe links and missing change reasons', () => {
    expect(() => validateProfilePatch({ birthday: '2025-02-29' }, 'Correction')).toThrow('valid birthday');
    expect(() => validateProfilePatch({ birthday: '2999-01-01' }, 'Correction')).toThrow('valid birthday');
    expect(() => validateProfilePatch({ messenger_link: 'javascript:alert(1)' }, 'Correction')).toThrow('HTTPS');
    expect(() => validateProfilePatch({}, '')).toThrow('reason');
    expect(() => validateProfilePatch({ birthday: '2000-02-29', id_on_file: true }, 'Guest provided')).not.toThrow();
  });
});
