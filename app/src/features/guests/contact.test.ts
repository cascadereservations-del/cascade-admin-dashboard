import { describe, expect, it } from 'vitest';
import { displayContact, hasContact, isMissingDetails } from './contact';

describe('guest contact rule', () => {
  it('a direct guest with only a phone or e-mail is not missing details', () => {
    expect(isMissingDetails({ phone: '0917 000 0000', id_on_file: false })).toBe(false);
    expect(isMissingDetails({ email: 'a@example.test', id_on_file: false })).toBe(false);
  });
  it('an Airbnb guest with only a saved contact number is not missing details', () => {
    expect(isMissingDetails({ contact_number: '0917 000 0001', id_on_file: false })).toBe(false);
  });
  it('ID on file alone is enough', () => {
    expect(isMissingDetails({ id_on_file: true })).toBe(false);
  });
  it('no ID and no contact (blank counts as none) is missing', () => {
    expect(isMissingDetails({ phone: '  ', email: null, contact_number: '', id_on_file: false })).toBe(true);
    expect(hasContact({})).toBe(false);
  });
  it('Contact column prefers phone, then saved contact number, then e-mail', () => {
    expect(displayContact({ phone: 'P', contact_number: 'C', email: 'E' })).toBe('P');
    expect(displayContact({ phone: null, contact_number: 'C', email: 'E' })).toBe('C');
    expect(displayContact({ phone: ' ', contact_number: null, email: 'E' })).toBe('E');
    expect(displayContact({})).toBeNull();
  });
});
