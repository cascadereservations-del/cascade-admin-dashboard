// SPEC-37 7.E (D-298.4): reading a QR Ph payment code well enough to check it and to say what it is without showing it.
// Pure, no I/O. The payload carries an account number, so nothing here logs it and the UI never prints it: it shows the bank,
// the account holder's name and the last four digits. The CRC is the same CRC-16/CCITT-FALSE the Edge Functions use
// (supabase/functions/_shared/cascade-core/qrph.ts), so a payload that passes here is one qrphWithAmount can rebuild.

/** CRC-16/CCITT-FALSE over the payload up to and including "6304", as EMVCo specifies. */
export function crc16(s: string): string {
  let c = 0xFFFF;
  for (const b of new TextEncoder().encode(s)) {
    c ^= b << 8;
    for (let i = 0; i < 8; i++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF;
  }
  return c.toString(16).toUpperCase().padStart(4, '0');
}

export type Tlv = { tag: string; value: string };

/** Walk EMVCo tag-length-value data: two digits of tag, two of length, then the value. Null when it does not parse exactly. */
export function parseTlv(s: string): Tlv[] | null {
  const out: Tlv[] = [];
  let i = 0;
  while (i < s.length) {
    const tag = s.slice(i, i + 2), len = s.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(len)) return null;
    const value = s.slice(i + 4, i + 4 + Number(len));
    if (value.length !== Number(len)) return null;
    out.push({ tag, value });
    i += 4 + Number(len);
  }
  return out;
}

/** Acquirer BIC (the merchant template's sub-tag 01) -> the name people know. MariBank's BIC is added from Honey's own payload (SPEC-37 7.D); an unknown BIC is shown as itself. */
export const BANKS: Record<string, string> = {
  GXCHPHM2XXX: 'GCash',
};

export type QrphInfo =
  | { ok: true; bank: string; name: string | null; accountMasked: string | null }
  | { ok: false };

/** `••••` plus the last four digits of the longest digit run in the template's sub-tags; null when there are fewer than four digits. */
export function maskAccount(subValues: string[]): string | null {
  let best = '';
  for (const v of subValues) for (const run of v.match(/\d+/g) ?? []) if (run.length > best.length) best = run;
  return best.length >= 4 ? `••••${best.slice(-4)}` : null;
}

/**
 * Is this a QR Ph payment code, and what is it? It must start 000201, end 6304 plus a CRC this file reproduces, parse as TLV
 * all the way, and carry a merchant-account template (tags 26 to 51). The payload itself is never part of the answer.
 */
export function describeQrph(payload: string): QrphInfo {
  const p = String(payload ?? '').trim();
  if (!p.startsWith('000201') || !/6304[0-9A-F]{4}$/.test(p) || p.length > 512) return { ok: false };
  if (crc16(p.slice(0, -4)) !== p.slice(-4)) return { ok: false };
  const top = parseTlv(p);
  if (!top) return { ok: false };
  const template = top.find((t) => Number(t.tag) >= 26 && Number(t.tag) <= 51);
  const sub = template ? parseTlv(template.value) : null;
  if (!template || !sub) return { ok: false };
  const bic = sub.find((t) => t.tag === '01')?.value ?? '';
  const name = top.find((t) => t.tag === '59')?.value.trim() || null;
  return { ok: true, bank: BANKS[bic] ?? (bic || 'Unknown bank'), name, accountMasked: maskAccount(sub.map((t) => t.value)) };
}

/** The one line the staff details card shows. */
export function describeLine(payload: string | null | undefined): string {
  if (!payload) return 'Payout QR · not set';
  const d = describeQrph(payload);
  if (!d.ok) return 'Payout QR · saved, but its checksum does not verify';
  return ['Payout QR', d.bank, d.name, d.accountMasked ? `account ${d.accountMasked}` : null, 'checksum OK'].filter(Boolean).join(' · ');
}
