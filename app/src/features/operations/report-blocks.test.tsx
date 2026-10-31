import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.hoisted(() => vi.fn());
const signed = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
vi.mock('@/lib/rpc', () => ({ rpc: rpcMock }));
vi.mock('@/lib/supabase', () => ({ supabase: { storage: { from: () => ({ createSignedUrls: signed }) } } }));
const caps = vi.hoisted(() => ({ inspect: true }));
vi.mock('@/auth/session', () => ({ useSession: () => ({ propertyId: 'p1', caps: { can: (c: string) => c === 'inspect_cleaning' && caps.inspect } }) }));
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }));

import { ReportBlocksCard } from './report-blocks-card';
import { alignRead, correctionProblem, fetchReportBlocks, num } from './report-blocks-api';
import { RPC_MODULE, assertRpcEnabled } from '@/lib/rollout';

const ROW = {
  reading_id: 'r1', session_id: 's1', cleaner_name: 'Honey', checkout_date: '2026-10-30', recorded_at: '2026-10-30T16:30:00Z',
  typed_electric: 4292, typed_water: 81.852, prev_electric: 4200, prev_water: 80,
  photo_electric: 431.2, photo_water: 806, photo_note_electric: 'decimal misread', photo_note_water: null,
  photo_path_electric: 'p/e.jpg', photo_path_water: 'p/w.jpg',
};

function mount() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ReportBlocksCard /></QueryClientProvider>);
}
const listThen = (rows: unknown[]) => rpcMock.mockImplementation(async (fn: string) => (fn === 'admin_report_blocks_v1' ? rows : { ok: true, action: 'x', reading_id: 'r1' }));

beforeEach(() => { signed.mockResolvedValue({ data: [{ path: 'p/e.jpg', signedUrl: 'https://x/e' }, { path: 'p/w.jpg', signedUrl: 'https://x/w' }] }); });
afterEach(() => { caps.inspect = true; cleanup(); rpcMock.mockReset(); signed.mockReset(); toastSuccess.mockReset(); toastError.mockReset(); });

describe('report blocks api', () => {
  it('unknown stays null, never 0', () => {
    expect([num(null), num(''), num(undefined), num('abc'), num('12.5'), num(0)]).toEqual([null, null, null, null, 12.5, 0]);
  });

  it('calls the list rpc with the property and signs both photo paths for 900 s', async () => {
    rpcMock.mockResolvedValue([ROW]);
    const rows = await fetchReportBlocks('p1');
    expect(rpcMock).toHaveBeenCalledWith('admin_report_blocks_v1', { p_property_id: 'p1' });
    expect(signed).toHaveBeenCalledWith(['p/e.jpg', 'p/w.jpg'], 900);
    expect(rows[0]).toMatchObject({ electric_url: 'https://x/e', water_url: 'https://x/w' });
  });

  it('a corrected number below the last reading, or a missing one, is a plain problem', () => {
    const prev = { prev_electric: 4200, prev_water: 80 };
    expect([correctionProblem(prev, '4199', '81'), correctionProblem(prev, '4300', '79.9'), correctionProblem(prev, '', '81'), correctionProblem(prev, '4312', '80.7'), correctionProblem({ prev_electric: null, prev_water: null }, '1', '1')])
      .toEqual(['The electric number cannot be below the last reading.', 'The water number cannot be below the last reading.', 'Enter both the electric and the water number.', null, null]);
  });

  it('aligns the photo read to the typed decimal', () => {
    expect(alignRead(431.2, 4292)).toEqual({ value: 4312, shifted: true });
    expect(alignRead(806, 81.852)).toEqual({ value: 80.6, shifted: true });
    expect(alignRead(4326, 4326)).toEqual({ value: 4326, shifted: false });
    expect(alignRead(5, 4292)).toEqual({ value: 5, shifted: false });
    expect(alignRead(null, 5)).toEqual({ value: null, shifted: false });
    expect(alignRead(5, null)).toEqual({ value: 5, shifted: false });
  });

  it('the resolve rpc is behind the operations rollout gate', () => {
    expect(RPC_MODULE.admin_resolve_report_block_v1).toBe('operations');
    expect(() => assertRpcEnabled('admin_resolve_report_block_v1')).not.toThrow();
  });
});

