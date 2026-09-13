import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { AlertTriangle, Inbox, RefreshCw, ShieldAlert, Unplug } from 'lucide-react';
import { toAppError } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

// UX15: skeleton, empty, filtered-empty, partial, forbidden and retry states in
// one place so no screen can silently show an empty list on failure.

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return <Skeleton className="h-28 w-full" aria-busy aria-label="Loading" />;
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center">
      <Inbox className="size-6 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const e = toAppError(error);
  const Icon = e.kind === 'forbidden' ? ShieldAlert : e.kind === 'unavailable' ? Unplug : AlertTriangle;
  const title =
    e.kind === 'forbidden'
      ? 'Not permitted'
      : e.kind === 'unavailable'
        ? 'Unavailable'
        : e.kind === 'conflict'
          ? 'Conflict'
          : 'Something went wrong';
  return (
    <div role="alert" className="flex flex-col items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 py-8 text-center">
      <Icon className="size-6 text-destructive" aria-hidden />
      <p className="font-medium">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{e.message}</p>
      {e.detail && <p className="max-w-md break-words text-xs text-muted-foreground/80">{e.detail}</p>}
      {onRetry && e.kind !== 'forbidden' && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="size-4" aria-hidden /> Retry
        </Button>
      )}
    </div>
  );
}

export function PartialBanner({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <div role="status" className="rounded-md border border-champagne/40 bg-cream px-3 py-2 text-sm text-foreground">
      <span className="font-medium">Partial data. </span>
      {warnings.join(' ')}
    </div>
  );
}

type Props<T> = {
  query: UseQueryResult<T>;
  skeleton?: ReactNode;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  children: (data: T) => ReactNode;
};

export function QueryState<T>({ query, skeleton, isEmpty, empty, children }: Props<T>) {
  if (query.isPending) return <>{skeleton ?? <ListSkeleton />}</>;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const data = query.data as T;
  if (isEmpty?.(data)) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;
  return <>{children(data)}</>;
}
