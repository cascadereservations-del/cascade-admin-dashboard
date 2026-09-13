// Public DTOs shared by adapters and components. Mirrors docs/CONTRACTS.md.

export type Decimal = string;

export type MetricUnit = 'PHP' | 'percent' | 'night' | 'day' | 'count';
export type MetricBasis = 'stay' | 'cash' | 'accrual' | 'booking_cohort';
export type Coverage = 'complete' | 'partial' | 'missing';

export type MetricResult = {
  key: string;
  value: Decimal | null;
  unit: MetricUnit;
  periodStart: string;
  periodEndExclusive: string;
  basis: MetricBasis;
  definitionVersion: string;
  sourceAsOf: string | null;
  coverage: Coverage;
  includedCount: number;
  excludedCount: number;
  warnings: string[];
  drilldownToken: string;
};

export type ListResponse<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  sourceAsOf: string | null;
};

export type Receipt = {
  id: string;
  status: string;
  at: string;
  label: string;
};