describe('ReportBlocksCard', () => {
  it('says so when nothing is on hold', async () => {
    listThen([]);
    mount();
    expect(await screen.findByText('No meter readings to check.')).toBeInTheDocument();
  });

  it('shows who, which stay, the Manila time, the table, the reader note and no ids', async () => {
    listThen([ROW]);
    mount();
    expect(await screen.findByText('The report was accepted. Check the photo against the typed numbers and pick one answer.')).toBeInTheDocument();
    // 2026-10-30T16:30Z is 31 Oct 00:30 in Asia/Manila
    expect(screen.getByText(/Honey · stay ending 30 Oct 2026 · recorded 31 Oct 2026, 00:30/)).toBeInTheDocument();
    expect(screen.getByText('4292')).toBeInTheDocument();
    expect(screen.getByText('4312 (reader saw 431.2)')).toBeInTheDocument();
    expect(screen.getByText('80.6 (reader saw 806)')).toBeInTheDocument();
    expect(screen.getByText('4200')).toBeInTheDocument();
    expect(screen.getByText(/Electric: decimal misread/)).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(2);
    expect(document.body.textContent).not.toMatch(/r1\b|s1\b/);
  });

  it('a photo_date row shows the date headline, the lines and the same two buttons', async () => {
    listThen([{ ...ROW, reason: 'photo_date', photo_date_lines: ['Electric photo taken Oct 23, checkout Oct 21'] }]);
    mount();
    expect(await screen.findByText('Photo date is far from the checkout day')).toBeInTheDocument();
    expect(screen.getByText('Electric photo taken Oct 23, checkout Oct 21')).toBeInTheDocument();
    expect(screen.queryByText(/The report was accepted/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Typed numbers are right' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Correct the numbers' })).toBeInTheDocument();
  });

  it('an archived photo says so', async () => {
    listThen([{ ...ROW, photo_archived: true, photo_path_electric: null, photo_path_water: null }]);
    mount();
    expect(await screen.findByText('Photo moved to the Drive archive')).toBeInTheDocument();
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('Typed numbers are right calls the rpc with that action and the note', async () => {
    listThen([ROW]);
    mount();
    await userEvent.type(await screen.findByLabelText('Note (optional)'), 'photo is blurred');
    await userEvent.click(screen.getByRole('button', { name: 'Typed numbers are right' }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith('admin_resolve_report_block_v1', { p_reading_id: 'r1', p_action: 'typed_is_right', p_electric: null, p_water: null, p_note: 'photo is blurred' }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
  });

  it('Correct the numbers prefills the typed numbers, refuses a lower one, then saves', async () => {
    listThen([ROW]);
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Correct the numbers' }));
    const e = screen.getByLabelText('Electric (kWh)'), w = screen.getByLabelText('Water (m3)');
    expect(e).toHaveValue('4292');
    expect(w).toHaveValue('81.852');
    await userEvent.clear(e); await userEvent.type(e, '4100');
    expect(screen.getByRole('alert')).toHaveTextContent('The electric number cannot be below the last reading.');
    expect(screen.getByRole('button', { name: 'Save corrected numbers' })).toBeDisabled();
    await userEvent.clear(e); await userEvent.type(e, '4312');
    await userEvent.clear(w); await userEvent.type(w, '80.7');
    await userEvent.click(screen.getByRole('button', { name: 'Save corrected numbers' }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith('admin_resolve_report_block_v1', { p_reading_id: 'r1', p_action: 'correct_numbers', p_electric: 4312, p_water: 80.7, p_note: null }));
  });

  it('shows the server message when the answer is refused, and re-enables the buttons', async () => {
    rpcMock.mockImplementation(async (fn: string) => {
      if (fn === 'admin_report_blocks_v1') return [ROW];
      throw { code: '22023', message: 'This reading was already answered.' };
    });
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Typed numbers are right' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This reading was already answered.');
    expect(toastError).toHaveBeenCalledWith('This reading was already answered.');
    expect(screen.getByRole('button', { name: 'Typed numbers are right' })).toBeEnabled();
  });

  it('an ok:false body is shown as the refusal, not as success', async () => {
    rpcMock.mockImplementation(async (fn: string) => (fn === 'admin_report_blocks_v1' ? [ROW] : { ok: false, message: 'Not allowed.' }));
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Typed numbers are right' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Not allowed.');
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('a cleaner (no inspect_cleaning) sees nothing of the card and the list is never asked for', async () => {
    caps.inspect = false;
    listThen([ROW]);
    mount();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('Meter readings to check')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Typed numbers are right' })).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('an inspector sees the card with both answers', async () => {
    listThen([ROW]);
    mount();
    expect(await screen.findByRole('button', { name: 'Typed numbers are right' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Correct the numbers' })).toBeInTheDocument();
  });

  it('shows the server message when the list itself is refused', async () => {
    rpcMock.mockRejectedValue({ code: '42501', message: 'permission denied' });
    mount();
    expect(await screen.findByText('You are not permitted to do this.')).toBeInTheDocument();
  });
});
