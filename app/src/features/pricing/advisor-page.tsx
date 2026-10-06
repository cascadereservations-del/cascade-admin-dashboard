import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useSession } from '@/auth/session';
import { formatPHP } from '@/lib/money';
import { todayManila } from '@/lib/dates';
import { PageHeader, Section } from '@/components/data/page-header';
import { QueryState } from '@/components/data/query-state';
import { StatusBadge } from '@/components/data/status-badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchCard } from './api';
import { fetchAdvisorInputs } from './advisor-api';
import {
  addMonths, baseInForce, calculate, defaultExpenseLines, defaultFeeRate, defaultPeriod, monthFacts, monthSpan, numOrNull, prefillPath, promosInMonth, staysUsed, sumExpenseLines,
  type AdvisorInputs,
} from './advisor';

// SPEC-35 / SPEC-42 item 1. The advisor SUGGESTS a nightly price from what the host wants to keep. It never writes a price:
// "Open Rate settings" opens the Pricing tab with the number typed in, and the host still presses Publish there.
// The only thing remembered is the host's own last inputs, in this browser.

const KEY = 'cascade.priceAdvisor.v1';
type Remembered = { target: string; overhead: string; minPrice: string; maxPrice: string; useExpenses: boolean };
const load = (): Remembered => {
  const d: Remembered = { target: '', overhead: '', minPrice: '', maxPrice: '', useExpenses: true };
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Remembered> | null;
    if (!o || typeof o !== 'object') return d;
    return {
      target: typeof o.target === 'string' ? o.target : d.target, overhead: typeof o.overhead === 'string' ? o.overhead : d.overhead,
      minPrice: typeof o.minPrice === 'string' ? o.minPrice : d.minPrice, maxPrice: typeof o.maxPrice === 'string' ? o.maxPrice : d.maxPrice,
      useExpenses: typeof o.useExpenses === 'boolean' ? o.useExpenses : d.useExpenses,
    };
  } catch { return d; }
};
const save = (r: Remembered) => { try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* private window or blocked storage: the page works without it */ } };

/** "1,234.5" -> 1234.5; empty or junk -> null (never 0). */
const pnum = (s: string) => numOrNull(s.replace(/,/g, ''));
const peso = (v: number | null) => (v === null ? '—' : formatPHP(Math.round(v), { whole: true }));
const pct = (v: number | null) => (v === null ? '' : String(Math.round(v * 1000) / 10));
const monthLabel = (m: string) => new Date(`${m}T00:00:00Z`).toLocaleDateString('en-PH', { month: 'short', year: 'numeric', timeZone: 'UTC' });

export default function PriceAdvisorPage() {
  const s = useSession();
  const today = todayManila();
  const init = useMemo(() => defaultPeriod(today), [today]);
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const span = monthSpan(from, to);
  const periodProblem = span < 1 ? 'The last month comes after the first.' : span > 12 ? 'Pick at most 12 months.' : null;
  const inputs = useQuery({
    queryKey: ['price-advisor', s.propertyId, from, to],
    queryFn: () => fetchAdvisorInputs(s.propertyId, from, to),
    enabled: !periodProblem,
  });
  const card = useQuery({ queryKey: ['rate-card'], queryFn: fetchCard });
  return (
    <div className="space-y-8">
      <PageHeader
        title="Price advisor"
        description="Suggests a nightly price from what you want to keep, using last year's nights and the last 12 months of expenses. It only suggests: nothing here changes a price."
      />
      <Section title="Period">
        <div className="flex flex-wrap items-end gap-4">
          <div><Label htmlFor="pa-from">From month</Label><Input id="pa-from" type="month" className="w-44 text-base sm:text-sm" value={from.slice(0, 7)} onChange={(e) => e.target.value && setFrom(`${e.target.value}-01`)} /></div>
          <div><Label htmlFor="pa-to">To month</Label><Input id="pa-to" type="month" className="w-44 text-base sm:text-sm" value={to.slice(0, 7)} onChange={(e) => e.target.value && setTo(`${e.target.value}-01`)} /></div>
          <p className="pb-2 text-sm text-muted-foreground">{periodProblem ?? `${span} month${span === 1 ? '' : 's'}`}</p>
        </div>
      </Section>
      {periodProblem ? <p role="alert" className="text-sm text-destructive">{periodProblem}</p> : (
        <QueryState query={inputs}>
          {(d) => <Advisor key={`${from}|${to}`} data={d} today={today} canPublish={s.caps.can('publish_rate_policy')} card={card.data ?? null} />}
        </QueryState>
      )}
    </div>
  );
}

