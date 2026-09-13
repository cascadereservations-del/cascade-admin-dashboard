import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSession } from '@/auth/session';
import { formatDate, formatDateTime } from '@/lib/dates';
import { addDecimal, formatPHP } from '@/lib/money';
import { toAppError } from '@/lib/errors';
import { PageHeader, Section } from '@/components/data/page-header';
import { QueryState } from '@/components/data/query-state';
import { StatusBadge } from '@/components/data/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { approveOpening, closePeriod, fetchAccountingSetup, fetchAccounts, postConsumableUsage, reopenPeriod, runDepreciation, saveOpeningBatch, seedChart, type OpeningBatch } from './api';

// ACC06/ACC08: opening balances are business inputs entered by Finance with
// supporting references; approval refuses any difference. Monthly close runs
// the checklist and stores an immutable snapshot; reopening needs the owner.

const CHECKLIST: Array<[string, string]> = [
  ['ingestion_verified', 'Ingestion and source coverage verified'],
  ['cash_and_settlements_reconciled', 'Cash and channel settlements reconciled'],
  ['duplicates_and_classifications_resolved', 'Duplicates and missing classifications resolved'],
  ['obligations_deposits_refunds_reviewed', 'Unpaid obligations, deposits and refunds reviewed'],
  ['stock_and_depreciation_reviewed', 'Stock valuation and depreciation reviewed'],
  ['statement_identities_verified', 'Statement identities verified'],
];

