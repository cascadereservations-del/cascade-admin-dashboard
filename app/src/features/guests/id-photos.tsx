import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Eye, ImageOff } from 'lucide-react';
import { toAppError } from '@/lib/errors';
import { PhotoLightbox } from '@/components/data/photo-lightbox';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { companionIdPhotoUrls, listGuestCompanions, saveGuestCompanion, saveProfile, uploadCompanionIdPhoto, type ProfileDetails } from './api';
import { ID_TYPES, findSelfCompanion, idPhotoFormError, idPhotoLabel, idPhotoRefs, needsIdOnFile, selfCompanionPatch } from './id-photo';
import { validateIdPhoto } from './local-records';

// ID photos on the guest page: small thumbnails that open one shared viewer stepping through the
// guest's own photo and every companion's. Previews stay hidden until staff choose to reveal them
// (the same toggle as "Reveal private details"); signed URLs are only requested after that.

type Ctx = { reveal: boolean; setReveal: (v: boolean) => void; urls: Map<string, string | null> | undefined; loading: boolean; open: (companionId: string) => void };
const IdPhotoContext = createContext<Ctx | null>(null);
export const useIdPhotoReveal = () => useContext(IdPhotoContext);

export function IdPhotoProvider({ guestId, guestName, children }: { guestId: string; guestName: string; children: ReactNode }) {
  const [reveal, setReveal] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const companions = useQuery({ queryKey: ['companions', guestId], queryFn: () => listGuestCompanions(guestId) });
  const refs = useMemo(() => idPhotoRefs(companions.data, guestName), [companions.data, guestName]);
  const paths = refs.map((r) => r.path);
  const urls = useQuery({ queryKey: ['id-photo-urls', guestId, paths.join('|')], queryFn: () => companionIdPhotoUrls(paths), enabled: reveal && paths.length > 0, staleTime: 10 * 60_000 });
  const viewable = refs.filter((r) => urls.data?.get(r.path));
  const items = viewable.map((r) => ({ src: urls.data!.get(r.path)!, label: idPhotoLabel(r), sub: r.idType ? r.idType.replaceAll('_', ' ') : undefined }));
  const ctx: Ctx = { reveal, setReveal, urls: urls.data, loading: reveal && paths.length > 0 && urls.isPending, open: (id) => { const k = viewable.findIndex((r) => r.companionId === id); if (k >= 0) setViewer(k); } };
  return (
    <IdPhotoContext.Provider value={ctx}>
      {children}
      <PhotoLightbox items={items} index={viewer} onIndexChange={setViewer} onClose={() => setViewer(null)} />
    </IdPhotoContext.Provider>
  );
}

const tile = 'flex shrink-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg border bg-muted text-center text-[11px] leading-tight text-muted-foreground';

export function IdPhotoThumb({ companionId, path, name, size = 'size-16' }: { companionId: string; path: string; name: string; size?: string }) {
  const ctx = useContext(IdPhotoContext);
  const [broken, setBroken] = useState(false);
  if (!ctx) return null;
  if (!ctx.reveal) return <button type="button" className={`${tile} ${size} hover:bg-accent`} onClick={() => ctx.setReveal(true)} aria-label={`Show ID photo preview for ${name}`}><Eye className="size-4" aria-hidden />Show</button>;
  const url = ctx.urls?.get(path);
  if (ctx.loading) return <div className={`${tile} ${size} animate-pulse`} aria-label="Loading ID photo" />;
  if (!url || broken) return <div className={`${tile} ${size} border-destructive/40`} title="A photo is recorded for this person but the file could not be loaded." role="img" aria-label={`ID photo for ${name} could not be loaded`}><ImageOff className="size-4" aria-hidden />Not found</div>;
  return (
    <button type="button" className={`${size} shrink-0 overflow-hidden rounded-lg border focus-visible:outline-2 focus-visible:outline-ring`} onClick={() => ctx.open(companionId)} aria-label={`Open ID photo of ${name}`}>
      <img src={url} alt="" loading="lazy" className="size-full object-cover" onError={() => setBroken(true)} />
    </button>
  );
}

