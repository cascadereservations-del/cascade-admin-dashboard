import { describe, expect, it } from 'vitest';
import type { Companion } from './api';
import { companionFlags, findSelfCompanion, guestIdStatus, idPhotoFormError, idPhotoLabel, idPhotoRefs, needsIdOnFile, otherCompanions, selfCompanionPatch } from './id-photo';

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
  it('matches names that carry invisible direction marks', () => {
    expect(findSelfCompanion([c({ id: 'z', name: 'Dino Jr. Tan' })], '⁨Dino Jr.⁩ Tan')?.id).toBe('z');
  });
  it('keeps the guest’s own row out of the companions list', () => {
    expect(otherCompanions(rows, 'Test Person').map((r) => r.id)).toEqual(['a', 'd']);
    expect(otherCompanions(rows, 'Nobody').map((r) => r.id)).toEqual(['a', 'b', 'd']);
  });
  it('says whether the guest’s own ID is a photo, only a tick, or nothing', () => {
    expect(guestIdStatus({ id_photo_path: 'b/1.jpg' }, { id_on_file: false })).toBe('photo');
    expect(guestIdStatus(undefined, { id_on_file: true })).toBe('marked_no_photo');
    expect(guestIdStatus({ id_photo_path: null }, null)).toBe('none');
    expect(guestIdStatus(undefined, { id_on_file: true }, 2)).toBe('companion_photos');
  });
  it('flags real companions and any ID photo for the guests list', () => {
    const f = companionFlags([
      { guest_id: 'g1', name: 'Ann', id_photo_path: 'p', guest_name: 'ann ' },
      { guest_id: 'g2', name: 'Bo', id_photo_path: null, guest_name: 'Cy' },
      { guest_id: 'g3', name: 'Di', id_photo_path: 'q', guest_name: 'Ed' },
    ]);
    expect([...f.companions].sort()).toEqual(['g2', 'g3']);
    expect([...f.photos].sort()).toEqual(['g1', 'g3']);
  });
  it('requires a file and a reason', () => {
    const f = new File(['x'], 'id.jpg', { type: 'image/jpeg' });
    expect(idPhotoFormError(null, 'because')).toMatch(/Choose/);
    expect(idPhotoFormError(f, 'ab')).toMatch(/reason/);
    expect(idPhotoFormError(f, 'a'.repeat(501))).toMatch(/500/);
    expect(idPhotoFormError(f, 'ID collected at check-in')).toBeNull();
  });
});
