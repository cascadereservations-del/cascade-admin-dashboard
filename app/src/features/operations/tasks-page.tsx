import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSession } from '@/auth/session';
import { formatDateTime, todayManila } from '@/lib/dates';
import { toAppError } from '@/lib/errors';
import { newIdempotencyKey } from '@/lib/idempotency';
import { PageHeader } from '@/components/data/page-header';
import { EmptyState, QueryState } from '@/components/data/query-state';
import { StatusBadge, type Tone } from '@/components/data/status-badge';
import { DetailSheet } from '@/components/data/detail-sheet';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { KIND_LABEL, addReminder, dueFromLocal, dueState, fetchAssignees, fetchTasks, groupTasks, reminderProblem, setTaskDone, type TaskRow } from './tasks-api';

// D-301: ONE list of what needs a person. It unions follow-ups and reminders, work orders (cleaning issues, guest reports),
// and open verifier findings; there is no second task store. Owner/admin see all and add reminders; everyone else sees only
// their own tasks, redacted by the server.

const NONE = 'none';
const priorityTone = (p: string): Tone => (p === 'urgent' ? 'bad' : p === 'high' ? 'warn' : 'neutral');

export default function TasksPage() {
  const s = useSession();
  const qc = useQueryClient();
  const [showDone, setShowDone] = useState(false);
  const query = useQuery({ queryKey: ['tasks', s.propertyId, showDone], queryFn: () => fetchTasks(s.propertyId, showDone) });
  const [adding, setAdding] = useState(false);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['tasks'] });
    void qc.invalidateQueries({ queryKey: ['work-orders'] });
    void qc.invalidateQueries({ queryKey: ['overview'] });
    void qc.invalidateQueries({ queryKey: ['audit-feed'] });
  };
  const toggle = useMutation({
    mutationFn: (p: { task: TaskRow; done: boolean }) => setTaskDone(s.propertyId, p.task, p.done),
    onSuccess: (_r, p) => {
      refresh();
      if (p.task.source === 'verifier_findings') { toast.success('Marked as seen'); return; }
      toast.success(p.done ? 'Marked done' : 'Back on the list', {
        action: { label: p.done ? 'Undo' : 'Done again', onClick: () => toggle.mutate({ task: p.task, done: !p.done }) },
        duration: 6000,
      });
    },
    onError: (e) => toast.error(toAppError(e).message),
  });
  const manager = query.data?.manager === true;
  return (
    <div>
      <PageHeader
        title="Tasks"
        description={manager ? 'Everything that needs a person: reminders, follow-ups, work orders, cleaning issues and checks. Tap the box when it is done.' : 'What is yours to do. Tap the box when it is done.'}
        actions={manager && <Button onClick={() => setAdding(true)}>Add a reminder</Button>}
      />
      <label className="mb-3 flex w-fit items-center gap-2 text-sm">
        <Checkbox checked={showDone} onCheckedChange={(v) => setShowDone(v === true)} /> Show what was done in the last 14 days
      </label>
      <QueryState query={query}>
        {(data) => {
          const groups = groupTasks(data.tasks, data.today || todayManila());
          if (groups.length === 0) return <EmptyState title="Nothing to do" hint={manager ? 'Add a reminder, or wait for a cleaning issue or a check to land here.' : 'Nothing is waiting for you.'} action={manager ? <Button size="sm" onClick={() => setAdding(true)}>Add a reminder</Button> : undefined} />;
          return (
            <div className="space-y-6">
              {groups.map((g) => (
                <section key={g.key} className="space-y-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{g.label} ({g.tasks.length})</h2>
                  <ul className="divide-y rounded-lg border">
                    {g.tasks.map((t) => (
                      <TaskItem key={`${t.source}:${t.id}`} t={t} today={data.today} manager={manager} busy={toggle.isPending} onToggle={(done) => toggle.mutate({ task: t, done })} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          );
        }}
      </QueryState>
      {manager && <AddReminder open={adding} onOpenChange={setAdding} propertyId={s.propertyId} onDone={refresh} />}
    </div>
  );
}

function TaskItem({ t, today, manager, busy, onToggle }: { t: TaskRow; today: string; manager: boolean; busy: boolean; onToggle: (done: boolean) => void }) {
  const done = t.status === 'done';
  const due = dueState(t.due_at, today);
  const undoable = done && t.source !== 'verifier_findings';
  return (
    <li className="flex items-start gap-3 px-3 py-3">
      <Checkbox
        className="mt-1 size-5"
        aria-label={done ? `Done: ${t.title}` : `Mark done: ${t.title}`}
        checked={done}
        disabled={busy || (done && !undoable)}
        onCheckedChange={() => onToggle(!done)}
      />
      <div className="min-w-0 flex-1 text-sm">
        <p className={done ? 'font-medium text-muted-foreground line-through' : 'font-medium'}>{t.title}</p>
        {t.detail && <p className="mt-0.5 whitespace-pre-line break-words text-muted-foreground">{t.detail}</p>}
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{KIND_LABEL[t.kind]}</span>
          {t.due_at && <span className={due === 'overdue' && !done ? 'font-medium text-destructive' : undefined}>due {formatDateTime(t.due_at)}</span>}
          {t.mine ? <StatusBadge tone="info">yours</StatusBadge> : manager ? <span>{t.assignee_label ? `for ${t.assignee_label}` : 'unassigned'}</span> : null}
          {(t.priority === 'urgent' || t.priority === 'high') && !done && <StatusBadge tone={priorityTone(t.priority)}>{t.priority}</StatusBadge>}
          {t.blocks_arrival && !done && <StatusBadge tone="bad">blocks arrival</StatusBadge>}
        </p>
      </div>
      {undoable && <Button size="sm" variant="ghost" disabled={busy} onClick={() => onToggle(false)}>Undo</Button>}
    </li>
  );
}

function AddReminder({ open, onOpenChange, propertyId, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; propertyId: string; onDone: () => void }) {
  const assignees = useQuery({ queryKey: ['task-assignees', propertyId], queryFn: () => fetchAssignees(propertyId), enabled: open });
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [assignee, setAssignee] = useState(NONE);
  const [note, setNote] = useState('');
  const [key, setKey] = useState(() => newIdempotencyKey('reminder'));
  const problem = reminderProblem(title);
  const save = useMutation({
    mutationFn: () => addReminder(propertyId, { title, dueAt: dueFromLocal(due), assigneeId: assignee === NONE ? null : assignee, note }, key),
    onSuccess: () => {
      toast.success('Reminder added');
      setTitle(''); setDue(''); setAssignee(NONE); setNote(''); setKey(newIdempotencyKey('reminder'));
      onOpenChange(false);
      onDone();
    },
    onError: (e) => toast.error(toAppError(e).message),
  });
  return (
    <DetailSheet open={open} onOpenChange={onOpenChange} title="Add a reminder" description="It lands on the task list. The person you pick sees it in the staff app.">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!problem) save.mutate(); }}>
        <div><Label htmlFor="rem-title">What needs doing</Label><Input id="rem-title" required minLength={3} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className="text-base" /></div>
        <div><Label htmlFor="rem-due">Due (optional)</Label><Input id="rem-due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className="text-base" /></div>
        <div>
          <Label>For</Label>
          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Anyone / nobody yet</SelectItem>
              {(assignees.data ?? []).map((a) => <SelectItem key={a.user_id} value={a.user_id}>{a.label} ({a.role})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label htmlFor="rem-note">Note (optional)</Label><Textarea id="rem-note" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} className="text-base" /></div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={!!problem || save.isPending}>{save.isPending ? 'Saving…' : 'Add'}</Button>
        </div>
      </form>
    </DetailSheet>
  );
}
