import { formatDateTime } from '@/lib/dates';

// UX17: "last updated" shows source freshness, not page-load time.
export function Freshness({ sourceAsOf, label = 'Source updated' }: { sourceAsOf: string | null | undefined; label?: string }) {
  return (
    <p className="text-xs text-muted-foreground">
      {label}: {sourceAsOf ? formatDateTime(sourceAsOf) : 'unknown'}
    </p>
  );
}
