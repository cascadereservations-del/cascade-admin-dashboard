import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ can: new Set<string>(['approve_payment']), fetchInquiryPayments: vi.fn() }));
vi.mock('@/auth/session', () => ({ useSession: () => ({ propertyId: 'p1', caps: { can: (a: string) => mocks.can.has(a) } }) }));
vi.mock('@/features/bookings/confirm-api', () => ({ fetchInquiryPayments: mocks.fetchInquiryPayments }));

import { BookingsToConfirmCard } from './bookings-to-confirm-card';

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `b${i}` }));
function view() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><BookingsToConfirmCard /></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => { mocks.can = new Set(['approve_payment']); mocks.fetchInquiryPayments.mockReset(); });
afterEach(() => cleanup());

it('shows the count and links to Inquiries', async () => {
  mocks.fetchInquiryPayments.mockResolvedValue(rows(3));
  view();
  const link = await screen.findByRole('link', { name: /3 bookings to confirm/ });
  expect(link).toHaveAttribute('href', '/bookings/inquiries');
});

it('says "1 booking" for one', async () => {
  mocks.fetchInquiryPayments.mockResolvedValue(rows(1));
  view();
  expect(await screen.findByRole('link', { name: '1 booking to confirm' })).toBeInTheDocument();
});

it('is hidden at zero', async () => {
  mocks.fetchInquiryPayments.mockResolvedValue([]);
  view();
  await vi.waitFor(() => expect(mocks.fetchInquiryPayments).toHaveBeenCalled());
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});

it('is hidden, and never asks the server, without approve_payment or read_finance', () => {
  mocks.can = new Set(['read_operations']);
  mocks.fetchInquiryPayments.mockResolvedValue(rows(2));
  view();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(mocks.fetchInquiryPayments).not.toHaveBeenCalled();
});

it('shows for read_finance alone', async () => {
  mocks.can = new Set(['read_finance']);
  mocks.fetchInquiryPayments.mockResolvedValue(rows(2));
  view();
  expect(await screen.findByRole('link', { name: /2 bookings to confirm/ })).toBeInTheDocument();
});

it('is hidden when the lookup fails', async () => {
  mocks.fetchInquiryPayments.mockRejectedValue(new Error('nope'));
  view();
  await vi.waitFor(() => expect(mocks.fetchInquiryPayments).toHaveBeenCalled());
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
