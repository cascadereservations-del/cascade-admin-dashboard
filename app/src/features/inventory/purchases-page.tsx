import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSession } from '@/auth/session';
import { formatDate, formatDateTime, todayManila } from '@/lib/dates';
import { formatNumber, formatPHP } from '@/lib/money';
import { toAppError } from '@/lib/errors';
import { newIdempotencyKey } from '@/lib/idempotency';
import { useUndoToast } from '@/lib/undo';
import { latestAuditId } from '@/features/operations/api';
import { PageHeader, Section } from '@/components/data/page-header';
import { EmptyState, QueryState } from '@/components/data/query-state';
import { StatusBadge, type Tone } from '@/components/data/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchCatalogue, fetchPurchases, fetchShoppingList, recordReceipt, saveShoppingItem } from './api';

// INV04: proposed shopping list → approval → receipt (stock movement) →
// financial treatment (separately, in Finance). Three distinct actions.

const tone = (st: string): Tone => (st === 'received' ? 'good' : st === 'approved' ? 'info' : st === 'rejected' || st === 'cancelled' ? 'neutral' : 'warn');

export default function PurchasesPage() {
  const s = useSession();
  const qc = useQueryClient();
  const canApprove = s.caps.can('manage_inventory');
  const canFinance = s.caps.can('read_finance');
  const list = useQuery({ queryKey: ['shopping', s.propertyId], queryFn: () => fetchShoppingList(s.propertyId) });
  const purchases = useQuery({ queryKey: ['purchases', s.propertyId], queryFn: () => fetchPurchases(s.propertyId) });
  const catalogue = useQuery({ queryKey: ['catalogue', s.propertyId], queryFn: () => fetchCatalogue(s.propertyId) });
  const [proposal, setProposal] = useState({ item_id: '', item_name: '', quantity: '', reason: '' });
  const [receive, setReceive] = useState<{ id: string; item_id: string; packs: string; cost: string; supplier: string } | null>(null);
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['shopping'] });
    void qc.invalidateQueries({ queryKey: ['purchases'] });
    void qc.invalidateQueries({ queryKey: ['catalogue'] });
  };

  const undoToast = useUndoToast();
  const propose = useMutation({
    mutationFn: async () => {
      const r = await saveShoppingItem(s.propertyId, { item_id: proposal.item_id || null, item_name: proposal.item_name || catalogue.data?.items.find((i) => i.id === proposal.item_id)?.name, quantity: proposal.quantity, reason: proposal.reason });
      return { ...r, auditId: await latestAuditId('inventory_shopping_list', r.id) };
    },
    onSuccess: (r) => { undoToast('Added to the shopping list', r.auditId); setProposal({ item_id: '', item_name: '', quantity: '', reason: '' }); invalidate(); },
    onError: (e) => toast.error(toAppError(e).message),
  });
  const decide = useMutation({
    mutationFn: async (p: { id: string; status: 'approved' | 'rejected' | 'cancelled' }) => {
      const r = await saveShoppingItem(s.propertyId, { id: p.id, status: p.status }, newIdempotencyKey('shopdec'));
      return { ...r, auditId: await latestAuditId('inventory_shopping_list', r.id) };
    },
    onSuccess: (r) => { undoToast(`Shopping item ${r.status}`, r.auditId); invalidate(); },
    onError: (e) => toast.error(toAppError(e).message),
  });
  const doReceive = useMutation({
    mutationFn: () => recordReceipt(receive!.item_id, receive!.packs, receive!.cost || null, receive!.supplier || null, todayManila(), receive!.id),
    onSuccess: (r) => { toast.success(`Received ${r.unitsAdded} units`, { description: `Stock updated ${formatDateTime(new Date().toISOString())}. Record the expense in Finance separately.` }); setReceive(null); invalidate(); },
    onError: (e) => toast.error(toAppError(e).message),
  });

  return (
    <div>
      <PageHeader title="Purchases" description="Shopping list with approval and receipt. Receiving goods, approving spend and paying a supplier are separate steps." />
      <div className="space-y-6">
        <Section title="Propose an item">
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); propose.mutate(); }}>
            <div className="min-w-56"><Label>Catalogue item</Label>
              <Select value={proposal.item_id || 'custom'} onValueChange={(v) => setProposal({ ...proposal, item_id: v === 'custom' ? '' : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="custom">Not in catalogue</SelectItem>{(catalogue.data?.items ?? []).filter((i) => i.active).map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {!proposal.item_id && <div><Label htmlFor="p-name">Item name</Label><Input id="p-name" required value={proposal.item_name} onChange={(e) => setProposal({ ...proposal, item_name: e.target.value })} className="text-base" /></div>}
            <div><Label htmlFor="p-qty">Quantity</Label><Input id="p-qty" inputMode="decimal" required className="w-28 text-base" value={proposal.quantity} onChange={(e) => setProposal({ ...proposal, quantity: e.target.value })} /></div>
            <div className="min-w-56 flex-1"><Label htmlFor="p-reason">Reason</Label><Input id="p-reason" value={proposal.reason} onChange={(e) => setProposal({ ...proposal, reason: e.target.value })} className="text-base" /></div>
            <Button type="submit" disabled={propose.isPending || !proposal.quantity}>Add</Button>
          </form>
        </Section>
        <Section title="Shopping list">
          <QueryState query={list}>
            {(d) => d.rows.length === 0 ? <EmptyState title="Nothing proposed" /> : (
              <ul className="divide-y rounded-lg border text-sm">
                {d.rows.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1"><span className="font-medium">{r.item_name}</span> · {formatNumber(r.quantity, 2)} {r.purchase_unit ?? ''}<div className="text-xs text-muted-foreground">{r.reason ?? 'no reason'} · proposed {formatDateTime(r.proposed_at)}{r.approved_at ? ` · decided ${formatDateTime(r.approved_at)}` : ''}{r.received_at ? ` · received ${formatNumber(r.received_quantity, 2)} on ${formatDate(r.received_at.slice(0, 10))}` : ''}</div></div>
                    <StatusBadge tone={tone(r.status)}>{r.status}</StatusBadge>
                    {canApprove && r.status === 'proposed' && <><Button size="sm" onClick={() => decide.mutate({ id: r.id, status: 'approved' })}>Approve</Button><Button size="sm" variant="outline" onClick={() => decide.mutate({ id: r.id, status: 'rejected' })}>Reject</Button></>}
                    {canApprove && (r.status === 'proposed' || r.status === 'approved') && <Button size="sm" variant="ghost" onClick={() => decide.mutate({ id: r.id, status: 'cancelled' })}>Cancel</Button>}
                    {canApprove && r.status === 'approved' && r.item_id && <Button size="sm" variant="outline" onClick={() => setReceive({ id: r.id, item_id: r.item_id!, packs: r.quantity, cost: '', supplier: '' })}>Receive</Button>}
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
          {receive && (
            <form className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border p-3" onSubmit={(e) => { e.preventDefault(); doReceive.mutate(); }}>
              <div><Label htmlFor="rc-packs">Packs received</Label><Input id="rc-packs" inputMode="decimal" required className="w-28 text-base" value={receive.packs} onChange={(e) => setReceive({ ...receive, packs: e.target.value })} /></div>
              <div><Label htmlFor="rc-cost">Cost per pack</Label><Input id="rc-cost" inputMode="decimal" className="w-32 text-base" value={receive.cost} onChange={(e) => setReceive({ ...receive, cost: e.target.value })} /></div>
              <div><Label htmlFor="rc-sup">Supplier</Label><Input id="rc-sup" value={receive.supplier} onChange={(e) => setReceive({ ...receive, supplier: e.target.value })} className="text-base" /></div>
              <Button type="submit" disabled={doReceive.isPending}>Record receipt</Button><Button type="button" variant="ghost" onClick={() => setReceive(null)}>Cancel</Button>
            </form>
          )}
        </Section>
        <Section title="Recorded purchases">
          <QueryState query={purchases}>
            {(d) => d.rows.length === 0 ? <EmptyState title="No purchases recorded" /> : (
              <ul className="divide-y rounded-lg border text-sm">
                {d.rows.map((p) => <li key={p.id} className="flex flex-wrap gap-2 px-3 py-2"><span className="tabular w-24">{formatDate(p.purchased_at, 'long')}</span><span className="min-w-0 flex-1">{d.names.get(p.item_id ?? '') ?? 'unknown item'} · {formatNumber(p.qty, 2)} units{p.supplier ? ` · ${p.supplier}` : ''}</span>{canFinance && <span className="tabular">{formatPHP(p.total_cost)}</span>}</li>)}
              </ul>
            )}
          </QueryState>
        </Section>
      </div>
    </div>
  );
}
