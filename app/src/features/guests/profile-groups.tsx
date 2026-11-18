import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronRight } from 'lucide-react';
import { toAppError } from '@/lib/errors';
import { formatDate } from '@/lib/dates';
import { safeMessengerUrl } from './local-records';
import { DetailSheet, Field } from '@/components/data/detail-sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { REASON_CHIPS, autoReason, sensitiveKind, type ReasonKind } from './auto-reason';
import { fetchGuest, saveProfile, type GuestRow, type ProfileDetails } from './api';
import { ID_TYPES } from './id-photo';
import { NoteGroups, isPlausiblePHMobile, phNetworkHint } from './profile-extras';

// s118 guest page: the always-visible core rows and six collapsed groups. Four text sizes only: title 1.75rem,
// body 1rem, secondary 0.9375rem, caption 0.8125rem. Rows are 44 px or taller on every width.

export type FieldDef = { key: string; label: string; kind: 'text' | 'tel' | 'textarea' | 'select' | 'date' | 'url'; options?: readonly (readonly [string, string])[]; reason?: ReasonKind; masked?: boolean; placeholder?: string };

const YES_NO = [['false', 'No'], ['true', 'Yes']] as const;
export const PHONE: FieldDef = { key: 'contact_number', label: 'Contact number', kind: 'tel', reason: 'contact' };
export const NOTES: FieldDef = { key: 'stay_preferences', label: 'Notes', kind: 'textarea', reason: 'notes', placeholder: 'Requests, arrival time, occasions' };
export const ID_TYPE: FieldDef = { key: 'id_type', label: 'ID type', kind: 'select', reason: 'id_type', options: [['', 'Not stated'], ...ID_TYPES] };
export const DISPLAY_NAME: FieldDef = { key: 'display_name', label: 'Name shown to staff', kind: 'text', reason: 'name' };

const CONTACT_FIELDS: FieldDef[] = [
  { key: 'email', label: 'E-mail', kind: 'text' }, // guests.email: read here, the profile save has no e-mail key
  { key: 'preferred_channel', label: 'Prefers', kind: 'select', reason: 'channel', options: [['', 'Not stated'], ...['messenger', 'phone', 'email', 'airbnb', 'other'].map((v) => [v, v[0]!.toUpperCase() + v.slice(1)] as const)] },
  { key: 'language', label: 'Language', kind: 'text' },
  { key: 'messenger_link', label: 'Messenger link', kind: 'url', placeholder: 'https://m.me/…' },
  { key: 'airbnb_profile_id', label: 'Airbnb profile', kind: 'text' },
];
const PRIVATE_FIELDS: FieldDef[] = [
  { key: 'birthday', label: 'Birthday', kind: 'date' },
  { key: 'address', label: 'Address', kind: 'textarea', masked: true },
  { key: 'id_number', label: 'ID number', kind: 'text', masked: true },
  { key: 'id_drive_url', label: 'Drive link', kind: 'url', masked: true, placeholder: 'https://drive.google.com/…' },
  { key: 'id_on_file', label: 'ID marked on file', kind: 'select', options: YES_NO },
];
const TAG_FIELDS: FieldDef[] = [
  { key: 'tags', label: 'Tags', kind: 'text', reason: 'tags', placeholder: 'returning, occasion' },
  { key: 'vip', label: 'VIP', kind: 'select', options: YES_NO },
];

type Source = { guest: Pick<GuestRow, 'email'>; details: ProfileDetails | null };
/** A field's value as the text a row shows and edits. */
export function fieldValue({ guest, details: d }: Source, key: string): string {
  if (key === 'email') return guest.email ?? '';
  if (key === 'tags') return d?.tags?.join(', ') ?? '';
  if (key === 'vip' || key === 'id_on_file') return d?.[key] ? 'true' : 'false';
  const v = (d as unknown as Record<string, unknown> | null)?.[key];
  return typeof v === 'string' ? v : '';
}
const filledValue = (v: string) => v !== '' && v !== 'false';
const toPatchValue = (key: string, raw: string): unknown => key === 'tags' ? raw.split(',').map((t) => t.trim()).filter(Boolean) : key === 'vip' || key === 'id_on_file' ? raw === 'true' : raw;

