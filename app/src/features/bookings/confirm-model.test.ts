import { describe, expect, it } from 'vitest';
import { RPC_MODULE } from '@/lib/rollout';
import {
  confirmArgs, confirmSentence, declineReason, declineSentence, normalizePayments, parseAmount, paymentLine, validateConfirm,
  type ConfirmForm, type InquiryPayment,
} from './confirm-model';

const RECEIPT: InquiryPayment = { id: 'b1', booking_ref: 'BD1', guest_name: 'Maria', checkin_date: '2026-10-12', checkout_date: '2026-10-14', pax: 2, expected_amount: '5073', comparison_id: 'c1', candidate_amount: '5073', reference: '9012345678901234', receipt_image_path: 'r.jpg', hold_expires_at: null };
const form = (p: Partial<ConfirmForm> = {}): ConfirmForm => ({ checked: false, method: 'messenger_gcash', reference: '', amount: '5073.00', note: '', ...p });

describe('normalizePayments', () => {
  it('turns missing fields into null and never into 0', () => {
    const [p] = normalizePayments([{ id: 'b1', expected_amount: null, candidate_amount: 'abc', pax: undefined }]);
    expect(p).toMatchObject({ id: 'b1', expected_amount: null, candidate_amount: null, pax: null, comparison_id: null, reference: null });
  });
  it('keeps numeric amounts, drops rows without an id, and tolerates a non-array', () => {
    expect(normalizePayments([{ id: 'b1', candidate_amount: 5073 }, { guest_name: 'x' }])).toHaveLength(1);
    expect(normalizePayments(null)).toEqual([]);
  });
});

describe('paymentLine', () => {
  it('names the receipt, the amount and the last four of the reference, and never says it matches', () => {
    const line = paymentLine(RECEIPT);
    expect(line).toMatch(/^Receipt on file · .*5,073\.00 · ref \.\.\.1234$/);
    expect(line).not.toMatch(/match/i);
  });
  it('leaves out an unknown amount or reference instead of showing zero', () => {
    expect(paymentLine({ ...RECEIPT, candidate_amount: null, reference: null })).toBe('Receipt on file');
  });
  it('says there is no receipt when there is no payment row or no comparison', () => {
    expect(paymentLine(null)).toBe('No receipt yet');
    expect(paymentLine({ ...RECEIPT, comparison_id: null })).toBe('No receipt yet');
  });
});

describe('parseAmount', () => {
  it('accepts commas and a PHP prefix, rejects zero, negatives and text', () => {
    expect(parseAmount('5,073')).toBe('5073.00');
    expect(parseAmount('PHP 1,250.5')).toBe('1250.50');
    for (const bad of ['', '0', '0.00', '-5', 'abc', '12.345', '5073.001']) expect(parseAmount(bad)).toBeNull();
  });
});

describe('validateConfirm', () => {
  it('receipt on file: the tick is required, the reference comes from the receipt', () => {
    expect(validateConfirm(form(), RECEIPT)).toEqual({ checked: expect.any(String) });
    expect(validateConfirm(form({ checked: true }), RECEIPT)).toEqual({});
  });
  it('receipt without a reference asks for one', () => {
    expect(validateConfirm(form({ checked: true }), { ...RECEIPT, reference: null })).toHaveProperty('reference');
  });
  it('no receipt: a reference is required for every method except cash', () => {
    for (const method of ['messenger_gcash', 'gcash_qr', 'bank', 'other'] as const) {
      expect(validateConfirm(form({ method }), null)).toHaveProperty('reference');
      expect(validateConfirm(form({ method, reference: '123' }), null)).toEqual({});
    }
  });
  it('no receipt: cash needs a note and no reference', () => {
    expect(validateConfirm(form({ method: 'cash' }), null)).toEqual({ note: expect.any(String) });
    expect(validateConfirm(form({ method: 'cash', note: 'Handed over at the gate' }), null)).toEqual({});
  });
  it('the amount must be above zero in every case', () => {
    for (const amount of ['', '0', 'x']) {
      expect(validateConfirm(form({ checked: true, amount }), RECEIPT)).toHaveProperty('amount');
      expect(validateConfirm(form({ amount, method: 'cash', note: 'n' }), null)).toHaveProperty('amount');
    }
  });
});