function nextMonth(d: string): string {
  const y = Number(d.slice(0, 4));
  const m = Number(d.slice(5, 7));
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

const sum = (lines: OpeningBatch['lines'], side: 'debit' | 'credit') => addDecimal(...lines.map((l) => l[side]));

export default function AccountingSetupPage() {
  const s = useSession();
  const qc = useQueryClient();
  const canPost = s.caps.can('approve_payment');
  const setup = useQuery({ queryKey: ['acct-setup', s.propertyId], queryFn: () => fetchAccountingSetup(s.propertyId) });
  const accounts = useQuery({ queryKey: ['accounts', s.propertyId], queryFn: () => fetchAccounts(s.propertyId) });
  const [draft, setDraft] = useState<OpeningBatch | null>(null);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [closeMonth, setCloseMonth] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['acct-setup'] });
    void qc.invalidateQueries({ queryKey: ['accounts'] });
    void qc.invalidateQueries({ queryKey: ['journals'] });
    void qc.invalidateQueries({ queryKey: ['statement'] });
  };
  const err = (e: unknown) => toast.error(toAppError(e).message);

  const seed = useMutation({ mutationFn: () => seedChart(s.propertyId), onSuccess: (r) => { toast.success(`Chart of accounts ready (${r.inserted} added)`); refresh(); }, onError: err });
  const save = useMutation({
    mutationFn: () => saveOpeningBatch(s.propertyId, { id: draft!.id || undefined, expected_version: draft!.id ? draft!.version : undefined, accounting_start: draft!.accounting_start, lines: draft!.lines.filter((l) => l.account_code), reference_notes: draft!.reference_notes }),
    onSuccess: (r) => { toast.success(`Draft saved · difference ${formatPHP(r.difference)}`); setDraft(null); refresh(); },
    onError: err,
  });
  const approve = useMutation({ mutationFn: (id: string) => approveOpening(id, 'Approved in admin'), onSuccess: () => { toast.success('Opening balances approved and posted'); refresh(); }, onError: err });
  const close = useMutation({ mutationFn: () => closePeriod(s.propertyId, closeMonth + '-01', checks), onSuccess: (r) => { toast.success(`Period closed · snapshot v${r.version}`); setChecks({}); refresh(); }, onError: err });
  const reopen = useMutation({ mutationFn: (p: string) => reopenPeriod(s.propertyId, p, reopenReason), onSuccess: () => { toast.success('Period reopened'); refresh(); }, onError: err });
  const dep = useMutation({ mutationFn: () => runDepreciation(s.propertyId, closeMonth + '-01'), onSuccess: (r) => toast.success(`Depreciation: ${r.posted.length} posted, ${r.skipped.length} skipped`, { description: r.skipped.map((x) => `${x.name}: ${x.reason}`).join('; ') }), onError: err });
  const cons = useMutation({ mutationFn: () => postConsumableUsage(s.propertyId, closeMonth + '-01', nextMonth(closeMonth + '-01')), onSuccess: (r) => toast.success(`Consumables ${r.posted === false ? 'nothing to post' : formatPHP(r.amount)}`, { description: r.unvalued.map((x) => `${x.name}: ${x.reason}`).join('; ') || undefined }), onError: err });

  const updateLine = (i: number, patch: Partial<OpeningBatch['lines'][number]>) => draft && setDraft({ ...draft, lines: draft.lines.map((x, j) => (j === i ? { ...x, ...patch } : x)) });

  return (
    <div>
      <PageHeader title="Accounting setup" description="Opening balances, periods and monthly close. Balances are your inputs with references; the system never invents a balancing figure." />
      <QueryState query={setup}>
        {(d) => (
          <div className="space-y-6">
            <Section title="Chart of accounts">
              <p className="text-sm">{accounts.data?.rows.length ? `${accounts.data.rows.length} accounts.` : 'No accounts yet.'} {canPost && <Button size="sm" variant="outline" onClick={() => seed.mutate()} disabled={seed.isPending}>Seed compact chart</Button>}</p>
            </Section>
            <Section title="Opening balances">
              <p className="text-sm">Accounting start: <strong>{d.settings?.accounting_start ? formatDate(d.settings.accounting_start, 'long') : 'not set'}</strong>{d.settings?.opening_batch_id ? <> · <StatusBadge tone="good">approved</StatusBadge></> : null}</p>
              {d.batches.map((b) => (
                <div key={b.id} className="mt-2 rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><span>Batch for {formatDate(b.accounting_start, 'long')}</span><StatusBadge tone={b.status === 'approved' ? 'good' : 'warn'}>{b.status}</StatusBadge><span className="text-muted-foreground">v{b.version} · debits {formatPHP(sum(b.lines, 'debit'))} · credits {formatPHP(sum(b.lines, 'credit'))}</span>
                    {canPost && b.status === 'draft' && <><Button size="sm" variant="outline" onClick={() => setDraft(b)}>Edit</Button><Button size="sm" onClick={() => approve.mutate(b.id)} disabled={approve.isPending}>Approve</Button></>}</div>
                  {b.reference_notes && <p className="text-xs text-muted-foreground">Refs: {b.reference_notes}</p>}
                </div>
              ))}
              {canPost && !d.settings?.opening_batch_id && !draft && <Button className="mt-2" size="sm" onClick={() => setDraft({ id: '', accounting_start: '', status: 'draft', lines: [{ account_code: '1010', debit: '', credit: '' }, { account_code: '3000', debit: '', credit: '' }], reference_notes: '', version: 1, review_note: null, journal_id: null })}>New opening balance batch</Button>}
              {draft && (
                <form className="mt-3 space-y-3 rounded-lg border p-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
                  <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="ob-start">Accounting start (first of month)</Label><Input id="ob-start" type="date" required value={draft.accounting_start} onChange={(e) => setDraft({ ...draft, accounting_start: e.target.value })} className="text-base" /></div><div><Label htmlFor="ob-refs">Supporting references (required)</Label><Textarea id="ob-refs" required rows={1} value={draft.reference_notes ?? ''} onChange={(e) => setDraft({ ...draft, reference_notes: e.target.value })} className="text-base" /></div></div>
                  <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th>Account</th><th>Debit</th><th>Credit</th><th>Memo</th></tr></thead><tbody>
                    {draft.lines.map((l, i) => <tr key={i}><td><select aria-label="Account" className="h-9 w-full rounded-md border bg-transparent px-2 text-base sm:text-sm" value={l.account_code} onChange={(e) => updateLine(i, { account_code: e.target.value })}><option value="">—</option>{accounts.data?.rows.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}</select></td><td><Input inputMode="decimal" aria-label="Debit" className="w-32 text-base sm:text-sm" value={l.debit} onChange={(e) => updateLine(i, { debit: e.target.value })} /></td><td><Input inputMode="decimal" aria-label="Credit" className="w-32 text-base sm:text-sm" value={l.credit} onChange={(e) => updateLine(i, { credit: e.target.value })} /></td><td><Input aria-label="Memo" className="text-base sm:text-sm" value={l.memo ?? ''} onChange={(e) => updateLine(i, { memo: e.target.value })} /></td></tr>)}
                  </tbody></table>
                  <p className="tabular text-sm">Debits {formatPHP(sum(draft.lines, 'debit'))} · Credits {formatPHP(sum(draft.lines, 'credit'))} · Difference <strong>{formatPHP(addDecimal(sum(draft.lines, 'debit'), `-${sum(draft.lines, 'credit')}`))}</strong> (must be zero to approve)</p>
                  <div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setDraft({ ...draft, lines: [...draft.lines, { account_code: '', debit: '', credit: '' }] })}>Add line</Button><Button type="submit" size="sm" disabled={save.isPending}>Save draft</Button><Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button></div>
                </form>
              )}
            </Section>
            <Section title="Periods and monthly close">
              {d.periods.length === 0 ? <p className="text-sm text-muted-foreground">No periods until opening balances are approved.</p> : (
                <ul className="mb-3 divide-y rounded-lg border text-sm">{d.periods.map((p) => <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5"><span className="tabular">{p.period_start.slice(0, 7)}</span><StatusBadge tone={p.status === 'closed' ? 'good' : 'warn'}>{p.status}</StatusBadge>{p.closed_at && <span className="text-xs text-muted-foreground">closed {formatDateTime(p.closed_at)}</span>}{p.reopen_reason && <span className="text-xs text-muted-foreground">reopened: {p.reopen_reason}</span>}{p.status === 'closed' && s.caps.role === 'owner' && <form className="ml-auto flex gap-1" onSubmit={(e) => { e.preventDefault(); reopen.mutate(p.period_start); }}><Input required minLength={5} placeholder="Reason to reopen" className="h-8 w-48 text-sm" value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} /><Button size="sm" variant="outline" type="submit">Reopen</Button></form>}</li>)}</ul>
              )}
              {canPost && (
                <div className="space-y-2 rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-end gap-2"><div><Label htmlFor="close-month">Month</Label><Input id="close-month" type="month" value={closeMonth} onChange={(e) => setCloseMonth(e.target.value)} className="text-base" /></div><Button size="sm" variant="outline" disabled={!closeMonth || dep.isPending} onClick={() => dep.mutate()}>Run depreciation</Button><Button size="sm" variant="outline" disabled={!closeMonth || cons.isPending} onClick={() => cons.mutate()}>Post consumable usage</Button></div>
                  <ul className="space-y-1">{CHECKLIST.map(([k, l]) => <li key={k}><label className="flex items-center gap-2"><Checkbox checked={!!checks[k]} onCheckedChange={(v) => setChecks({ ...checks, [k]: v === true })} /> {l}</label></li>)}</ul>
                  <Button size="sm" disabled={!closeMonth || CHECKLIST.some(([k]) => !checks[k]) || close.isPending} onClick={() => close.mutate()}>Close {closeMonth || 'month'}</Button>
                </div>
              )}
              {d.snapshots.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Close snapshots: {d.snapshots.map((x) => `${x.period_start.slice(0, 7)} v${x.version}`).join(', ')}. Open any statement with a snapshot id to view the frozen version.</p>}
            </Section>
          </div>
        )}
      </QueryState>
    </div>
  );
}
