import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSession } from '@/auth/session';
import { formatDateTime } from '@/lib/dates';
import { toAppError } from '@/lib/errors';
import { undoAudit } from '@/lib/undo';
import { PageHeader } from '@/components/data/page-header';
import { FilterBar, FilterSelect } from '@/components/data/filter-bar';
import { EmptyState, QueryState } from '@/components/data/query-state';
import { StatusBadge, type Tone } from '@/components/data/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchAuditFeed, type AuditFeedRow } from './api';

// Audit history: every admin write (row before/after with Undo), staff access
// changes, booking lifecycle, inventory movements, journals, readiness and
// evidence reviews, guest profile changes. One server feed; finance and staff
// rows are filtered by the server for the caller's role.

const SRC_LABEL: Record<string, string> = { admin: 'Record', staff: 'Staff access', booking: 'Booking', inventory: 'Inventory', journal: 'Journal', readiness: 'Readiness', evidence: 'Evidence', guest: 'Guest' };
const tone = (a: string): Tone => (a === 'soft_delete' ? 'bad' : a === 'undo' ? 'info' : a === 'insert' || a === 'posted' ? 'good' : 'neutral');

function diff(before: unknown, after: unknown): Array<[string, unknown, unknown]> {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const out: Array<[string, unknown, unknown]> = [];
  for (const k of keys) if (JSON.stringify(b[k]) !== JSON.stringify(a[k]) && !['updated_at', 'version'].includes(k)) out.push([k, b[k], a[k]]);
  return out;
}

export default function AuditPage() {
  const s = useSession();
  const qc = useQueryClient();
  const [src, setSrc] = useState('');
  const [q, setQ] = useState('');
  const [reason, setReason] = useState<Record<string, string>>({});
  const feed = useQuery({ queryKey: ['audit-feed', s.propertyId], queryFn: () => fetchAuditFeed(s.propertyId, 400) });
  const undo = useMutation({
    mutationFn: (r: AuditFeedRow) => undoAudit(r.id, reason[r.id] || 'undo from audit history'),
    onSuccess: () => { toast.success('Undone'); void qc.invalidateQueries(); },
    onError: (e) => toast.error(toAppError(e).message),
  });
  return (
    <div>
      <PageHeader title="Audit history" description="Every change recorded by the server, newest first. Record changes show what changed and can be undone; the undo is itself recorded." />
      <FilterBar search={q} onSearch={setQ} searchPlaceholder="Table, action, reason, id" activeCount={src ? 1 : 0} onClear={() => { setSrc(''); setQ(''); }}>
        <FilterSelect label="Kind" value={src || undefined} onChange={(v) => setSrc(v ?? '')} options={Object.entries(SRC_LABEL).map(([value, label]) => ({ value, label }))} />
      </FilterBar>
      <QueryState query={feed}>
        {(d) => {
          const needle = q.trim().toLowerCase();
          const rows = d.rows.filter((r) => (!src || r.src === src) && (!needle || [r.entity_table, r.action, r.reason ?? '', r.entity_id, r.src].join(' ').toLowerCase().includes(needle)));
          return rows.length === 0 ? <EmptyState title="No audit rows match" /> : (
            <ul className="divide-y rounded-lg border text-sm">
              {rows.map((r) => {
                const changes = r.src === 'admin' ? diff(r.before_state, r.after_state) : [];
                const after = (r.after_state ?? {}) as { gross_amount?: string; title?: string };
                return (
                  <li key={`${r.src}-${r.id}`} className="space-y-1 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tabular text-xs text-muted-foreground">{formatDateTime(r.at)}</span>
                      <StatusBadge tone={tone(r.action)}>{r.action.replaceAll('_', ' ')}</StatusBadge>
                      <span className="font-medium">{SRC_LABEL[r.src] ?? r.src} · {r.entity_table.replaceAll('_', ' ')}</span>
                      <span className="truncate text-xs text-muted-foreground">{r.entity_id}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{r.actor ? `by ${r.actor.slice(0, 8)}` : 'system'}</span>
                    </div>
                    {r.reason && <p className="text-xs text-muted-foreground">{r.reason}</p>}
                    {changes.length > 0 && (
                      <ul className="grid gap-x-4 text-xs sm:grid-cols-2">{changes.slice(0, 12).map(([k, b, a]) => <li key={k}><span className="text-muted-foreground">{k}:</span> <span className="line-through opacity-70">{b === undefined || b === null ? '—' : String(b)}</span> → <span>{a === undefined || a === null ? '—' : String(a)}</span></li>)}</ul>
                    )}
                    {r.src === 'admin' && r.action === 'insert' && <p className="text-xs text-muted-foreground">Created{after.gross_amount ? ` · PHP ${after.gross_amount}` : ''}{after.title ? ` · ${after.title}` : ''}</p>}
                    {!!(r.before_state || r.after_state) && r.src !== 'admin' && <details className="text-xs text-muted-foreground"><summary>before / after</summary><pre className="overflow-auto">{JSON.stringify({ before: r.before_state, after: r.after_state }, null, 1)}</pre></details>}
                    {r.undoable && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Input aria-label="Undo reason" placeholder="Reason for undo" className="h-8 w-56 text-sm" value={reason[r.id] ?? ''} onChange={(e) => setReason({ ...reason, [r.id]: e.target.value })} />
                        <Button size="sm" variant="outline" disabled={undo.isPending} onClick={() => undo.mutate(r)}>{r.action === 'insert' ? 'Undo (delete)' : r.action === 'soft_delete' ? 'Undo (restore)' : 'Undo'}</Button>
                      </div>
                    )}
                    {r.undo_of && <p className="text-xs text-muted-foreground">Reverted change {r.undo_of.slice(0, 8)}</p>}
                  </li>
                );
              })}
            </ul>
          );
        }}
      </QueryState>
    </div>
  );
}
