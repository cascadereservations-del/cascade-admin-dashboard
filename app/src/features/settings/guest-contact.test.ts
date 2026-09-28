import { describe, expect, it } from 'vitest';
import { normalizeGuestContact } from './guest-contact';

describe('normalizeGuestContact', () => {
  it('stores every accepted form in one dialable shape', () => {
    for (const p of ['0991 853 8269', '09918538269', '+63 991 853 8269', '+639918538269', '0991-853-8269', '(0991) 853 8269']) {
      expect(normalizeGuestContact(' Honey ', p)).toEqual({ ok: true, value: { name: 'Honey', phone: '0991 853 8269' } });
    }
  });
  it('refuses what would strand a guest', () => {
    for (const p of ['', '0991 853 826', '0991 853 82690', '082 553 1234', '1234567890a']) expect(normalizeGuestContact('Honey', p).ok).toBe(false);
    expect(normalizeGuestContact('   ', '0991 853 8269').ok).toBe(false);
    expect(normalizeGuestContact('x'.repeat(41), '0991 853 8269').ok).toBe(false);
  });
});
