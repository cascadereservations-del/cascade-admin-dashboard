import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { toAppError } from '@/lib/errors';
import { formatDateTime } from '@/lib/dates';
import { newIdempotencyKey } from '@/lib/idempotency';
import { DetailSheet } from '@/components/data/detail-sheet';
import { GlassSheet, useNarrow } from '@/components/shell/page-band';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getItemMoves, moveStock, moveUsage, undoMove, type Item, type ItemMove, type MoveResult } from './api';
import { staysLearning, trimNumber } from './usage';

// s122 (D-383): move stock to another item. Admin only (the callers check manage_inventory). A move is not a count: it never touches usage learning from here.
// Wording: plain and calm, no exclamation marks; guidance is the warn tone, red is only for a server refusal.

const num = (v: unknown) => (v === null || v === undefined || v === '' ? NaN : Number(v));
const r2 = (n: number) => Math.round(n * 100) / 100;
const shown = (n: number) => trimNumber(r2(n)) ?? '0';
const sameUnit = (a: Item, b: Item) => a.unit.trim().toLowerCase() === b.unit.trim().toLowerCase();
const byName = (a: Item, b: Item) => a.name.localeCompare(b.name);

/** Items stock can be moved from or to: active consumables that are not on the movement ledger. */
export const movable = (items: Item[]) => items.filter((i) => i.active && i.consumable && !i.movementControlled).sort(byName);
/** Targets for a source: the same list, same unit, without the source. */
export const targetsFor = (items: Item[], from: Item | null) => (from ? movable(items).filter((i) => i.id !== from.id && sameUnit(i, from)) : []);

const GENERIC = 'This could not be done. Nothing was changed.';
type Names = { from?: Item | null; to?: Item | null };
/** The one sentence set for a refusal (spec R1.9). Unknown reasons get the calm generic line. */
export function refusalText(r: MoveResult, ctx: Names & { undo?: { giver: string; qty: string; unit: string } } = {}): string {
  const side = r.item === 'to' ? ctx.to : ctx.from;
  const onHand = r.on_hand ?? r.onHand;
  switch (r.reason) {
    case 'not_enough':
      if (ctx.undo) return onHand === undefined ? GENERIC : `${ctx.undo.giver} has ${trimNumber(onHand)} ${ctx.undo.unit} now, so the ${ctx.undo.qty} cannot go back. Make a new move or count it.`;
      return onHand === undefined || !ctx.from ? GENERIC : `${ctx.from.name} has ${trimNumber(onHand)} ${ctx.from.unit} now. Move ${trimNumber(onHand)} or fewer.`;
    case 'unit_mismatch': return ctx.from && ctx.to ? `These items use different units (${ctx.from.unit} and ${ctx.to.unit}).` : 'These items use different units.';
    case 'inactive': return side ? `${side.name} is inactive.` : 'One of these items is inactive.';
    case 'movement_controlled': return side ? `${side.name} is on the movement ledger. Use Adjust.` : 'One of these items is on the movement ledger. Use Adjust.';
    case 'not_consumable': return side ? `${side.name} is not a consumable.` : 'One of these items is not a consumable.';
    case 'same_item': return 'Choose a different item.';
    case 'bad_qty': return 'Enter an amount above 0, with at most 2 decimals.';
    case 'moved_since': return 'This row was moved again after. Undo the newest move first.';
    case 'key_conflict': return 'Something changed. Close the panel and try again.';
    case 'item_not_found': case 'usage_not_found': return 'That record is no longer there. Close the panel and open it again.';
    default: return GENERIC;
  }
}

/** One idempotency key per attempt: kept while the same move is retried after an error, renewed once it succeeds or the move changes. */
function useAttemptKey(prefix: string) {
  const ref = useRef<{ sig: string; key: string } | null>(null);
  return {
    keyFor(sig: string) { if (ref.current?.sig !== sig) ref.current = { sig, key: newIdempotencyKey(prefix) }; return ref.current.key; },
    clear() { ref.current = null; },
  };
}

function useRefresh() {
  const qc = useQueryClient();
  return () => { for (const k of ['catalogue', 'item-moves', 'movements', 'usage-kpi']) void qc.invalidateQueries({ queryKey: [k] }); };
}

/** Undo for the toast and the History list. A refusal is shown as text, never swallowed. */
function useUndo(refresh: () => void) {
  const keys = useRef(new Map<string, string>());
  return async (moveId: string, ctx: Names & { undo: { giver: string; qty: string; unit: string } }) => {
    const key = keys.current.get(moveId) ?? newIdempotencyKey('undomove');
    keys.current.set(moveId, key);
    try {
      const r = await undoMove(moveId, key);
      if (r.ok) { keys.current.delete(moveId); toast.success('Move undone'); } else toast.error(refusalText(r, ctx));
    } catch (e) { toast.error(toAppError(e).message); }
    refresh();
  };
}

