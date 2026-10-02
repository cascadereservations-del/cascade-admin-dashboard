import { describe, expect, it } from 'vitest';
import type { Companion } from './api';
import { findSelfCompanion, idPhotoFormError, idPhotoLabel, idPhotoRefs, needsIdOnFile, selfCompanionPatch } from './id-photo';

const c = (o: Partial<Companion>): Companion => ({ id: 'x', guest_id: 'g', name: 'Test Person', contact_number: null, id_type: null, id_number: null, id_photo_path: null, notes: null, created_at: '', updated_at: '', version: 1, ...o });
const rows = [c({ id: 'a', name: 'Co One', id_photo_path: 'a/1.jpg' }), c({ id: 'b', name: ' test person ', id_photo_path: 'b/1.jpg', id_type: 'passport' }), c({ id: 'd', name: 'Test Person' })];

describe('guest ID photos', () => {
  it('finds the guest row by name, preferring the one with a photo', () => {
    expect(findSelfCompanion(rows, 'Test Person')?.id).toBe('b');
    expect(findSelfCompanion([rows[2]!], 'Test Person')?.id).toBe('d');
    expect(findSelfCompanion(rows, 'Nobody')).toBeUndefined();
    expect(findSelfCompanion(undefined, 'Test Person')).toBeUndefined();
  });
  it('lists the guest photo first, then companions, skipping rows without a photo', () => {
    const refs = idPhotoRefs(rows, 'Test Person');
    expect(refs.map((r) => r.companionId)).toEqual(['b', 'a']);
    expect(refs[0]!.isSelf).toBe(true);
    expect(idPhotoLabel(refs[0]!)).toBe('test person (guest)');
    expect(idPhotoLabel(refs[1]!)).toBe('Co One');
  });
  it('builds the companion patch: name only when creating, id type only when chosen', () => {
    expect(selfCompanionPatch('  Test Person ', 'passport', undefined)).toEqual({ name: 'Test Person', id_type: 'passport' });
    expect(selfCompanionPatch('Test Person', '', undefined)).toEqual({ name: 'Test Person' });
    expect(selfCompanionPatch('Test Person', 'other', rows[1])).toEqual({ id_type: 'other' });
    expect(selfCompanionPatch('Test Person', '', rows[1])).toEqual({});
  });
  it('offers the profile update only when ID is not already marked on file', () => {
    expect(needsIdOnFile(null)).toBe(true);
    expect(needsIdOnFile({ id_on_file: false })).toBe(true);
    expect(needsIdOnFile({ id_on_file: true })).toBe(false);
  });
  it('requires a file and a reason', () => {
    const f = new File(['x'], 'id.jpg', { type: 'image/jpeg' });
    expect(idPhotoFormError(null, 'because')).toMatch(/Choose/);
    expect(idPhotoFormError(f, 'ab')).toMatch(/reason/);
    expect(idPhotoFormError(f, 'a'.repeat(501))).toMatch(/500/);
    expect(idPhotoFormError(f, 'ID collected at check-in')).toBeNull();
  });
});
