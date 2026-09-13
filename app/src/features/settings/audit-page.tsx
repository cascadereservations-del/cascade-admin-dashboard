import { useQuery } from '@tanstack/react-query';
import { formatDateTime } from '@/lib/dates';
import { PageHeader } from '@/components/data/page-header';
import { EmptyState, QueryState } from '@/components/data/query-state';
import { fetchAudit } from './api';

// Audit history of staff access changes (server-written by manage_staff_access).
export default function AuditPage() {
  const q = useQuery({ queryKey: ['audit'], queryFn: fetchAudit });
  return (
    <div>
      <PageHeader title="Audit history" description="Staff access changes recorded by the server. Journal reversals and readiness overrides appear on their own records." />
      <QueryState query={q}>
        {(d) => d.rows.length === 0 ? <EmptyState title="No audit rows" /> : (
          <ul className="divide-y rounded-lg border text-sm">
            {d.rows.map((r) => <li key={r.id} className="px-3 py-2"><span className="tabular text-muted-foreground">{formatDateTime(r.created_at)}</span> · <span className="font-medium">{r.action}</span> · target {r.target_user_id ?? '—'} by {r.actor_user_id ?? 'system'}{r.reason ? ` · ${r.reason}` : ''}<details className="mt-1 text-xs text-muted-foreground"><summary>before / after</summary><pre className="overflow-auto">{JSON.stringify({ before: r.before_state, after: r.after_state }, null, 1)}</pre></details></li>)}
          </ul>
        )}
      </QueryState>
    </div>
  );
}
