// Guest contact (session 59, Lloyd 2026-09-28): the on-ground partner guests are told to call. One source,
// app_settings onground_name / onground_phone; the concierge, Cassy, the scheduled messages, the confirmation
// e-mail and the welcome guide all read it. A wrong number here strands a locked-out guest, so only a
// Philippine mobile number is accepted, stored in one shape (0991 853 8269) that every reader can dial.
export type GuestContact = { name: string; phone: string };

export function normalizeGuestContact(name: string, phone: string): { ok: true; value: GuestContact } | { ok: false; error: string } {
  const n = name.trim().replace(/\s+/g, ' ');
  if (!n) return { ok: false, error: 'Enter the name guests should ask for.' };
  if (n.length > 40) return { ok: false, error: 'Keep the name under 40 characters.' };
  const digits = phone.replace(/[\s\-().]/g, '').replace(/^\+?63/, '0');
  if (!/^09\d{9}$/.test(digits)) return { ok: false, error: 'Enter a Philippine mobile number, like 0991 853 8269.' };
  return { ok: true, value: { name: n, phone: `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}` } };
}
