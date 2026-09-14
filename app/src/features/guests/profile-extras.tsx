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

export function ProfileExtras({ details: d }: { details: ProfileDetails | null }) {
  const [reveal, setReveal] = useState(false);
  const link = safeDriveUrl(d?.id_drive_url);
  return <div className="grid gap-4 lg:grid-cols-2">
    <Card className="gap-3 py-4"><CardHeader><CardTitle className="flex items-center gap-2"><Heart className="size-4 text-muted-foreground" aria-hidden />Preferences & occasions</CardTitle></CardHeader><CardContent className="space-y-3">
      <Field label="Birthday">{d?.birthday ? formatDate(d.birthday, 'long') : 'Not recorded'}</Field>
      <Field label="Stay notes"><span className="whitespace-pre-wrap">{d?.stay_preferences || 'No guest-stated preferences recorded'}</span></Field>
      {d?.vip_reason && <Field label="VIP reason">{d.vip_reason}</Field>}
      <p className="text-xs text-muted-foreground">Record requests, agreed courtesies and early arrival or departure arrangements with their dates. Follow-ups track what still needs a response.</p>
    </CardContent></Card>
    <Card className="gap-3 py-4"><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4 text-muted-foreground" aria-hidden />Private guest details</CardTitle></CardHeader><CardContent className="space-y-3">
      <Field label="ID on file">{d?.id_on_file ? 'Marked on file' : 'Not marked on file'}</Field>
      <Field label="Identity review">{d?.id_verified_at ? `Recorded ${formatDateTime(d.id_verified_at)}` : 'No verification recorded'}</Field>
      <Button size="sm" variant="outline" onClick={() => setReveal(!reveal)}>{reveal ? 'Hide private details' : 'Reveal private details'}</Button>
      {reveal && <div className="space-y-2"><Field label="Address">{d?.address || 'Not recorded'}</Field><Field label="Airbnb profile ID">{d?.airbnb_profile_id || 'Not recorded'}</Field><Field label="ID type">{d?.id_type?.replaceAll('_', ' ') || 'Not recorded'}</Field><Field label="ID number">{d?.id_number || 'Not recorded'}</Field><Field label="ID document">{link ? <a href={link} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="underline">Open private Drive document</a> : d?.id_drive_url ? 'The stored link needs correction.' : 'No Drive link recorded'}</Field></div>}
      <p className="text-xs text-muted-foreground">Documents are shown only when requested. A photo on file does not confirm a person’s identity.</p>
    </CardContent></Card>
  </div>;
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
