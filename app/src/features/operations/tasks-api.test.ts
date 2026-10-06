import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.fn();
vi.mock('@/lib/rpc', () => ({ rpc: (...a: unknown[]) => rpcMock(...a) }));
vi.mock('@/features/settings/api', () => ({ ackVerifierFinding: (k: string) => rpcMock('ack_verifier_finding_v1', { p_key: k }) }));

import { addReminder, dueFromLocal, dueState, fetchAssignees, fetchTasks, groupTasks, manilaDate, reminderProblem, setTaskDone, type TaskRow } from './tasks-api';

// D-301: the Tasks page's data layer. The list itself is built by tasks_list_v1; these tests cover how it is fetched, grouped
// and written back.
const row = (o: Partial<TaskRow>): TaskRow => ({
  source: 'follow_up_tasks', id: 'id', kind: 'reminder', title: 'T', detail: null, priority: 'normal', status: 'open', due_at: null,
  assignee_id: null, assignee_label: null, mine: false, created_at: '2026-10-01T00:00:00Z', completed_at: null, version: 1, blocks_arrival: false, ...o,
});
const today = '2026-10-06';

beforeEach(() => rpcMock.mockReset());

describe('manilaDate and dueState use the Manila calendar day', () => {
  it('23:30 UTC on the 5th is already the 6th in Manila', () => {
    expect(manilaDate('2026-10-05T23:30:00Z')).toBe('2026-10-06');
    expect(manilaDate('2026-10-06T15:59:00Z')).toBe('2026-10-06');
    expect(manilaDate('2026-10-06T16:00:00Z')).toBe('2026-10-07');
  });
  it('no date and a bad date are null, never today', () => {
    expect(manilaDate(null)).toBeNull();
    expect(manilaDate('garbage')).toBeNull();
    expect(dueState(null, today)).toBe('none');
    expect(dueState('garbage', today)).toBe('none');
  });
  it('overdue, today and later', () => {
    expect(dueState('2026-10-05T10:00:00Z', today)).toBe('overdue');
    expect(dueState('2026-10-06T02:00:00Z', today)).toBe('today');
    expect(dueState('2026-10-09T02:00:00Z', today)).toBe('later');
  });
});

describe('groupTasks', () => {
  const tasks = [
    row({ id: 'later', due_at: '2026-10-09T02:00:00Z' }),
    row({ id: 'today', due_at: '2026-10-06T02:00:00Z' }),
    row({ id: 'none-low', priority: 'low' }),
    row({ id: 'none-urgent', priority: 'urgent' }),
    row({ id: 'late', due_at: '2026-10-01T02:00:00Z' }),
    row({ id: 'done', status: 'done', due_at: '2026-10-01T02:00:00Z' }),
  ];
  it('orders the groups overdue, today, coming up, no date, done', () => {
    expect(groupTasks(tasks, today).map((g) => g.key)).toEqual(['overdue', 'today', 'later', 'none', 'done']);
  });
  it('a done task is never overdue', () => {
    expect(groupTasks(tasks, today).find((g) => g.key === 'overdue')?.tasks.map((t) => t.id)).toEqual(['late']);
    expect(groupTasks(tasks, today).find((g) => g.key === 'done')?.tasks.map((t) => t.id)).toEqual(['done']);
  });
  it('inside a group the more urgent task comes first', () => {
    expect(groupTasks(tasks, today).find((g) => g.key === 'none')?.tasks.map((t) => t.id)).toEqual(['none-urgent', 'none-low']);
  });
  it('leaves empty groups out and handles an empty list', () => {
    expect(groupTasks([], today)).toEqual([]);
    expect(groupTasks([row({ id: 'a' })], today).map((g) => g.key)).toEqual(['none']);
  });
});

