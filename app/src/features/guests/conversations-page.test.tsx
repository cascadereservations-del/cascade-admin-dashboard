import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ fetchConversations: vi.fn(), fetchThread: vi.fn(), sendHostReply: vi.fn() }));
vi.mock('./conversations-api', () => api);
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from 'sonner';
import { AppError } from '@/lib/errors';
import ConversationsPage from './conversations-page';

const recent = new Date(Date.now() - 3_600_000).toISOString();
const row = { psid: 'zz-1', psid_short: 'abcd1234', guest_name: 'Zz Guest', updated_at: recent, last_role: 'guest', last_text: 'Is there parking', last_guest_at: recent, open_handoffs: 1, human_until: null, last_risk: null };
const HID = '11111111-1111-4111-8111-111111111111';
const thread = (at: string) => ({ psid: 'zz-1', psid_short: 'abcd1234', guest_name: 'Zz Guest', updated_at: at, human_until: null, last_risk: null,
  history: [{ role: 'guest', text: 'Is there parking', at }, { role: 'bot', text: 'Yes, one slot.\n\n— Lloyd, Cascade Hideaway', at }],
  handoffs: [{ id: HID, status: 'open', risk: 'priority', guest_text: 'Is there parking', sent_text: null, resolved_by: null, resolved_at: null, created_at: at }] });

function view() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><ConversationsPage /></QueryClientProvider>);
}
beforeEach(() => { Object.values(api).forEach((m) => m.mockReset()); api.fetchConversations.mockResolvedValue([row]); });
afterEach(() => cleanup());

it('shows the thread and sends nothing until Send is pressed, then sends once with the open handoff', async () => {
  api.fetchThread.mockResolvedValue(thread(recent));
  api.sendHostReply.mockResolvedValue({ sent_text: 'x', recorded: true, handoff_marked: true });
  const user = userEvent.setup();
  view();
  await screen.findByText('Is there parking', { selector: 'p' });
  expect(screen.getByText('Host')).toBeInTheDocument(); // the signed bot turn is a host bubble
  const box = await screen.findByLabelText(/Reply to Zz Guest/);
  await user.type(box, 'See you soon');
  expect(api.sendHostReply).not.toHaveBeenCalled(); // typing, even a newline, never sends
  await user.type(box, '{Enter}');
  expect(api.sendHostReply).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Send reply' }));
  await waitFor(() => expect(api.sendHostReply).toHaveBeenCalledTimes(1));
  expect(api.sendHostReply).toHaveBeenCalledWith({ psid: 'zz-1', text: 'See you soon', handoffId: HID });
});

it('leaves the handoff alone when the box is unticked', async () => {
  api.fetchThread.mockResolvedValue(thread(recent));
  api.sendHostReply.mockResolvedValue({ sent_text: 'x', recorded: true, handoff_marked: false });
  const user = userEvent.setup();
  view();
  await user.type(await screen.findByLabelText(/Reply to Zz Guest/), 'Hello');
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'Send reply' }));
  await waitFor(() => expect(api.sendHostReply).toHaveBeenCalledWith({ psid: 'zz-1', text: 'Hello', handoffId: null }));
});

it('has no reply box once the 7-day window has closed', async () => {
  api.fetchThread.mockResolvedValue(thread(new Date(Date.now() - 8 * 86_400_000).toISOString()));
  view();
  await screen.findByRole('status');
  expect(screen.queryByRole('button', { name: 'Send reply' })).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent(/window closed/i);
});

it('disables Send for an empty reply', async () => {
  api.fetchThread.mockResolvedValue(thread(recent));
  view();
  expect(await screen.findByRole('button', { name: 'Send reply' })).toBeDisabled();
});

it('after a network error or 504 it shows the may-have-been-sent line and reloads the thread', async () => {
  api.fetchThread.mockResolvedValue(thread(recent));
  const msg = 'The reply may have been sent. Refresh the conversation before trying again.';
  api.sendHostReply.mockRejectedValue(new AppError('unavailable', msg));
  const user = userEvent.setup();
  view();
  await user.type(await screen.findByLabelText(/Reply to Zz Guest/), 'Hello');
  const loads = api.fetchThread.mock.calls.length;
  await user.click(screen.getByRole('button', { name: 'Send reply' }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith(msg));
  await waitFor(() => expect(api.fetchThread.mock.calls.length).toBeGreaterThan(loads));
  expect(api.sendHostReply).toHaveBeenCalledTimes(1); // never retried on its own
});
