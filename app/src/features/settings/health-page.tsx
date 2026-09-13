import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/auth/session';
import { formatDateTime } from '@/lib/dates';
import { PageHeader, Section } from '@/components/data/page-header';
import { QueryState } from '@/components/data/query-state';
import { StatusBadge } from '@/components/data/status-badge';
import { fetchHealth } from './api';

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
            <Section title="Job heartbeats">
              {'error' in d.heartbeats ? <p className="text-sm text-destructive">Cannot read heartbeats: {d.heartbeats.error}</p> : d.heartbeats.rows.length === 0 ? <p className="text-sm text-muted-foreground">No heartbeat rows exist. That means no job has reported, not that jobs are healthy.</p> : (
                <ul className="divide-y rounded-lg border text-sm">{d.heartbeats.rows.map((h) => <li key={h.job_name} className="flex flex-wrap items-center gap-2 px-3 py-1.5"><span className="font-medium">{h.job_name}</span><StatusBadge tone={h.ops_risk || stale(h) ? 'bad' : h.consecutive_failures > 0 ? 'warn' : 'good'}>{h.ops_risk ? 'ops risk' : stale(h) ? 'stale' : h.consecutive_failures > 0 ? `${h.consecutive_failures} failures` : 'on time'}</StatusBadge><span className="ml-auto text-xs text-muted-foreground">last success {h.last_succeeded_at ? formatDateTime(h.last_succeeded_at) : 'never'} · every {Math.round(h.expected_interval_seconds / 60)} min{h.last_error_code ? ` · ${h.last_error_code}` : ''}</span></li>)}</ul>
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
