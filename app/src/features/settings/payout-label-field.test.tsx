import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const save = vi.hoisted(() => vi.fn());
const read = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('./api', () => ({ saveStaffDetails: save, getStaffPayoutDetails: read }));
vi.mock('sonner', () => ({ toast }));

import { PayoutLabelField } from './payout-label-field';
import { checkPayoutLabel } from './qrph';

// The public GCash guest QR (public by design), standing in for a payout QR. Never a real staff payout code.
const GCASH = '00020101021127830012com.p2pqrpay0111GXCHPHM2XXX02089996440303152170200000006560417DWQM4TK3JDNWCFOT15204601653036085802PH5909Cascades 6005CONEL610412346304350D';
const USER = 'f3700000-0000-4000-8000-0000000000a1';

function mount(qrPayload: string | null = null, onSaved = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={qc}><PayoutLabelField userId={USER} version={3} qrPayload={qrPayload} onSaved={onSaved} /></QueryClientProvider>);
  return onSaved;
}

describe('checkPayoutLabel', () => {
  it('trims, clears on empty, and holds the 2 to 40 character rule', () => {
    expect(checkPayoutLabel('  MariBank ')).toEqual({ ok: true, value: 'MariBank' });
    expect(checkPayoutLabel('   ')).toEqual({ ok: true, value: null });
    expect(checkPayoutLabel('x').ok).toBe(false);
    expect(checkPayoutLabel('x'.repeat(41)).ok).toBe(false);
    expect(checkPayoutLabel('x'.repeat(40)).ok).toBe(true);
  });
});

vi.setConfig({ testTimeout: 30000 });

describe('PayoutLabelField', () => {
  beforeEach(() => { save.mockReset(); read.mockReset(); toast.success.mockReset(); toast.error.mockReset(); save.mockResolvedValue({ ok: true, userId: USER, version: 4 }); });

  it('hides itself while staff_payout_details_v1 is not deployed', async () => {
    read.mockResolvedValue(null);
    mount();
    await waitFor(() => expect(read).toHaveBeenCalled());
    expect(screen.queryByTestId('payout-label-field')).toBeNull();
  });

  it('shows the saved name and writes only the payout_bank_label key, trimmed', async () => {
    const user = userEvent.setup();
    read.mockResolvedValue({ payout_bank_label: 'MariBank', has_qr: true, qr_payload: null });
    const onSaved = mount();
    const input = await screen.findByLabelText('Bank or wallet');
    expect(input).toHaveValue('MariBank');
    expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled();
    fireEvent.change(input, { target: { value: '  GCash ' } });
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(USER, { payout_bank_label: 'GCash' }, 3, 'payout bank label set'));
    expect(toast.success).toHaveBeenCalledWith('Bank or wallet name saved');
    expect(onSaved).toHaveBeenCalled();
  });

  it('refuses a one-character name without calling the server', async () => {
    read.mockResolvedValue({ payout_bank_label: null, has_qr: false, qr_payload: null });
    mount();
    fireEvent.change(await screen.findByLabelText('Bank or wallet'), { target: { value: 'x' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Use 2 to 40 characters');
    expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled();
    expect(save).not.toHaveBeenCalled();
  });

  it('offers the bank read from the stored QR when the name is empty', async () => {
    const user = userEvent.setup();
    read.mockResolvedValue({ payout_bank_label: null, has_qr: true, qr_payload: null });
    mount(GCASH);
    await user.click(await screen.findByRole('button', { name: 'Use GCash, read from the QR' }));
    expect(screen.getByLabelText('Bank or wallet')).toHaveValue('GCash');
  });

  it('shows a calm message on a stale version', async () => {
    const user = userEvent.setup();
    read.mockResolvedValue({ payout_bank_label: 'A1', has_qr: false, qr_payload: null });
    save.mockRejectedValue({ code: '40001', message: 'stale version: staff details changed since they were loaded' });
    mount();
    const input = await screen.findByLabelText('Bank or wallet');
    fireEvent.change(input, { target: { value: 'A1b' } });
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('changed since they were loaded')));
    expect(within(document.body).queryByText(/!/)).toBeNull();
  });
});
