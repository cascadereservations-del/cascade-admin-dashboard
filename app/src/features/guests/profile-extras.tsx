import { useState } from 'react';
import { ShieldCheck, Heart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/data/detail-sheet';
import { formatDate, formatDateTime } from '@/lib/dates';
import { safeDriveUrl } from './local-records';
import type { ProfileDetails } from './api';

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
function NoteGroups({ text }: { text: string }) {
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
      {g.date && <p className="text-xs font-medium tabular text-muted-foreground">{formatDate(g.date, 'long')}</p>}
      <ul className="mt-1 list-disc space-y-1 pl-4 text-sm">{g.points.map((p, j) => <li key={j}>{p}</li>)}</ul>
    </div>)}
  </div>;
}

// Pinned above the fold on the detail page: occasions, requests and courtesies
// read at a glance before contact/record cards, per the redesign's "important
// notes first" requirement -- staff should not have to open an edit form to
// see what a returning guest was promised last time. Hidden entirely when
// there's nothing recorded -- an empty card with placeholder text is noise.
export function ImportantNotes({ details: d }: { details: ProfileDetails | null }) {
  const hasContent = d?.stay_preferences || d?.birthday || d?.vip_reason;
  if (!hasContent) return null;
  return <Card className="gap-3 py-4 border-champagne/60"><CardHeader><CardTitle className="flex items-center gap-2"><Heart className="size-4 text-muted-foreground" aria-hidden />Important notes</CardTitle></CardHeader><CardContent className="space-y-3">
    {d?.birthday && <Field label="Birthday">{formatDate(d.birthday, 'long')}</Field>}
    {d?.vip_reason && <Field label="VIP reason">{d.vip_reason}</Field>}
    {d?.stay_preferences && <NoteGroups text={d.stay_preferences} />}
    <p className="text-xs text-muted-foreground">Transcribed by staff from the guest's own Airbnb messages -- not independently verified.</p>
  </CardContent></Card>;
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

export function PrivateGuestDetails({ details: d }: { details: ProfileDetails | null }) {
  const [reveal, setReveal] = useState(false);
  const link = safeDriveUrl(d?.id_drive_url);
  return <Card className="gap-3 py-4"><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4 text-muted-foreground" aria-hidden />Private guest details</CardTitle></CardHeader><CardContent className="space-y-3">
    <Field label="ID on file">{d?.id_on_file ? 'Marked on file' : 'Not marked on file'}</Field>
    <Field label="Identity review">{d?.id_verified_at ? `Recorded ${formatDateTime(d.id_verified_at)}` : 'No verification recorded'}</Field>
    <Button size="sm" variant="outline" onClick={() => setReveal(!reveal)}>{reveal ? 'Hide private details' : 'Reveal private details'}</Button>
    {reveal && <div className="space-y-2"><Field label="Address">{d?.address || 'Not recorded'}</Field><Field label="Airbnb profile ID">{d?.airbnb_profile_id || 'Not recorded'}</Field><Field label="ID type">{d?.id_type?.replaceAll('_', ' ') || 'Not recorded'}</Field><Field label="ID number">{d?.id_number || 'Not recorded'}</Field><Field label="ID document">{link ? <a href={link} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="underline">Open private Drive document</a> : d?.id_drive_url ? 'The stored link needs correction.' : 'No Drive link recorded'}</Field></div>}
    <p className="text-xs text-muted-foreground">Documents are shown only when requested. A photo on file does not confirm a person’s identity. The primary guest's own ID photo, if collected, is stored as a companion record below (named after the guest) rather than a separate field here.</p>
  </CardContent></Card>;
}

export function ProfileExtraFields({ details: d, change }: { details: ProfileDetails | null; change: (key: string, value: string | boolean) => void }) {
  const [showId, setShowId] = useState(false);
  return <fieldset className="space-y-3 rounded-lg border p-3"><legend className="px-1 text-sm font-semibold">Contact & private details</legend>
    <div><Label htmlFor="pf-contact">Preferred contact number</Label><Input id="pf-contact" type="tel" maxLength={100} defaultValue={d?.contact_number ?? ''} onChange={(e) => change('contact_number', e.target.value)} autoComplete="off" /></div>
    <div><Label htmlFor="pf-birthday">Birthday (only if explicitly provided)</Label><Input id="pf-birthday" type="date" defaultValue={d?.birthday ?? ''} onChange={(e) => change('birthday', e.target.value)} /></div>
    <div><Label htmlFor="pf-address">Address</Label><Textarea id="pf-address" maxLength={1000} defaultValue={d?.address ?? ''} onChange={(e) => change('address', e.target.value)} autoComplete="off" /></div>
    <div><Label htmlFor="pf-airbnb">Airbnb profile ID</Label><Input id="pf-airbnb" maxLength={100} defaultValue={d?.airbnb_profile_id ?? ''} onChange={(e) => change('airbnb_profile_id', e.target.value)} autoComplete="off" /></div>
    <label className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" defaultChecked={d?.id_on_file ?? false} onChange={(e) => change('id_on_file', e.target.checked)} /> ID document on file</label>
    <div><Label htmlFor="pf-id-type">ID type</Label><select id="pf-id-type" className="mt-1 block h-9 w-full rounded-md border bg-background px-3 text-sm" defaultValue={d?.id_type ?? ''} onChange={(e) => change('id_type', e.target.value)}><option value="">Not recorded</option><option value="passport">Passport</option><option value="drivers_license">Driver’s license</option><option value="national_id">National ID</option><option value="other">Other</option></select></div>
    <div><Label htmlFor="pf-id-number">ID number</Label><Input id="pf-id-number" type={showId ? 'text' : 'password'} maxLength={100} autoComplete="off" defaultValue={d?.id_number ?? ''} onChange={(e) => change('id_number', e.target.value)} /><Button type="button" variant="ghost" size="sm" onClick={() => setShowId(!showId)}>{showId ? 'Hide ID number' : 'Show ID number'}</Button></div>
    <div><Label htmlFor="pf-id-link">Private Google Drive document link</Label><Input id="pf-id-link" type="url" maxLength={1000} defaultValue={d?.id_drive_url ?? ''} onChange={(e) => change('id_drive_url', e.target.value)} autoComplete="off" /><p className="mt-1 text-xs text-muted-foreground">The Drive file must be restricted to authorised staff. Saving its link does not change sharing or mark the identity as verified.</p></div>
  </fieldset>;
}
