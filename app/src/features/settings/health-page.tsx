import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSession } from '@/auth/session';
import { formatDateTime } from '@/lib/dates';
import { toAppError } from '@/lib/errors';
import { PageHeader, Section } from '@/components/data/page-header';
import { QueryState } from '@/components/data/query-state';
import { StatusBadge } from '@/components/data/status-badge';
import { Button } from '@/components/ui/button';
import { ackVerifierFinding, fetchHealth, fetchHealthRuns, fetchVerifierFindings, runHealthChecks } from './api';

// Cross-tab checks (session 12): ledger vs reservations vs payouts vs cleaning
// log vs meters vs inventory. Each is a read-only query on the server; the
// button runs them all and keeps the last result per check.
function ChecksSection() {
  const s = useSession();
  const qc = useQueryClient();
  const runs = useQuery({ queryKey: ['health-runs', s.propertyId], queryFn: () => fetchHealthRuns(s.propertyId) });
  const run = useMutation({
    mutationFn: () => runHealthChecks(s.propertyId),
    onSuccess: (r) => { toast.success(`${r.checks.length} checks ran`, { description: formatDateTime(r.ranAt) }); void qc.invalidateQueries({ queryKey: ['health-runs'] }); },
    onError: (e) => toast.error(toAppError(e).message),
  });
  return (
    <Section title="Verification checks" aside={<Button size="sm" onClick={() => run.mutate()} disabled={run.isPending}>{run.isPending ? 'Running…' : 'Run all checks'}</Button>}>
      {runs.isPending ? <p className="text-sm text-muted-foreground">Loading…</p> : runs.isError ? <p className="text-sm text-destructive">{toAppError(runs.error).message}</p> : runs.data.rows.length === 0 ? <p className="text-sm text-muted-foreground">No check has run yet. Run all checks to compare the ledger, reservations, payouts, cleaning log, meters and inventory.</p> : (
        <ul className="divide-y rounded-lg border text-sm">
          {runs.data.rows.map((c) => {
            const detail = c.detail as Record<string, unknown> | unknown[] | null;
            const sample = Array.isArray(detail) ? detail : null;
            return (
              <li key={c.check_key} className="space-y-1 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={c.status === 'pass' ? 'good' : c.status === 'warn' ? 'warn' : 'bad'}>{c.status}</StatusBadge>
                  <span className="font-medium">{c.label}</span>
                  {c.count > 0 && <span className="tabular text-xs text-muted-foreground">{c.count} row{c.count === 1 ? '' : 's'}</span>}
                  <span className="ml-auto text-xs text-muted-foreground">last run {formatDateTime(c.ran_at)}</span>
                </div>
                {sample && sample.length > 0 && <details className="text-xs text-muted-foreground"><summary>{sample.length} example{sample.length === 1 ? '' : 's'}</summary><pre className="max-h-48 overflow-auto">{JSON.stringify(sample, null, 1)}</pre></details>}
                {!sample && detail && <p className="text-xs text-muted-foreground">{Object.entries(detail).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

// SPEC-25 (D-226): what the hourly and 07:45 verifier found and has not seen resolved. The same
// "Known, stop reminding" as the Telegram card; owner/admin only (the server decides, the button just
// is not offered to anyone else). An acknowledgement holds until the finding's detail changes (D-217.2).
function FindingsSection() {
  const s = useSession();
  const qc = useQueryClient();
  const me = s.session?.user.id ?? '';
  const canAck = s.caps.can('manage_staff');
  const q = useQuery({ queryKey: ['verifier-findings'], queryFn: fetchVerifierFindings, refetchInterval: 60_000 });
  const ack = useMutation({
    mutationFn: (key: string) => ackVerifierFinding(key),
    onSuccess: (r) => {
      toast.success(r.outcome === 'not_open' ? 'Already handled.' : 'Acknowledged. It will not remind you again unless it changes.');
      void qc.invalidateQueries({ queryKey: ['verifier-findings'] });
    },
    onError: (e) => toast.error(toAppError(e).message),
  });
  return (
    <Section title="System verifier findings">
      {q.isPending ? <p className="text-sm text-muted-foreground">Loading…</p> : q.isError ? <p className="text-sm text-destructive">{toAppError(q.error).message}</p> : q.data.rows.length === 0 ? <p className="text-sm text-muted-foreground">Nothing open. The verifier runs hourly and at 07:45.</p> : (
        <ul className="divide-y rounded-lg border text-sm">
          {q.data.rows.map((f) => (
            <li key={f.key} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <StatusBadge tone={f.severity === 'red' ? 'bad' : 'warn'}>{f.severity}</StatusBadge>
              <span className="font-medium">{f.title}</span>
              <span className="text-xs text-muted-foreground">first seen {formatDateTime(f.first_seen)}{f.last_alerted_at ? ` · last reminded ${formatDateTime(f.last_alerted_at)}` : ''}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {f.status === 'acknowledged'
                  ? `Acknowledged${f.acknowledged_by ? ` by ${f.acknowledged_by === me ? 'you' : 'an admin'}` : ''}${f.acknowledged_at ? ` on ${formatDateTime(f.acknowledged_at)}` : ''}`
                  : canAck
                    ? <Button size="sm" variant="outline" onClick={() => ack.mutate(f.key)} disabled={ack.isPending}>Known, stop reminding</Button>
                    : 'Open'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// OPS04: "No records received" is distinct from "healthy"; a section that
// cannot be read says so. No secret values are shown.

function stale(hb: { last_succeeded_at: string | null; expected_interval_seconds: number }): boolean {
  if (!hb.last_succeeded_at) return true;
  return Date.now() - new Date(hb.last_succeeded_at).getTime() > hb.expected_interval_seconds * 1000 * 2;
}

export default function HealthPage() {
  const s = useSession();
  const q = useQuery({ queryKey: ['health', s.propertyId], queryFn: () => fetchHealth(s.propertyId), refetchInterval: 60_000 });
  return (
    <div>
      <PageHeader title="System health" description="Job heartbeats, calendar sync, e-mail ingestion and integrity checks. Absence of records is reported as absence, not as health." />
      <QueryState query={q}>
        {(d) => (
          <div className="space-y-6">
            <ChecksSection />
            <FindingsSection />
            <Section title="Job heartbeats">
              {'error' in d.heartbeats ? <p className="text-sm text-destructive">Cannot read heartbeats: {d.heartbeats.error}</p> : d.heartbeats.rows.length === 0 ? <p className="text-sm text-muted-foreground">No heartbeat rows exist. That means no job has reported, not that jobs are healthy.</p> : (
                <ul className="divide-y rounded-lg border text-sm">{d.heartbeats.rows.map((h) => <li key={h.job_name} className="flex flex-wrap items-center gap-2 px-3 py-1.5"><span className="font-medium">{h.job_name}</span><StatusBadge tone={stale(h) ? 'bad' : h.consecutive_failures > 0 ? 'warn' : 'good'}>{stale(h) ? 'stale' : h.consecutive_failures > 0 ? `${h.consecutive_failures} failures` : 'on time'}</StatusBadge>{h.ops_risk && <StatusBadge tone="neutral" className="normal-case">ops-critical</StatusBadge>}<span className="ml-auto text-xs text-muted-foreground">last success {h.last_succeeded_at ? formatDateTime(h.last_succeeded_at) : 'never'} · every {Math.round(h.expected_interval_seconds / 60)} min{h.last_error_code ? ` · ${h.last_error_code}` : ''}</span></li>)}</ul>
              )}
            </Section>
            <Section title="Calendar sync">
              {'error' in d.sync ? <p className="text-sm text-destructive">Cannot read sync log: {d.sync.error}</p> : d.sync.rows.length === 0 ? <p className="text-sm text-muted-foreground">No sync runs recorded.</p> : (
                <ul className="divide-y rounded-lg border text-sm">{d.sync.rows.map((r) => <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5"><span className="tabular">{formatDateTime(r.synced_at)}</span><StatusBadge tone={r.status === 'success' || r.status === 'ok' ? 'good' : 'bad'}>{r.status}</StatusBadge><span className="text-xs text-muted-foreground">{r.source} · {r.event_count ?? '—'} events{r.error_msg ? ` · ${r.error_msg}` : ''}</span></li>)}</ul>
              )}
            </Section>
            <Section title="Airbnb e-mail ingestion">
              {'error' in d.email ? <p className="text-sm text-destructive">Cannot read e-mail events: {d.email.error}</p> : d.email.rows.length === 0 ? <p className="text-sm text-muted-foreground">No e-mail events ingested.</p> : (
                <ul className="divide-y rounded-lg border text-sm">{d.email.rows.map((e) => <li key={e.id} className="flex gap-2 px-3 py-1.5"><span className="tabular">{formatDateTime(e.email_date)}</span><span>{e.email_type}</span><span className="ml-auto text-xs text-muted-foreground">processed {e.processed_at ? formatDateTime(e.processed_at) : 'pending'}</span></li>)}</ul>
              )}
            </Section>
            <Section title="Data integrity report">
              {'error' in d.integrity ? <p className="text-sm text-destructive">Report unavailable: {d.integrity.error}</p> : <pre className="max-h-96 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs">{JSON.stringify(d.integrity.data, null, 2)}</pre>}
            </Section>
          </div>
        )}
      </QueryState>
    </div>
  );
}
