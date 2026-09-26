import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSession } from '@/auth/session';
import { formatPHP } from '@/lib/money';
import { toAppError } from '@/lib/errors';
import { newIdempotencyKey } from '@/lib/idempotency';
import { addIsoDays, todayManila } from '@/lib/dates';
import { PageHeader, Section } from '@/components/data/page-header';
import { QueryState } from '@/components/data/query-state';
import { StatusBadge } from '@/components/data/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  endPromotion, fetchCard, fetchPromotions, fetchVersions, pctToPrice, previewQuote, promoStatus, publishCard, savePromotion, tierProblem, tierRate,
  type PromotionRow, type Quote, type RateCard, type Tier,
} from './api';

// SPEC-34 Pricing tab (D-259, D-261, D-262). The one rate card: the booking site, the Messenger concierge, Cassy and
// submit-booking all read it through get_rate_card_v1 / the rate-card function (a change reaches them within a minute).
// The price advisor (SPEC-35) is a separate module; it never writes here.

const num = (v: string) => (v.trim() === '' ? NaN : Number(v));
/** The SQL functions take a reason of 3 to 2000 characters (review 2026-09-26: check both ends here). */
const reasonProblem = (r: string) => (r.trim().length < 3 ? 'Say why (a few words), for the audit history.' : r.trim().length > 2000 ? 'Keep the reason under 2,000 characters.' : null);

export default function PricingPage() {
  const s = useSession();
  const qc = useQueryClient();
  const card = useQuery({ queryKey: ['rate-card'], queryFn: fetchCard });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['rate-card'] }); void qc.invalidateQueries({ queryKey: ['rate-versions'] }); void qc.invalidateQueries({ queryKey: ['rate-promotions'] }); };
  return (
    <div className="space-y-8">
      <PageHeader title="Pricing" description="The one rate card every module reads: the booking site, the Messenger concierge, Cassy and every new booking request. A change here reaches all of them within a minute. Bookings already made keep the amount they were quoted." />
      <QueryState query={card}>
        {(c) => (
          <>
            <StandardRate card={c} propertyId={s.propertyId} onDone={refresh} />
            <Promotions card={c} propertyId={s.propertyId} onDone={refresh} />
            <Preview />
          </>
        )}
      </QueryState>
    </div>
  );
}

