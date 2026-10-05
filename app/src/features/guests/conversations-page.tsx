import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { formatDateTime } from '@/lib/dates';
import { toAppError } from '@/lib/errors';
import { PageHeader } from '@/components/data/page-header';
import { EmptyState, ListSkeleton, QueryState } from '@/components/data/query-state';
import { StatusBadge } from '@/components/data/status-badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { fetchConversations, fetchThread, sendHostReply, type ConversationRow, type ThreadDetail } from './conversations-api';
import { buildTimeline, newestOpenHandoff, replyWindow, speakerOf, turnRisk, windowLabel, type Speaker } from './conversations-window';

// SPEC-42 section 7 (H4): every Cassy thread and its handoffs in one place, and a reply box. Owner/admin only (route guard plus the
// RPCs and the host-reply function each refuse anyone else). Nothing is sent until the Send button is pressed.

const BUBBLE: Record<Speaker, { label: string; side: string; tone: string }> = {
  guest: { label: 'Guest', side: 'mr-auto', tone: 'bg-muted' },
  cassy: { label: 'Cassy', side: 'ml-auto', tone: 'border bg-background' },
  host: { label: 'Host', side: 'ml-auto', tone: 'border-chart-4/40 bg-chart-4/10' },
};

export default function ConversationsPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['conversations'], queryFn: () => fetchConversations(30) });
  const psid = selected ?? list.data?.[0]?.psid ?? null;
  return (
    <div>
      <PageHeader title="Conversations" description="Every Cassy thread in one place. Open handoffs are first. Replies go out only when you press Send." />
      <QueryState query={list}>
        {(rows) => rows.length === 0 ? <EmptyState title="No Messenger conversations yet" hint="A thread appears here after a guest messages the Page." /> : (
          <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
            <ul className="max-h-[70vh] divide-y overflow-auto rounded-lg border text-sm" aria-label="Conversations">
              {rows.map((r) => <ThreadRow key={r.psid} row={r} active={r.psid === psid} onPick={() => setSelected(r.psid)} />)}
            </ul>
            {psid && <ThreadView key={psid} psid={psid} />}
          </div>
        )}
      </QueryState>
    </div>
  );
}

function ThreadRow({ row, active, onPick }: { row: ConversationRow; active: boolean; onPick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onPick} aria-current={active ? 'true' : undefined} className={cn('block w-full px-3 py-2 text-left hover:bg-muted/50', active && 'bg-muted')}>
        <span className="flex items-center gap-2">
          <span className="truncate font-medium">{row.guest_name ?? `Guest ${row.psid_short}`}</span>
          {row.open_handoffs > 0 && <StatusBadge tone="warn">{row.open_handoffs} open</StatusBadge>}
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">{formatDateTime(row.updated_at)}</span>
        </span>
        {row.last_text && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{row.last_role === 'guest' ? '' : 'Cassy: '}{row.last_text}</span>}
      </button>
    </li>
  );
}

function ThreadView({ psid }: { psid: string }) {
  const thread = useQuery({ queryKey: ['conversation', psid], queryFn: () => fetchThread(psid) });
  if (thread.isLoading) return <ListSkeleton rows={4} />;
  if (thread.isError || !thread.data) return <EmptyState title={thread.isError ? 'Could not load this conversation' : 'This conversation no longer exists'} hint={thread.isError ? toAppError(thread.error).message : undefined} action={thread.isError ? <Button variant="outline" onClick={() => void thread.refetch()}>Try again</Button> : undefined} />;
  return <Thread t={thread.data} />;
}

