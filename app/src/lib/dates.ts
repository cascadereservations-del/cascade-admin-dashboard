import { TZDate } from '@date-fns/tz';
import { addDays, differenceInCalendarDays, format, startOfMonth, startOfYear } from 'date-fns';
import { BUSINESS_TIMEZONE } from './env';

// Business dates are Asia/Manila calendar dates independent of the browser
// timezone (PRD section 6). All helpers return ISO yyyy-MM-dd strings.

export type IsoDate = string; // yyyy-MM-dd

export function nowManila(): TZDate {
  return new TZDate(Date.now(), BUSINESS_TIMEZONE);
}

export function todayManila(): IsoDate {
  return format(nowManila(), 'yyyy-MM-dd');
}

export function parseIso(d: IsoDate): TZDate {
  const [y, m, day] = d.split('-').map(Number);
  return new TZDate(y ?? 1970, (m ?? 1) - 1, day ?? 1, BUSINESS_TIMEZONE);
}

export function addIsoDays(d: IsoDate, n: number): IsoDate {
  return format(addDays(parseIso(d), n), 'yyyy-MM-dd');
}

/** Stay nights use [check-in, checkout). */
export function nightsBetween(checkin: IsoDate, checkout: IsoDate): number {
  return Math.max(0, differenceInCalendarDays(parseIso(checkout), parseIso(checkin)));
}

/** Nights of a stay that fall inside [periodStart, periodEndExclusive). */
export function nightsInPeriod(
  checkin: IsoDate,
  checkout: IsoDate,
  periodStart: IsoDate,
  periodEndExclusive: IsoDate,
): number {
  const s = checkin > periodStart ? checkin : periodStart;
  const e = checkout < periodEndExclusive ? checkout : periodEndExclusive;
  return s < e ? nightsBetween(s, e) : 0;
}

export type Period = { start: IsoDate; endExclusive: IsoDate; label: string; key: string };

/** Default performance periods end at the last completed night (today, exclusive). */
export function periodPreset(key: string, today: IsoDate = todayManila()): Period {
  const t = parseIso(today);
  switch (key) {
    case 'mtd':
      return { key, start: format(startOfMonth(t), 'yyyy-MM-dd'), endExclusive: today, label: 'Month to date' };
    case 'ytd':
      return { key, start: format(startOfYear(t), 'yyyy-MM-dd'), endExclusive: today, label: 'Year to date' };
    case 'last30':
      return { key, start: addIsoDays(today, -30), endExclusive: today, label: 'Last 30 nights' };
    case 'last90':
      return { key, start: addIsoDays(today, -90), endExclusive: today, label: 'Last 90 nights' };
    case 'prev-month': {
      const s = startOfMonth(addDays(startOfMonth(t), -1));
      return { key, start: format(s, 'yyyy-MM-dd'), endExclusive: format(startOfMonth(t), 'yyyy-MM-dd'), label: 'Previous month' };
    }
    case 'qtd': {
      const q = new TZDate(t.getFullYear(), Math.floor(t.getMonth() / 3) * 3, 1, BUSINESS_TIMEZONE);
      return { key, start: format(q, 'yyyy-MM-dd'), endExclusive: today, label: 'Quarter to date' };
    }
    case 'prev-quarter': {
      const qStart = Math.floor(t.getMonth() / 3) * 3;
      const s = new TZDate(t.getFullYear(), qStart - 3, 1, BUSINESS_TIMEZONE);
      const e = new TZDate(t.getFullYear(), qStart, 1, BUSINESS_TIMEZONE);
      return { key, start: format(s, 'yyyy-MM-dd'), endExclusive: format(e, 'yyyy-MM-dd'), label: 'Previous quarter' };
    }
    case 'prev-year': {
      return { key, start: `${t.getFullYear() - 1}-01-01`, endExclusive: `${t.getFullYear()}-01-01`, label: 'Previous year' };
    }
    case 'last12': {
      const s = new TZDate(t.getFullYear(), t.getMonth() - 12, 1, BUSINESS_TIMEZONE);
      return { key, start: format(s, 'yyyy-MM-dd'), endExclusive: format(startOfMonth(t), 'yyyy-MM-dd'), label: 'Last twelve full months' };
    }
    default:
      return periodPreset('mtd', today);
  }
}

/** Equivalent elapsed period one month or one year earlier, same elapsed length (INS03). */
export function comparablePeriod(p: Period, mode: 'month' | 'year'): Period {
  const s = parseIso(p.start);
  const len = nightsBetween(p.start, p.endExclusive);
  const prevStart = mode === 'month'
    ? new TZDate(s.getFullYear(), s.getMonth() - 1, s.getDate(), BUSINESS_TIMEZONE)
    : new TZDate(s.getFullYear() - 1, s.getMonth(), s.getDate(), BUSINESS_TIMEZONE);
  const start = format(prevStart, 'yyyy-MM-dd');
  return { key: `${p.key}-cmp-${mode}`, start, endExclusive: addIsoDays(start, len), label: `Same elapsed period, previous ${mode}` };
}

export function formatDate(d: IsoDate | null | undefined, style: 'short' | 'long' | 'weekday' = 'short'): string {
  if (!d) return '—';
  const dt = parseIso(d);
  if (style === 'long') return format(dt, 'd MMM yyyy');
  if (style === 'weekday') return format(dt, 'EEE d MMM');
  return format(dt, 'd MMM');
}

export function formatDateTime(ts: string | null | undefined): string {
  if (!ts) return '—';
  return format(new TZDate(new Date(ts), BUSINESS_TIMEZONE), 'd MMM yyyy, HH:mm');
}

export function relativeDay(d: IsoDate, today: IsoDate = todayManila()): string {
  if (d === today) return 'Today';
  if (d === addIsoDays(today, 1)) return 'Tomorrow';
  if (d === addIsoDays(today, -1)) return 'Yesterday';
  return formatDate(d, 'weekday');
}
