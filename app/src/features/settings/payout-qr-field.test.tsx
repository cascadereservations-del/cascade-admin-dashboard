import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const save = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('./api', () => ({ saveStaffDetails: save }));
vi.mock('sonner', () => ({ toast }));

import { PayoutQrField } from './payout-qr-field';

// The public GCash guest QR (public by design), standing in for a payout QR. Never a real staff payout code.
const GCASH = '00020101021127830012com.p2pqrpay0111GXCHPHM2XXX02089996440303152170200000006560417DWQM4TK3JDNWCFOT15204601653036085802PH5909Cascades 6005CONEL610412346304350D';
const USER = 'f3700000-0000-4000-8000-0000000000a1';

function mount(payload: string | null, onSaved = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(<QueryClientProvider client={qc}><PayoutQrField userId={USER} payload={payload} version={3} onSaved={onSaved} /></QueryClientProvider>);
  return onSaved;
}

describe('PayoutQrField', () => {
  beforeEach(() => { save.mockReset(); save.mockResolvedValue({ ok: true, userId: USER, version: 4 }); toast.success.mockReset(); toast.error.mockReset(); });

  it('shows bank, holder and the last four digits, never the code', () => {
    mount(GCASH);
    expect(screen.getByText('Payout QR · GCash · Cascades · account ••••0656 · checksum OK')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('000201');
    expect(document.body.textContent).not.toContain('2170200000006');
  });

  it('says not set when there is no code', () => {
    mount(null);
    expect(screen.getByText('Payout QR · not set')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  it('refuses a pasted text that is not a QR Ph code and saves nothing', async () => {
    const user = userEvent.setup();
    mount(null);
    await user.click(screen.getByRole('button', { name: 'Paste QR text instead' }));
    await user.click(screen.getByLabelText('QR Ph text'));
    await user.paste('hello world');
    await user.click(screen.getByRole('button', { name: 'Check code' }));
    expect(toast.error).toHaveBeenCalledWith('That is not a QR Ph payment code, so nothing was saved.');
    expect(save).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Save payout QR' })).toBeNull();
  });

  it('checks a good code, previews it masked, and writes only the payout_qrph key on Save', async () => {
    const user = userEvent.setup();
    const onSaved = mount(null);
    await user.click(screen.getByRole('button', { name: 'Paste QR text instead' }));
    await user.click(screen.getByLabelText('QR Ph text'));
    await user.paste(GCASH);
    await user.click(screen.getByRole('button', { name: 'Check code' }));
    expect(screen.getByRole('status')).toHaveTextContent('GCash · Cascades · account ••••0656 · checksum OK');
    expect(screen.getByRole('status').textContent).not.toContain('000201');
    expect(save).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Save payout QR' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(USER, { payout_qrph: GCASH }, 3, 'payout QR replaced'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith('Payout QR saved');
  });

  it('removes the code only after a second click', async () => {
    const user = userEvent.setup();
    mount(GCASH);
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(save).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Yes, remove the payout QR' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(USER, { payout_qrph: null }, 3, 'payout QR removed'));
  });

  it('a failed save says so without the payload and keeps the preview', async () => {
    save.mockRejectedValue({ code: '23514', message: 'new row violates check constraint', details: `Failing row contains (${GCASH})` });
    const user = userEvent.setup();
    mount(null);
    await user.click(screen.getByRole('button', { name: 'Paste QR text instead' }));
    await user.click(screen.getByLabelText('QR Ph text'));
    await user.paste(GCASH);
    await user.click(screen.getByRole('button', { name: 'Check code' }));
    await user.click(screen.getByRole('button', { name: 'Save payout QR' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(String(toast.error.mock.calls[0]?.[0])).not.toContain('000201');
    expect(screen.getByRole('button', { name: 'Save payout QR' })).toBeInTheDocument();
  });
});
