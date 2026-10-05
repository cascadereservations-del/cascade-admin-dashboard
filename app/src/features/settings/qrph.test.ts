import { describe, expect, it } from 'vitest';
import { crc16, describeLine, describeQrph, maskAccount, parseTlv } from './qrph';

// The public GCash guest QR (decoded from the site's own PNG, 2026-09-17; public by design). Never a staff payout QR.
const GCASH = '00020101021127830012com.p2pqrpay0111GXCHPHM2XXX02089996440303152170200000006560417DWQM4TK3JDNWCFOT15204601653036085802PH5909Cascades 6005CONEL610412346304350D';
const build = (body: string) => { const b = body + '6304'; return b + crc16(b); };

describe('describeQrph', () => {
  it('reads the GCash base: bank GCash, name Cascades, account masked, checksum verified', () => {
    expect(describeQrph(GCASH)).toEqual({ ok: true, bank: 'GCash', name: 'Cascades', accountMasked: '••••0656' });
  });
  it('one flipped character fails the checksum', () => {
    const flipped = GCASH.replace('Cascades', 'Cascadez');
    expect(flipped).not.toBe(GCASH);
    expect(describeQrph(flipped)).toEqual({ ok: false });
    expect(describeQrph(GCASH.slice(0, -1) + (GCASH.endsWith('D') ? 'E' : 'D'))).toEqual({ ok: false });
  });
  it('masking shows only the last four digits and never the account number', () => {
    const d = describeQrph(GCASH);
    expect(JSON.stringify(d)).not.toContain('2170200000006');
    expect(maskAccount(['00', 'GXCHPHM2XXX', '99964403', '217020000000656'])).toBe('••••0656');
    expect(maskAccount(['abc', '12'])).toBeNull();
  });
  it('refuses text that is not a QR Ph payment code', () => {
    for (const t of ['', 'hello', '000201', GCASH.slice(0, 40), 'x'.repeat(600)]) expect(describeQrph(t)).toEqual({ ok: false });
    // a valid checksum alone is not enough: there must be a merchant-account template (tags 26-51)
    expect(describeQrph(build('000201010211' + '5204601653036085802PH5909Someone '))).toEqual({ ok: false });
  });
  it('shows an unknown acquirer as its own BIC and tolerates a missing name or account', () => {
    const p = build('000201010211' + '2627' + '0011ph.ppmi.p2m' + '0108ZZZZPHM2' + '5802PH');
    expect(describeQrph(p)).toEqual({ ok: true, bank: 'ZZZZPHM2', name: null, accountMasked: null });
  });
});

describe('parseTlv and describeLine', () => {
  it('walks tag-length-value exactly and rejects a short value', () => {
    expect(parseTlv('0002010102115802PH')).toEqual([{ tag: '00', value: '01' }, { tag: '01', value: '11' }, { tag: '58', value: 'PH' }]);
    expect(parseTlv('5905Ab')).toBeNull();
    expect(parseTlv('ab0201')).toBeNull();
  });
  it('the display line names bank, holder and last four, and never the payload', () => {
    expect(describeLine(null)).toBe('Payout QR · not set');
    const line = describeLine(GCASH);
    expect(line).toBe('Payout QR · GCash · Cascades · account ••••0656 · checksum OK');
    expect(line).not.toContain('000201');
    expect(describeLine('000201bad')).toContain('does not verify');
  });
});
