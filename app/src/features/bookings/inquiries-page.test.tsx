import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  can: new Set<string>(['approve_payment']),
  fetchStays: vi.fn(), fetchInquiryPayments: vi.fn(), confirmDirectBooking: vi.fn(), declineDirectBooking: vi.fn(),
}));
vi.mock('@/auth/session', () => ({ useSession: () => ({ propertyId: 'p1', caps: { can: (a: string) => mocks.can.has(a) } }) }));
vi.mock('./api', () => ({ fetchStays: mocks.fetchStays }));
vi.mock('./confirm-api', () => ({
  newConfirmKey: () => 'confirm-test-key-0123456789',
  fetchInquiryPayments: mocks.fetchInquiryPayments,
  confirmDirectBooking: mocks.confirmDirectBooking,
  declineDirectBooking: mocks.declineDirectBooking,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from 'sonner';
import { AppError } from '@/lib/errors';
import InquiriesPage from './inquiries-page';
import type { InquiryPayment } from './confirm-model';

const stay = (id: string, guest: string) => ({
  key: `direct-${id}`, kind: 'direct', sourceId: id, code: `BD-${id}`, guestName: guest, guestId: null, guestCount: 2,
  checkin: '2099-10-12', checkout: '2099-10-14', nights: 2, bookingState: 'inquiry', paymentState: 'not_recorded', payoutState: 'not_applicable',
  payoutDate: null, guestPaid: null, hostPayout: null, totalAmount: '5073.00', depositAmount: null, calendar: null, createdAt: '2026-10-08T01:00:00Z', href: `/bookings/direct/${id}`,
});
const payment = (p: Partial<InquiryPayment>): InquiryPayment => ({ id: 'b1', booking_ref: null, guest_name: null, checkin_date: null, checkout_date: null, pax: null, expected_amount: '5073', comparison_id: null, candidate_amount: null, reference: null, receipt_image_path: null, hold_expires_at: null, ...p });
const RECEIPT = payment({ id: 'b1', comparison_id: 'cmp-1', candidate_amount: '5073', reference: '9012345678901234' });

function view() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><InquiriesPage /></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => {
  Object.values(mocks).forEach((m) => typeof m === 'function' && m.mockReset());
  mocks.can = new Set(['approve_payment']);
  mocks.fetchStays.mockResolvedValue({ stays: [stay('b1', 'Maria Santos')], sourceAsOf: null, warnings: [] });
  mocks.fetchInquiryPayments.mockResolvedValue([RECEIPT]);
  vi.mocked(toast.success).mockClear();
});
afterEach(() => cleanup());

const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: 'Confirm booking' }));
  return screen.findByRole('dialog');
};

it('shows the receipt line on the card without ever saying the reference matches', async () => {
  view();
  const line = await screen.findByText(/Receipt on file/);
  expect(line).toHaveTextContent(/5,073\.00 · ref \.\.\.1234/);
  expect(document.body).not.toHaveTextContent(/match/i);
});

it('shows "No receipt yet" when there is no receipt row', async () => {
  mocks.fetchInquiryPayments.mockResolvedValue([]);
  view();
  expect(await screen.findByText('No receipt yet')).toBeInTheDocument();
});

