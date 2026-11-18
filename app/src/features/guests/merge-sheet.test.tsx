import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { MergeSheet } from './merge-sheet';

const fetchGuests = vi.hoisted(() => vi.fn());
const previewMerge = vi.hoisted(() => vi.fn());
const mergeGuests = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({ fetchGuests, previewMerge, mergeGuests }));
vi.mock('@/auth/session', () => ({ useSession: () => ({ propertyId: 'p1' }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
afterEach(() => { cleanup(); fetchGuests.mockReset(); previewMerge.mockReset(); mergeGuests.mockReset(); });

const row = (id: string, name: string, phone: string | null) => ({ id, name, phone, contact_number: null, last_stay_date: '2026-11-01' });
const renderSheet = (onClose = vi.fn()) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MergeSheet open guestId="g1" guestName="Demo Guest One" onClose={onClose} /></QueryClientProvider>);

it('finds the other record by name (no id to paste), previews, needs a reason and a second tap', async () => {
  const user = userEvent.setup();
  fetchGuests.mockResolvedValue({ rows: [row('g1', 'Demo Guest One', '1'), row('g5', 'Demo G. One', '0917 555 0101')], total: 2, page: 1 });
  previewMerge.mockResolvedValue({ reservations: 1, inquiries: 0, followUps: 2, conversations: 0, sharedContact: true });
  mergeGuests.mockResolvedValue({ ok: true });
  const onClose = vi.fn();
  renderSheet(onClose);
  expect(screen.queryByLabelText(/guest id/i)).not.toBeInTheDocument();
  await user.type(screen.getByLabelText('Find the other record'), 'Demo G');
  const hit = await screen.findByRole('button', { name: /Demo G\. One/ });
  expect(fetchGuests).toHaveBeenCalledWith('p1', { q: 'Demo G' });
  expect(screen.queryByRole('button', { name: /^Demo Guest One/ })).not.toBeInTheDocument(); // not itself
  await user.click(hit);
  expect(await screen.findByText(/Affects 1 reservations, 0 inquiries, 2 follow-ups, 0 conversations/)).toBeInTheDocument();
  expect(previewMerge).toHaveBeenCalledWith('g1', 'g5');
  const merge = screen.getByRole('button', { name: 'Merge' });
  expect(merge).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Same phone' }));
  await user.click(merge);
  expect(mergeGuests).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: /Tap again to merge/ }));
  await waitFor(() => expect(mergeGuests).toHaveBeenCalledWith('g1', 'g5', 'Same phone'));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
});

it('keeps the shared-contact rule: no shared phone or e-mail means no Merge button', async () => {
  const user = userEvent.setup();
  fetchGuests.mockResolvedValue({ rows: [row('g2', 'Demo Guest Two', null)], total: 1, page: 1 });
  previewMerge.mockResolvedValue({ reservations: 0, inquiries: 0, followUps: 0, conversations: 0, sharedContact: false });
  renderSheet();
  await user.type(screen.getByLabelText('Find the other record'), 'Two');
  await user.click(await screen.findByRole('button', { name: /Demo Guest Two/ }));
  expect(await screen.findByText(/A name alone cannot be merged/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Merge' })).not.toBeInTheDocument();
});