type CardLike = Awaited<ReturnType<typeof fetchCard>>;

function Advisor({ data, today, canPublish, card }: { data: AdvisorInputs; today: string; canPublish: boolean; card: CardLike | null }) {
  const [mem, setMem] = useState(load);
  useEffect(() => save(mem), [mem]);
  const [feeText, setFeeText] = useState('');
  const [occ, setOcc] = useState<Record<string, string>>({});
  const [lines, setLines] = useState<Record<string, { include?: boolean; monthly?: string }>>({});

  const facts = useMemo(() => data.months.map(monthFacts), [data]);
  const expenseLines = useMemo(() => defaultExpenseLines(data.expenses).map((l) => {
    const o = lines[l.category];
    return { ...l, include: o?.include ?? l.include, monthly: o?.monthly !== undefined ? pnum(o.monthly) : l.monthly };
  }), [data, lines]);
  const exp = sumExpenseLines(expenseLines);
  const feeDefault = defaultFeeRate(data);
  const feeRate = feeText !== '' ? (pnum(feeText) === null ? null : (pnum(feeText) as number) / 100) : feeDefault;
  const occupancy = data.months.map((m, i) => (occ[m.month] !== undefined ? (pnum(occ[m.month] as string) === null ? null : (pnum(occ[m.month] as string) as number) / 100) : facts[i]!.lyOccupancy));
  const result = calculate(data.months, {
    targetNet: pnum(mem.target), expensesPerMonth: mem.useExpenses ? exp.total : 0, overheadPerMonth: pnum(mem.overhead) ?? 0, feeRate, occupancy,
    minPrice: pnum(mem.minPrice), maxPrice: pnum(mem.maxPrice),
  });
  const stays = staysUsed(data.months);
  const prefillFrom = data.from > today ? data.from : today;
  const why: Record<string, string> = {
    no_target: 'Enter what you want to keep over this period.', no_fee: 'No Airbnb fee is on record: enter the fee (%).', bad_fee: 'The fee must be between 0% and 99%.',
    no_months: 'No month has an expected occupancy yet: enter one in the table below.', no_nights: 'Every month is at 0% occupancy, so there is no night to price.',
  };
  const applyLink = (price: number | null, label: string) => price === null ? null : canPublish
    ? <Link className="text-sm underline underline-offset-2" to={prefillPath(price, prefillFrom)}>{label}</Link>
    : <span className="text-xs text-muted-foreground">Only an owner or admin can open Rate settings.</span>;

  return (
    <>
      <Section title="What you want to keep">
        <div className="flex flex-wrap gap-4">
          <div><Label htmlFor="pa-target">Net earning for the whole period (PHP)</Label><Input id="pa-target" inputMode="numeric" className="w-48 text-base sm:text-sm" value={mem.target} onChange={(e) => setMem({ ...mem, target: e.target.value })} placeholder="e.g. 60000" /></div>
          <div><Label htmlFor="pa-over">Fixed overheads per month (PHP)</Label><Input id="pa-over" inputMode="numeric" className="w-44 text-base sm:text-sm" value={mem.overhead} onChange={(e) => setMem({ ...mem, overhead: e.target.value })} placeholder="0" /></div>
          <div><Label htmlFor="pa-fee">Platform fee (%)</Label><Input id="pa-fee" inputMode="decimal" className="w-28 text-base sm:text-sm" value={feeText} onChange={(e) => setFeeText(e.target.value)} placeholder={feeDefault === null ? 'enter' : (feeDefault * 100).toFixed(1)} /></div>
          <div><Label htmlFor="pa-min">Lowest price (PHP)</Label><Input id="pa-min" inputMode="numeric" className="w-32 text-base sm:text-sm" value={mem.minPrice} onChange={(e) => setMem({ ...mem, minPrice: e.target.value })} /></div>
          <div><Label htmlFor="pa-max">Highest price (PHP)</Label><Input id="pa-max" inputMode="numeric" className="w-32 text-base sm:text-sm" value={mem.maxPrice} onChange={(e) => setMem({ ...mem, maxPrice: e.target.value })} /></div>
        </div>
        <p className="text-xs text-muted-foreground">
          The fee starts at what Airbnb kept last year, scaled by the share of nights that came through Airbnb ({data.airbnbFee.stays} stays on record). Direct bookings pay no platform fee.
          {' '}Built on {stays} stay{stays === 1 ? '' : 's'} from last year{stays < 10 ? ': thin, so treat the result as a rough guide' : ''}.
        </p>
      </Section>

      <Section title="Expenses" aside={<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mem.useExpenses} onChange={(e) => setMem({ ...mem, useExpenses: e.target.checked })} /> Include expenses</label>}>
        {data.expenses.categories.length === 0 ? <p className="text-sm text-muted-foreground">No expenses are on record for the 12 months before this period.</p> : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="text-xs text-muted-foreground"><tr><th className="p-2">Include</th><th>Category</th><th>Per month (PHP)</th><th>On record</th></tr></thead>
              <tbody className="tabular">
                {expenseLines.map((l) => (
                  <tr key={l.category} className="border-t">
                    <td className="p-2"><input type="checkbox" aria-label={`Include ${l.category}`} checked={l.include} disabled={!mem.useExpenses} onChange={(e) => setLines({ ...lines, [l.category]: { ...lines[l.category], include: e.target.checked } })} /></td>
                    <td>{l.category.replace(/_/g, ' ')}</td>
                    <td><Input aria-label={`${l.category} per month`} inputMode="decimal" className="h-8 w-28 text-base sm:text-sm" disabled={!mem.useExpenses || !l.include}
                      value={lines[l.category]?.monthly ?? (l.monthly === null ? '' : String(Math.round(l.monthly)))} onChange={(e) => setLines({ ...lines, [l.category]: { ...lines[l.category], monthly: e.target.value } })} /></td>
                    <td className="text-muted-foreground">{l.rows} row{l.rows === 1 ? '' : 's'}{l.estimateShare > 0.5 ? ' · mostly estimates' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Monthly average of the {data.expenses.monthsCovered ?? '—'} months on record up to {data.expenses.windowEnd ?? '—'}{data.accountingStart ? `. Rows before ${data.accountingStart} are estimates (the books were not clean yet)` : ''}.
          {' '}Balancing entries, refunds to guests and Airbnb adjustments start switched off.
          {mem.useExpenses && exp.missing > 0 ? ` ${exp.missing} included categor${exp.missing === 1 ? 'y has' : 'ies have'} no amount: enter one.` : ''}
        </p>
      </Section>

      <Section title="Month by month">
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr><th className="p-2">Month</th><th>Last year</th><th>Expected occupancy (%)</th><th>Held nights</th><th>Expected nights</th><th>Paid out per night last year</th><th>Standard rate now</th><th>Suggested price</th></tr>
            </thead>
            <tbody className="tabular">
              {data.months.map((m, i) => {
                const f = facts[i]!, p = result.months[i]!;
                const promos = card ? promosInMonth(card.promotions, m.month) : [];
                return (
                  <tr key={m.month} className="border-t align-top">
                    <td className="p-2 font-medium">{monthLabel(m.month)}</td>
                    <td className="py-2">
                      {f.lyOccupancy === null ? <StatusBadge tone="warn">no history</StatusBadge> : `${Math.round(f.lyOccupancy * 100)}% (${f.lyOccupied} of ${f.lySellable} nights)`}
                      <div className="text-xs text-muted-foreground">{m.lyStays} stay{m.lyStays === 1 ? '' : 's'}{f.partial ? ' · month only partly on record' : ''}</div>
                    </td>
                    <td><Input aria-label={`${monthLabel(m.month)} expected occupancy`} inputMode="decimal" className="h-8 w-20 text-base sm:text-sm" value={occ[m.month] ?? pct(f.lyOccupancy)} onChange={(e) => setOcc({ ...occ, [m.month]: e.target.value })} placeholder="enter" /></td>
                    <td>{m.heldNights}{m.heldNights > 0 && <div className="text-xs text-muted-foreground">not sellable</div>}</td>
                    <td>{p.nights === null ? '—' : p.nights.toFixed(1)}</td>
                    <td>{peso(f.lyAvgPayout)}</td>
                    <td>
                      {card ? peso(baseInForce(card, m.month)) : '—'}
                      {promos.map((x) => <div key={x.name + x.first_night} className="text-xs text-muted-foreground">{x.name}: {peso(x.nightly_rate)}</div>)}
                    </td>
                    <td>
                      {!result.ok ? '—' : p.price === null ? (p.included ? 'nothing to price' : 'left out') : <><span className="font-semibold">{peso(p.price)}</span>{p.clamped && <div className="text-xs text-muted-foreground">held at your {p.clamped === 'min' ? 'lowest' : 'highest'} price</div>}</>}
                      {result.ok && p.price !== null && <div>{applyLink(p.price, 'Use in Rate settings')}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {result.excluded.length > 0 && <p className="text-xs text-muted-foreground">Left out until you enter an expected occupancy: {result.excluded.map(monthLabel).join(', ')}. Their expenses are left out too.</p>}
      </Section>

      <Section title="Suggested price">
        {!result.ok ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{why[result.reason ?? ''] ?? 'Not enough to work out a price.'}</p> : (
          <div className="space-y-3 rounded-lg border p-4 text-sm">
            <p><span className="text-2xl font-semibold tabular">{peso(result.flat)}</span> a night, the same all period{result.flatClamped ? ` (held at your ${result.flatClamped === 'min' ? 'lowest' : 'highest'} price)` : ''}. {applyLink(result.flat, 'Open Rate settings with this price')}</p>
            <ol className="space-y-1 tabular">
              {result.lines.map((l) => <li key={l.label} className="flex flex-wrap justify-between gap-2 border-b py-1 last:border-0"><span>{l.label}{l.note ? <span className="text-xs text-muted-foreground"> · {l.note}</span> : null}</span><span>{l.label.startsWith('Expected nights') ? l.value?.toFixed(1) : peso(l.value)}</span></li>)}
            </ol>
            <p className="text-xs text-muted-foreground">
              The seasonal prices in the table share the same total: a month that sells half as often is priced half as high. At the rounded prices the period keeps about {peso(result.projectedNetFlat)} (flat) or {peso(result.projectedNetSeasonal)} (seasonal), against your {peso(pnum(mem.target))}.
              Nights held for brownouts, maintenance or owner use are not counted as sellable. This is a guide: Airbnb prices are set on Airbnb.
            </p>
          </div>
        )}
      </Section>
      <p className="text-xs text-muted-foreground">Last year is read for {addMonths(data.from, -12).slice(0, 7)} to {addMonths(data.to, -12).slice(0, 7)}{data.historyStart ? `; the first stay on record is ${data.historyStart}` : '; no stays are on record yet'}.</p>
    </>
  );
}