describe('fetchTasks', () => {
  it('asks tasks_list_v1 for the property and the done flag', async () => {
    rpcMock.mockResolvedValue({ ok: true, manager: true, today, tasks: [row({ id: 'a' })] });
    const r = await fetchTasks('prop-1', true);
    expect(rpcMock).toHaveBeenCalledWith('tasks_list_v1', { p_property_id: 'prop-1', p_include_done: true });
    expect(r.manager).toBe(true);
    expect(r.tasks).toHaveLength(1);
  });
  it('turns not_authorized into a forbidden error instead of an empty list', async () => {
    rpcMock.mockResolvedValue({ ok: false, reason: 'not_authorized' });
    await expect(fetchTasks('prop-1', false)).rejects.toMatchObject({ kind: 'forbidden' });
  });
  it('a missing tasks array is an empty list, not a crash', async () => {
    rpcMock.mockResolvedValue({ ok: true, manager: false, today });
    expect((await fetchTasks('prop-1', false)).tasks).toEqual([]);
  });
});

describe('writes', () => {
  it('setTaskDone calls task_set_done_v1 with the source, id and flag; a blank note is null', async () => {
    rpcMock.mockResolvedValue({ ok: true, changed: true });
    await setTaskDone('prop-1', { source: 'work_orders', id: 'wo-1' }, true, '   ');
    expect(rpcMock).toHaveBeenCalledWith('task_set_done_v1', { p_property_id: 'prop-1', p_source: 'work_orders', p_id: 'wo-1', p_done: true, p_note: null });
    await setTaskDone('prop-1', { source: 'follow_up_tasks', id: 'f-1' }, false);
    expect(rpcMock).toHaveBeenLastCalledWith('task_set_done_v1', { p_property_id: 'prop-1', p_source: 'follow_up_tasks', p_id: 'f-1', p_done: false, p_note: null });
  });
  it('a verifier finding is acknowledged through the existing RPC, not task_set_done_v1', async () => {
    rpcMock.mockResolvedValue({ ok: true });
    await setTaskDone('prop-1', { source: 'verifier_findings', id: 'V10:x' }, true);
    expect(rpcMock).toHaveBeenCalledWith('ack_verifier_finding_v1', { p_key: 'V10:x' });
    expect(rpcMock).not.toHaveBeenCalledWith('task_set_done_v1', expect.anything());
  });
  it('addReminder sends the trimmed title, the due instant, the assignee, the note and the idempotency key', async () => {
    rpcMock.mockResolvedValue({ ok: true, id: 'n', replayed: false });
    await addReminder('prop-1', { title: '  Order towels ', dueAt: '2026-10-08T02:00:00.000Z', assigneeId: 'u-1', note: ' call first ' }, 'key-0123456789abcdef');
    expect(rpcMock).toHaveBeenCalledWith('task_add_reminder_v1', {
      p_property_id: 'prop-1', p_title: 'Order towels', p_due_at: '2026-10-08T02:00:00.000Z', p_assignee_user_id: 'u-1', p_note: 'call first', p_idempotency_key: 'key-0123456789abcdef',
    });
    await addReminder('prop-1', { title: 'Plain', dueAt: null, assigneeId: null, note: '  ' }, 'key-0123456789abcdef');
    expect(rpcMock).toHaveBeenLastCalledWith('task_add_reminder_v1', expect.objectContaining({ p_due_at: null, p_assignee_user_id: null, p_note: null }));
  });
  it('fetchAssignees returns the staff list, empty when missing', async () => {
    rpcMock.mockResolvedValue({ ok: true, staff: [{ user_id: 'u', role: 'cleaner', label: 'Honey' }] });
    expect(await fetchAssignees('prop-1')).toHaveLength(1);
    rpcMock.mockResolvedValue({ ok: true });
    expect(await fetchAssignees('prop-1')).toEqual([]);
  });
});

describe('form helpers', () => {
  it('dueFromLocal reads a datetime-local value as Manila time', () => {
    expect(dueFromLocal('2026-10-08T10:00')).toBe('2026-10-08T02:00:00.000Z');
    expect(dueFromLocal('2026-10-08T10:00:30')).toBe('2026-10-08T02:00:30.000Z');
    expect(dueFromLocal('')).toBeNull();
    expect(dueFromLocal('nonsense')).toBeNull();
  });
  it('reminderProblem needs 3 to 200 characters', () => {
    expect(reminderProblem('ab')).toMatch(/title/);
    expect(reminderProblem('  ab  ')).toMatch(/title/);
    expect(reminderProblem('Order towels')).toBeNull();
    expect(reminderProblem('x'.repeat(201))).toMatch(/200/);
  });
});
