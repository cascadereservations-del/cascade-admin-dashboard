import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { FileLock2, FolderOpen, Search, X, CalendarDays, Heart, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/data/status-badge';
import { DetailSheet, Field } from '@/components/data/detail-sheet';
import { MAX_COLLECTION_BYTES, parseLocalCollection, validateIdPhoto, safeDriveUrl, type LocalCollection, type LocalField, type LocalPhoto, type LocalRecord } from './local-records';

function SourceFields({ fields }: { fields: LocalField[] }) {
  return <dl className="space-y-3">{fields.map((f, i) => <div key={`${f.line}-${i}`}><dt className="text-xs font-medium text-muted-foreground">{f.label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm">{f.value || 'Not recorded'} <span className="text-xs text-muted-foreground">· source line {f.line}</span></dd></div>)}</dl>;
}

/** This module deliberately has no Supabase, query-client or network imports. */
export function LocalRecordsPanel() {
  const [collection, setCollection] = useState<LocalCollection | null>(null);
  const [files, setFiles] = useState<Map<string, File>>(new Map());
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const photoGeneration = useRef(0);
  useEffect(() => { folderInput.current?.setAttribute('webkitdirectory', ''); }, []);
  useEffect(() => () => { generation.current++; photoGeneration.current++; }, []);
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  const clear = () => {
    generation.current++; photoGeneration.current++;
    setCollection(null); setFiles(new Map()); setSelected(null); setSearch(''); setFilter('all'); setReveal(false); setError(''); setBusy(false); setPhotoUrl(null);
  };
  const select = (key: string | null) => { photoGeneration.current++; setSelected(key); setReveal(false); setPhotoUrl(null); setError(''); };
  const load = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!selectedFiles.length) return;
    const current = ++generation.current;
    photoGeneration.current++;
    // Clear old personal data even when the next selection fails validation.
    setCollection(null); setFiles(new Map()); setSelected(null); setReveal(false); setPhotoUrl(null); setError(''); setBusy(true);
    try {
      const manifests = selectedFiles.filter((f) => f.name === 'guest-records.local.json');
      if (manifests.length !== 1) throw new Error('Choose the prepared folder containing one guest-records.local.json file, or choose that file directly.');
      const manifest = manifests[0]!;
      if (manifest.size > MAX_COLLECTION_BYTES) throw new Error('The collection is too large (maximum 5 MB).');
      const parsed = parseLocalCollection(await manifest.text());
      const rootPrefix = (manifest.webkitRelativePath ?? '').slice(0, -manifest.name.length);
      const fileMap = new Map<string, File>();
      for (const f of selectedFiles) if (f.webkitRelativePath && f.webkitRelativePath.startsWith(rootPrefix)) fileMap.set(f.webkitRelativePath.slice(rootPrefix.length), f);
      if (generation.current !== current) return;
      setCollection(parsed); setFiles(fileMap); setSearch(''); setFilter('all');
    } catch (e) { if (generation.current === current) setError(e instanceof Error ? e.message : 'Could not open the local collection.'); }
    finally { if (generation.current === current) setBusy(false); }
  };
  const openPhoto = async (photo: LocalPhoto) => {
    const current = ++photoGeneration.current;
    setError(''); setPhotoUrl(null);
    try {
      const file = files.get(photo.path);
      if (!file) throw new Error('Choose the original folder to view local ID photos.');
      const mime = await validateIdPhoto(file);
      const bytes = await file.arrayBuffer();
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
      if (file.size !== photo.bytes || digest !== photo.sha256) throw new Error('This photo differs from the prepared record. Prepare the collection again before viewing it.');
      if (photoGeneration.current === current) setPhotoUrl(URL.createObjectURL(new Blob([bytes], { type: mime })));
    } catch (e) { if (photoGeneration.current === current) setError(e instanceof Error ? e.message : 'Could not open the photo.'); }
  };
  const rows = useMemo(() => (collection?.records ?? []).filter((r) => (filter === 'all' || (filter === 'photos' ? r.photos.length > 0 : r.kind === filter)) && `${r.displayName} ${r.stayDates ?? ''} ${r.contact ?? ''} ${r.notes.map((n) => n.value).join(' ')}`.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim())), [collection, filter, search]);
  const record: LocalRecord | undefined = collection?.records.find((r) => r.key === selected);
  const total = collection?.records.length ?? 0;
  const documented = collection?.records.filter((r) => r.kind === 'documented').length ?? 0;
  const photoCount = collection?.records.reduce((n, r) => n + r.photos.length, 0) ?? 0;

  return <section aria-label="Local guest records" className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-card p-5">
      <div className="max-w-xl"><div className="mb-2 flex items-center gap-2 text-primary"><FileLock2 className="size-5" aria-hidden /><h2 className="font-semibold">Your collected guest records</h2></div><p className="text-sm text-muted-foreground">Open the private folder prepared on this computer. Records stay in this tab’s memory and clear when you leave it. They are not sent to the shared CRM.</p></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => folderInput.current?.click()} disabled={busy}><FolderOpen className="size-4" aria-hidden />Choose folder</Button>
        <Label htmlFor="local-manifest" className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm focus-within:ring-2">Choose collection file<input id="local-manifest" type="file" accept=".json,application/json" className="sr-only" disabled={busy} onChange={(e) => void load(e)} /></Label>
        {collection && <Button variant="ghost" onClick={clear}><X className="size-4" aria-hidden />Clear records</Button>}
      </div>
      <input ref={folderInput} aria-label="Choose private guest folder" type="file" multiple className="hidden" onChange={(e) => void load(e)} />
    </div>
    {busy && <p role="status" className="text-sm">Reading local collection…</p>}
    {error && <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
    {!collection && !busy && <div className="rounded-xl border border-dashed p-8 text-center"><FolderOpen className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden /><h3 className="font-medium">Keep the details that make a stay personal</h3><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Review birthdays, requests, early arrivals, courtesies and ID documents alongside their original notes. Choose the prepared Airbnb Client Details folder to begin.</p></div>}
    {collection && <>
      <div className="grid gap-3 sm:grid-cols-3" aria-label="Collection summary">
        {[{ n: documented, label: 'Documented records' }, { n: total - documented, label: 'Folders awaiting details' }, { n: photoCount, label: 'ID photos on file' }].map(({ n, label }) => <div key={label} className="rounded-xl border bg-card px-4 py-3"><div className="text-2xl font-semibold tabular">{n}</div><div className="text-xs text-muted-foreground">{label}</div></div>)}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1"><Label htmlFor="local-search">Search collected records</Label><div className="relative mt-1"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden /><Input id="local-search" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Guest, stay, phone or request" autoComplete="off" /></div></div>
        <div><Label htmlFor="local-filter">Show</Label><select id="local-filter" value={filter} onChange={(e) => setFilter(e.target.value)} className="mt-1 block h-9 rounded-md border bg-background px-3 text-sm"><option value="all">All records</option><option value="documented">With guest details</option><option value="inquiry_only">Inquiry folders</option><option value="folder_only">Other folders</option><option value="photos">With ID photos</option></select></div>
      </div>
      <p role="status" className="text-xs text-muted-foreground">{rows.length} of {total} records · Prepared {new Date(collection.generatedAt).toLocaleDateString()} · Source statements have not been independently verified.</p>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => <li key={r.key}><button type="button" className="flex h-full w-full flex-col gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" onClick={() => select(r.key)}>
          <div className="flex w-full items-start justify-between gap-2"><span className="break-words font-semibold">{r.displayName}</span><StatusBadge tone={r.kind === 'documented' ? 'info' : 'neutral'}>{r.kind === 'documented' ? 'Collected' : r.kind === 'inquiry_only' ? 'Inquiry only' : 'Folder only'}</StatusBadge></div>
          <span className="flex items-start gap-2 text-sm text-muted-foreground"><CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden />{r.stayDates ?? 'Dates not documented'}</span>
          <span className="mt-auto flex flex-wrap gap-3 text-xs text-muted-foreground"><span>{r.notes.length} source notes</span><span>{r.photos.length} ID photos</span></span>
        </button></li>)}
      </ul>
      {!rows.length && <p className="py-8 text-center text-sm text-muted-foreground">No collected records match these filters.</p>}
    </>}
    <DetailSheet open={!!record} onOpenChange={(open) => { if (!open) select(null); }} title={record?.displayName ?? 'Collected record'} description="Private source record. No automatic matching, merging or booking changes.">
      {record && <div className="space-y-5">
        <div className="rounded-lg bg-muted/50 p-3"><Field label="Stay dates">{record.stayDates ?? 'Not documented'}</Field><Field label="Guests">{record.guestCount ?? 'Not documented'}</Field><Field label="Contact">{record.contact ?? 'Not provided'}</Field></div>
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Heart className="size-4" aria-hidden />Requests & occasions</CardTitle></CardHeader><CardContent>{record.notes.length ? <SourceFields fields={record.notes} /> : <p className="text-sm text-muted-foreground">No requests or occasions documented.</p>}<p className="mt-4 text-xs text-muted-foreground">The original wording distinguishes a request from an agreed courtesy. “Not found” does not establish that no request was made.</p></CardContent></Card>
        <div><h3 className="mb-3 font-semibold">Guest & stay details</h3><SourceFields fields={record.fields} />{record.kind !== 'documented' && <p className="text-sm text-muted-foreground">Only the folder label is available. No booking, contact or guest identity has been inferred.</p>}</div>
        <div className="rounded-lg border p-3"><div className="flex items-center gap-2"><ShieldCheck className="size-4" aria-hidden /><h3 className="font-semibold">Private documents</h3></div><p className="my-2 text-xs text-muted-foreground">{record.photos.length} photo files · An ID on file is not a completed identity check.</p><Button variant="outline" size="sm" onClick={() => { photoGeneration.current++; setReveal(!reveal); setPhotoUrl(null); }}>{reveal ? 'Hide private details' : 'Reveal private details'}</Button>
          {reveal && <div className="mt-4 space-y-4"><SourceFields fields={record.identity} /><ul className="space-y-2">{record.photos.map((p, i) => <li key={p.path} className="flex flex-wrap items-center gap-2 text-sm"><span>ID photo {i + 1}</span>{files.has(p.path) && <Button size="sm" variant="outline" onClick={() => void openPhoto(p)}>View local photo {i + 1}</Button>}{safeDriveUrl(p.driveUrl) && <a href={safeDriveUrl(p.driveUrl)!} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="rounded border px-3 py-2 text-sm underline">Open Drive copy {i + 1}</a>}{!files.has(p.path) && !p.driveUrl && <span className="text-xs text-muted-foreground">Choose the original folder to view</span>}</li>)}</ul>
          {photoUrl && <div><Button variant="ghost" size="sm" onClick={() => setPhotoUrl(null)}>Close photo</Button><img src={photoUrl} alt="Selected private guest ID document" className="mt-2 max-h-96 w-full rounded-lg border object-contain" /></div>}
          {record.sourceText && <details><summary className="cursor-pointer py-2 text-sm font-medium">Original source document</summary><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 font-sans text-xs">{record.sourceText}</pre></details>}</div>}
        </div>
        <div className="break-all text-xs text-muted-foreground"><p>Source: {record.sourcePath ?? record.folder}</p>{record.sourceHash && <p className="mt-1">SHA-256: {record.sourceHash}</p>}</div>
      </div>}
    </DetailSheet>
  </section>;
}