function Thread({ t }: { t: ThreadDetail }) {
  const items = buildTimeline(t.history, t.handoffs);
  return (
    <section className="space-y-3" aria-label="Conversation">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">{t.guest_name ?? `Guest ${t.psid_short}`}</h2>
        <span className="text-xs text-muted-foreground">Messenger {t.psid_short}</span>
        {t.human_until && Date.parse(t.human_until) > Date.now() && <StatusBadge tone="info">Cassy paused until {formatDateTime(t.human_until)}</StatusBadge>}
      </div>
      <div className="flex max-h-[55vh] flex-col gap-2 overflow-auto rounded-lg border p-3">
        {items.length === 0 && <p className="text-sm text-muted-foreground">No messages stored for this guest.</p>}
        {items.map((it) => it.kind === 'turn' ? <Bubble key={it.key} turn={it.turn} /> : (
          <div key={it.key} className="rounded-md border border-champagne/50 bg-cream px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={it.handoff.status === 'open' ? 'warn' : it.handoff.status === 'sent' ? 'good' : 'neutral'}>Handoff {it.handoff.status}</StatusBadge>
              {it.handoff.risk && <span className="text-muted-foreground">risk {it.handoff.risk}</span>}
              <span className="ml-auto text-muted-foreground">{formatDateTime(it.handoff.created_at)}</span>
            </div>
            {it.handoff.status === 'sent' && it.handoff.resolved_by && <p className="mt-1 text-muted-foreground">Answered by {it.handoff.resolved_by}{it.handoff.resolved_at ? `, ${formatDateTime(it.handoff.resolved_at)}` : ''}.</p>}
          </div>
        ))}
      </div>
      <ReplyBox t={t} />
    </section>
  );
}

function Bubble({ turn }: { turn: ThreadDetail['history'][number] }) {
  const who = speakerOf(turn);
  const b = BUBBLE[who];
  const risk = turnRisk(turn);
  return (
    <div className={cn('max-w-[85%] rounded-lg px-3 py-2 text-sm', b.side, b.tone)}>
      <div className="mb-0.5 flex items-center gap-2 text-xs text-muted-foreground">
        <span>{b.label}</span><span>{formatDateTime(turn.at)}</span>
        {risk && <StatusBadge tone="warn">{risk}</StatusBadge>}
      </div>
      <p className="whitespace-pre-wrap break-words">{turn.text}</p>
    </div>
  );
}

function ReplyBox({ t }: { t: ThreadDetail }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const win = replyWindow(t.history, new Date());
  const open = newestOpenHandoff(t.handoffs);
  const [markHandoff, setMarkHandoff] = useState(true);
  const send = useMutation({
    mutationFn: () => sendHostReply({ psid: t.psid, text: text.trim(), handoffId: open && markHandoff ? open.id : null }),
    onSuccess: (r) => {
      toast.success(r.recorded ? 'Reply sent' : 'Reply sent, but it could not be saved to the thread history');
      setText('');
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      void qc.invalidateQueries({ queryKey: ['conversation', t.psid] });
      void qc.invalidateQueries({ queryKey: ['handoffs'] });
    },
    onError: (e) => toast.error(toAppError(e).message),
  });
  if (!win.open) {
    return <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground" role="status">{win.lastGuestAt ? `The 7-day reply window closed ${formatDateTime(win.closesAt)}.` : 'This guest has no message on record.'} Reply from the Page inbox in Messenger.</p>;
  }
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (text.trim() && !send.isPending) send.mutate(); }}>
      <Label htmlFor="host-reply-text">Reply to {t.guest_name ?? 'guest'} <span className="font-normal text-muted-foreground">· window {windowLabel(win.msLeft)}</span></Label>
      <Textarea id="host-reply-text" value={text} onChange={(e) => setText(e.target.value)} maxLength={1900} rows={3} placeholder="Write the reply. It is signed with your first name." className="text-base" />
      {open && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={markHandoff} onChange={(e) => setMarkHandoff(e.target.checked)} />
          This answers the open handoff ({formatDateTime(open.created_at)})
        </label>
      )}
      <div className="flex justify-end"><Button type="submit" disabled={!text.trim() || send.isPending}>{send.isPending ? 'Sending…' : 'Send reply'}</Button></div>
    </form>
  );
}
