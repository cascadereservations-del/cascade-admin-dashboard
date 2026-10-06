import { useState } from 'react';
import { formatDate } from '@/lib/dates';
import { StatusBadge, type Tone } from '@/components/data/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { METER_FLAGS, type CleaningDetail } from './api';
import { STATUS_LABEL, assessMeter, flagLabel, fmtUsage, type Status, type UsageLine } from './meter-context';

const TONE: Record<Status, Tone> = { normal: 'good', high: 'warn', low: 'info', check: 'bad', unknown: 'neutral' };

function UsageRow({ line, prev, curr }: { line: UsageLine; prev: string | null; curr: string | null }) {
  const name = line.kind === 'electric' ? 'Electric' : 'Water';
  const dp = line.kind === 'electric' ? 1 : 3;
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 border-t pt-2 first:border-t-0 first:pt-0">
      <span className="font-medium">{name}</span>
      <div className="min-w-0">
        <p className="tabular">{prev ?? '—'} → {curr ?? '—'}
          {line.delta !== null && <span className="ml-1 font-medium">+{fmtUsage(line.delta, line.kind)} {line.unit}</span>}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {line.perNight !== null && <span className="tabular">{fmtUsage(line.perNight, line.kind)} {line.unit}/night</span>}
          {line.band && <span className="tabular">usual {fmtUsage(line.band.low, line.kind)}–{fmtUsage(line.band.high, line.kind)} (median {Number(line.band.median.toFixed(dp))}, last {line.band.n} stays)</span>}
          <StatusBadge tone={TONE[line.status]} className="px-1.5 py-0 text-xs">{STATUS_LABEL[line.status]}</StatusBadge>
        </p>
      </div>
    </div>
  );
}

// One meter reading in context: which stay it covers, usage per night against this property's
// recent normal, a status chip with a one-line why, and (for inspectors) a plain-language flag.
export function MeterReadingBlock({ m, stay, baseline, canInspect, pending, onReview }: {
  m: CleaningDetail['meters'][number];
  stay: Pick<CleaningDetail['session'], 'nights_stayed' | 'checkin_date' | 'checkout_date'>;
  baseline: { kwh: number[]; m3: number[] };
  canInspect: boolean;
  pending: boolean;
  onReview: (p: { id: string; flag: string | null; reason: string }) => void;
}) {
  const a = assessMeter(m, stay, baseline);
  const [flag, setFlag] = useState(m.meter_flag ?? 'none');
  const [reason, setReason] = useState('');
  const stayText = stay.checkin_date && stay.checkout_date ? `${formatDate(stay.checkin_date)} → ${formatDate(stay.checkout_date)}` : 'Stay dates not recorded';
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Covers the stay {stayText}{a.nights ? ` · ${a.nights} ${a.nights === 1 ? 'night' : 'nights'}` : ''}</p>
        <StatusBadge tone={TONE[a.status]}>{STATUS_LABEL[a.status]}</StatusBadge>
      </div>
      <p className="text-xs">{a.why}</p>
      <div className="space-y-2">
        <UsageRow line={a.electric} prev={m.electric_prev} curr={m.electric_curr} />
        <UsageRow line={a.water} prev={m.water_prev} curr={m.water_curr} />
      </div>
      {m.meter_flag && <StatusBadge tone="warn">flagged: {flagLabel(m.meter_flag)}</StatusBadge>}
      {m.meter_override_note && <p className="text-muted-foreground">Note: {m.meter_override_note}</p>}
      {canInspect && (
        <div className="space-y-1.5 border-t pt-2">
          <p className="text-xs font-medium">Your review (optional)</p>
          <Select value={flag} onValueChange={setFlag}>
            <SelectTrigger className="h-auto min-h-8 w-full whitespace-normal text-left text-xs" aria-label="Meter flag"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="none">{flagLabel('none')}</SelectItem>{METER_FLAGS.map((f) => <SelectItem key={f} value={f}>{flagLabel(f)}</SelectItem>)}</SelectContent>
          </Select>
          <div className="flex flex-wrap items-center gap-1.5">
            <Input aria-label="Meter review reason" placeholder="Why? (a few words, required)" className="h-8 min-w-40 flex-1 text-xs" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button size="sm" variant="outline" className="h-8" disabled={reason.trim().length < 3 || pending} onClick={() => onReview({ id: m.id, flag: flag === 'none' ? null : flag, reason })}>Save review</Button>
          </div>
          <p className="text-xs text-muted-foreground">Flagging keeps the reading but leaves it out of the utilities chart. The numbers are never edited; your reason is logged.</p>
        </div>
      )}
    </div>
  );
}
