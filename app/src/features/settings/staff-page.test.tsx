import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  listStaff: vi.fn(), listStaffDetails: vi.fn(), saveStaffDetails: vi.fn(), getStaffPayoutDetails: vi.fn(), createStaff: vi.fn(), staffAction: vi.fn(),
}));
const session = vi.hoisted(() => ({ role: 'owner' }));
vi.mock('./api', () => ({ ...api, STAFF_ROLES: ['cleaner', 'finance', 'admin'], STAFF_PIN_PREFIX: '8888', STAFF_PIN_RE: /^\d{4}$/ }));
vi.mock('@/auth/session', () => ({ useSession: () => ({ propertyId: 'p1', caps: { role: session.role } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import StaffPage from './staff-page';

const USER = 'f3700000-0000-4000-8000-0000000000a1';
const details = { user_id: USER, contact_number: '0917', alternate_contact: null, address: null, id_type: null, id_number: null, id_drive_url: null, emergency_contact_name: null, emergency_contact_number: null, start_date: null, fee_turnover: null, fee_transport: null, fee_deep_clean: null, version: 5, payout_qrph: null, payout_bank_label: 'MariBank' };

async function openHoney(role: string) {
  session.role = role;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={qc}><StaffPage /></QueryClientProvider>);
  await userEvent.setup().click((await screen.findAllByRole('button', { name: 'Edit' }))[0]!);
}

describe('Staff page payment details', () => {
  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset());
    api.listStaff.mockResolvedValue([{ user_id: USER, name: 'Honey', role: 'cleaner', disabled: false, note: null, sign_in_name: 'honey', last_sign_in_at: null }]);
    api.listStaffDetails.mockResolvedValue([details]);
    api.getStaffPayoutDetails.mockResolvedValue({ payout_bank_label: 'MariBank', has_qr: false, qr_payload: null });
    api.saveStaffDetails.mockResolvedValue({ ok: true, userId: USER, version: 6 });
  });

  it('shows the payment details for an owner', async () => {
    await openHoney('owner');
    expect(await screen.findByTestId('payout-qr-field')).toBeInTheDocument();
    expect(await screen.findByLabelText('Bank or wallet')).toHaveValue('MariBank');
  });

  it('shows no payment details and never reads them for anyone but owner and admin', async () => {
    await openHoney('finance');
    expect(await screen.findByText('Contact, ID and fee structure')).toBeInTheDocument();
    expect(screen.queryByTestId('payout-qr-field')).toBeNull();
    expect(screen.queryByTestId('payout-label-field')).toBeNull();
    expect(api.getStaffPayoutDetails).not.toHaveBeenCalled();
  });

  it('never writes the payout fields back when contact details are saved', async () => {
    const user = userEvent.setup();
    await openHoney('owner');
    await user.click(await screen.findByRole('button', { name: 'Save details' }));
    await waitFor(() => expect(api.saveStaffDetails).toHaveBeenCalled());
    const patch = api.saveStaffDetails.mock.calls[0]![1] as Record<string, unknown>;
    expect(patch).not.toHaveProperty('payout_bank_label');
    expect(patch).not.toHaveProperty('payout_qrph');
    expect(patch.contact_number).toBe('0917');
  });
});