function Select({ id, label, value, onChange, children, disabled }: { id: string; label: string; value: string; onChange: (v: string) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <div>
      <label htmlFor={id} className="mt-2.5 mb-1 block text-xs font-medium">{label}</label>
      <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="min-h-11 w-full rounded-[10px] border bg-card px-3 text-base text-foreground md:text-sm">{children}</select>
    </div>
  );
}

const Preview = ({ from, fromAfter, to, toAfter }: { from: Item; fromAfter: number; to: Item; toAfter: number }) => (
  <p data-testid="move-preview" className="mt-3 rounded-[10px] bg-muted px-3 py-2.5 tabular">
    {from.name} <b className="font-semibold">{shown(num(from.qty))} → {shown(fromAfter)}</b> · {to.name} <b className="font-semibold">{shown(num(to.qty))} → {shown(toAfter)}</b>
  </p>
);

/** The panel form (from fixed) and the Counts form (from picked). */
export function MoveStockForm({ items, from: fixedFrom }: { items: Item[]; from: Item | null }) {
  const refresh = useRefresh();
  const undo = useUndo(refresh);
  const keys = useAttemptKey('move');
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('1');
  const [refusal, setRefusal] = useState<string | null>(null);
  const from = fixedFrom ?? items.find((i) => i.id === fromId) ?? null;
  const targets = targetsFor(items, from);
  const to = targets.find((i) => i.id === toId) ?? null;
  const onHand = from ? num(from.qty) : NaN;
  const n = /^\d+(\.\d{1,2})?$/.test(amount.trim()) ? Number(amount) : NaN;
  const valid = !!from && !!to && Number.isFinite(onHand) && n > 0 && n <= onHand;
  const fewerUnits = from ? movable(items).filter((i) => i.id !== from.id).length - targets.length : 0;
  const unit = from?.unit ?? '';
  const stop = Number.isFinite(onHand) ? onHand : 0;
  const setAmt = (v: number) => setAmount(String(r2(v)));

  const mut = useMutation({
    mutationFn: () => moveStock(from!.id, to!.id, String(n), null, keys.keyFor(`${from!.id}|${to!.id}|${n}`)),
    onSuccess: (r) => {
      refresh();
      if (!r.ok) { setRefusal(refusalText(r, { from, to })); return; }
      keys.clear(); setRefusal(null); setAmount('1');
      const moveId = r.moveId;
      const names = { from, to, undo: { giver: to!.name, qty: shown(n), unit } };
      toast.success(`Moved ${shown(n)} ${unit} to ${to!.name}`, { duration: 8000, action: moveId ? { label: 'Undo', onClick: () => void undo(moveId, names) } : undefined });
    },
    onError: (e) => { refresh(); setRefusal(toAppError(e).message); }, // the move may have committed before the answer was lost
  });

  return (
    <form className="rounded-lg border bg-card p-3.5" onSubmit={(e) => { e.preventDefault(); if (valid) mut.mutate(); }}>
      <p className="mb-1 text-sm font-semibold">{fixedFrom ? 'Move to another item' : 'Move stock between items'}</p>
      {!fixedFrom && (
        <Select id="mv-from" label="From" value={fromId} onChange={(v) => { setFromId(v); setToId(''); setAmount('1'); setRefusal(null); }}>
          <option value="">Choose an item</option>
          {movable(items).map((i) => <option key={i.id} value={i.id}>{i.name} · {formatQty(i)}</option>)}
        </Select>
      )}
      <Select id="mv-to" label={fixedFrom ? 'Move to' : 'To'} value={to ? toId : ''} onChange={(v) => { setToId(v); setRefusal(null); }} disabled={!from}>
        <option value="">Choose an item</option>
        {targets.map((i) => <option key={i.id} value={i.id}>{i.name} · {formatQty(i)}</option>)}
      </Select>
      {from && fewerUnits > 0 && <p className="mt-1 text-xs text-warn">Only items with the same unit ({from.unit}) are listed.</p>}
      <label htmlFor="mv-amount" className="mt-2.5 mb-1 block text-xs font-medium">Amount</label>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" aria-label="One less" className="min-h-11 min-w-11 text-xl" disabled={!(n > 1)} onClick={() => setAmt(Math.max(1, n - 1))}>−</Button>
        <Input id="mv-amount" inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setRefusal(null); }} className="min-h-11 w-24 text-center text-base tabular" />
        <Button type="button" variant="outline" aria-label="One more" className="min-h-11 min-w-11 text-xl" disabled={!from || !(n < stop)} onClick={() => setAmt(Math.min(stop, (Number.isFinite(n) ? n : 0) + 1))}>+</Button>
        <span className="text-muted-foreground">{unit}</span>
      </div>
      {from && to && n > 0 && n <= onHand && <Preview from={from} fromAfter={onHand - n} to={to} toAfter={num(to.qty) + n} />}
      {from && to && n > onHand && <p className="mt-3 text-xs text-warn">{from.name} has {shown(onHand)} {unit}. Move {shown(onHand)} or fewer.</p>}
      <div className="sticky bottom-0 mt-3 bg-card pt-2">
        <Button type="submit" className="min-h-11 w-full sm:w-auto" disabled={!valid || mut.isPending}>{valid ? `Move ${shown(n)} ${unit}` : 'Move'}</Button>
      </div>
      {refusal && <p role="alert" className="mt-2 text-xs text-destructive">{refusal}</p>}
      <p className="mt-2 text-xs text-muted-foreground">Use this when the total is right but it sits under the wrong item. It is not a count.</p>
    </form>
  );
}

