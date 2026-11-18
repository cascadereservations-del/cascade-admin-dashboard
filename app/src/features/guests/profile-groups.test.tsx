import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { FieldRow, NOTES, PHONE, ProfileGroups, notesShown, fieldValue, groupSummary, useFieldSave, type FieldDef } from './profile-groups';
import type { GuestRow, ProfileDetails } from './api';

const saveProfile = vi.hoisted(() => vi.fn());
const fetchGuest = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({ saveProfile, fetchGuest }));
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }));
vi.mock('@/lib/dates', () => ({ formatDate: (v: string) => v, formatDateTime: (v: string) => v }));
afterEach(() => { cleanup(); saveProfile.mockReset(); fetchGuest.mockReset(); toastSuccess.mockReset(); toastError.mockReset(); });

const details = (over: Partial<ProfileDetails> = {}): ProfileDetails => ({ guest_id: 'g1', display_name: null, preferred_channel: null, language: null, messenger_psid: null, messenger_link: null, stay_preferences: null, tags: [], vip: false, vip_reason: null, contact_provenance: {}, updated_at: '', version: 3, contact_number: null, birthday: null, address: null, airbnb_profile_id: null, id_on_file: false, id_type: null, id_number: null, id_drive_url: null, id_verified_at: null, ...over });
const guest = (over: Partial<GuestRow> = {}) => ({ id: 'g1', email: null, ...over }) as GuestRow;

it('summaries count filled fields of the group and never show a private value', () => {
  const src = { guest: guest({ email: 'a@example.com' }), details: details({ language: 'Filipino', address: '1 Demo Street', id_number: 'DEMO-1' }) };
  const defs = (k: string[]) => k.map((key) => ({ key, label: key, kind: 'text' }) as FieldDef);
  expect(groupSummary(src, defs(['email', 'preferred_channel', 'language', 'messenger_link', 'airbnb_profile_id']))).toMatchObject({ filled: 2, total: 5, text: 'a@example.com · Filipino' });
  const priv = groupSummary(src, [{ key: 'address', label: 'Address', kind: 'text', masked: true }, { key: 'id_number', label: 'ID number', kind: 'text', masked: true }, { key: 'birthday', label: 'Birthday', kind: 'date' }]);
  expect(priv).toMatchObject({ filled: 2, total: 3, text: 'Address · ID number' });
  expect(groupSummary({ guest: guest(), details: null }, defs(['language', 'tags']))).toMatchObject({ filled: 0, total: 2, text: 'Add language, tags' });
  expect(fieldValue({ guest: guest(), details: details({ vip: true, tags: ['a', 'b'] }) }, 'vip')).toBe('true');
});

function Harness({ d = details(), withPhone = false }: { d?: ProfileDetails; withPhone?: boolean }) {
  const { saveField, reasonSheet } = useFieldSave('g1', d);
  const [open, setOpen] = useState<string[]>(['contact', 'private', 'tags']);
  return <>
    {withPhone && <FieldRow def={PHONE} value={d.contact_number ?? ''} onSave={(v) => saveField(PHONE, v)} />}
    <ProfileGroups guest={guest()} details={d} open={open} onOpenChange={(id, o) => setOpen((c) => (o ? [...c, id] : c.filter((x) => x !== id)))} saveField={saveField} tier={{ summary: 'No tier yet', node: <p>tier</p> }} history={{ summary: '1 stay', node: <p>history</p> }} record={{ summary: 'Guest id', node: <p>record</p> }} />
    {reasonSheet}
  </>;
}
const renderHarness = (props: Parameters<typeof Harness>[0] = {}) => render(<QueryClientProvider client={new QueryClient()}><Harness {...props} /></QueryClientProvider>);

it('renders six groups, each with a header summary; empty rows say Add', () => {
  renderHarness();
  for (const t of ['Contact options', 'Private details', 'Tags and VIP', 'Tier and benefits', 'Stay history and follow-ups', 'Record and merge']) expect(screen.getByRole('button', { name: new RegExp(t) })).toBeInTheDocument();
  expect(screen.getAllByText(/^0 of \d+ filled$/).length).toBeGreaterThanOrEqual(3);
  expect(screen.getAllByText('Add').length).toBeGreaterThanOrEqual(8);
  // tier, history and record stay collapsed until opened
  expect(screen.queryByText('tier')).not.toBeInTheDocument();
});