/** "n of m filled" and the one-line summary for a group; private values show their label, never the value. */
export function groupSummary(src: Source, defs: FieldDef[]) {
  const done = defs.filter((f) => filledValue(fieldValue(src, f.key)));
  const text = done.length ? done.map((f) => f.masked ? f.label : displayValue(f, fieldValue(src, f.key))).join(' · ') : `Add ${defs.map((f) => f.label.toLowerCase()).join(', ')}`;
  return { filled: done.length, total: defs.length, text };
}
export const groupCounts = (src: Source) => ({ contact: groupSummary(src, CONTACT_FIELDS), private: groupSummary(src, PRIVATE_FIELDS), tags: groupSummary(src, TAG_FIELDS) });

function displayValue(def: FieldDef, v: string): string {
  if (def.kind === 'date' && v) return formatDate(v, 'long');
  if (def.kind === 'select') return def.options?.find(([o]) => o === v)?.[1] ?? v;
  return v;
}

const input = 'min-h-11 flex-1 basis-40 text-base md:text-base';

/** One row: tap to edit, Done or Enter saves that single field. Empty shows "Add", never a blank row. */
export function FieldRow({ def, value, shown, locked, onUnlock, readOnly, hint, onSave }: { def: FieldDef; value: string; shown?: ReactNode; locked?: boolean; onUnlock?: () => void; readOnly?: boolean; hint?: (v: string) => string; onSave: (value: string) => Promise<unknown> }) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const label = <span className="w-28 shrink-0 text-[0.9375rem] text-muted-foreground">{def.label}</span>;
  if (!editing) {
    const block = !!shown && typeof shown !== 'string' && !locked; // a block (the notes bullets) cannot sit inside a button
    const text = locked ? '•••• hidden' : block ? null : shown ?? (value ? displayValue(def, value) : readOnly ? 'Not recorded' : 'Add');
    const body = <>{label}<span className={`min-w-0 flex-1 break-words text-base ${value ? '' : 'text-muted-foreground'}`}>{block ? (readOnly ? '' : 'Tap to change') : text}</span>{!readOnly && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}</>;
    if (readOnly) return <div className="flex min-h-12 items-center gap-3 px-4 py-2">{body}{block && <div className="basis-full">{shown}</div>}</div>;
    const btn = <button type="button" aria-label={`${def.label}: ${locked ? 'hidden, tap to show' : value ? displayValue(def, value) : 'empty, tap to add'}`} className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted" onClick={() => { if (locked) onUnlock?.(); else { setDraft(value); setEditing(true); } }}>{body}</button>;
    return block ? <div>{btn}<div className="px-4 pb-3">{shown}</div></div> : btn;
  }
  const done = async (e?: FormEvent) => {
    e?.preventDefault();
    if (draft.trim() === value.trim()) return setEditing(false);
    setBusy(true);
    try { await onSave(draft.trim()); setEditing(false); } catch (err) { toast.error(toAppError(err).message); } finally { setBusy(false); }
  };
  const common = { id, value: draft, autoFocus: true, disabled: busy, onChange: (e: { target: { value: string } }) => setDraft(e.target.value) };
  return (
    <form className="flex flex-wrap items-center gap-2 bg-muted px-4 py-2" onSubmit={done} onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}>
      <label htmlFor={id} className="w-28 shrink-0 text-[0.9375rem] text-muted-foreground">{def.label}</label>
      {def.kind === 'textarea' ? <Textarea {...common} className={`${input} min-h-24`} placeholder={def.placeholder} />
        : def.kind === 'select' ? <select {...common} className="min-h-11 flex-1 basis-40 rounded-md border border-input bg-background px-3 text-base">{def.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        : <Input {...common} type={def.kind === 'tel' ? 'tel' : def.kind === 'url' ? 'url' : def.kind === 'date' ? 'date' : 'text'} inputMode={def.kind === 'tel' ? 'tel' : undefined} autoComplete="off" className={input} placeholder={def.placeholder} />}
      <Button type="submit" className="min-h-11" disabled={busy}>Done</Button>
      {hint && hint(draft) && <p className="basis-full text-[0.8125rem] text-muted-foreground">{hint(draft)}</p>}
    </form>
  );
}