const formatQty = (i: Item) => `${trimNumber(i.qty) ?? '—'} ${i.unit}`;

/** Counts page: the same form in its own sheet, with From and a 44 px Close. */
export function MoveStockSheet({ open, onOpenChange, items }: { open: boolean; onOpenChange: (o: boolean) => void; items: Item[] }) {
  const narrow = useNarrow();
  const body = (
    <div className="space-y-4">
      <MoveStockForm items={items} from={null} />
      <Button type="button" variant="outline" className="min-h-11 min-w-11" onClick={() => onOpenChange(false)}>Close</Button>
    </div>
  );
  return narrow
    ? <GlassSheet open={open} onOpenChange={onOpenChange} title="Move stock between items">{body}</GlassSheet>
    : <DetailSheet open={open} onOpenChange={onOpenChange} title="Move stock between items">{body}</DetailSheet>;
}

/** Admin gate for the Counts header button: needs at least two movable items of one unit. */
export const canMoveAny = (items: Item[]) => items.some(staysLearning) && movable(items).some((a) => targetsFor(items, a).length > 0);

function UsageMove({ rowQty, usageId, item, items, onDone }: { rowQty: number; usageId: string; item: Item; items: Item[]; onDone: () => void }) {
  const refresh = useRefresh();
  const undo = useUndo(refresh);
  const keys = useAttemptKey('moveuse');
  const [toId, setToId] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);
  const targets = targetsFor(items, item);
  const to = targets.find((i) => i.id === toId) ?? null;
  const enough = !!to && num(to.qty) >= rowQty;
  const mut = useMutation({
    mutationFn: () => moveUsage(usageId, to!.id, keys.keyFor(`${usageId}|${to!.id}`)),
    onSuccess: (r) => {
      refresh();
      if (!r.ok) {
        // For a usage move the server's on_hand is the TARGET's shelf (it gives the stock), not the source's.
        const onHand = r.on_hand ?? r.onHand;
        setRefusal(r.reason === 'not_enough' && onHand !== undefined && to ? `${to.name} has ${trimNumber(onHand)} ${to.unit} now, which is less than ${shown(rowQty)}.` : refusalText(r, { from: item, to }));
        return;
      }
      keys.clear(); onDone();
      const moveId = r.moveId;
      const names = { from: item, to, undo: { giver: item.name, qty: shown(rowQty), unit: item.unit } };
      toast.success(`Moved ${shown(rowQty)} ${item.unit} to ${to!.name}`, { duration: 8000, action: moveId ? { label: 'Undo', onClick: () => void undo(moveId, names) } : undefined });
    },
    onError: (e) => { refresh(); setRefusal(toAppError(e).message); },
  });
  return (
    <div className="mx-2.5 mb-2.5 rounded-[10px] bg-muted p-2.5">
      <Select id={`mu-${usageId}`} label="Which item was it?" value={to ? toId : ''} onChange={(v) => { setToId(v); setRefusal(null); }}>
        <option value="">Choose an item</option>
        {targets.map((i) => <option key={i.id} value={i.id}>{i.name} · {formatQty(i)}</option>)}
      </Select>
      {to && <Preview from={item} fromAfter={num(item.qty) + rowQty} to={to} toAfter={num(to.qty) - rowQty} />}
      {to && !enough && <p className="mt-1 text-xs text-warn">{to.name} has {trimNumber(to.qty)} {to.unit}, which is less than {shown(rowQty)}.</p>}
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button type="button" className="min-h-11" disabled={!enough || mut.isPending} onClick={() => mut.mutate()}>{to ? `Move ${shown(rowQty)} ${item.unit} to ${to.name}` : 'Move'}</Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={onDone}>Cancel</Button>
      </div>
      {refusal && <p role="alert" className="mt-2 text-xs text-destructive">{refusal}</p>}
      <p className="mt-2 text-xs text-muted-foreground">The usage row moves with its amount. Usage learning is not affected.</p>
    </div>
  );
}