it('tap, type, Enter saves that one field with an automatic reason and offers Undo', async () => {
  const user = userEvent.setup();
  saveProfile.mockResolvedValue({ ok: true, version: 4, updatedAt: '' });
  renderHarness();
  await user.click(screen.getByRole('button', { name: /^Language/ }));
  await user.type(screen.getByLabelText('Language'), 'Filipino{Enter}');
  await waitFor(() => expect(saveProfile).toHaveBeenCalledWith('g1', { language: 'Filipino' }, 3, 'Edited language'));
  const [msg, opts] = toastSuccess.mock.calls[0]!;
  expect(msg).toBe('Language saved');
  saveProfile.mockClear();
  opts.action.onClick();
  await waitFor(() => expect(saveProfile).toHaveBeenCalledWith('g1', { language: '' }, 4, 'Undo of last change'));
});

it('a version conflict re-reads the profile and re-applies the single field', async () => {
  const user = userEvent.setup();
  saveProfile.mockRejectedValueOnce({ code: '40001', message: 'stale version: profile changed since it was loaded' }).mockResolvedValueOnce({ ok: true, version: 10 });
  fetchGuest.mockResolvedValue({ guest: guest(), details: details({ version: 9, language: 'Cebuano' }), detailsError: null });
  renderHarness();
  await user.click(screen.getByRole('button', { name: /^Language/ }));
  await user.type(screen.getByLabelText('Language'), 'Filipino{Enter}');
  await waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(2));
  expect(saveProfile.mock.calls[1]).toEqual(['g1', { language: 'Filipino' }, 9, 'Edited language']);
  expect(toastError).not.toHaveBeenCalled();
});

it('ID number asks for a one-tap reason; a chip saves it', async () => {
  const user = userEvent.setup();
  saveProfile.mockResolvedValue({ ok: true, version: 4 });
  renderHarness();
  await user.click(screen.getByRole('button', { name: /^ID number/ }));
  await user.type(screen.getByLabelText('ID number'), 'DEMO-1234{Enter}');
  expect(saveProfile).not.toHaveBeenCalled();
  await user.click(await screen.findByRole('button', { name: 'Seen at check-in' }));
  await waitFor(() => expect(saveProfile).toHaveBeenCalledWith('g1', { id_number: 'DEMO-1234' }, 3, 'Seen at check-in'));
});

it('un-ticking ID on file asks for a reason; birthday does not', async () => {
  const user = userEvent.setup();
  saveProfile.mockResolvedValue({ ok: true, version: 4 });
  renderHarness({ d: details({ id_on_file: true }) });
  await user.click(screen.getByRole('button', { name: /^ID marked on file/ }));
  await user.selectOptions(screen.getByLabelText('ID marked on file'), 'false');
  await user.click(screen.getByRole('button', { name: 'Done' }));
  expect(await screen.findByRole('button', { name: 'Correction' })).toBeInTheDocument();
  expect(saveProfile).not.toHaveBeenCalled();
});

it('a birthday saves straight away with the automatic reason', async () => {
  const user = userEvent.setup();
  saveProfile.mockResolvedValue({ ok: true, version: 4 });
  renderHarness();
  await user.click(screen.getByRole('button', { name: /^Birthday/ }));
  await user.type(screen.getByLabelText('Birthday'), '1990-05-14{Enter}');
  await waitFor(() => expect(saveProfile).toHaveBeenCalledWith('g1', { birthday: '1990-05-14' }, 3, 'Edited birthday'));
});

it('a private value stays hidden until shown, and the first tap only shows it', async () => {
  const user = userEvent.setup();
  renderHarness({ d: details({ address: '1 Demo Street' }) });
  expect(screen.queryByText('1 Demo Street')).not.toBeInTheDocument();
  const row = screen.getByRole('button', { name: /^Address/ });
  expect(within(row).getByText('•••• hidden')).toBeInTheDocument();
  await user.click(row);
  expect(screen.getByText('1 Demo Street')).toBeInTheDocument();
  expect(screen.queryByLabelText('Address')).not.toBeInTheDocument();
});

it('an unchanged value closes without saving', async () => {
  const user = userEvent.setup();
  renderHarness({ d: details({ contact_number: '0917 555 0101' }), withPhone: true });
  await user.click(screen.getAllByRole('button', { name: /^Contact number/ })[0]!);
  await user.click(screen.getByRole('button', { name: 'Done' }));
  expect(saveProfile).not.toHaveBeenCalled();
});

it('a block value (the notes bullets) is never rendered inside a button', () => {
  const v = '2026-10-01: Late arrival | Quiet room';
  render(<FieldRow def={NOTES} value={v} shown={notesShown(v)} onSave={async () => undefined} />);
  const btn = screen.getByRole('button', { name: /^Notes:/ });
  expect(btn.querySelector('ul, div')).toBeNull();
  expect(screen.getByText('Late arrival').closest('button')).toBeNull();
});
