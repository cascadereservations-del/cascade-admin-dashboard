import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSession } from '@/auth/session';
import { useUrlState } from '@/lib/url-state';
import { formatDate, formatDateTime } from '@/lib/dates';
import { formatPHP } from '@/lib/money';
import { toAppError } from '@/lib/errors';
import { PageHeader, Section } from '@/components/data/page-header';
import { EmptyState, QueryState } from '@/components/data/query-state';
import { StatusBadge } from '@/components/data/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SimpleEntryForm } from './simple-entry-form';
import { fetchJournals, reverseJournal } from './api';

// ACC01-ACC03 UI: simple forms post balanced journals; posted journals are
// immutable and corrected with a linked reversal that needs a reason.

export default function JournalsPage() {
  const s = useSession();
  const qc = useQueryClient();
  const { state, set } = useUrlState({ from: '', to: '' });
  const canPost = s.caps.can('approve_payment');
  const journals = useQuery({ queryKey: ['journals', s.propertyId, state.from, state.to], queryFn: () => fetchJournals(s.propertyId, state.from || undefined, state.to || undefined) });
  const [reversing, setReversing] = useState<{ id: string; reason: string } | null>(null);
  const reverse = useMutation({
    mutationFn: () => reverseJournal(reversing!.id, reversing!.reason),
    onSuccess: (r) => {
      toast.success(`Reversal posted as #${r.journalNo}`);
      setReversing(null);
      void qc.invalidateQueries({ queryKey: ['journals'] });
      void qc.invalidateQueries({ queryKey: ['statement'] });
    },
    onError: (e) => toast.error(toAppError(e).message),
  });
  return (
    <div>
      <PageHeader title="Journals" description="Plain-language entries prepared by the server as balanced journals. Posted journals never change; corrections are linked reversals." />
      <div className="space-y-6">
        {canPost ? <Section title="Record"><SimpleEntryForm /></Section> : <p className="text-sm text-muted-foreground">Posting needs the finance approval right with a two-factor session. You can review journals below.</p>}
        <Section title="Posted journals" aside={<div className="flex gap-2"><Input type="date" aria-label="From" className="h-8 w-36 text-sm" value={state.from} onChange={(e) => set({ from: e.target.value })} /><Input type="date" aria-label="To (exclusive)" className="h-8 w-36 text-sm" value={state.to} onChange={(e) => set({ to: e.target.value })} /></div>}>
          <QueryState query={journals}>
            {(d) => d.rows.length === 0 ? <EmptyState title="No journals posted" hint="Accounting starts from approved opening balances (Finance › Accounting setup)." /> : (
              <ul className="space-y-2">
                {d.rows.map((j) => (
                  <li key={j.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tabular font-medium">#{j.journal_no}</span><span className="tabular text-muted-foreground">{formatDate(j.entry_date, 'long')}</span><span className="min-w-0 flex-1">{j.description}</span>
                      <StatusBadge tone={j.status === 'reversed' ? 'neutral' : j.reversal_of ? 'info' : 'good'}>{j.reversal_of ? 'reversal' : j.status}</StatusBadge>
                      {canPost && j.status === 'posted' && !j.reversal_of && <Button size="sm" variant="outline" onClick={() => setReversing({ id: j.id, reason: '' })}>Reverse</Button>}
                    </div>
                    <table className="mt-2 w-full text-xs"><tbody>{[...j.lines].sort((a, b) => a.line_no - b.line_no).map((l) => <tr key={l.line_no}><td className="tabular w-16">{l.account.code}</td><td>{l.account.name}</td><td className="tabular w-28 text-right">{Number(l.debit) ? formatPHP(l.debit) : ''}</td><td className="tabular w-28 text-right">{Number(l.credit) ? formatPHP(l.credit) : ''}</td><td className="text-muted-foreground">{l.memo}</td></tr>)}</tbody></table>
                    <p className="mt-1 text-xs text-muted-foreground">Posted {formatDateTime(j.posted_at)}{j.source_table ? ` · source ${j.source_table}/${j.source_id} (${j.event_kind})` : ''}{j.evidence_ref ? ` · evidence ${j.evidence_ref}` : ''}{j.reversal_reason ? ` · reason: ${j.reversal_reason}` : ''}</p>
                    {reversing?.id === j.id && (
                      <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); reverse.mutate(); }}>
                        <Input required minLength={3} placeholder="Reason for reversal" className="min-w-60 flex-1 text-base sm:text-sm" value={reversing.reason} onChange={(e) => setReversing({ ...reversing, reason: e.target.value })} />
                        <Button type="submit" variant="destructive" size="sm" disabled={reverse.isPending}>Post reversal</Button><Button type="button" size="sm" variant="ghost" onClick={() => setReversing(null)}>Cancel</Button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </Section>
      </div>
    </div>
  );
}
