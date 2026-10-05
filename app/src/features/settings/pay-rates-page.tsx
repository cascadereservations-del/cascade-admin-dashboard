import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSession } from '@/auth/session';
import { addIsoDays, formatDate } from '@/lib/dates';
import { formatPHP } from '@/lib/money';
import { toAppError } from '@/lib/errors';
import { PageHeader, Section } from '@/components/data/page-header';
import { QueryState } from '@/components/data/query-state';
import { StatusBadge } from '@/components/data/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { addPayRate, describeRate, earliestStart, fetchPayRates, rateProblem, type PayRates } from './pay-rates-api';

// D-301: the cleaning fee and the transport fee have ONE source, cleaner_rate_schedule. The staff app and payment requests read
// the row in force on the clean's date. A change here ADDS a dated row (history is kept, never overwritten, audited).

const num = (v: string) => (v.trim() === '' ? NaN : Number(v));

export default function PayRatesPage() {
  const s = useSession();
  const rates = useQuery({ queryKey: ['pay-rates', s.propertyId], queryFn: () => fetchPayRates(s.propertyId) });
  return (
    <div className="space-y-8">
      <PageHeader
        title="Pay rates"
        description="What a clean and its transport pay. The staff app and payment requests use these rates: a request reads the rate in force on the date of the clean."
      />
      <QueryState query={rates}>{(r) => <Rates data={r} propertyId={s.propertyId} />}</QueryState>
    </div>
  );
}

function Rates({ data, propertyId }: { data: PayRates; propertyId: string }) {
  const qc = useQueryClient();
  const earliest = earliestStart(data.history, data.today, addIsoDays);
  const [from, setFrom] = useState(earliest);
  const [regular, setRegular] = useState('');
  const [general, setGeneral] = useState('');
  const [transport, setTransport] = useState('');
  const [note, setNote] = useState('');
  const input = { effectiveFrom: from, regular: num(regular), general: num(general), transport: transport.trim() === '' ? null : num(transport), note };
  const problem = rateProblem(input, earliest, data.today, addIsoDays);
  const save = useMutation({
    mutationFn: () => addPayRate(propertyId, input),
    onSuccess: () => {
      toast.success(`New rate saved from ${from}`);
      setRegular(''); setGeneral(''); setTransport(''); setNote('');
      void qc.invalidateQueries({ queryKey: ['pay-rates'] });
      void qc.invalidateQueries({ queryKey: ['audit-feed'] });
    },
    onError: (e) => toast.error(toAppError(e).message),
  });
  const cur = data.in_force;
  return (
    <>
      <Section title="In force today">
        {cur ? (
          <div className="rounded-lg border p-4 text-sm">
            <p className="text-lg font-semibold tabular">{describeRate(cur)}</p>
            <p className="mt-1 text-muted-foreground">Since {formatDate(cur.effective_from, 'long')}{cur.note ? ` · ${cur.note}` : ''}</p>
            {cur.transport_rate === null && <p className="mt-1 text-muted-foreground">Transport is already part of the fee, so staff see no transport switch for cleans on these dates.</p>}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No rate is in force today. Add one below.</p>
        )}
        {data.next && (
          <p className="text-sm"><StatusBadge tone="info">scheduled</StatusBadge> {describeRate(data.next)} · starts {formatDate(data.next.effective_from, 'long')}</p>
        )}
      </Section>

      <Section title="Add a new rate">
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">This adds a new line starting on the date you pick. Earlier dates keep the rate they had; nothing is overwritten.</p>
          <div className="flex flex-wrap gap-4">
            <div><Label htmlFor="pr-from">Starts on</Label><Input id="pr-from" type="date" min={earliest} className="w-44 text-base sm:text-sm" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><Label htmlFor="pr-regular">Per clean (PHP)</Label><Input id="pr-regular" inputMode="decimal" className="w-32 text-base sm:text-sm" value={regular} onChange={(e) => setRegular(e.target.value)} placeholder={cur?.regular_rate !== null && cur?.regular_rate !== undefined ? String(cur.regular_rate) : ''} /></div>
            <div><Label htmlFor="pr-general">Per deep clean (PHP)</Label><Input id="pr-general" inputMode="decimal" className="w-32 text-base sm:text-sm" value={general} onChange={(e) => setGeneral(e.target.value)} placeholder={cur?.general_rate !== null && cur?.general_rate !== undefined ? String(cur.general_rate) : ''} /></div>
            <div><Label htmlFor="pr-transport">Transport (PHP)</Label><Input id="pr-transport" inputMode="decimal" className="w-32 text-base sm:text-sm" value={transport} onChange={(e) => setTransport(e.target.value)} placeholder="included" /></div>
          </div>
          <p className="text-xs text-muted-foreground">Leave transport empty when the fee already includes it. Otherwise staff get a switch for it on each clean.</p>
          <div><Label htmlFor="pr-note">Why (kept in the audit history)</Label><Textarea id="pr-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Honey agreed 500 plus 150 transport from Oct 1" /></div>
          {problem && regular + general + note !== '' && <p role="alert" className="text-sm text-destructive">{problem}</p>}
          <Button disabled={!!problem || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save new rate'}</Button>
        </div>
      </Section>

      <Section title="History">
        <ul className="divide-y rounded-lg border text-sm tabular">
          {data.history.map((h) => (
            <li key={h.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2">
              <span className="w-28 font-medium">{formatDate(h.effective_from, 'long')}</span>
              <span>{formatPHP(h.regular_rate, { whole: true })} / {formatPHP(h.general_rate ?? h.regular_rate, { whole: true })} / {h.transport_rate === null ? 'transport included' : formatPHP(h.transport_rate, { whole: true })}</span>
              {h.note && <span className="text-muted-foreground">{h.note}</span>}
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