it('has no Confirm or Decline button without approve_payment', async () => {
  mocks.can = new Set(['read_operations']);
  view();
  await screen.findByText('Maria Santos');
  expect(screen.queryByRole('button', { name: 'Confirm booking' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Decline' })).not.toBeInTheDocument();
});

it('receipt on file: needs the tick, prefilled amount, then sends the comparison id with messenger_gcash', async () => {
  mocks.confirmDirectBooking.mockResolvedValue({ ok: true, outcome: 'confirmed', booking_ref: 'BD1', guest_name: 'Maria Santos', checkin: '2099-10-12', checkout: '2099-10-14' });
  const user = userEvent.setup();
  view();
  const sheet = await open(user);
  expect(within(sheet).getByLabelText(/Amount received/)).toHaveValue('5073.00');
  expect(within(sheet).queryByRole('radio')).not.toBeInTheDocument();
  await user.click(within(sheet).getByRole('button', { name: 'Confirm booking' }));
  expect(await within(sheet).findByText('Tick the box once you have checked the money arrived.')).toBeInTheDocument();
  expect(mocks.confirmDirectBooking).not.toHaveBeenCalled();
  await user.click(within(sheet).getByRole('checkbox', { name: 'I checked the money arrived' }));
  await user.click(within(sheet).getByRole('button', { name: 'Confirm booking' }));
  await waitFor(() => expect(mocks.confirmDirectBooking).toHaveBeenCalledTimes(1));
  expect(mocks.confirmDirectBooking).toHaveBeenCalledWith({
    p_booking_id: 'b1', p_method: 'messenger_gcash', p_reference: '9012345678901234', p_amount: '5073.00', p_note: null, p_comparison_id: 'cmp-1', p_idempotency_key: 'confirm-test-key-0123456789',
  });
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Booking confirmed for Maria Santos, 12 Oct to 14 Oct.'));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
}, 20_000);

it('no receipt: GCash via Messenger is the default, a reference is required, then the body has a null comparison id', async () => {
  mocks.fetchInquiryPayments.mockResolvedValue([]);
  mocks.confirmDirectBooking.mockResolvedValue({ ok: true, outcome: 'confirmed' });
  const user = userEvent.setup();
  view();
  const sheet = await open(user);
  expect(within(sheet).getByRole('radio', { name: 'GCash via Messenger' })).toBeChecked();
  expect(within(sheet).getAllByRole('radio').map((r) => r.getAttribute('value'))).toEqual(['messenger_gcash', 'gcash_qr', 'bank', 'cash', 'other']);
  await user.click(within(sheet).getByRole('button', { name: 'Confirm booking' }));
  expect(await within(sheet).findByText('Enter the payment reference.')).toBeInTheDocument();
  expect(mocks.confirmDirectBooking).not.toHaveBeenCalled();
  await user.click(within(sheet).getByRole('radio', { name: 'GCash QR' }));
  await user.type(within(sheet).getByLabelText('Payment reference'), '777888');
  await user.clear(within(sheet).getByLabelText(/Amount received/));
  await user.type(within(sheet).getByLabelText(/Amount received/), '2,500');
  await user.click(within(sheet).getByRole('button', { name: 'Confirm booking' }));
  await waitFor(() => expect(mocks.confirmDirectBooking).toHaveBeenCalledWith({
    p_booking_id: 'b1', p_method: 'gcash_qr', p_reference: '777888', p_amount: '2500.00', p_note: null, p_comparison_id: null, p_idempotency_key: 'confirm-test-key-0123456789',
  }));
}, 20_000);

it('cash needs a note, not a reference; an amount of zero is refused', async () => {
  mocks.fetchInquiryPayments.mockResolvedValue([]);
  mocks.confirmDirectBooking.mockResolvedValue({ ok: true, outcome: 'confirmed' });
  const user = userEvent.setup();
  view();
  const sheet = await open(user);
  await user.click(within(sheet).getByRole('radio', { name: 'Cash' }));
  expect(within(sheet).queryByLabelText('Payment reference')).not.toBeInTheDocument();
  await user.click(within(sheet).getByRole('button', { name: 'Confirm booking' }));
  expect(await within(sheet).findByText(/Add a short note about the cash/)).toBeInTheDocument();
  await user.type(within(sheet).getByLabelText(/Note/), 'Handed over at the gate');
  await user.clear(within(sheet).getByLabelText(/Amount received/));
  await user.type(within(sheet).getByLabelText(/Amount received/), '0');
  await user.click(within(sheet).getByRole('button', { name: 'Confirm booking' }));
  expect(await within(sheet).findByText('Enter the amount received, more than zero.')).toBeInTheDocument();
  expect(mocks.confirmDirectBooking).not.toHaveBeenCalled();
  await user.clear(within(sheet).getByLabelText(/Amount received/));
  await user.type(within(sheet).getByLabelText(/Amount received/), '5073');
  await user.click(within(sheet).getByRole('button', { name: 'Confirm booking' }));
  await waitFor(() => expect(mocks.confirmDirectBooking).toHaveBeenCalledWith(expect.objectContaining({ p_method: 'cash', p_reference: null, p_note: 'Handed over at the gate', p_comparison_id: null })));
}, 20_000);

it('a server refusal shows its sentence and keeps the sheet open', async () => {
  mocks.confirmDirectBooking.mockResolvedValueOnce({ ok: false, outcome: 'reference_reused', prior_ref: 'BD99' });
  const user = userEvent.setup();
  view();
  const sheet = await open(user);
  await user.click(within(sheet).getByRole('checkbox'));
  await user.click(within(sheet).getByRole('button', { name: 'Confirm booking' }));
  const alert = await within(sheet).findByRole('alert');
  expect(alert).toHaveTextContent('BD99');
  expect(alert.textContent).not.toMatch(/!|Unfortunately/);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(toast.success).not.toHaveBeenCalled();
}, 20_000);

it('a dropped connection shows the error and keeps the sheet open for a retry', async () => {
  mocks.confirmDirectBooking.mockRejectedValueOnce(new AppError('unavailable', 'The backend is unreachable.'));
  const user = userEvent.setup();
  view();
  const sheet = await open(user);
  await user.click(within(sheet).getByRole('checkbox'));
  await user.click(within(sheet).getByRole('button', { name: 'Confirm booking' }));
  expect(await within(sheet).findByRole('alert')).toHaveTextContent('The backend is unreachable.');
}, 20_000);

it('Decline needs a reason, then sends the chip and text to staff_decline', async () => {
  mocks.declineDirectBooking.mockResolvedValue({ ok: true, outcome: 'declined', guest_name: 'Maria Santos' });
  const user = userEvent.setup();
  view();
  await user.click(await screen.findByRole('button', { name: 'Decline' }));
  const sheet = await screen.findByRole('dialog');
  expect(within(sheet).getByRole('button', { name: 'Decline request' })).toBeDisabled();
  await user.click(within(sheet).getByRole('button', { name: 'No payment received' }));
  await user.type(within(sheet).getByLabelText(/Anything to add/), 'sent twice');
  await user.click(within(sheet).getByRole('button', { name: 'Decline request' }));
  await waitFor(() => expect(mocks.declineDirectBooking).toHaveBeenCalledWith('b1', 'No payment received: sent twice', 'confirm-test-key-0123456789'));
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Request declined for Maria Santos.'));
}, 20_000);

it('the old single-click path is gone: Confirm opens a sheet and nothing is sent', async () => {
  const user = userEvent.setup();
  view();
  await open(user);
  expect(mocks.confirmDirectBooking).not.toHaveBeenCalled();
  expect(mocks.declineDirectBooking).not.toHaveBeenCalled();
});