/** Phone hint in muted text: never a warning colour for a number that may simply be foreign. */
export const phoneHint = (v: string) => !v.trim() ? '' : isPlausiblePHMobile(v) ? `PH mobile${phNetworkHint(v) ? ` (${phNetworkHint(v)})` : ''}` : 'Not a PH mobile format. Fine for a number from abroad.';

/** Saves one or more profile fields with an automatic reason, an Undo toast, and a re-read on a version conflict. */
export function useFieldSave(guestId: string, details: ProfileDetails | null) {
  const qc = useQueryClient();
  const latest = useRef(details);
  latest.current = details;
  const [ask, setAsk] = useState<{ label: string; resolve: (reason: string | null) => void } | null>(null);
  const [typed, setTyped] = useState('');
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['guest', guestId] }); void qc.invalidateQueries({ queryKey: ['timeline', guestId] }); };
  // A conflict re-reads the profile and re-applies only this patch, so a field changed elsewhere is not lost.
  const send = async (patch: Record<string, unknown>, reason: string, version: number | null) => {
    try { return await saveProfile(guestId, patch, version, reason); } catch (e) {
      if (toAppError(e).kind !== 'conflict') throw e;
      const fresh = await fetchGuest(guestId);
      return saveProfile(guestId, patch, fresh.details?.version ?? null, reason);
    }
  };
  const saveFields = async (patch: Record<string, unknown>, o: { labels: string[]; kind?: ReasonKind; reason?: string }) => {
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, toPatchValue(k, fieldValue({ guest: { email: null }, details: latest.current }, k))]));
    const r = await send(patch, o.reason ?? autoReason(o.kind ?? 'contact', o.labels), latest.current?.version ?? null);
    refresh();
    toast.success(`${o.labels.join(', ')} saved`, { duration: 6000, action: { label: 'Undo', onClick: () => { send(before, 'Undo of last change', r?.version ?? null).then(() => { refresh(); toast.success('Undone'); }).catch((e) => toast.error(toAppError(e).message)); } } });
  };
  const saveField = async (def: FieldDef, raw: string) => {
    const value = toPatchValue(def.key, raw);
    let reason: string | undefined;
    if (sensitiveKind(def.key, value)) {
      const r = await new Promise<string | null>((resolve) => { setTyped(''); setAsk({ label: def.label, resolve }); });
      if (!r) return;
      reason = r;
    }
    await saveFields({ [def.key]: value }, { labels: [def.label], kind: def.reason, reason });
  };
  const close = (r: string | null) => { ask?.resolve(r); setAsk(null); };
  const reasonSheet = (
    <DetailSheet open={!!ask} onOpenChange={(o) => { if (!o) close(null); }} title={ask?.label ?? 'Reason'} description="This is private. Choose why it changed; it is kept in the guest’s history.">
      <div className="flex flex-wrap gap-2">{REASON_CHIPS.map((c) => <Button key={c} type="button" variant="outline" className="min-h-11" onClick={() => close(c)}>{c}</Button>)}</div>
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (typed.trim().length >= 3) close(typed.trim()); }}>
        <label htmlFor="reason-text" className="text-[0.9375rem] text-muted-foreground">Or write a reason</label>
        <Input id="reason-text" maxLength={500} value={typed} onChange={(e) => setTyped(e.target.value)} className="min-h-11 text-base" autoComplete="off" />
        <Button type="submit" className="min-h-11" disabled={typed.trim().length < 3}>Save</Button>
      </form>
    </DetailSheet>
  );
  return { saveField, saveFields, reasonSheet };
}

