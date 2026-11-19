import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSession } from '@/auth/session';
import { formatNumber } from '@/lib/money';
import { toAppError } from '@/lib/errors';
import { newIdempotencyKey } from '@/lib/idempotency';
import { PageHeader } from '@/components/data/page-header';
import { QueryState } from '@/components/data/query-state';
import { StatusBadge } from '@/components/data/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fetchCatalogue, reconcileBaseline } from './api';
import { staysLearning } from './usage';
import { canMoveAny, MoveStockSheet } from './move-stock';

// INV03/INV06: count sheet with variance preview; each reviewed count becomes
// the item's reconciled baseline. An active consumable that is not on the ledger
// stays in usage learning (the count anchors it); other items move to the movement
// ledger. Nothing is applied until the reviewer confirms a row.

export default function CountsPage() {
  const s = useSession();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['catalogue', s.propertyId], queryFn: () => fetchCatalogue(s.propertyId) });
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [keys] = useState<Record<string, string>>({});
  const keyFor = (id: string) => (keys[id] ??= newIdempotencyKey('count'));
  const apply = useMutation({
    mutationFn: (id: string) => reconcileBaseline(id, counts[id] ?? '', notes[id] ?? 'Count sheet', keyFor(id)),
    onSuccess: (r, id) => {
      const item = query.data?.items.find((i) => i.id === id);
      toast.success(item && staysLearning(item) ? `Count recorded: ${r.after}` : `Baseline set to ${r.after}`, { description: `Variance ${r.variance}` });
      delete keys[id];
      // A confirmed row is spent: clear it so a second tap cannot write a new count (that would end a refill prompt). A failure keeps what was typed.
      setCounts(({ [id]: _c, ...rest }) => rest);
      setNotes(({ [id]: _n, ...rest }) => rest);
      void qc.invalidateQueries({ queryKey: ['catalogue'] });
      void qc.invalidateQueries({ queryKey: ['movements'] });
      void qc.invalidateQueries({ queryKey: ['usage-kpi'] }); // a count can start or end a refill prompt
      void qc.invalidateQueries({ queryKey: ['item-moves'] }); // the item History lists counts
    },
    onError: (e) => toast.error(toAppError(e).message),
  });
  const [moveOpen, setMoveOpen] = useState(false);
  const canMove = s.caps.can('manage_inventory') && canMoveAny(query.data?.items ?? []); // s122 (D-383): admin only; hidden until the server reports usage state
  const learns = query.data?.items.some(staysLearning) ?? false; // the sentence is true only once the server reports usage state
  return (
    <div>
      <PageHeader title="Stock counts" description={`Count what is in storage (a consumable placed in the unit counts as used), enter the quantity per item, review the variance, then confirm. The count replaces the recorded quantity and is kept in the item's movement history.${learns ? ' Counts of active consumables keep usage learning.' : ''}${canMove ? ' If the total is right but split wrongly, move it instead of counting.' : ''}`}
        actions={canMove ? <Button variant="outline" className="min-h-11" onClick={() => setMoveOpen(true)}>Move stock between items</Button> : undefined} />
      {canMove && <MoveStockSheet open={moveOpen} onOpenChange={setMoveOpen} items={query.data?.items ?? []} />}
      <QueryState query={query}>
        {(d) => (
          <div className="overflow-x-auto rounded-lg border" role="region" aria-label="Count sheet" tabIndex={0}>
            <Table>
              <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Recorded</TableHead><TableHead>Counted</TableHead><TableHead>Variance</TableHead><TableHead>Note</TableHead><TableHead>Control</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {d.items.filter((i) => i.active).map((i) => {
                  const c = counts[i.id];
                  const saving = apply.isPending && apply.variables === i.id;
                  const variance = c !== undefined && c !== '' && !Number.isNaN(Number(c)) ? Number(c) - Number(i.qty) : null;
                  return (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">{i.name}<div className="text-xs text-muted-foreground">{i.unit}</div></TableCell>
                      <TableCell className="tabular">{formatNumber(i.qty, 2)}</TableCell>
                      <TableCell><Input inputMode="decimal" aria-label={`Counted ${i.name}`} className="w-24 text-base sm:text-sm" value={c ?? ''} disabled={saving} onChange={(e) => setCounts({ ...counts, [i.id]: e.target.value })} /></TableCell>
                      <TableCell className="tabular">{variance === null ? '—' : <span className={variance === 0 ? 'text-muted-foreground' : 'font-medium'}>{variance > 0 ? '+' : ''}{formatNumber(variance, 2)}</span>}</TableCell>
                      <TableCell><Input aria-label={`Note ${i.name}`} className="w-44 text-base sm:text-sm" placeholder="Where counted / why" value={notes[i.id] ?? ''} disabled={saving} onChange={(e) => setNotes({ ...notes, [i.id]: e.target.value })} /></TableCell>
                      <TableCell><StatusBadge tone={i.movementControlled ? 'good' : 'neutral'}>{i.movementControlled ? 'ledger' : staysLearning(i) ? 'learning' : 'legacy'}</StatusBadge></TableCell>
                      <TableCell><Button size="sm" disabled={variance === null || (notes[i.id] ?? '').trim().length < 3 || apply.isPending} onClick={() => apply.mutate(i.id)}>Confirm</Button></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </QueryState>
    </div>
  );
}
