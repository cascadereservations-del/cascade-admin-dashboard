import { expect, it } from 'vitest';
import { REASON_CHIPS, SENSITIVE_FIELDS, autoReason, sensitiveKind, type ReasonKind } from './auto-reason';

const KINDS: ReasonKind[] = ['contact', 'notes', 'id_type', 'photo_added', 'photo_replaced', 'photo_removed', 'tier', 'tags', 'channel', 'name', 'companion'];

it('every kind gives 3-500 characters, with no fields, empty fields and a huge field list', () => {
  for (const k of KINDS) for (const f of [undefined, [], [''], ['Phone'], Array.from({ length: 200 }, () => 'a very long field label')]) {
    const r = autoReason(k, f);
    expect(r.length).toBeGreaterThanOrEqual(3);
    expect(r.length).toBeLessThanOrEqual(k === 'tier' ? 200 : 500);
  }
});

it('uses the exact photo wording lane P relies on, and reads field labels plainly', () => {
  expect([autoReason('photo_added'), autoReason('photo_replaced'), autoReason('photo_removed')]).toEqual(['ID photo added', 'ID photo replaced', 'ID photo removed']);
  expect(autoReason('contact', ['Contact number'])).toBe('Edited contact number');
  expect(autoReason('photo_added', ['Contact number'])).toBe('ID photo added');
  expect(autoReason('notes')).toBe('Notes changed');
});

it('asks only for ID number, address, ID un-ticked and VIP', () => {
  expect(SENSITIVE_FIELDS).toEqual(['id_number', 'address', 'id_on_file_off', 'vip']);
  expect(REASON_CHIPS).toEqual(['Guest sent it on Airbnb', 'Seen at check-in', 'Correction']);
  expect([['id_number', 'x'], ['address', 'x'], ['id_on_file', false], ['vip', true], ['vip', false]].map(([f, v]) => sensitiveKind(f as string, v))).toEqual(['id_number', 'address', 'id_on_file_off', 'vip', 'vip']);
  expect([['id_on_file', true], ['contact_number', '1'], ['birthday', '2000-01-01'], ['tags', []]].map(([f, v]) => sensitiveKind(f as string, v))).toEqual([null, null, null, null]);
});