function StandardRate({ card, propertyId, onDone }: { card: RateCard; propertyId: string; onDone: () => void }) {
  const versions = useQuery({ queryKey: ['rate-versions', propertyId], queryFn: () => fetchVersions(propertyId) });
  const [editing, setEditing] = useState(false);
  const [base, setBase] = useState(String(card.base));
  const [fee, setFee] = useState(String(card.deposit_pct));
  const [tiers, setTiers] = useState<Array<{ min: string; pct: string }>>(card.tiers.map((t) => ({ min: String(t.min_nights), pct: String(t.pct) })));
  // A card may start later: since release rate_card_upcoming_20260926 get_rate_card_v1 lists it as `upcoming` and every
  // quote prices a stay by the card in force on its check-in date (review 2026-09-26, finding 1).
  const [from, setFrom] = useState(todayManila());
  const [reason, setReason] = useState('');
  const [key, setKey] = useState(() => newIdempotencyKey('rate-card'));
  const parsed: Tier[] = tiers.map((t) => ({ min_nights: num(t.min), pct: num(t.pct) }));
  const b = num(base), f = num(fee);
  const problem = !(b > 0 && b < 100000) ? 'The standard rate must be a price above zero.'
    : !(f > 0 && f <= 100) ? 'The reservation fee is between 1% and 100%.'
    : tierProblem(parsed) ?? (from < todayManila() ? 'A new card starts today or later.'
      : (card.upcoming ?? []).some((u) => u.effective_from > from) ? `A card is already scheduled from ${(card.upcoming ?? []).map((u) => u.effective_from).sort().pop()}: pick that date to correct it, or a later one.`
      : reasonProblem(reason));
  const publish = useMutation({
    mutationFn: () => publishCard({ base: b, tiers: parsed, depositPct: f, effectiveFrom: from, reason: reason.trim(), key }),
    onSuccess: () => { toast.success(`Rate card published from ${from}`); setEditing(false); setReason(''); setKey(newIdempotencyKey('rate-card')); onDone(); },
    onError: (e) => toast.error(toAppError(e).message),
  });
  const sortedCur = [...card.tiers].sort((x, y) => x.min_nights - y.min_nights);
  return (
    <Section title="Standard rate and length-of-stay discounts" aside={!editing && <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Change</Button>}>
      <div className="rounded-lg border p-4 text-sm">
        <p><span className="text-2xl font-semibold tabular">{formatPHP(card.base, { whole: true })}</span> per night · reservation fee {card.deposit_pct}% · in force since {card.effective_from}</p>
        {(card.upcoming ?? []).map((u) => (
          <p key={u.version_id} className="mt-1"><StatusBadge tone="info">scheduled</StatusBadge> {formatPHP(u.base, { whole: true })} per night · fee {u.deposit_pct}% · for stays checking in from {u.effective_from} · {u.tiers.map((t) => `${t.pct}% from ${t.min_nights} nights`).join(', ') || 'no length-of-stay discounts'}</p>
        ))}
        <table className="mt-3 w-full max-w-md text-left">
          <thead className="text-xs text-muted-foreground"><tr><th className="py-1">Stay length</th><th>% off</th><th>Per night</th></tr></thead>
          <tbody className="tabular">
            <tr><td className="py-1">1 night{sortedCur[0] && sortedCur[0].min_nights > 2 ? `-${sortedCur[0].min_nights - 1} nights` : ''}</td><td>—</td><td>{formatPHP(card.base, { whole: true })}</td></tr>
            {sortedCur.map((t, i) => { const nx = sortedCur[i + 1]; return (
              <tr key={t.min_nights}><td className="py-1">{t.min_nights}{nx ? `-${nx.min_nights - 1}` : '+'} nights</td><td>{t.pct}%</td><td>{formatPHP(tierRate(card.base, t.pct), { whole: true })}</td></tr>
            ); })}
          </tbody>
        </table>
      </div>
      {editing && (
        <div className="space-y-3 rounded-lg border border-dashed p-4">
          <div className="flex flex-wrap gap-4">
            <div><Label htmlFor="rc-base">Standard rate per night (PHP)</Label><Input id="rc-base" inputMode="numeric" className="w-36 text-base sm:text-sm" value={base} onChange={(e) => setBase(e.target.value)} /></div>
            <div><Label htmlFor="rc-fee">Reservation fee (%)</Label><Input id="rc-fee" inputMode="numeric" className="w-24 text-base sm:text-sm" value={fee} onChange={(e) => setFee(e.target.value)} /></div>
            <div><Label htmlFor="rc-from">Starts on</Label><Input id="rc-from" type="date" min={todayManila()} className="w-44 text-base sm:text-sm" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <p className="self-end pb-2 text-muted-foreground">Stays checking in on or after this date are quoted on the new card. Bookings already made keep their price.</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Discounts by length of stay (the whole stay gets the rate of its length)</p>
            {tiers.map((t, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                <span>From</span>
                <Input aria-label={`Discount ${i + 1} starts at nights`} inputMode="numeric" className="w-16 text-base sm:text-sm" value={t.min} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, min: e.target.value } : x)))} />
                <span>nights:</span>
                <Input aria-label={`Discount ${i + 1} percent off`} inputMode="decimal" className="w-16 text-base sm:text-sm" value={t.pct} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))} />
                <span>% off = {b > 0 && num(t.pct) > 0 ? formatPHP(tierRate(b, num(t.pct)), { whole: true }) : '—'} a night</span>
                <Button size="sm" variant="ghost" onClick={() => setTiers(tiers.filter((_, j) => j !== i))}>Remove</Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setTiers([...tiers, { min: '', pct: '' }])}>Add a discount</Button>
          </div>
          <div><Label htmlFor="rc-reason">Why (kept in the audit history)</Label><Textarea id="rc-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. High season rate from December" /></div>
          {b > 0 && b !== 1780 && <p className="text-xs text-muted-foreground">The booking site's search-engine text (the page description Google shows) still says ₱1,780: ask for it to be updated when this card starts.</p>}
          {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
          <div className="flex gap-2">
            <Button disabled={!!problem || publish.isPending} onClick={() => publish.mutate()}>{publish.isPending ? 'Publishing…' : from === todayManila() ? 'Publish now' : `Publish from ${from}`}</Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      )}
      <QueryState query={versions} isEmpty={(v) => v.length === 0}>
        {(v) => (
          <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Card history ({v.length})</summary>
            <ul className="mt-2 space-y-1 tabular">{v.map((x) => <li key={x.id}>{x.effective_from} → {x.effective_to ?? 'open'} · {formatPHP(x.nightly_rate, { whole: true })} · fee {x.terms.deposit_pct ?? 50}% · published {x.approved_at.slice(0, 10)}</li>)}</ul>
          </details>
        )}
      </QueryState>
    </Section>
  );
}

