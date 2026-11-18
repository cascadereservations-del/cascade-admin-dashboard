import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  list: vi.fn(), save: vi.fn(), upload: vi.fn(), saveProfile: vi.fn(), remove: vi.fn(), restore: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: h.toast }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('./api', () => ({
  listGuestCompanions: h.list, saveGuestCompanion: h.save, uploadCompanionIdPhoto: h.upload, saveProfile: h.saveProfile,
  removeIdPhoto: h.remove, restoreIdPhoto: h.restore, companionIdPhotoUrls: vi.fn(async () => new Map()),
}));

import { GuestIdPanel } from './id-photos';

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0];
const jpeg = () => new File([new Uint8Array(JPEG)], 'id.jpg', { type: 'image/jpeg' });
const companion = (o: object = {}) => ({ id: 'c1', guest_id: 'g1', name: 'Demo Guest', contact_number: null, id_type: null, id_number: null, id_photo_path: null, id_photo_rotation: null, notes: null, created_at: '', updated_at: '', version: 3, ...o });
const details = (o: object = {}) => ({ id_on_file: false, version: 2, ...o }) as never;

function view(d = details()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={qc}><GuestIdPanel guestId="g1" guestName="Demo Guest" details={d} /></QueryClientProvider>);
}
const pick = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: 'Add photo' }));
  await user.upload(await screen.findByTestId('photo-library'), jpeg());
};

beforeEach(() => {
  Object.values(h).forEach((f) => typeof f === 'function' && 'mockReset' in f && f.mockReset());
  h.toast.success.mockReset(); h.toast.error.mockReset();
  h.list.mockResolvedValue([]);
  h.save.mockResolvedValue({ ok: true, id: 'c1', version: 4 });
  h.upload.mockResolvedValue('c1/new.jpg');
  h.saveProfile.mockResolvedValue({ ok: true });
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:local'), revokeObjectURL: vi.fn() }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('shows a calm placeholder, with the marked-on-file wording and no alert', async () => {
  view(details({ id_on_file: true }));
  expect(await screen.findByText('Marked on file, no photo')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('button', { name: 'Add photo' })).toHaveClass('h-11');
});

it('shows the chosen photo at once, saves with the automatic reason and marks the ID on file', async () => {
  const user = userEvent.setup();
  let finish!: (path: string) => void;
  h.upload.mockImplementationOnce((_id: string, _f: File, on: (s: string) => void) => new Promise((res) => { on('uploading'); finish = res; }));
  view();
  await pick(user);
  expect(await screen.findByAltText('The ID photo you chose')).toHaveAttribute('src', 'blob:local');
  expect(await screen.findByRole('progressbar', { name: 'Upload progress' })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Uploading…');
  finish('c1/new.jpg');
  await waitFor(() => expect(h.toast.success).toHaveBeenCalledWith('ID photo saved'));
  expect(h.save).toHaveBeenNthCalledWith(1, 'g1', null, { name: 'Demo Guest' }, undefined, 'ID photo added');
  expect(h.upload).toHaveBeenCalledWith('c1', expect.any(File), expect.any(Function));
  expect(h.save).toHaveBeenNthCalledWith(2, 'g1', 'c1', { id_photo_path: 'c1/new.jpg' }, 4, 'ID photo added');
  expect(h.saveProfile).toHaveBeenCalledWith('g1', { id_on_file: true }, 2, 'ID photo added');
});

it('keeps the photo on screen when the upload stops, and Retry resumes without a second companion', async () => {
  const user = userEvent.setup();
  h.upload.mockRejectedValueOnce(new Error('offline'));
  view();
  await pick(user);
  expect(await screen.findByRole('alert')).toHaveTextContent('Upload stopped. Your photo is kept here.');
  expect(screen.getByAltText('The ID photo you chose')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(h.toast.success).toHaveBeenCalledWith('ID photo saved'));
  const creates = h.save.mock.calls.filter((c) => c[1] === null);
  expect(creates).toHaveLength(1);
});

it('Remove clears the path, says the file stays, and Undo for 6 seconds writes the old path back', async () => {
  const user = userEvent.setup();
  h.list.mockResolvedValue([companion({ id_photo_path: 'c1/old.jpg' })]);
  h.remove.mockResolvedValue({ previousPath: 'c1/old.jpg', version: 4 });
  h.restore.mockResolvedValue(undefined);
  view();
  await user.click(await screen.findByRole('button', { name: 'Remove' }));
  await waitFor(() => expect(h.remove).toHaveBeenCalledWith('c1', 3));
  const [msg, opts] = h.toast.mock.calls[0]!;
  expect(msg).toBe('ID photo removed. The file stays in private storage.');
  expect(opts.duration).toBe(6000);
  expect(opts.action.label).toBe('Undo');
  opts.action.onClick();
  await waitFor(() => expect(h.restore).toHaveBeenCalledWith('c1', 'c1/old.jpg', 4));
});
