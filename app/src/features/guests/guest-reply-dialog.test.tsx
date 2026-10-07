import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ draftGuestReply: vi.fn(), shrinkImage: vi.fn() }));
vi.mock('./guest-reply-image', () => ({ shrinkImage: api.shrinkImage }));
vi.mock('./guest-reply-api', async (orig) => ({ ...(await orig<typeof import('./guest-reply-api')>()), draftGuestReply: api.draftGuestReply }));

import { AppError } from '@/lib/errors';
import { GuestReplyButton } from './guest-reply-dialog';

const DRAFT = { guest_name: 'Maria', platform: 'messenger', guest_text: 'Is early check-in possible?', header: 'h', replies: ['Hello Maria, early check-in is possible from noon.', 'Hi Maria, we can usually welcome you from noon.'] };

function view() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}><GuestReplyButton /></QueryClientProvider>);
}
beforeEach(() => { api.draftGuestReply.mockReset(); api.shrinkImage.mockReset(); });
afterEach(() => cleanup());

it('opens on a Text / Screenshot choice, drafts from text, shows two cards with Copy and can start over', async () => {
  api.draftGuestReply.mockResolvedValue(DRAFT);
  const user = userEvent.setup();
  const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
  view();
  await user.click(screen.getByRole('button', { name: 'Cassy reply' }));
  expect(await screen.findByRole('heading', { name: 'What did the guest send?' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Text' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Screenshot' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Messenger' })).toBeChecked();
  expect(screen.getByRole('button', { name: 'Write replies' })).toBeDisabled();

  await user.click(screen.getByLabelText('Guest message'));
  await user.paste('Is early check-in possible?');
  await user.click(screen.getByRole('button', { name: 'Write replies' }));
  await waitFor(() => expect(api.draftGuestReply).toHaveBeenCalledWith({ text: 'Is early check-in possible?', guestName: '', platform: 'messenger' }));

  expect(await screen.findByText('Replying to: Is early check-in possible?')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /^Copy reply/ })).toHaveLength(2);
  expect(screen.getByText(DRAFT.replies[1]!)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Copy reply 2' }));
  expect(writeText).toHaveBeenCalledWith(DRAFT.replies[1]);
  expect(await screen.findByRole('button', { name: 'Copy reply 2' })).toHaveTextContent('Copied');

  await user.click(screen.getByRole('button', { name: 'Start over' }));
  expect(await screen.findByLabelText('Guest message')).toHaveValue('');
}, 20_000); // many userEvent steps; jsdom is slow when the whole suite runs in parallel

it('shows the warm sentence for a refusal and keeps what was typed', async () => {
  api.draftGuestReply.mockRejectedValue(new AppError('forbidden', 'Only owner and admin accounts can draft guest replies.'));
  const user = userEvent.setup();
  view();
  await user.click(screen.getByRole('button', { name: 'Cassy reply' }));
  await user.click(await screen.findByLabelText('Guest message'));
  await user.paste('Hi there');
  await user.click(screen.getByRole('button', { name: 'Write replies' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Only owner and admin accounts can draft guest replies.');
  expect(screen.getByLabelText('Guest message')).toHaveValue('Hi there');
});

it('the Screenshot tab takes an image file and the Write replies button waits for one', async () => {
  const user = userEvent.setup();
  view();
  await user.click(screen.getByRole('button', { name: 'Cassy reply' }));
  await user.click(await screen.findByRole('tab', { name: 'Screenshot' }));
  const input = await screen.findByLabelText('Screenshot of the message');
  expect(input).toHaveAttribute('accept', 'image/*');
  expect(screen.getByRole('button', { name: 'Write replies' })).toBeDisabled();
  await user.upload(input, new File(['x'], 'chat.png', { type: 'image/png' }));
  expect(screen.getByRole('button', { name: 'Write replies' })).toBeEnabled();
  expect(screen.getByText(/Ready: chat\.png/)).toBeInTheDocument();
});

it('shows the warm bad-image sentence when the browser cannot decode the picture, and clears it on the next edit', async () => {
  api.shrinkImage.mockRejectedValue(new Error('The source image could not be decoded.'));
  const user = userEvent.setup();
  view();
  await user.click(screen.getByRole('button', { name: 'Cassy reply' }));
  await user.click(await screen.findByRole('tab', { name: 'Screenshot' }));
  await user.upload(await screen.findByLabelText('Screenshot of the message'), new File(['x'], 'photo.heic', { type: 'image/heic' }));
  await user.click(screen.getByRole('button', { name: 'Write replies' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('That image could not be read. Try another screenshot, or paste the text instead.');
  expect(api.draftGuestReply).not.toHaveBeenCalled();
  await user.upload(screen.getByLabelText('Screenshot of the message'), new File(['y'], 'chat.png', { type: 'image/png' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('moves focus to the result heading, announces it, and returns focus to the form heading after Start over', async () => {
  api.draftGuestReply.mockResolvedValue(DRAFT);
  const user = userEvent.setup();
  view();
  await user.click(screen.getByRole('button', { name: 'Cassy reply' }));
  await user.click(await screen.findByLabelText('Guest message'));
  await user.paste('Hello');
  await user.click(screen.getByRole('button', { name: 'Write replies' }));
  const result = await screen.findByRole('heading', { name: 'Draft replies' });
  await waitFor(() => expect(result).toHaveFocus());
  expect(screen.getByText('The replies are ready.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Start over' }));
  const form = await screen.findByRole('heading', { name: 'What did the guest send?' });
  await waitFor(() => expect(form).toHaveFocus());
});