/** "Add ID photo" / "Replace ID photo" for the guest themself -- saves through the audited companion path. */
export function GuestIdPhotoControl({ guestId, guestName, details }: { guestId: string; guestName: string; details: ProfileDetails | null }) {
  const qc = useQueryClient();
  const companions = useQuery({ queryKey: ['companions', guestId], queryFn: () => listGuestCompanions(guestId) });
  const self = findSelfCompanion(companions.data, guestName);
  const refs = idPhotoRefs(companions.data, guestName);
  const mine = refs.find((r) => r.isSelf);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [idType, setIdType] = useState('');
  const [reason, setReason] = useState('');
  const [markOnFile, setMarkOnFile] = useState(true);
  // Survives a failed attempt so Retry resumes instead of creating a second companion or re-uploading.
  const progress = useRef<{ id?: string; version?: number; path?: string; photoSaved?: boolean; profileDone?: boolean }>({});

  const reset = () => { progress.current = {}; setFile(null); setReason(''); setIdType(self?.id_type ?? details?.id_type ?? ''); setMarkOnFile(true); };
  const refresh = () => { for (const k of [['companions', guestId], ['guest', guestId], ['timeline', guestId], ['id-photo-urls', guestId]]) void qc.invalidateQueries({ queryKey: k }); };

  const save = useMutation({
    mutationFn: async () => {
      const problem = idPhotoFormError(file, reason);
      if (problem) throw new Error(problem);
      await validateIdPhoto(file!);
      const p = progress.current;
      if (!p.id) {
        const r = await saveGuestCompanion(guestId, self?.id ?? null, selfCompanionPatch(guestName, idType, self), self?.version, reason);
        p.id = r.id; p.version = r.version;
      }
      if (!p.photoSaved) {
        p.path ??= await uploadCompanionIdPhoto(p.id, file!);
        const r = await saveGuestCompanion(guestId, p.id, { id_photo_path: p.path }, p.version, reason);
        p.version = r.version; p.photoSaved = true;
      }
      if (markOnFile && needsIdOnFile(details) && !p.profileDone) {
        await saveProfile(guestId, { id_on_file: true }, details?.version ?? null, reason);
        p.profileDone = true;
      }
    },
    onSuccess: () => { toast.success('ID photo saved'); setOpen(false); reset(); refresh(); },
    onError: (e) => { if (progress.current.photoSaved) refresh(); toast.error(toAppError(e).message); },
  });

  return (
    <>
      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => { reset(); setOpen(true); }}>{mine ? 'Replace ID photo' : 'Add ID photo'}</Button>
      <Dialog open={open} onOpenChange={(o) => { if (!o && !save.isPending) setOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{mine ? 'Replace ID photo' : 'Add ID photo'}</DialogTitle>
            <DialogDescription>Kept in Cascade’s private storage on the guest’s own record. The change is logged with your reason.</DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            <div>
              <Label htmlFor="idp-file">Photo</Label>
              <Input id="idp-file" type="file" accept="image/jpeg,image/png,image/webp" disabled={save.isPending} onChange={(e) => { setFile(e.target.files?.[0] ?? null); progress.current.path = undefined; progress.current.photoSaved = false; }} className="text-base" />
              <p className="mt-1 text-xs text-muted-foreground">JPEG, PNG or WebP, up to 10 MB.</p>
            </div>
            <div>
              <Label htmlFor="idp-type">ID type</Label>
              <Select value={idType || 'unset'} onValueChange={(v) => setIdType(v === 'unset' ? '' : v)}>
                <SelectTrigger id="idp-type"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="unset">Not stated</SelectItem>{ID_TYPES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label htmlFor="idp-reason">Reason</Label><Input id="idp-reason" required minLength={3} maxLength={500} placeholder="e.g. ID shown at check-in" value={reason} onChange={(e) => setReason(e.target.value)} className="text-base" /></div>
            {needsIdOnFile(details) && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={markOnFile} onChange={(e) => setMarkOnFile(e.target.checked)} /> Also mark “ID on file” on the profile</label>}
            {save.isError && progress.current.id && <p role="alert" className="text-sm">Part of this may already be saved. Retry carries on from where it stopped.</p>}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={save.isPending} onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save photo'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
