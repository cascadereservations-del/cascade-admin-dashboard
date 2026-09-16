import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { useSession } from '@/auth/session';
import { useUrlState } from '@/lib/url-state';
import { formatDateTime, todayManila } from '@/lib/dates';
import { formatNumber, formatPHP } from '@/lib/money';
import { toAppError } from '@/lib/errors';
import { newIdempotencyKey } from '@/lib/idempotency';
import { PageHeader, Section } from '@/components/data/page-header';
import { FilterBar, FilterSelect } from '@/components/data/filter-bar';
import { DataTable } from '@/components/data/data-table';
import { EmptyState, QueryState } from '@/components/data/query-state';
import { Freshness } from '@/components/data/freshness';
import { StatusBadge } from '@/components/data/status-badge';
import { DetailSheet, Field } from '@/components/data/detail-sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { fetchCatalogue, fetchItemPurchases, fetchMovements, recordAdjustment, recordReceipt, type Item } from './api';

// INV01/INV02/INV05: catalogue with attention filters, advisory coverage
// ("Not enough usage history" when < 14 usage days), and movement history.
// Receipts and adjustments go through the single movement path.

const DEFAULTS = { q: '', attention: '', category: '', density: 'comfortable', item: '' };

export default function InventoryPage() {
  const s = useSession();
  const qc = useQueryClient();
  const { state, set, reset, activeFilterCount } = useUrlState(DEFAULTS);
  const canManage = s.caps.can('manage_inventory');
  const query = useQuery({ queryKey: ['catalogue', s.propertyId], queryFn: () => fetchCatalogue(s.propertyId) });
  const selected = query.data?.items.find((i) => i.id === state.item) ?? null;
  const moves = useQuery({ queryKey: ['movements', state.item], queryFn: () => fetchMovements(state.item), enabled: !!state.item });
  const itemPurchases = useQuery({ queryKey: ['item-purchases', state.item], queryFn: () => fetchItemPurchases(state.item), enabled: !!state.item });
  const [receipt, setReceipt] = useState({ packs: '', unitCost: '', supplier: '', date: todayManila() });
  const [adjust, setAdjust] = useState({ delta: '', reason: '' });
  const [rKey, setRKey] = useState(() => newIdempotencyKey('receipt'));
  const [aKey, setAKey] = useState(() => newIdempotencyKey('adjust'));
  const density = state.density === 'compact' ? 'compact' : 'comfortable';

  const doReceipt = useMutation({
    mutationFn: () => recordReceipt(selected!.id, receipt.packs, receipt.unitCost || null, receipt.supplier || null, receipt.date, null, rKey),
    onSuccess: (r) => {
      toast.success(`Received ${r.unitsAdded} ${selected?.unit}`, { description: `${r.controlled ? 'Movement' : 'Legacy quantity update'} recorded ${formatDateTime(new Date().toISOString())}` });
      setReceipt({ packs: '', unitCost: '', supplier: '', date: receipt.date });
      setRKey(newIdempotencyKey('receipt'));
      void qc.invalidateQueries({ queryKey: ['catalogue'] });
      void qc.invalidateQueries({ queryKey: ['movements'] });
    },
    onError: (e) => toast.error(toAppError(e).message),
  });
  const doAdjust = useMutation({
    mutationFn: () => recordAdjustment(selected!.id, adjust.delta, adjust.reason, aKey),
    onSuccess: () => {
      // Movements are append-only: undo posts the opposite adjustment so both
      // rows stay in the item's history and in Settings → Audit history.
      const itemId = selected!.id;
      const delta = adjust.delta;
      const reverse = String(-Number(delta));
      toast.success('Adjustment recorded', {
        duration: 8000,
        action: { label: 'Undo', onClick: () => recordAdjustment(itemId, reverse, `undo of adjustment ${delta}`, newIdempotencyKey('adjust')).then(() => { toast.success('Adjustment reversed'); void qc.invalidateQueries(); }).catch((e) => toast.error(toAppError(e).message)) },
      });
      setAdjust({ delta: '', reason: '' });
      setAKey(newIdempotencyKey('adjust'));
      void qc.invalidateQueries({ queryKey: ['catalogue'] });
      void qc.invalidateQueries({ queryKey: ['movements'] });
    },
    onError: (e) => {
      const err = toAppError(e);
      toast.error(err.message.includes('reconciliation required') ? 'This item needs a reviewed baseline count first (Inventory › Counts).' : err.message);
    },
  });

  const nameCol = useMemo<ColumnDef<Item, unknown>>(() => ({ id: 'name', header: 'Item', accessorFn: (r) => r.name, cell: ({ row }) => <div><button type="button" className="text-left font-medium hover:underline" onClick={() => set({ item: row.original.id })}>{row.original.name}</button><div className="text-xs text-muted-foreground">{row.original.category}{row.original.consumable ? ' · consumable' : ' · durable'}</div></div> }), [set]);
  const qtyCol: ColumnDef<Item, unknown> = { id: 'qty', header: 'On hand', accessorFn: (r) => Number(r.qty), cell: ({ row }) => <span className="tabular">{formatNumber(row.original.qty, 2)} {row.original.unit}</span> };
  const controlCol: ColumnDef<Item, unknown> = { id: 'control', header: 'Stock control', accessorFn: (r) => r.movementControlled, cell: ({ row }) => <StatusBadge tone={row.original.movementControlled ? 'good' : 'neutral'}>{row.original.movementControlled ? 'movement ledger' : 'legacy quantity'}</StatusBadge> };
  const stateCol: ColumnDef<Item, unknown> = { id: 'state', header: 'State', accessorFn: (r) => r.attention, cell: ({ row }) => (!row.original.active ? <StatusBadge tone="neutral">inactive</StatusBadge> : Number(row.original.qty) <= 0 ? <StatusBadge tone="bad">out of stock</StatusBadge> : row.original.attention ? <StatusBadge tone="warn">attention</StatusBadge> : <StatusBadge tone="good">ok</StatusBadge>) };
  // Consumables carry reorder-point and coverage columns; durables don't run
  // out on a schedule, so those two columns would only ever read empty there.
  const consumableColumns = useMemo<ColumnDef<Item, unknown>[]>(() => [
    nameCol, qtyCol,
    { id: 'reorder', header: 'Reorder below', accessorFn: (r) => r.reorderBelow ?? '', cell: ({ row }) => <span className="tabular">{row.original.reorderBelow ?? '—'}</span> },
    { id: 'coverage', header: 'Coverage', accessorFn: (r) => r.coverageDays ?? '', cell: ({ row }) => (row.original.coverageDays ? <span className="tabular">{formatNumber(row.original.coverageDays, 0)} days</span> : <span className="text-xs text-muted-foreground">Not enough usage history</span>) },
    controlCol, stateCol,
  ], [nameCol]);
  const durableColumns = useMemo<ColumnDef<Item, unknown>[]>(() => [nameCol, qtyCol, controlCol, stateCol], [nameCol]);

  // Phase-3 grouping (D-137): the category field mixes real appliances with
  // utensils and furniture under one label ("Kitchen & Dining" holds the
  // fridge and a fork alike), and there's no dedicated appliance flag
  // anywhere in the schema or the standalone CH_Inventory app. Confirmed live
  // 2026-09-16: moving "Kitchen & Dining" plus the one miscategorized
  // Washing Machine into Appliances, everything else durable into Stores,
  // reuses the existing category data with a single named exception rather
  // than inventing a new field.
  const APPLIANCE_EXCEPTIONS = new Set(['Washing Machine (Panasonic)']);
  const isAppliance = (i: Item) => i.category === 'Kitchen & Dining' || APPLIANCE_EXCEPTIONS.has(i.name);
  // Coverage isn't populated for any item yet (needs 14+ days of usage
  // history); until it is, fall back to on-hand ÷ reorder-below so "lowest
  // coverage first" still means something instead of an arbitrary order.
  const coverageKey = (i: Item) => (i.coverageDays !== null ? Number(i.coverageDays) : i.reorderBelow !== null && Number(i.reorderBelow) > 0 ? Number(i.qty) / Number(i.reorderBelow) : Infinity);

  return (
    <div>
      <PageHeader title="Inventory" description="Consumables and durable items. Advisory reorder estimates never place orders." actions={<><Button variant="outline" asChild><Link to="/inventory/purchases">Purchases</Link></Button>{canManage && <Button variant="outline" asChild><Link to="/inventory/counts">Counts</Link></Button>}</>} />
      <FilterBar search={state.q} onSearch={(q) => set({ q })} searchPlaceholder="Item name" activeCount={activeFilterCount} onClear={reset} density={density} onDensity={(d) => set({ density: d })}>
        <FilterSelect label="Attention" value={state.attention || undefined} onChange={(v) => set({ attention: v ?? '' })} options={[{ value: 'low', label: 'Low stock' }, { value: 'out', label: 'Out of stock' }, { value: 'inactive', label: 'Inactive' }, { value: 'attention', label: 'Attention required' }]} />
        <FilterSelect label="Category" value={state.category || undefined} onChange={(v) => set({ category: v ?? '' })} options={[...new Set((query.data?.items ?? []).map((i) => i.category))].sort().map((c) => ({ value: c, label: c }))} />
      </FilterBar>
      <QueryState query={query}>
        {(data) => {
          let rows = data.items;
          if (state.q) rows = rows.filter((i) => i.name.toLowerCase().includes(state.q.toLowerCase()));
          if (state.category) rows = rows.filter((i) => i.category === state.category);
          if (state.attention === 'low') rows = rows.filter((i) => i.reorderBelow !== null && Number(i.qty) <= Number(i.reorderBelow) && Number(i.qty) > 0);
          if (state.attention === 'out') rows = rows.filter((i) => Number(i.qty) <= 0);
          if (state.attention === 'inactive') rows = rows.filter((i) => !i.active);
          if (state.attention === 'attention') rows = rows.filter((i) => i.attention);
          if (!state.attention) rows = rows.filter((i) => i.active);
          if (rows.length === 0) return <EmptyState title="No items match" action={<Button size="sm" variant="outline" onClick={reset}>Clear filters</Button>} />;
          const consumables = rows.filter((i) => i.consumable).sort((a, b) => coverageKey(a) - coverageKey(b));
          const appliances = rows.filter((i) => !i.consumable && isAppliance(i)).sort((a, b) => a.name.localeCompare(b.name));
          const stores = rows.filter((i) => !i.consumable && !isAppliance(i)).sort((a, b) => a.name.localeCompare(b.name));
          return (
            <div className="space-y-6">
              <Section title={`Consumables (${consumables.length})`}>
                {consumables.length === 0 ? <p className="text-sm text-muted-foreground">No consumables match.</p> : (
                  <DataTable columns={consumableColumns} rows={consumables} density={density} caption="Consumables" getRowId={(r) => r.id} onRowClick={(r) => set({ item: r.id })} />
                )}
              </Section>
              <Section title={`Appliances & utensils (${appliances.length})`}>
                {appliances.length === 0 ? <p className="text-sm text-muted-foreground">No appliances or utensils match.</p> : (
                  <DataTable columns={durableColumns} rows={appliances} density={density} caption="Appliances and utensils" getRowId={(r) => r.id} onRowClick={(r) => set({ item: r.id })} />
                )}
              </Section>
              <Section title={`Stores (${stores.length})`}>
                {stores.length === 0 ? <p className="text-sm text-muted-foreground">No store items match.</p> : (
                  <DataTable columns={durableColumns} rows={stores} density={density} caption="Stores" getRowId={(r) => r.id} onRowClick={(r) => set({ item: r.id })} />
                )}
              </Section>
              <Freshness sourceAsOf={data.sourceAsOf} label="Catalogue updated" />
              <p className="text-xs text-muted-foreground">{data.forecastNote}</p>
            </div>
          );
        }}
      </QueryState>
      <DetailSheet open={!!selected} onOpenChange={(o) => !o && set({ item: '' })} title={selected?.name ?? ''} description={selected ? `${selected.category} · ${selected.unit}` : undefined}>
        {selected && (
          <div className="space-y-4">
            <dl className="space-y-1">
              <Field label="On hand">{formatNumber(selected.qty, 2)} {selected.unit}</Field>
              <Field label="Reorder below">{selected.reorderBelow ?? 'not set'}</Field>
              <Field label="Purchase unit">{selected.purchaseUnit ? `${selected.purchaseUnit} = ${selected.unitsPerPurchase} ${selected.unit}` : 'same as base unit'}</Field>
              <Field label="Unit cost">{selected.unitCost !== null ? formatPHP(selected.unitCost) : s.caps.can('read_finance') ? 'not recorded' : 'restricted'}</Field>
              <Field label="Usage (30d)">
                <div>
                  <div>{selected.usageDays && selected.usageDays >= 14 ? `${formatNumber(selected.usage30d, 2)} over ${selected.usageDays} days · ${selected.avgDaily}/day` : `Not enough usage history (${selected.usageDays ?? 0} days recorded)`}</div>
                  <div className="text-xs text-muted-foreground">Sum of recorded consumption in the last 30 days; needs at least 14 distinct days with a usage entry before it's shown.</div>
                </div>
              </Field>
              <Field label="Stock control">{selected.movementControlled ? `Movement ledger${selected.baselineNote ? ` · baseline: ${selected.baselineNote}` : ''}` : 'Legacy quantity. Reconcile a baseline count to switch this item to the movement ledger.'}</Field>
            </dl>
            {canManage && (
              <div className="grid gap-4 sm:grid-cols-2">
                <form className="space-y-2 rounded-lg border p-3" onSubmit={(e) => { e.preventDefault(); doReceipt.mutate(); }}>
                  <p className="text-sm font-medium">Receive stock</p>
                  <div><Label htmlFor="r-packs">Packs ({selected.purchaseUnit ?? selected.unit})</Label><Input id="r-packs" inputMode="decimal" required value={receipt.packs} onChange={(e) => setReceipt({ ...receipt, packs: e.target.value })} className="text-base" /></div>
                  <div><Label htmlFor="r-cost">Cost per pack (PHP)</Label><Input id="r-cost" inputMode="decimal" value={receipt.unitCost} onChange={(e) => setReceipt({ ...receipt, unitCost: e.target.value })} className="text-base" /></div>
                  <div><Label htmlFor="r-sup">Supplier</Label><Input id="r-sup" value={receipt.supplier} onChange={(e) => setReceipt({ ...receipt, supplier: e.target.value })} className="text-base" /></div>
                  <div><Label htmlFor="r-date">Date</Label><Input id="r-date" type="date" value={receipt.date} onChange={(e) => setReceipt({ ...receipt, date: e.target.value })} className="text-base" /></div>
                  <Button type="submit" size="sm" disabled={doReceipt.isPending || !receipt.packs}>Record receipt</Button>
                </form>
                <form className="space-y-2 rounded-lg border p-3" onSubmit={(e) => { e.preventDefault(); doAdjust.mutate(); }}>
                  <p className="text-sm font-medium">Adjust (movement ledger only)</p>
                  <div><Label htmlFor="a-delta">Change (+/−) in {selected.unit}</Label><Input id="a-delta" inputMode="decimal" required value={adjust.delta} onChange={(e) => setAdjust({ ...adjust, delta: e.target.value })} className="text-base" /></div>
                  <div><Label htmlFor="a-reason">Reason</Label><Textarea id="a-reason" required minLength={3} value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })} className="text-base" /></div>
                  <Button type="submit" size="sm" variant="outline" disabled={doAdjust.isPending || !selected.movementControlled}>Record adjustment</Button>
                  {!selected.movementControlled && <p className="text-xs text-muted-foreground">Needs a baseline count first.</p>}
                </form>
              </div>
            )}
            <div>
              <p className="mb-1 text-sm font-medium">Movement history</p>
              {moves.isPending ? <p className="text-xs text-muted-foreground">Loading…</p> : moves.isError ? <p className="text-xs text-destructive">{toAppError(moves.error).message}</p> : moves.data.rows.length === 0 ? <p className="text-xs text-muted-foreground">No movements. An empty ledger is not zero stock; the quantity above comes from the item record.</p> : (
                <ul className="max-h-64 divide-y overflow-auto rounded-lg border text-xs">
                  {moves.data.rows.map((m) => <li key={m.id} className="flex gap-2 px-2 py-1"><span className="tabular w-32 shrink-0 text-muted-foreground">{formatDateTime(m.created_at)}</span><span className="w-20 shrink-0 capitalize">{m.kind}</span><span className="tabular w-24 shrink-0">{m.quantity_before} → {m.quantity_after}</span><span className="min-w-0 truncate">{m.reason}</span></li>)}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-1 text-sm font-medium">Purchase history by supplier</p>
              {itemPurchases.isPending ? <p className="text-xs text-muted-foreground">Loading…</p> : itemPurchases.isError ? <p className="text-xs text-destructive">{toAppError(itemPurchases.error).message}</p> : itemPurchases.data.rows.length === 0 ? <p className="text-xs text-muted-foreground">No recorded purchases for this item.</p> : (
                <ul className="max-h-64 divide-y overflow-auto rounded-lg border text-xs">
                  {itemPurchases.data.rows.map((p, i) => {
                    const prior = itemPurchases.data.rows[i + 1];
                    const change = p.unit_cost && prior?.unit_cost && Number(prior.unit_cost) > 0 ? ((Number(p.unit_cost) - Number(prior.unit_cost)) / Number(prior.unit_cost)) * 100 : null;
                    return (
                      <li key={p.id} className="flex flex-wrap gap-2 px-2 py-1">
                        <span className="tabular w-24 shrink-0 text-muted-foreground">{formatDateTime(p.purchased_at).slice(0, 10)}</span>
                        <span className="w-28 shrink-0 truncate">{p.supplier ?? 'no supplier'}</span>
                        <span className="tabular w-16 shrink-0">{formatNumber(p.qty, 2)}</span>
                        <span className="tabular w-20 shrink-0">{p.unit_cost !== null && s.caps.can('read_finance') ? formatPHP(p.unit_cost) : '—'}/unit</span>
                        <span className="tabular w-20 shrink-0">{p.total_cost !== null && s.caps.can('read_finance') ? formatPHP(p.total_cost) : '—'}</span>
                        {change !== null && s.caps.can('read_finance') && <span className={change > 0 ? 'tabular text-destructive' : change < 0 ? 'tabular text-emerald-600' : 'tabular text-muted-foreground'}>{change > 0 ? '▲' : change < 0 ? '▼' : '='} {Math.abs(change).toFixed(0)}% vs prior</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </DetailSheet>
    </div>
  );
}