describe('confirmArgs', () => {
  it('receipt: sends the comparison id, messenger_gcash and the receipt reference', () => {
    expect(confirmArgs('b1', form({ checked: true, method: 'bank', reference: 'ignored' }), RECEIPT, 'confirm-k')).toEqual({
      p_booking_id: 'b1', p_method: 'messenger_gcash', p_reference: '9012345678901234', p_amount: '5073.00', p_note: null, p_comparison_id: 'c1', p_idempotency_key: 'confirm-k',
    });
  });
  it('no receipt: sends the chosen method, a null comparison id and the typed reference', () => {
    expect(confirmArgs('b1', form({ method: 'gcash_qr', reference: ' 777 ', note: ' ok ' }), null, 'k')).toEqual({
      p_booking_id: 'b1', p_method: 'gcash_qr', p_reference: '777', p_amount: '5073.00', p_note: 'ok', p_comparison_id: null, p_idempotency_key: 'k',
    });
  });
  it('cash sends no reference even if one was typed earlier', () => {
    expect(confirmArgs('b1', form({ method: 'cash', reference: '777', note: 'n' }), null, 'k').p_reference).toBeNull();
  });
});

describe('outcome sentences', () => {
  const outcomes = ['confirmed', 'conflict', 'invalid_state', 'reference_reused', 'amount_required', 'reference_required', 'note_required', 'denied', 'something_new'];
  it('every outcome is one plain sentence with no exclamation mark and no "Unfortunately"', () => {
    for (const outcome of outcomes) {
      const s = confirmSentence({ ok: outcome === 'confirmed', outcome, guest_name: 'Maria', checkin: '2026-10-12', checkout: '2026-10-14', prior_ref: 'BD9' });
      expect(s).toMatch(/\.$/);
      expect(s).not.toMatch(/!|Unfortunately/);
    }
    for (const r of [{ ok: true }, { ok: false, outcome: 'invalid_state' }, { ok: false, outcome: 'denied' }, { ok: false }]) {
      expect(declineSentence(r)).not.toMatch(/!|Unfortunately/);
    }
  });
  it('reference_reused names the prior booking and conflict says nothing was confirmed', () => {
    expect(confirmSentence({ ok: false, outcome: 'reference_reused', prior_ref: 'BD9' })).toContain('BD9');
    expect(confirmSentence({ ok: false, outcome: 'conflict' })).toBe('These dates clash with another stay, so nothing was confirmed.');
  });
  it('confirmed names the guest and the dates', () => {
    expect(confirmSentence({ ok: true, outcome: 'confirmed', guest_name: 'Maria', checkin: '2026-10-12', checkout: '2026-10-14' })).toBe('Booking confirmed for Maria, 12 Oct to 14 Oct.');
  });
});

describe('declineSentence', () => {
  it('maps note_required to a plain ask for a reason', () => {
    expect(declineSentence({ ok: false, outcome: 'note_required' })).toBe('Choose or write a reason first.');
  });
});

describe('declineReason', () => {
  it('joins the chip and the text, and is null when both are empty', () => {
    expect(declineReason('No payment received', ' sent twice ')).toBe('No payment received: sent twice');
    expect(declineReason('Duplicate request', '')).toBe('Duplicate request');
    expect(declineReason(null, '  ')).toBeNull();
  });
});

describe('rollout gate', () => {
  it('the confirm call is behind the finance switch, decline behind bookings, resume behind operations', () => {
    expect(RPC_MODULE.staff_confirm_direct_booking_v1).toBe('finance');
    expect(RPC_MODULE.staff_decline_direct_booking_v1).toBe('bookings');
    expect(RPC_MODULE.concierge_resume_cassy_v1).toBe('operations');
  });
});
