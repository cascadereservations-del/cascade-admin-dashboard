// Money crosses JSON boundaries as decimal strings (PRD section 8). The
// frontend only formats; it never computes authoritative totals. Where a
// display needs a sum of already-authoritative rows (a page subtotal), use
// addDecimal which works in integer centavos to avoid float drift.

const PHP = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const PHP0 = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export type Decimal = string;

/** Parse a decimal string (or number from a legacy table) to integer centavos. */
export function toCentavos(value: Decimal | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const s = typeof value === 'number' ? value.toFixed(2) : String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const neg = s.startsWith('-');
  const [whole, frac = ''] = s.replace('-', '').split('.');
  const cents = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  return neg ? -cents : cents;
}

export function fromCentavos(cents: number): Decimal {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${neg ? '-' : ''}${whole}.${frac}`;
}

export function addDecimal(...values: Array<Decimal | number | null | undefined>): Decimal {
  let total = 0;
  for (const v of values) total += toCentavos(v) ?? 0;
  return fromCentavos(total);
}

/** Format a decimal string as PHP. Null/undefined renders an explicit dash, never 0. */
export function formatPHP(value: Decimal | number | null | undefined, opts?: { whole?: boolean }): string {
  const cents = toCentavos(value);
  if (cents === null) return '—';
  const n = cents / 100;
  return opts?.whole ? PHP0.format(n) : PHP.format(n);
}

export function formatPercent(value: Decimal | number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(digits)}%`;
}

export function formatNumber(value: Decimal | number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-PH', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
