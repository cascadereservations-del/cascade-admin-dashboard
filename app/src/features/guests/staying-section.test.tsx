import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StayingSection, stayingState } from './staying-section';
import { MSG_CONTACT, MSG_GONE, MSG_STALE, MSG_STALE_KEPT, keyFor, stayingError } from './staying';

const api = vi.hoisted(() => ({ fetchTimeline: vi.fn() }));
const st = vi.hoisted(() => ({ fetchStayRows: vi.fn(), fetchStayStaying: vi.fn(), setStayStaying: vi.fn(), confirmStayStaying: vi.fn() }));
vi.mock('./api', () => api);
vi.mock('./staying', async (orig) => ({ ...(await orig<typeof import('./staying')>()), ...st }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/dates', () => ({ formatDate: (v: string) => v }));
const caps = vi.hoisted(() => ({ manage: true }));
vi.mock('@/auth/session', () => ({ useSession: () => ({ propertyId: 'p1', caps: { can: () => caps.manage } }) }));

const rows = [
  { uid: 'u1', checkin: '2026-11-14', checkout: '2026-11-21', kind: 'airbnb', code: 'A' },
  { uid: 'u2', checkin: '2026-10-02', checkout: '2026-10-05', kind: 'direct', code: 'B' },
  { uid: 'u3', checkin: '2026-09-09', checkout: '2026-09-11', kind: 'airbnb', code: 'C' },
  { uid: 'u4', checkin: '2026-08-01', checkout: '2026-08-03', kind: 'airbnb', code: 'D' },
];
const staying = () => new Map([
  ['u1', { stay_uid: 'u1', names: 'Bravo Guest', source: 'staff', suggestion: null, version: 2 }],
  ['u2', { stay_uid: 'u2', names: '<img src=x onerror=alert(1)> Alpha', source: 'admin', suggestion: null, version: 1 }],
  ['u3', { stay_uid: 'u3', names: null, source: null, suggestion: 'Bravo Guest, Charlie Guest', version: 1 }],
]);
const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><StayingSection guestId="g1" /></QueryClientProvider>);

beforeEach(() => { caps.manage = true; api.fetchTimeline.mockResolvedValue({ events: [] }); st.fetchStayRows.mockResolvedValue(rows); st.fetchStayStaying.mockResolvedValue(staying()); });
afterEach(() => { cleanup(); Object.values({ ...api, ...st }).forEach((m) => m.mockReset()); });

describe('row states', () => {
  it('maps a value to its source tag and action', () => {
    expect(stayingState({ stay_uid: 'a', names: 'X', source: 'admin', suggestion: null, version: 1 })).toEqual({ value: 'X', tag: 'You', action: 'Edit' });
    expect(stayingState({ stay_uid: 'a', names: 'X', source: 'staff', suggestion: null, version: 1 })).toMatchObject({ tag: 'Staff', action: 'Edit' });
    expect(stayingState({ stay_uid: 'a', names: null, source: null, suggestion: 'Y', version: 1 })).toEqual({ value: 'Y', tag: 'Cassy suggested', action: 'Review' });
    expect(stayingState(undefined)).toEqual({ value: null, tag: null, action: 'Add' });
  });
  it('shows You, Staff, Cassy suggested and Not recorded rows, and renders a hostile name as text', async () => {
    const { container } = wrap();
    const list = await screen.findAllByRole('button', { name: /who is staying/i });
    expect(list.map((b) => b.textContent)).toEqual(['Edit', 'Edit', 'Review', 'Add']);
    expect(screen.getByText('Staff')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('Cassy suggested')).toBeInTheDocument();
    expect(screen.getByText('Not recorded')).toBeInTheDocument();
    expect(screen.getByText('Not confirmed. Staff have not accepted it.')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)> Alpha')).toBeInTheDocument();
  });
  it('hides itself when the read function is absent, and hides Edit without the admin permission', async () => {
    st.fetchStayStaying.mockResolvedValue(null);
    const { container } = wrap();
    await waitFor(() => expect(st.fetchStayStaying).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    cleanup();
    st.fetchStayStaying.mockResolvedValue(staying());
    caps.manage = false;
    wrap();
    await screen.findByText('Bravo Guest');
    expect(screen.queryByRole('button', { name: /who is staying/i })).toBeNull();
  });
});

describe('dialog', () => {
  const open = async (name: RegExp) => { const user = userEvent.setup(); wrap(); await user.click(await screen.findByRole('button', { name })); return user; };
  it('sends source admin, version 0 for a stay with no row, and a trimmed value', async () => {
    st.setStayStaying.mockResolvedValue({ ok: true, version: 1 });
    const user = await open(/^Add who is staying, 2026-08-01/);
    await user.type(screen.getByRole('textbox'), '  Delta Guest  ');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(st.setStayStaying).toHaveBeenCalledWith('p1', 'u4', 'Delta Guest', 0, expect.any(String)));
  });
  it('refuses phone numbers in plain words and keeps the dialog open', async () => {
    st.setStayStaying.mockRejectedValue({ code: '22023', message: 'names_contact' });
    const user = await open(/^Add who is staying, 2026-08-01/);
    await user.type(screen.getByRole('textbox'), 'Delta 0917 555 0100');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(MSG_CONTACT);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });
  it('keeps typed text and says to check the latest on a stale version', async () => {
    st.setStayStaying.mockRejectedValue({ code: '40001', message: 'stale version: x' });
    const user = await open(/^Edit who is staying, 2026-11-14/);
    await user.type(screen.getByRole('textbox'), ' Z');
    st.fetchStayStaying.mockClear();
    st.fetchStayStaying.mockResolvedValue(new Map([['u1', { stay_uid: 'u1', names: 'Newer Names', source: 'staff', suggestion: null, version: 3 }]]));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(MSG_STALE_KEPT);
    await waitFor(() => expect(st.fetchStayStaying).toHaveBeenCalled());
    expect(screen.getByRole('textbox')).toHaveValue('Bravo Guest Z');
  });
  it('shows the refreshed names when nothing was typed', async () => {
    st.setStayStaying.mockRejectedValue({ code: '40001', message: 'stale version: x' });
    const user = await open(/^Edit who is staying, 2026-11-14/);
    st.fetchStayStaying.mockResolvedValue(new Map([['u1', { stay_uid: 'u1', names: 'Newer Names', source: 'staff', suggestion: null, version: 3 }]]));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(MSG_STALE);
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('Newer Names'));
  });
  it('accepts a suggestion through the confirm function, and says calmly when it is gone', async () => {
    st.confirmStayStaying.mockResolvedValue({ ok: false, error: 'no_pending_suggestion', names: null, version: 3 });
    const user = await open(/^Review who is staying, 2026-09-09/);
    st.fetchStayStaying.mockClear();
    await user.click(screen.getByRole('button', { name: 'Use these' }));
    expect(st.confirmStayStaying).toHaveBeenCalledWith('p1', 'u3', true, 1);
    expect(await screen.findByRole('alert')).toHaveTextContent(MSG_GONE);
    await waitFor(() => expect(st.fetchStayStaying).toHaveBeenCalled());
  });
  it('sets a suggestion aside with Not these', async () => {
    st.confirmStayStaying.mockResolvedValue({ ok: true });
    const user = await open(/^Review who is staying, 2026-09-09/);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Not these' }));
    await waitFor(() => expect(st.confirmStayStaying).toHaveBeenCalledWith('p1', 'u3', false, 1));
  });
});

describe('error mapping and keys', () => {
  it('maps each refusal to plain words', () => {
    expect(stayingError({ code: '22023', message: 'names_contact' }).text).toBe('Please leave phone numbers and e-mail addresses out. Type names only.');
    expect(stayingError({ code: '22023', message: 'names_too_long' }).text).toMatch(/under 300 characters/);
    expect(stayingError({ code: 'P0002', message: 'stay_not_found' }).text).toBe('This stay is no longer on the calendar.');
    expect(stayingError({ code: '42501', message: 'forbidden' }).text).toMatch(/not permitted/);
    expect(stayingError({ code: '40001', message: 'stale version: the names changed' })).toEqual({ stale: true, text: MSG_STALE });
    expect(stayingError(new Error('boom')).stale).toBe(false);
  });
  it('mints a new idempotency key only when the names change', () => {
    const a = keyFor(null, 'A B');
    expect(keyFor(a, 'A B')).toBe(a);
    expect(keyFor(a, 'A B C').key).not.toBe(a.key);
  });
});
