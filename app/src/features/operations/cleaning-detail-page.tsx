import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Camera, ClipboardList, Gauge, Sparkles } from 'lucide-react';
import { useSession } from '@/auth/session';
import { formatDate, formatDateTime, todayManila } from '@/lib/dates';
import { formatPHP } from '@/lib/money';
import { toAppError } from '@/lib/errors';
import { Section } from '@/components/data/page-header';
import { EmptyState, QueryState } from '@/components/data/query-state';
import { Field } from '@/components/data/detail-sheet';
import { CopyButton } from '@/components/data/copy-button';
import { StatusBadge } from '@/components/data/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUndoToast } from '@/lib/undo';
import { Input } from '@/components/ui/input';
import { METER_FLAGS, fetchCleaningDetail, reviewEvidence, reviewMeterReading, reviewReadiness } from './api';

// CLN02-CLN05. Evidence is linked by submission identity; advisory findings
// are shown as advisory; readiness needs a human decision with a reason for
// overrides. An unreadable meter photo is uncertainty, not misconduct.

type ChecklistItem = { text?: string; checked?: unknown; critical?: unknown };
type ChecklistSection = { icon?: string; title?: string; items?: ChecklistItem[] };

// The cleaner app stores checklist_details as sections with icon/title/items
// (confirmed uniform across every stored submission), not a flat {label, done}
// list. The old renderer expected the latter and fell back to a bare array
// index for every section, which is why it showed "0 1 2 3 4" with no text.
function ChecklistView({ details }: { details: unknown }) {
  if (!details || typeof details !== 'object') return <p className="text-sm text-muted-foreground">No checklist detail stored.</p>;
  const sections = Array.isArray(details) ? (details as ChecklistSection[]) : null;
  const looksSectioned = sections?.every((s) => Array.isArray(s?.items));
  if (!sections || !looksSectioned) {
    // Fallback for any other stored shape: flat {label|id, done|value} entries.
    const entries: Array<[string, unknown]> = Array.isArray(details)
      ? (details as unknown[]).map((e, i) => {
          const o = e as { id?: string; label?: string; done?: unknown; value?: unknown };
          return [String(o.label ?? o.id ?? i), o.done ?? o.value];
        })
      : Object.entries(details as Record<string, unknown>);
    return (
      <ul className="grid gap-1 text-sm sm:grid-cols-2">
        {entries.slice(0, 200).map(([k, v], i) => {
          const ok = v === true || v === 'done' || v === 'yes';
          return (
            <li key={i} className="flex items-start gap-2">
              <span aria-hidden className="mt-0.5 text-xs">{ok ? '✓' : v === false ? '✕' : '○'}</span>
              <span className="min-w-0 break-words">{k}{typeof v === 'string' && !ok ? `: ${v}` : ''}</span>
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <div className="space-y-4">
      {sections.map((s, si) => {
        const items = s.items ?? [];
        const done = items.filter((it) => it.checked === true).length;
        return (
          <div key={si}>
            <p className="mb-1 text-sm font-medium">{s.icon ? `${s.icon} ` : ''}{s.title ?? `Section ${si + 1}`} <span className="text-xs font-normal text-muted-foreground">({done}/{items.length})</span></p>
            <ul className="grid gap-1 text-sm sm:grid-cols-2">
              {items.map((it, ii) => {
                const ok = it.checked === true;
                const critical = it.critical === true;
                return (
                  <li key={ii} className={`flex items-start gap-2 ${!ok && critical ? 'text-destructive' : ''}`}>
                    <span aria-hidden className="mt-0.5 text-xs">{ok ? '✓' : '✕'}</span>
                    <span className="min-w-0 break-words">{it.text ?? ''}{!ok && critical ? ' (critical)' : ''}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export default function CleaningDetailPage() {
  const { id = '' } = useParams();
  const s = useSession();
  const nav = useNavigate();
  const qc = useQueryClient();
  const canFees = s.caps.can('read_finance');
  const canInspect = s.caps.can('inspect_cleaning');
  const canOverride = s.caps.can('manage_operations');
  const query = useQuery({ queryKey: ['cleaning', s.propertyId, id, canFees], queryFn: () => fetchCleaningDetail(s.propertyId, id, canFees) });
  const [outcome, setOutcome] = useState<'ready' | 'not_ready' | 'override_ready'>('ready');
  const [reason, setReason] = useState('');
  const [evReason, setEvReason] = useState('');
  const [meterFlag, setMeterFlag] = useState<Record<string, string>>({});
  const [meterReason, setMeterReason] = useState<Record<string, string>>({});
  const undoToast = useUndoToast();
  const meterReview = useMutation({
    mutationFn: (p: { id: string; flag: string | null; reason: string }) => reviewMeterReading(p.id, p.flag, p.reason),
    onSuccess: (r) => {
      undoToast(r.flag ? `Reading flagged: ${r.flag.replaceAll('_', ' ')}` : 'Reading flag cleared', r.auditId, 'Flagged rows are left out of the utilities chart.');
      void qc.invalidateQueries({ queryKey: ['cleaning'] });
      void qc.invalidateQueries({ queryKey: ['utility-months'] });
      void qc.invalidateQueries({ queryKey: ['audit-feed'] });
    },
    onError: (e) => toast.error(toAppError(e).message),
  });

  const readiness = useMutation({
    mutationFn: (forCheckin: string) => reviewReadiness(s.propertyId, forCheckin, outcome, reason, id),
    onSuccess: (r) => {
      toast.success(`Readiness recorded: ${r.outcome.replace('_', ' ')}`, { description: `${formatDateTime(new Date().toISOString())} · ${r.openBlockers} blocking work orders open` });
      setReason('');
      void qc.invalidateQueries({ queryKey: ['cleaning'] });
      void qc.invalidateQueries({ queryKey: ['overview'] });
    },
    onError: (e) => toast.error(toAppError(e).message),
  });
  const evidence = useMutation({
    mutationFn: (p: { id: string; outcome: 'reviewed' | 'follow_up_required' | 'resolved' }) => reviewEvidence(p.id, p.outcome, evReason),
    onSuccess: () => {
      toast.success('Evidence review recorded');
      setEvReason('');
      void qc.invalidateQueries({ queryKey: ['cleaning'] });
    },
    onError: (e) => toast.error(toAppError(e).message),
  });

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => nav(-1)}><ArrowLeft className="size-4" aria-hidden /> Back</Button>
      <QueryState query={query}>
        {(d) => {
          const c = d.session;
          const nextCheckin = c.checkout_date ?? todayManila();
          const followUp = d.evidence.some((e) => e.reviews.some((r) => r.outcome === 'follow_up_required'));
          const anyReviewed = d.evidence.some((e) => e.reviews.length > 0);
          return (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-5 shadow-sm">
                <div className="flex items-start gap-4">
                  <div aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Sparkles className="size-6" aria-hidden /></div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-xl font-semibold tracking-tight">{c.last_guest_name ?? 'Cleaning'}</h1>
                      <StatusBadge tone={c.is_complete ? 'good' : c.is_complete === false ? 'warn' : 'neutral'}>{c.is_complete === null ? 'unknown' : c.is_complete ? 'complete' : 'incomplete'}</StatusBadge>
                    </div>
                    <p className="mt-0.5 inline-flex items-center gap-1 text-sm text-muted-foreground">Submission {c.submission_id}<CopyButton value={c.submission_id} /></p>
                    <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="tabular">{formatDateTime(c.cleaned_at)}</span>
                      <span>{c.cleaner_name}{c.cleaning_type ? ` · ${c.cleaning_type}` : ''}</span>
                    </p>
                  </div>
                </div>
              </div>
              {/* @5xl/main measures the actual content width left after the sidebar,
                  not the raw viewport - lg: alone went 3-up while there was still too
                  little room for this card's own label+value grid, forcing every word
                  in Notes onto its own line (reproduced live at 1040px viewport). */}
              <div className="grid gap-4 @5xl/main:grid-cols-3">
                <Card className="py-4 gap-3">
                  <CardHeader><CardTitle className="flex items-center gap-2"><ClipboardList className="size-4 text-muted-foreground" aria-hidden /> States</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    <Field label="Submission"><StatusBadge tone={c.is_complete ? 'good' : c.is_complete === false ? 'warn' : 'neutral'}>{c.is_complete === null ? 'unknown' : c.is_complete ? 'complete' : 'incomplete'}</StatusBadge></Field>
                    <Field label="Checklist">{c.completion_pct !== null ? `${Number(c.completion_pct).toFixed(0)}%` : 'not recorded'}</Field>
                    <Field label="Evidence">{d.evidence.length === 0 ? 'no verification evidence' : `${d.evidence.length} items, ${d.evidence.filter((e) => e.reviews.length > 0).length} reviewed`}</Field>
                    <Field label="Inspector review">{followUp ? 'follow-up required' : anyReviewed ? 'reviewed' : 'pending'}</Field>
                    <Field label="Readiness">{d.readiness[0] ? `${d.readiness[0].outcome.replace('_', ' ')} · ${formatDateTime(d.readiness[0].reviewed_at)}` : 'not reviewed'}</Field>
                    <Field label="Cleaner fee">{canFees ? (c.fee_amount ? `${formatPHP(c.fee_amount)} · ${c.fee_paid_at ? `paid ${formatDateTime(c.fee_paid_at)}` : 'accrued, unpaid'}` : 'no fee recorded') : 'restricted'}</Field>
                    {c.incomplete_reasons?.length ? <Field label="Incomplete"><ul className="list-disc pl-4">{c.incomplete_reasons.map((r) => <li key={r}>{r}</li>)}</ul></Field> : null}
                    <Field label="Issues">{c.issue_count ? <StatusBadge tone="warn">{c.issue_count} issue{c.issue_count > 1 ? 's' : ''}</StatusBadge> : 'none reported'}</Field>
                    {c.notes && (
                      <Field label="Notes">
                        <div className="space-y-0.5">
                          {c.notes.split('\n').map((line, i) => (
                            <p key={i} className={line.includes('[URGENT]') ? 'font-medium text-destructive' : undefined}>{line}</p>
                          ))}
                        </div>
                      </Field>
                    )}
                  </CardContent>
                </Card>
                <Card className="py-4 gap-3">
                  <CardHeader><CardTitle className="flex items-center gap-2"><Gauge className="size-4 text-muted-foreground" aria-hidden /> Meters</CardTitle></CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {d.meters.length === 0 ? <p className="text-muted-foreground">No meter readings on this submission.</p> : d.meters.map((m) => (
                      <div key={m.id} className="space-y-1">
                        <p className="tabular">Electric {m.electric_prev ?? '—'} → {m.electric_curr ?? '—'} (Δ {m.electric_delta ?? '—'} kWh, {m.kwh_per_night ?? '—'}/night)</p>
                        <p className="tabular">Water {m.water_prev ?? '—'} → {m.water_curr ?? '—'} (Δ {m.water_delta ?? '—'} m³, {m.m3_per_night ?? '—'}/night)</p>
                        {m.meter_flag && <StatusBadge tone="warn">flag: {m.meter_flag.replaceAll('_', ' ')}</StatusBadge>}
                        {m.meter_override_note && <p className="text-muted-foreground">Note: {m.meter_override_note}</p>}
                        {canInspect && (
                          <div className="flex flex-wrap items-end gap-1.5">
                            <Select value={meterFlag[m.id] ?? m.meter_flag ?? 'none'} onValueChange={(v) => setMeterFlag({ ...meterFlag, [m.id]: v })}>
                              <SelectTrigger className="h-8 w-40 text-xs" aria-label="Meter flag"><SelectValue /></SelectTrigger>
                              <SelectContent><SelectItem value="none">no flag</SelectItem>{METER_FLAGS.map((f) => <SelectItem key={f} value={f}>{f.replaceAll('_', ' ')}</SelectItem>)}</SelectContent>
                            </Select>
                            <Input aria-label="Meter review reason" placeholder="Reason" className="h-8 w-44 text-xs" value={meterReason[m.id] ?? ''} onChange={(e) => setMeterReason({ ...meterReason, [m.id]: e.target.value })} />
                            <Button size="sm" variant="outline" className="h-8" disabled={(meterReason[m.id] ?? '').trim().length < 3 || meterReview.isPending} onClick={() => meterReview.mutate({ id: m.id, flag: (meterFlag[m.id] ?? m.meter_flag ?? 'none') === 'none' ? null : (meterFlag[m.id] ?? m.meter_flag!), reason: meterReason[m.id] ?? '' })}>Review</Button>
                          </div>
                        )}
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground">Arithmetic and vision checks are advisory. They never block a submission.</p>
                  </CardContent>
                </Card>
                <Card className="py-4 gap-3">
                  <CardHeader><CardTitle className="flex items-center gap-2"><Camera className="size-4 text-muted-foreground" aria-hidden /> Photos</CardTitle></CardHeader>
                  <CardContent className="text-sm">
                    <p className="text-muted-foreground">Counts from the submission: {c.preclean_photo_count ?? 0} before · {c.afterclean_photo_count ?? 0} after · {c.meter_photo_count ?? 0} meter · {c.other_photo_count ?? 0} other.</p>
                    {d.photos === 'unavailable' ? <p className="mt-2 text-muted-foreground">Storage listing unavailable for this session.</p> : d.photos.length === 0 ? <p className="mt-2 text-muted-foreground">No photo objects found for this submission.</p> : (
                      <div className="mt-2 max-h-64 space-y-3 overflow-auto">
                        {(['meter', 'before', 'after', 'other'] as const).map((section) => {
                          const shots = d.photos === 'unavailable' ? [] : d.photos.filter((p) => p.section === section);
                          if (shots.length === 0) return null;
                          return (
                            <div key={section}>
                              <p className="mb-1 text-xs font-medium capitalize text-muted-foreground">{section} ({shots.length})</p>
                              <div className="flex flex-wrap gap-1.5">
                                {shots.map((p) => p.url ? (
                                  <a key={p.href ?? p.name} href={p.href ?? p.url} target="_blank" rel="noreferrer" title={p.name}>
                                    <img src={p.url} alt="" loading="lazy" className="size-16 rounded border object-cover" />
                                  </a>
                                ) : (
                                  <span key={p.name} className="max-w-24 truncate rounded border px-1.5 py-1 text-xs" title={p.name}>{p.name}</span>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Section title="Checklist">
                <ChecklistView details={c.checklist_details} />
              </Section>

              <Section title="Verification evidence (advisory)">
                {d.evidence.length === 0 ? <EmptyState title="No verification evidence recorded" hint="Evidence rows are written by the meter photo sweep; their absence means no check ran, not that everything is fine." /> : (
                  <ul className="divide-y rounded-lg border text-sm">
                    {d.evidence.map((e) => (
                      <li key={e.id} className="space-y-2 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{e.evidence_kind}</span>
                          <StatusBadge tone={e.advisory_result === 'ok' ? 'good' : e.advisory_result === 'unreadable' ? 'neutral' : 'warn'}>{e.advisory_result ?? 'no result'}</StatusBadge>
                          <span className="text-xs text-muted-foreground">{formatDateTime(e.created_at)} {e.advisory_reason_codes?.length ? `· ${e.advisory_reason_codes.join(', ')}` : ''}</span>
                        </div>
                        {e.reviews.map((r) => <p key={r.id} className="text-xs text-muted-foreground">Review: {r.outcome.replaceAll('_', ' ')} · {formatDateTime(r.reviewed_at)}{r.reason ? ` · ${r.reason}` : ''}</p>)}
                        {canInspect && e.reviews.length === 0 && (
                          <div className="flex flex-wrap items-end gap-2">
                            <div className="min-w-60 flex-1"><Label htmlFor={`ev-${e.id}`} className="text-xs">Reason</Label><Textarea id={`ev-${e.id}`} rows={1} value={evReason} onChange={(ev) => setEvReason(ev.target.value)} className="text-base sm:text-sm" /></div>
                            <Button size="sm" variant="outline" disabled={evReason.trim().length < 3 || evidence.isPending} onClick={() => evidence.mutate({ id: e.id, outcome: 'reviewed' })}>Mark reviewed</Button>
                            <Button size="sm" variant="outline" disabled={evReason.trim().length < 3 || evidence.isPending} onClick={() => evidence.mutate({ id: e.id, outcome: 'follow_up_required' })}>Needs follow-up</Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Readiness decision">
                {d.readiness.length > 0 && (
                  <ul className="mb-2 text-sm">{d.readiness.map((r) => <li key={r.id}>{formatDateTime(r.reviewed_at)} · <strong>{r.outcome.replace('_', ' ')}</strong> for {formatDate(r.for_checkin_date, 'long')}{r.reason ? ` · ${r.reason}` : ''}</li>)}</ul>
                )}
                {canInspect ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <div>
                      <Label className="text-xs">Outcome</Label>
                      <Select value={outcome} onValueChange={(v) => setOutcome(v as typeof outcome)}>
                        <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ready">Ready for arrival</SelectItem>
                          <SelectItem value="not_ready">Not ready</SelectItem>
                          {canOverride && <SelectItem value="override_ready">Override: ready despite blockers</SelectItem>}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="min-w-60 flex-1"><Label htmlFor="rd-reason" className="text-xs">Reason {outcome === 'override_ready' ? '(required)' : '(optional)'}</Label><Textarea id="rd-reason" rows={1} value={reason} onChange={(e) => setReason(e.target.value)} className="text-base sm:text-sm" /></div>
                    <Button className="min-h-10" disabled={readiness.isPending || (outcome === 'override_ready' && reason.trim().length < 3)} onClick={() => readiness.mutate(nextCheckin)}>Record for {formatDate(nextCheckin)}</Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Readiness decisions need the inspector, admin or owner role.</p>
                )}
              </Section>
            </div>
          );
        }}
      </QueryState>
    </div>
  );
}