export function Group({ id, title, summary, filled, total, open, onToggle, note, children }: { id: string; title: string; summary: string; filled?: number; total?: number; open: boolean; onToggle: () => void; note?: string; children: ReactNode }) {
  const body = `group-body-${id}`;
  return (
    <section id={`group-${id}`} className="overflow-hidden rounded-xl border bg-card">
      <button type="button" aria-expanded={open} aria-controls={body} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted" onClick={onToggle}>
        <span className="min-w-0 flex-1"><span className="block text-base font-semibold">{title}</span><span className="block truncate text-[0.9375rem] text-muted-foreground">{summary}</span></span>
        {total != null && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.8125rem] font-semibold ${filled ? 'bg-chart-3/10' : 'bg-muted text-muted-foreground'}`}>{filled} of {total} filled</span>}
        <ChevronRight className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden />
      </button>
      {open && <div id={body} className="divide-y border-t">{children}{note && <p className="px-4 py-2 text-[0.8125rem] text-muted-foreground">{note}</p>}</div>}
    </section>
  );
}

export type GroupSlot = { summary: string; node: ReactNode };
export const GROUP_IDS = [['contact', 'Contact options'], ['private', 'Private details'], ['tags', 'Tags and VIP'], ['tier', 'Tier and benefits'], ['history', 'Stay history and follow-ups'], ['record', 'Record and merge']] as const;

export function ProfileGroups({ guest, details, open, onOpenChange, saveField, tier, history, record }: { guest: GuestRow; details: ProfileDetails | null; open: string[]; onOpenChange: (id: string, open: boolean) => void; saveField: (def: FieldDef, value: string) => Promise<unknown>; tier: GroupSlot; history: GroupSlot; record: GroupSlot }) {
  const [reveal, setReveal] = useState(false);
  const src = { guest, details };
  const counts = groupCounts(src);
  const rows = (defs: FieldDef[]) => defs.map((def) => {
    const value = fieldValue(src, def.key);
    if (def.key === 'email') return <FieldRow key={def.key} def={def} value={value} readOnly onSave={async () => undefined} />;
    return <FieldRow key={def.key} def={def} value={value} locked={!!def.masked && !!value && !reveal} onUnlock={() => setReveal(true)} onSave={(v) => saveField(def, v)} />;
  });
  const t = (id: string) => ({ id, open: open.includes(id), onToggle: () => onOpenChange(id, !open.includes(id)), title: GROUP_IDS.find(([g]) => g === id)![1] });
  const link = safeMessengerUrl(details?.messenger_link);
  return (
    <div className="space-y-3">
      <Group {...t('contact')} summary={counts.contact.text} filled={counts.contact.filled} total={counts.contact.total}>
        {rows(CONTACT_FIELDS)}
        {link && <a href={link} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center px-4 text-base text-primary underline">Open Messenger conversation</a>}
        {!link && details?.messenger_psid && <Field label="Messenger PSID"><span className="break-all">{details.messenger_psid}</span> (open the Page inbox)</Field>}
      </Group>
      <Group {...t('private')} summary={counts.private.text} filled={counts.private.filled} total={counts.private.total} note="Address, ID number and Drive link stay hidden until shown. Changes ask a one-tap reason. A photo on file does not confirm a person’s identity.">
        {rows(PRIVATE_FIELDS)}
        <button type="button" className="flex min-h-12 w-full items-center px-4 text-left text-base font-semibold text-primary hover:bg-muted" onClick={() => setReveal(!reveal)}>{reveal ? 'Hide private values' : 'Show private values'}</button>
      </Group>
      <Group {...t('tags')} summary={counts.tags.text} filled={counts.tags.filled} total={counts.tags.total}>
        {rows(TAG_FIELDS)}
        {details?.vip_reason && <Field label="VIP reason">{details.vip_reason}</Field>}
      </Group>
      <Group {...t('tier')} summary={tier.summary} note="Saves itself. No reason needed.">{tier.node}</Group>
      <Group {...t('history')} summary={history.summary}>{history.node}</Group>
      <Group {...t('record')} summary={record.summary}>{record.node}</Group>
    </div>
  );
}

/** The notes row shows the stored text as per-stay bullet points instead of one wall of text. */
export const notesShown = (v: string) => v ? <NoteGroups text={v} /> : undefined;
