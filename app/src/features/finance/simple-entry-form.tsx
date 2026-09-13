import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSession } from '@/auth/session';
import { formatDateTime, todayManila } from '@/lib/dates';
import { formatPHP } from '@/lib/money';
import { toAppError } from '@/lib/errors';
import { newIdempotencyKey } from '@/lib/idempotency';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchAccounts, postJournal, prepareEntry, type Prepared } from './api';

// PRD section 7 simple forms. The server prepares balanced lines; the user
// reviews them, then posts. One idempotency key per opened form so a retry
// after a network failure never posts twice.

const KINDS: Array<[string, string]> = [
  ['expense', 'Record expense'], ['supplier_bill', 'Record supplier bill'], ['pay_supplier', 'Pay supplier'], ['guest_deposit', 'Record guest deposit'],
  ['accommodation_earned', 'Recognise accommodation earned'], ['payout_match', 'Match Airbnb payout'], ['refund', 'Record refund'],
  ['owner_contribution', 'Record owner contribution'], ['owner_withdrawal', 'Record owner withdrawal'], ['transfer', 'Transfer between accounts'],
  ['asset_purchase', 'Record asset purchase'], ['cleaner_fee_accrual', 'Accrue cleaner fee'], ['cleaner_fee_payment', 'Pay cleaner fee'],
];

const FIELDS: Record<string, string[]> = {
  expense: ['expense_code', 'paid_from', 'payee'], supplier_bill: ['expense_code', 'supplier'], pay_supplier: ['paid_from'], guest_deposit: ['paid_into'],
  accommodation_earned: ['channel', 'host_fee'], payout_match: ['paid_into'], refund: ['paid_from', 'earned'], owner_contribution: ['paid_into'],
  owner_withdrawal: ['paid_from'], transfer: ['from_code', 'to_code'], asset_purchase: ['paid_from'], cleaner_fee_accrual: [], cleaner_fee_payment: ['paid_from'],
};

