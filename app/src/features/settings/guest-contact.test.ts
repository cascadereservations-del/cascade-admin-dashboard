import { describe, expect, it } from 'vitest';
import { normalizeGuestContact } from './guest-contact';

// SPEC-41 2c (D-296.3): one tappable shape, "+63 9XX XXX XXXX"; the number below is a made-up one.
describe('normalizeGuestContact', () => {
  it('stores every accepted form in one tappable shape', () => {
    for (const p of ['0917 111 2222', '09171112222', '+63 917 111 2222', '+639171112222', '0917-111-2222', '(0917) 111 2222', '639171112222']) {
      expect(normalizeGuestContact(' Honey ', p)).toEqual({ ok: true, value: { name: 'Honey', phone: '+63 917 111 2222' } });
    }
  });
  it('refuses what would strand a guest', () => {
    for (const p of ['', '0917 111 222', '0917 111 22220', '082 553 1234', '1234567890a']) expect(normalizeGuestContact('Honey', p).ok).toBe(false);
    expect(normalizeGuestContact('   ', '0917 111 2222').ok).toBe(false);
    expect(normalizeGuestContact('x'.repeat(41), '0917 111 2222').ok).toBe(false);
  });
  it('the refusal shows the new shape, not a real number', () => {
    const r = normalizeGuestContact('Honey', '123');
    expect(r.ok === false && r.error.includes('+63 9XX XXX XXXX')).toBe(true);
  });
});
