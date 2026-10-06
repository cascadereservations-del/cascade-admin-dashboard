import { rpc } from '@/lib/rpc';
import { AppError } from '@/lib/errors';
import { ackVerifierFinding } from '@/features/settings/api';

// Tasks adapter (D-301). ONE list over follow_up_tasks, work_orders and open verifier findings (tasks_list_v1): no second task
// store. Owner/admin see everything and can add reminders; any other staff account sees only its own tasks, already redacted by
// the server (no guest id, money or contact). A reminder is a plain follow_up_tasks row (title, due date, assignee, note).

export type TaskSource = 'follow_up_tasks' | 'work_orders' | 'verifier_findings';
export type TaskKind = 'reminder' | 'guest_follow_up' | 'system' | 'cleaning_issue' | 'guest_report' | 'work_order' | 'verifier';
export type TaskRow = {
  source: TaskSource;
  id: string;
  kind: TaskKind;
  title: string;
  detail: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'open' | 'done';
  due_at: string | null;
  assignee_id: string | null;
  assignee_label: string | null;
  mine: boolean;
  created_at: string;
  completed_at: string | null;
  version: number;
  blocks_arrival: boolean;
};
export type TaskList = { ok: boolean; manager: boolean; today: string; tasks: TaskRow[] };
export type Assignee = { user_id: string; role: string; label: string };

export async function fetchTasks(propertyId: string, includeDone: boolean): Promise<TaskList> {
  const r = await rpc<TaskList | { ok: false; reason: string }>('tasks_list_v1', { p_property_id: propertyId, p_include_done: includeDone });
  if (!r.ok) throw new AppError('forbidden', 'You are not permitted to see the task list.', (r as { reason?: string }).reason);
  return { ...(r as TaskList), tasks: (r as TaskList).tasks ?? [] };
}

export function setTaskDone(propertyId: string, task: Pick<TaskRow, 'source' | 'id'>, done: boolean, note?: string) {
  if (task.source === 'verifier_findings') return ackVerifierFinding(task.id).then(() => ({ ok: true, changed: true }));
  return rpc<{ ok: boolean; changed: boolean }>('task_set_done_v1', { p_property_id: propertyId, p_source: task.source, p_id: task.id, p_done: done, p_note: note?.trim() || null });
}

export type NewReminder = { title: string; dueAt: string | null; assigneeId: string | null; note: string };
export function addReminder(propertyId: string, r: NewReminder, key: string) {
  return rpc<{ ok: boolean; id: string; replayed: boolean }>('task_add_reminder_v1', {
    p_property_id: propertyId,
    p_title: r.title.trim(),
    p_due_at: r.dueAt,
    p_assignee_user_id: r.assigneeId,
    p_note: r.note.trim() || null,
    p_idempotency_key: key,
  });
}

export async function fetchAssignees(propertyId: string): Promise<Assignee[]> {
  const r = await rpc<{ ok: boolean; staff: Assignee[] }>('task_assignees_v1', { p_property_id: propertyId });
  return r.staff ?? [];
}

export const KIND_LABEL: Record<TaskKind, string> = {
  reminder: 'Reminder',
  guest_follow_up: 'Guest follow-up',
  system: 'System task',
  cleaning_issue: 'Cleaning issue',
  guest_report: 'Guest report',
  work_order: 'Work order',
  verifier: 'Check needs a person',
};

/** The Manila calendar date (yyyy-MM-dd) of a timestamp. null stays null. */
export function manilaDate(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  return Number.isFinite(t) ? new Date(t + 8 * 3600 * 1000).toISOString().slice(0, 10) : null;
}

export type DueState = 'overdue' | 'today' | 'later' | 'none';
export function dueState(dueAt: string | null, today: string): DueState {
  const d = manilaDate(dueAt);
  if (d === null) return 'none';
  return d < today ? 'overdue' : d === today ? 'today' : 'later';
}

export type TaskGroup = { key: 'overdue' | 'today' | 'later' | 'none' | 'done'; label: string; tasks: TaskRow[] };
const ORDER: Array<[TaskGroup['key'], string]> = [['overdue', 'Overdue'], ['today', 'Today'], ['later', 'Coming up'], ['none', 'No date'], ['done', 'Done recently']];
const RANK = { urgent: 0, high: 1, normal: 2, low: 3 } as const;

/** Open tasks by due state (overdue first), then the recently done. Empty groups are left out. Within a group: due time, priority, age. */
export function groupTasks(tasks: TaskRow[], today: string): TaskGroup[] {
  const by = new Map<TaskGroup['key'], TaskRow[]>(ORDER.map(([k]) => [k, []]));
  for (const t of tasks) by.get(t.status === 'done' ? 'done' : dueState(t.due_at, today))!.push(t);
  const cmp = (a: TaskRow, b: TaskRow) =>
    (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999') || RANK[a.priority] - RANK[b.priority] || a.created_at.localeCompare(b.created_at);
  return ORDER.map(([key, label]) => ({ key, label, tasks: (by.get(key) ?? []).sort(cmp) })).filter((g) => g.tasks.length > 0);
}

/** The datetime-local value a reminder form submits, as an ISO instant (Manila wall time, UTC+8). null when empty or invalid. */
export function dueFromLocal(v: string): string | null {
  if (!v) return null;
  const t = Date.parse(`${v.length === 16 ? `${v}:00` : v}+08:00`);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export function reminderProblem(title: string): string | null {
  const t = title.trim();
  return t.length < 3 ? 'Give the reminder a short title.' : t.length > 200 ? 'Keep the title under 200 characters.' : null;
}
