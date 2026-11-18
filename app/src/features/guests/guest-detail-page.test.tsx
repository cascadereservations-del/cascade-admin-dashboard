import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import GuestDetailPage, { CompanionsSection } from './guest-detail-page';

const api = vi.hoisted(() => ({
  deleteGuestCompanion: vi.fn(), fetchFollowUps: vi.fn(), fetchGuest: vi.fn(), fetchTimeline: vi.fn(), listGuestCompanions: vi.fn(),
  saveGuestCompanion: vi.fn(), uploadCompanionIdPhoto: vi.fn(), saveProfile: vi.fn(),
}));
const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
vi.mock('./api', () => api);
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }));
const role = vi.hoisted(() => ({ value: 'owner' }));
vi.mock('@/auth/session', () => ({ useSession: () => ({ propertyId: 'p1', caps: { can: () => role.value === 'owner' || role.value === 'admin' } }) }));
vi.mock('./utilities-api', () => ({ UTILITIES_KEY: (p: string) => ['guest-utilities', p], fetchStayUtilities: async () => [] }));
vi.mock('@/lib/dates', () => ({ formatDate: (v: string) => v, formatDateTime: (v: string) => v }));
vi.mock('./id-photos', () => ({
  GuestIdPanel: () => null, IdPhotoProvider: ({ children }: { children: unknown }) => <>{children as never}</>, IdPhotoThumb: () => null, NoIdPhotoTile: () => null,
}));
vi.mock('./tier-card', () => ({ TierCard: () => null }));
vi.mock('./merge-sheet', () => ({ MergeSheet: () => null }));
vi.mock('./follow-up-form', () => ({ FollowUpForm: () => null }));
vi.mock('./photo-sheet', () => ({ PhotoSheet: () => null }));

beforeEach(() => vi.useRealTimers());
afterEach(() => { role.value = 'owner'; cleanup(); vi.useRealTimers(); Object.values(api).forEach((m) => m.mockReset()); toastSuccess.mockReset(); toastError.mockReset(); });

const companion = { id: 'c1', guest_id: 'g1', name: 'Demo Companion', contact_number: null, id_type: null, id_number: null, id_photo_path: 'c1/a.jpg', id_photo_rotation: null, notes: null, created_at: '', updated_at: '', version: 1 };
const wrap = (ui: React.ReactNode, path = '/') => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter></QueryClientProvider>);

async function removeFirstCompanion(user: ReturnType<typeof userEvent.setup>) {
  api.listGuestCompanions.mockResolvedValue([companion]);
  api.deleteGuestCompanion.mockResolvedValue({ ok: true, id: 'c1' });
  const view = wrap(<CompanionsSection guestId="g1" guestName="Demo Guest" />);
  await user.click(await screen.findByRole('button', { name: /Demo Companion/ }));
  await user.click(await screen.findByRole('button', { name: 'Remove companion' }));
  return view;
}

it('Remove waits for the Undo window, then deletes exactly once', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
  await removeFirstCompanion(user);
  expect(toastSuccess.mock.calls[0]![0]).toBe('Companion removed');
  expect(api.deleteGuestCompanion).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: /Demo Companion/ })).not.toBeInTheDocument();
  await act(async () => { vi.advanceTimersByTime(6100); });
  expect(api.deleteGuestCompanion).toHaveBeenCalledTimes(1);
  expect(api.deleteGuestCompanion).toHaveBeenCalledWith('c1', 'Companion removed');
  await act(async () => { vi.advanceTimersByTime(20000); });
  expect(api.deleteGuestCompanion).toHaveBeenCalledTimes(1);
  expect(api.saveGuestCompanion).not.toHaveBeenCalled(); // no restore with a new id
});

it('Undo cancels the delete and the row comes back with its own id', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
  await removeFirstCompanion(user);
  act(() => toastSuccess.mock.calls[0]![1].action.onClick());
  expect(await screen.findByRole('button', { name: /Demo Companion/ })).toBeInTheDocument();
  await act(async () => { vi.advanceTimersByTime(30000); });
  expect(api.deleteGuestCompanion).not.toHaveBeenCalled();
  expect(api.saveGuestCompanion).not.toHaveBeenCalled();
});

it('leaving the page inside the Undo window still deletes, once', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
  const view = await removeFirstCompanion(user);
  expect(api.deleteGuestCompanion).not.toHaveBeenCalled();
  view.unmount();
  expect(api.deleteGuestCompanion).toHaveBeenCalledTimes(1);
  await act(async () => { vi.advanceTimersByTime(30000); });
  expect(api.deleteGuestCompanion).toHaveBeenCalledTimes(1);
});

const profile = (over = {}) => ({ guest_id: 'g1', display_name: null, stay_preferences: null, id_type: null, contact_number: null, tags: [], vip: false, vip_reason: null, contact_provenance: {}, updated_at: '', version: 3, id_on_file: false, ...over });
function pageSetup() {
  api.fetchGuest.mockResolvedValue({ guest: { id: 'g1', name: 'Demo Guest', phone: '0917 555 0100', email: null, source: 'airbnb', total_stays: 1, last_stay_date: '2026-10-01', tier: null, tier_manual: null, created_at: '', updated_at: '', first_stay_date: '2026-10-01', notes: null }, details: profile(), detailsError: null });
  api.fetchTimeline.mockResolvedValue({ events: [], financeVisible: true });
  api.fetchFollowUps.mockResolvedValue({ rows: [] });
  api.listGuestCompanions.mockResolvedValue([]);
  api.saveProfile.mockResolvedValue({ ok: true, version: 4, updatedAt: '' });
  return wrap(<Routes><Route path="/guests/:id" element={<GuestDetailPage />} /></Routes>, '/guests/g1');
}

it('Edit sheet: the guests.phone fallback is a placeholder, so Save with no change writes nothing', async () => {
  const user = userEvent.setup();
  pageSetup();
  await user.click(await screen.findByRole('button', { name: 'Edit' }));
  const phone = await screen.findByLabelText('Contact number');
  expect(phone).toHaveValue('');
  expect(phone).toHaveAttribute('placeholder', '0917 555 0100');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument());
  expect(api.saveProfile).not.toHaveBeenCalled();
});

it('inline Phone row: clearing a value the profile never had does not save', async () => {
  const user = userEvent.setup();
  pageSetup();
  await user.click(await screen.findByRole('button', { name: /^Contact number: 0917/ }));
  await user.clear(screen.getByLabelText('Contact number'));
  await user.click(screen.getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument());
  expect(api.saveProfile).not.toHaveBeenCalled();
  expect(toastError).not.toHaveBeenCalled();
});

it('lane U: the electricity and water card shows for owner and admin, not for other roles', async () => {
  for (const r of ['owner', 'admin']) {
    role.value = r; pageSetup();
    expect(await screen.findByRole('heading', { name: 'Electricity and water' })).toBeInTheDocument();
    cleanup();
  }
  role.value = 'finance'; pageSetup();
  await screen.findByRole('button', { name: /^Contact number: 0917/ });
  expect(screen.queryByRole('heading', { name: 'Electricity and water' })).not.toBeInTheDocument();
});
