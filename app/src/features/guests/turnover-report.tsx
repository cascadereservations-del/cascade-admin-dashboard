import { Link } from 'react-router';
import { StatusBadge } from '@/components/data/status-badge';
import { formatDate } from '@/lib/dates';
import type { TimelineEvent } from './api';

// Timeline entry for kind `turnover_report` (s115 D): body {sessionId, checkout, text, issueCount}.
export function TurnoverReport({ body }: { body: TimelineEvent['body'] }) {
  const n = Number(body.issueCount) || 0;
  const co = /^\d{4}-\d{2}-\d{2}$/.test(String(body.checkout ?? '')) ? formatDate(String(body.checkout)) : 'unknown'; // a non-date would throw in date-fns and blank the page
  return (
    <div className="mt-1 rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-foreground">
      <StatusBadge tone="warn">Turnover report</StatusBadge>{' '}
      <span className="text-xs">checkout {co}{n > 0 ? ` · ${n} issue${n === 1 ? '' : 's'}` : ''}</span>
      <p className="whitespace-pre-wrap">{String(body.text ?? '')}</p>
      {body.sessionId ? <Link to={`/operations/cleaning/${String(body.sessionId)}`} className="text-xs underline">cleaning detail</Link> : null}
    </div>
  );
}