export function SimpleEntryForm({ initial, onDone }: { initial?: { kind?: string; amount?: string; source?: { source_table: string; source_id: string; event_kind: string }; description?: string }; onDone?: () => void }) {
  const s = useSession();
  const qc = useQueryClient();
  const accounts = useQuery({ queryKey: ['accounts', s.propertyId], queryFn: () => fetchAccounts(s.propertyId) });
  const [kind, setKind] = useState(initial?.kind ?? 'expense');
  const [f, setF] = useState<Record<string, string>>({ amount: initial?.amount ?? '', date: todayManila(), expense_code: '5900', paid_from: '1010', paid_into: '1010', from_code: '1010', to_code: '1020', channel: 'airbnb', host_fee: '', payee: '', supplier: '', evidence: '', earned: 'false' });
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [key, setKey] = useState(() => newIdempotencyKey('journal'));
  const cash = (accounts.data?.rows ?? []).filter((a) => a.is_cash);
  const expenses = (accounts.data?.rows ?? []).filter((a) => a.class === 'expense');
  const wants = (field: string) => FIELDS[kind]?.includes(field) ?? false;

  const prepare = useMutation({
    mutationFn: () => prepareEntry(s.propertyId, kind, { ...f, earned: f.earned === 'true', ...(initial?.source ? { source_table: initial.source.source_table, source_id: initial.source.source_id, event_kind: initial.source.event_kind } : {}) }),
    onSuccess: setPrepared,
    onError: (e) => toast.error(toAppError(e).message),
  });
  const post = useMutation({
    mutationFn: () => postJournal(s.propertyId, { entryDate: f.date ?? todayManila(), description: initial?.description ?? prepared!.description, lines: prepared!.lines, source: prepared!.source, evidenceRef: f.evidence || null, channel: prepared!.channel }, key),
    onSuccess: (r) => {
      toast.success(r.replayed ? 'Already posted (replay)' : `Posted journal #${r.journalNo}`, { description: formatDateTime(new Date().toISOString()) });
      setPrepared(null);
      setKey(newIdempotencyKey('journal'));
      setF({ ...f, amount: '' });
      void qc.invalidateQueries({ queryKey: ['journals'] });
      void qc.invalidateQueries({ queryKey: ['statement'] });
      void qc.invalidateQueries({ queryKey: ['acct-setup'] });
      onDone?.();
    },
    onError: (e) => {
      const err = toAppError(e);
      toast.error(err.kind === 'conflict' ? 'This event is already posted or the key was reused with different data.' : err.message);
    },
  });
  const set = (k: string, v: string) => {
    setF({ ...f, [k]: v });
    setPrepared(null);
  };
  const cashSelect = (field: string, label: string) => (
    <div><Label>{label}</Label><Select value={f[field]} onValueChange={(v) => set(field, v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{cash.map((a) => <SelectItem key={a.code} value={a.code}>{a.code} {a.name}</SelectItem>)}{field === 'paid_from' && kind === 'expense' && <SelectItem value="2000">2000 Supplier payables (unpaid)</SelectItem>}</SelectContent></Select></div>
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>Action</Label><Select value={kind} onValueChange={(v) => { setKind(v); setPrepared(null); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{KINDS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
        <div><Label htmlFor="se-amount">Amount (PHP)</Label><Input id="se-amount" inputMode="decimal" required value={f.amount} onChange={(e) => set('amount', e.target.value)} className="text-base" /></div>
        <div><Label htmlFor="se-date">Date</Label><Input id="se-date" type="date" value={f.date} onChange={(e) => set('date', e.target.value)} className="text-base" /></div>
        {wants('expense_code') && <div><Label>Expense category</Label><Select value={f.expense_code} onValueChange={(v) => set('expense_code', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{expenses.map((a) => <SelectItem key={a.code} value={a.code}>{a.code} {a.name}</SelectItem>)}</SelectContent></Select></div>}
        {wants('paid_from') && cashSelect('paid_from', 'Paid from')}
        {wants('paid_into') && cashSelect('paid_into', 'Paid into')}
        {wants('from_code') && cashSelect('from_code', 'From')}
        {wants('to_code') && cashSelect('to_code', 'To')}
        {wants('payee') && <div><Label htmlFor="se-payee">Payee</Label><Input id="se-payee" value={f.payee} onChange={(e) => set('payee', e.target.value)} className="text-base" /></div>}
        {wants('supplier') && <div><Label htmlFor="se-sup">Supplier</Label><Input id="se-sup" value={f.supplier} onChange={(e) => set('supplier', e.target.value)} className="text-base" /></div>}
        {wants('channel') && <div><Label>Channel</Label><Select value={f.channel} onValueChange={(v) => set('channel', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="airbnb">Airbnb</SelectItem><SelectItem value="direct">Direct</SelectItem></SelectContent></Select></div>}
        {wants('host_fee') && f.channel === 'airbnb' && <div><Label htmlFor="se-fee">Host service fee</Label><Input id="se-fee" inputMode="decimal" value={f.host_fee} onChange={(e) => set('host_fee', e.target.value)} className="text-base" /></div>}
        {wants('earned') && <div><Label>Refund of</Label><Select value={f.earned} onValueChange={(v) => set('earned', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="false">Unearned advance</SelectItem><SelectItem value="true">Earned charge</SelectItem></SelectContent></Select></div>}
        <div><Label htmlFor="se-ev">Evidence reference</Label><Input id="se-ev" placeholder="Receipt no., bank ref, e-mail id" value={f.evidence} onChange={(e) => set('evidence', e.target.value)} className="text-base" /></div>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" disabled={!f.amount || prepare.isPending} onClick={() => prepare.mutate()}>Prepare entry</Button>
        <Button type="button" disabled={!prepared || !prepared.balanced || post.isPending} onClick={() => post.mutate()}>{post.isPending ? 'Posting…' : 'Review and post'}</Button>
      </div>
      {prepared && (
        <div className="rounded-lg border p-3 text-sm">
          <p className="font-medium">{initial?.description ?? prepared.description}</p>
          <table className="mt-2 w-full text-xs"><thead><tr className="text-left text-muted-foreground"><th>Account</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th>Memo</th></tr></thead>
            <tbody>{prepared.lines.map((l, i) => <tr key={i}><td className="tabular">{l.account_code} {accounts.data?.rows.find((a) => a.code === l.account_code)?.name ?? ''}</td><td className="tabular text-right">{Number(l.debit) ? formatPHP(l.debit) : ''}</td><td className="tabular text-right">{Number(l.credit) ? formatPHP(l.credit) : ''}</td><td className="text-muted-foreground">{l.memo}</td></tr>)}</tbody></table>
          <p className="mt-2 text-xs text-muted-foreground">{prepared.balanced ? 'Balanced.' : 'Not balanced; cannot post.'} {prepared.source ? `Source: ${prepared.source.source_table}/${prepared.source.source_id} (${prepared.source.event_kind}) posts once.` : 'No source link: this is a manual entry.'}</p>
          {prepared.warnings.map((w) => <p key={w} className="mt-1 text-xs text-destructive">{w}</p>)}
        </div>
      )}
    </div>
  );
}