function Promotions({ card, propertyId, onDone }: { card: RateCard; propertyId: string; onDone: () => void }) {
  const promos = useQuery({ queryKey: ['rate-promotions', propertyId], queryFn: () => fetchPromotions(propertyId) });
  const today = todayManila();
  const [edit, setEdit] = useState<PromotionRow | 'new' | null>(null);
  const end = useMutation({
    mutationFn: (p: PromotionRow) => endPromotion(p.id, `Ended from the Pricing tab: ${p.name}`),
    onSuccess: () => { toast.success('Promotion ended: new quotes no longer use it'); onDone(); },
    onError: (e) => toast.error(toAppError(e).message),
  });
  return (
    <Section title="Promotions" aside={!edit && <Button size="sm" variant="outline" onClick={() => setEdit('new')}>New promotion</Button>}>
      <p className="text-xs text-muted-foreground">A promotion price replaces the length-of-stay rate for the nights it covers; other nights keep the normal rates. Guests see it anchored on the standard {formatPHP(card.base, { whole: true })}, never on a "was" price.</p>
      {edit && <PromotionForm card={card} row={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onDone={onDone} />}
      <QueryState query={promos} isEmpty={(p) => p.length === 0}>
        {(rows) => (
          <ul className="divide-y rounded-lg border text-sm">
            {rows.map((p) => {
              const st = promoStatus(p, today);
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div>
                    <p className="font-medium">{p.name} <StatusBadge tone={st === 'active' ? 'good' : st === 'upcoming' ? 'info' : 'neutral'}>{st}</StatusBadge></p>
                    <p className="text-muted-foreground tabular">{formatPHP(p.nightly_rate, { whole: true })} a night · nights {p.first_night} to {p.last_night} (check-out by {addIsoDays(p.last_night, 1)}) · {Math.round((1 - p.nightly_rate / card.base) * 100)}% under the standard</p>
                  </div>
                  {st !== 'ended' && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEdit(p)}>Edit</Button>
                      <Button size="sm" variant="ghost" disabled={end.isPending} onClick={() => { if (window.confirm(`End ${p.name}? New quotes stop using it at once.`)) end.mutate(p); }}>End</Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </QueryState>
    </Section>
  );
}

function PromotionForm({ card, row, onClose, onDone }: { card: RateCard; row: PromotionRow | null; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(row?.name ?? '');
  const [first, setFirst] = useState(row?.first_night ?? '');
  const [last, setLast] = useState(row?.last_night ?? '');
  const [mode, setMode] = useState<'price' | 'pct'>('price');
  const [value, setValue] = useState(row ? String(row.nightly_rate) : '');
  const [reason, setReason] = useState('');
  const v = num(value);
  const price = mode === 'price' ? v : v > 0 && v < 100 ? pctToPrice(card.base, v) : NaN;
  const problem = name.trim().length < 3 || name.trim().length > 80 ? 'Give it a name guests will read (3 to 80 characters).'
    : !first || !last ? 'Pick the first and the last NIGHT of the promotion.'
    : last < first ? 'The last night comes after the first.'
    : last < todayManila() ? 'That promotion would already be over.'
    : !(price > 0 && price < 100000) ? (mode === 'pct' ? 'A percentage between 0 and 100.' : 'A price above zero.')
    : price >= card.base ? `The promotion price should be under the standard ${formatPHP(card.base, { whole: true })}.`
    : reasonProblem(reason);
  const save = useMutation({
    mutationFn: () => savePromotion({ id: row?.id ?? null, name: name.trim(), firstNight: first, lastNight: last, nightlyRate: price, reason: reason.trim() }),
    onSuccess: () => { toast.success(row ? 'Promotion updated' : 'Promotion saved', { description: 'The site and the concierge quote it within a minute.' }); onClose(); onDone(); },
    onError: (e) => { const a = toAppError(e); toast.error(/overlap|23P01|exclusion/i.test(`${a.message} ${(e as { code?: string })?.code ?? ''}`) ? 'Those nights overlap another active promotion. End or shorten that one first.' : a.message); },
  });
  return (
    <div className="space-y-3 rounded-lg border border-dashed p-4 text-sm">
      <div className="flex flex-wrap gap-4">
        <div><Label htmlFor="pr-name">Name guests see</Label><Input id="pr-name" className="w-64 text-base sm:text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Anniversary Promotion" /></div>
        <div><Label htmlFor="pr-first">First night</Label><Input id="pr-first" type="date" className="w-44 text-base sm:text-sm" value={first} onChange={(e) => setFirst(e.target.value)} /></div>
        <div><Label htmlFor="pr-last">Last night</Label><Input id="pr-last" type="date" min={first || undefined} className="w-44 text-base sm:text-sm" value={last} onChange={(e) => setLast(e.target.value)} /></div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex gap-1" role="group" aria-label="Price or percentage">
          <Button size="sm" variant={mode === 'price' ? 'default' : 'outline'} onClick={() => setMode('price')}>Price a night</Button>
          <Button size="sm" variant={mode === 'pct' ? 'default' : 'outline'} onClick={() => setMode('pct')}>% off the standard</Button>
        </div>
        <div><Label htmlFor="pr-val">{mode === 'price' ? 'PHP a night' : '% off'}</Label><Input id="pr-val" inputMode="decimal" className="w-28 text-base sm:text-sm" value={value} onChange={(e) => setValue(e.target.value)} /></div>
        <p className="pb-2 text-muted-foreground">{price > 0 ? `${formatPHP(price, { whole: true })} a night (standard ${formatPHP(card.base, { whole: true })})` : ''}{first && last && last >= first ? ` · check-out by ${addIsoDays(last, 1)}` : ''}</p>
      </div>
      <div><Label htmlFor="pr-reason">Why (kept in the audit history)</Label><Textarea id="pr-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      <p className="text-xs text-muted-foreground">Airbnb is not linked: set the same price on Airbnb yourself if the promotion should run there too.</p>
      {problem && <p role="alert" className="text-destructive">{problem}</p>}
      <div className="flex gap-2">
        <Button disabled={!!problem || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save promotion'}</Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}

function Preview() {
  const [ci, setCi] = useState(addIsoDays(todayManila(), 7));
  const [co, setCo] = useState(addIsoDays(todayManila(), 10));
  const [q, setQ] = useState<Quote | null>(null);
  const run = useMutation({ mutationFn: () => previewQuote(ci, co), onSuccess: setQ, onError: (e) => { setQ(null); toast.error(toAppError(e).message); } });
  return (
    <Section title="Preview a stay">
      <p className="text-xs text-muted-foreground">Asks the live rate-card function: exactly what the booking site shows and a booking request stores.</p>
      <div className="flex flex-wrap items-end gap-3">
        <div><Label htmlFor="pv-in">Check-in</Label><Input id="pv-in" type="date" className="w-44 text-base sm:text-sm" value={ci} onChange={(e) => setCi(e.target.value)} /></div>
        <div><Label htmlFor="pv-out">Check-out</Label><Input id="pv-out" type="date" min={ci} className="w-44 text-base sm:text-sm" value={co} onChange={(e) => setCo(e.target.value)} /></div>
        <Button disabled={!ci || !co || co <= ci || run.isPending} onClick={() => run.mutate()}>{run.isPending ? 'Quoting…' : 'Quote'}</Button>
      </div>
      {q && (
        <div className="rounded-lg border p-4 text-sm">
          <ul className="tabular">{q.nights.map((n) => <li key={n.date}>{n.date} · {formatPHP(n.rate, { whole: true })}{n.source === 'promo' ? ` · ${n.promo}` : ''}</li>)}</ul>
          <p className="mt-2 font-medium tabular">{q.n} night{q.n === 1 ? '' : 's'} · total {formatPHP(q.total, { whole: true })} (standard {formatPHP(q.standard_total, { whole: true })}) · reservation fee {formatPHP(q.deposit, { whole: true })}{q.last_minute ? ' · inside 5 days: paid in full' : ''}</p>
        </div>
      )}
    </Section>
  );
}
