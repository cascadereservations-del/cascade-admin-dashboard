import { formatDate } from '@/lib/dates';

// Notes are stored as one text field ("YYYY-MM-DD: point | point || YYYY-MM-DD:
// point") so multi-stay history survives in a single column. Rendered as a
// wall of text it's unreadable at a glance; break it into per-stay groups of
// short bullet points, most-important first, instead.
const POINT_PRIORITY: [RegExp, number][] = [
  [/security|incident|complaint|damage|dispute|concern/i, 0],
  [/special request|requested/i, 1],
  [/courtesy|benefit|refund|discount|goodwill|complimentary/i, 2],
  [/early check|late check|checkout/i, 3],
];
function pointPriority(point: string): number {
  for (const [re, p] of POINT_PRIORITY) if (re.test(point)) return p;
  return 4;
}
export function NoteGroups({ text }: { text: string }) {
  const groups = text.split(' || ').map((chunk) => {
    const m = chunk.match(/^(\d{4}-\d{2}-\d{2}):\s*(.*)$/s);
    const date = m ? m[1] : null;
    const body = m ? m[2] : chunk;
    const points = (body ?? '').split(' | ').map((p) => p.trim()).filter(Boolean);
    points.sort((a, b) => pointPriority(a) - pointPriority(b));
    return { date, points };
  });
  return <div className="space-y-3">
    {groups.map((g, i) => <div key={i}>
      {g.date && <p className="text-[0.8125rem] font-medium tabular text-muted-foreground">{formatDate(g.date, 'long')}</p>}
      <ul className="mt-1 list-disc space-y-1 pl-4 text-base">{g.points.map((p, j) => <li key={j}>{p}</li>)}</ul>
    </div>)}
  </div>;
}

const PH_NETWORKS: [RegExp, string][] = [
  [/^(0?63)?9(4[5-9]|5[5-9]|6[0-9]|7[0-9]|8[0-9]|9[0-9])/, 'Globe/TM'],
  [/^(0?63)?9(0[5-9]|1[0-9]|2[0-9]|3[0-9])/, 'Smart/TNT'],
  [/^(0?63)?9(4[0-4])/, 'DITO'],
];
// Best-effort PH mobile network guess from the prefix -- ranges overlap and
// numbers get ported between carriers, so this is a hint, not a fact.
export function phNetworkHint(raw: string): string | null {
  const digits = raw.replace(/\D/g, '').replace(/^0/, '').replace(/^63/, '');
  if (!/^9\d{9}$/.test(digits)) return null;
  for (const [re, name] of PH_NETWORKS) if (re.test(digits)) return name;
  return null;
}
export function isPlausiblePHMobile(raw: string): boolean {
  const digits = raw.replace(/\D/g, '').replace(/^0/, '').replace(/^63/, '');
  return /^9\d{9}$/.test(digits);
}