type Entry = { key: string; at: string; node: ReactNode };

/** Item panel History for a counted (learning) item: counts, moves and usage rows from the last 30 days, newest first. */
export function ItemHistory({ item, items, canManage }: { item: Item; items: Item[]; canManage: boolean }) {
  const refresh = useRefresh();
  const undo = useUndo(refresh);
  const q = useQuery({ queryKey: ['item-moves', item.id], queryFn: () => getItemMoves(item.id) });
  const [open, setOpen] = useState<string | null>(null);
  // Focus returns to the row's Move button, or to the History heading once the row has moved away (after the list is reread).
  const moveBtns = useRef(new Map<string, HTMLButtonElement>());
  const heading = useRef<HTMLParagraphElement>(null);
  const refocus = useRef<string | null>(null);
  useEffect(() => {
    if (refocus.current && !q.isFetching) { (moveBtns.current.get(refocus.current) ?? heading.current)?.focus(); refocus.current = null; }
  });
  const closeMove = (id: string) => { refocus.current = id; setOpen(null); };
  const nameOf = (x: string | null) => (x ? items.find((i) => i.id === x)?.name ?? x : '');
  const unit = item.unit;

  const moveLine = (m: ItemMove): string => {
    const other = nameOf(m.otherItem);
    const qty = `${trimNumber(m.qty)} ${unit}`;
    const what = m.undoOf ? 'Undid a move of' : 'Moved';
    const dir = m.direction === 'out' ? `to ${other}` : `from ${other}`;
    return `${what} ${qty} ${dir}${m.actor ? ` · by ${m.actor}` : ''}${m.undone ? ' · undone' : ''}`;
  };
  const undoMoveClick = (m: ItemMove) => {
    const other = nameOf(m.otherItem);
    // The item that gives stock back: for stock it is the side that received, for a usage row it is the original owner.
    const giverIsThis = m.kind === 'stock' ? m.direction === 'in' : m.direction === 'out';
    return undo(m.id, { from: item, to: item, undo: { giver: giverIsThis ? item.name : other, qty: trimNumber(m.qty) ?? '', unit } });
  };

  const entries: Entry[] = [];
  const d = q.data;
  if (d) {
    for (const c of d.counts ?? []) entries.push({ key: `c${c.at}`, at: c.at, node: <><span className="min-w-0 flex-1">Counted {trimNumber(c.qty)} {unit}</span><span className="text-muted-foreground">count</span></> });
    for (const m of d.moves ?? []) entries.push({ key: `m${m.id}`, at: m.at, node: <><span className="min-w-0 flex-1">{moveLine(m)}</span>{canManage && m.canUndo && !m.undone && <Button type="button" variant="outline" className="min-h-11" onClick={() => void undoMoveClick(m)}>Undo</Button>}</> });
    for (const u of d.usage ?? []) {
      const rowQty = num(u.qty);
      entries.push({
        key: `u${u.id}`, at: u.at ?? u.date,
        node: <>
          <span className="min-w-0 flex-1">Used {trimNumber(u.qty)} {unit}{u.loggedBy ? ` · logged by ${u.loggedBy}` : ''}{u.movedFrom ? ` · moved here from ${nameOf(u.movedFrom)}` : ''}</span>
          {canManage && Number.isFinite(rowQty) && <Button type="button" variant="outline" className="min-h-11" aria-expanded={open === u.id} ref={(el) => { if (el) moveBtns.current.set(u.id, el); else moveBtns.current.delete(u.id); }} onClick={() => setOpen(open === u.id ? null : u.id)}>Move</Button>}
        </>,
      });
    }
    entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  }
  return (
    <div>
      <p ref={heading} tabIndex={-1} className="mb-1 text-sm font-medium outline-none">History</p>
      {q.isPending ? <p className="text-xs text-muted-foreground">Loading…</p>
        : q.isError ? <p className="text-xs text-destructive">{toAppError(q.error).message}</p>
        : entries.length === 0 ? <p className="text-xs text-muted-foreground">Nothing recorded in the last 30 days.</p>
        : (
          <ul className="max-h-80 divide-y overflow-auto rounded-xl border bg-card text-xs">
            {entries.map((e) => {
              const u = e.key.startsWith('u') ? d!.usage.find((x) => `u${x.id}` === e.key) : undefined;
              return (
                <li key={e.key}>
                  <div className="flex min-h-[52px] items-center gap-2.5 px-2.5 py-1.5"><span className="tabular w-24 shrink-0 text-muted-foreground">{formatDateTime(e.at)}</span>{e.node}</div>
                  {u && open === u.id && <UsageMove usageId={u.id} rowQty={num(u.qty)} item={item} items={items} onDone={() => closeMove(u.id)} />}
                </li>
              );
            })}
          </ul>
        )}
    </div>
  );
}
