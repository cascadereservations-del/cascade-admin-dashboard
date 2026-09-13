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

// INV03/INV06: count sheet with variance preview; each reviewed count becomes
// the item's reconciled baseline and switches it to the movement ledger.
// Nothing is applied until the reviewer confirms a row.

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
      toast.success(`Baseline set to ${r.after}`, { description: `Variance ${r.variance}` });
      delete keys[id];
      void qc.invalidateQueries({ queryKey: ['catalogue'] });
    },
    onError: (e) => toast.error(toAppError(e).message),
  });
  return (
    <div>
      <PageHeader title="Stock counts" description="Enter the counted quantity per item, review the variance, then confirm. Confirming records a reviewed baseline; the item then uses the movement ledger for every change." />
      <QueryState query={query}>
        {(d) => (
          <div className="overflow-x-auto rounded-lg border" role="region" aria-label="Count sheet" tabIndex={0}>
            <Table>
              <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Recorded</TableHead><TableHead>Counted</TableHead><TableHead>Variance</TableHead><TableHead>Note</TableHead><TableHead>Control</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {d.items.filter((i) => i.active).map((i) => {
                  const c = counts[i.id];
                  const variance = c !== undefined && c !== '' && !Number.isNaN(Number(c)) ? Number(c) - Number(i.qty) : null;
                  return (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">{i.name}<div className="text-xs text-muted-foreground">{i.unit}</div></TableCell>
                      <TableCell className="tabular">{formatNumber(i.qty, 2)}</TableCell>
                      <TableCell><Input inputMode="decimal" aria-label={`Counted ${i.name}`} className="w-24 text-base sm:text-sm" value={c ?? ''} onChange={(e) => setCounts({ ...counts, [i.id]: e.target.value })} /></TableCell>
                      <TableCell className="tabular">{variance === null ? '—' : <span className={variance === 0 ? 'text-muted-foreground' : 'font-medium'}>{variance > 0 ? '+' : ''}{formatNumber(variance, 2)}</span>}</TableCell>
                      <TableCell><Input aria-label={`Note ${i.name}`} className="w-44 text-base sm:text-sm" placeholder="Where counted / why" value={notes[i.id] ?? ''} onChange={(e) => setNotes({ ...notes, [i.id]: e.target.value })} /></TableCell>
                      <TableCell><StatusBadge tone={i.movementControlled ? 'good' : 'neutral'}>{i.movementControlled ? 'ledger' : 'legacy'}</StatusBadge></TableCell>
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
