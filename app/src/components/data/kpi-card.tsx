import { Link } from 'react-router';
import { Info } from 'lucide-react';
import type { MetricResult } from '@/types/contracts';
import { formatNumber, formatPHP, formatPercent } from '@/lib/money';
import { formatDate, formatDateTime } from '@/lib/dates';
import { Card, CardContent } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';

// Every KPI exposes definition, period, freshness, coverage and a link to its
// supporting records (PRD section 6). Missing data renders as "not available",
// never as zero.

export function formatMetricValue(m: MetricResult): string {
  if (m.value === null) return 'Not available';
  switch (m.unit) {
    case 'PHP':
      return formatPHP(m.value);
    case 'percent':
      return formatPercent(m.value);
    case 'night':
    case 'day':
    case 'count':
      return formatNumber(m.value, m.unit === 'day' ? 1 : 0);
  }
}

export function KpiCard({ metric, title, definition, drilldownHref }: { metric: MetricResult; title: string; definition: string; drilldownHref?: string }) {
  const value = formatMetricValue(metric);
  const coverageVariant = metric.coverage === 'complete' ? 'secondary' : metric.coverage === 'partial' ? 'outline' : 'destructive';
  return (
    <Card className="py-4 gap-3">
      <CardContent className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">{title}</p>
          <Popover>
            <PopoverTrigger className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-2" aria-label={`About ${title}`}>
              <Info className="size-4" aria-hidden />
            </PopoverTrigger>
            <PopoverContent className="w-80 space-y-2 text-sm" align="end">
              <p className="font-medium">{title}</p>
              <p className="text-muted-foreground">{definition}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Period</dt>
                <dd>{formatDate(metric.periodStart, 'long')} to {formatDate(metric.periodEndExclusive, 'long')} (exclusive)</dd>
                <dt className="text-muted-foreground">Basis</dt>
                <dd>{metric.basis}</dd>
                <dt className="text-muted-foreground">Definition</dt>
                <dd>{metric.key} {metric.definitionVersion}</dd>
                <dt className="text-muted-foreground">Source as of</dt>
                <dd>{metric.sourceAsOf ? formatDateTime(metric.sourceAsOf) : 'unknown'}</dd>
                <dt className="text-muted-foreground">Records</dt>
                <dd>{metric.includedCount} included, {metric.excludedCount} excluded</dd>
              </dl>
              {metric.warnings.length > 0 && (
                <ul className="list-disc pl-4 text-xs text-muted-foreground">
                  {metric.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
              {drilldownHref && (
                <Link to={drilldownHref} className="inline-block text-xs underline">
                  Open supporting records
                </Link>
              )}
            </PopoverContent>
          </Popover>
        </div>
        <p className={`tabular text-2xl font-semibold ${metric.value === null ? 'text-muted-foreground' : ''}`}>{value}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant={coverageVariant} className="capitalize">{metric.coverage}</Badge>
          <span>{metric.includedCount} records</span>
        </div>
      </CardContent>
    </Card>
  );
}
