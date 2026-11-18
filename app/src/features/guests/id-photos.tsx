import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ImageOff, Maximize2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toAppError } from '@/lib/errors';
import { PhotoLightbox, turnStyle } from '@/components/data/photo-lightbox';
import { Button } from '@/components/ui/button';
import { companionIdPhotoUrls, listGuestCompanions, removeIdPhoto, restoreIdPhoto, saveGuestCompanion, saveProfile, uploadCompanionIdPhoto, type ProfileDetails } from './api';
import { findSelfCompanion, guestIdStatus, idPhotoLabel, idPhotoRefs, idPhotoTurn, needsIdOnFile, otherCompanions, selfCompanionPatch } from './id-photo';
import { validateIdPhoto } from './local-records';
import { PhotoSheet } from './photo-sheet';

// ID photos on the guest page (Lloyd 2026-10-02: show the photo itself, full size on a click - not a
// link or a "Show" button). Every photo is a tile in ID-card proportions with the whole card visible
// (object-contain); a click opens one shared viewer that steps through the guest's own photo and every
// companion's. Signed URLs last 15 minutes and are fetched once per page.

type Ctx = { rotations: Map<string, number | null>; urls: Map<string, string | null> | undefined; loading: boolean; open: (companionId: string) => void };
const IdPhotoContext = createContext<Ctx | null>(null);

export function IdPhotoProvider({ guestId, guestName, children }: { guestId: string; guestName: string; children: ReactNode }) {
  const [viewer, setViewer] = useState<number | null>(null);
  const companions = useQuery({ queryKey: ['companions', guestId], queryFn: () => listGuestCompanions(guestId) });
  const refs = useMemo(() => idPhotoRefs(companions.data, guestName), [companions.data, guestName]);
  const paths = refs.map((r) => r.path);
  // Links last 15 minutes; renew at 10 so a tile or the viewer opened later never holds a dead link.
  const urls = useQuery({ queryKey: ['id-photo-urls', guestId, paths.join('|')], queryFn: () => companionIdPhotoUrls(paths), enabled: paths.length > 0, staleTime: 10 * 60_000, refetchInterval: 10 * 60_000 });
  const viewable = refs.filter((r) => urls.data?.get(r.path));
  const items = viewable.map((r) => ({ src: urls.data!.get(r.path)!, label: idPhotoLabel(r), sub: r.idType ? r.idType.replaceAll('_', ' ') : undefined, path: r.path, turn: r.rotation }));
  const rotations = useMemo(() => new Map(refs.map((r) => [r.companionId, r.rotation])), [refs]);
  // Quick taps on Rotate send one write: the last turn per photo goes out 600 ms after the final tap.
  const qc = useQueryClient();
  const pending = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; rotation: number; done: (ok: boolean) => void }>());
  const send = async (path: string, rotation: number) => {
    const { data, error } = await supabase.rpc('set_guest_photo_rotation_v1', { p_path: path, p_rotation: rotation });
    const ok = !error && (data as { ok?: boolean } | null)?.ok !== false;
    if (ok) void qc.invalidateQueries({ queryKey: ['companions', guestId] });
    else toast.error('Could not save the turn');
    return ok;
  };
  const flush = (path: string) => { const p = pending.current.get(path); if (!p) return; clearTimeout(p.timer); pending.current.delete(path); void send(path, p.rotation).then(p.done); };
  // Leaving within the debounce window still saves the last turn.
  useEffect(() => { const m = pending.current; return () => { for (const path of [...m.keys()]) flush(path); }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const saveTurn = (path: string, rotation: number) => new Promise<boolean>((resolve) => {
    pending.current.get(path)?.done(true); // superseded by this tap; the newest turn decides success
    clearTimeout(pending.current.get(path)?.timer);
    pending.current.set(path, { rotation, done: resolve, timer: setTimeout(() => flush(path), 600) });
  });
  const ctx: Ctx = { rotations, urls: urls.data, loading: paths.length > 0 && urls.isPending, open: (id) => { const k = viewable.findIndex((r) => r.companionId === id); if (k >= 0) setViewer(k); } };
  return (
    <IdPhotoContext.Provider value={ctx}>
      {children}
      <PhotoLightbox items={items} index={viewer} onIndexChange={setViewer} onClose={() => setViewer(null)} onTurn={saveTurn} />
    </IdPhotoContext.Provider>
  );
}

const tile = 'flex aspect-[8/5] shrink-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border bg-muted p-2 text-center text-xs leading-tight text-muted-foreground';

export function IdPhotoThumb({ companionId, path, name, className = 'w-28' }: { companionId: string; path: string; name: string; className?: string }) {
  const ctx = useContext(IdPhotoContext);
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ url: string; w: number; h: number }>();
  if (!ctx) return null;
  const url = ctx.urls?.get(path);
  const nat = loaded?.url === url ? loaded : undefined; // a replaced photo never reuses the old size
  if (ctx.loading) return <div className={`${tile} ${className} animate-pulse`} aria-label="Loading ID photo" />;
  if (!url || brokenUrl === url) return <div className={`${tile} ${className} border-destructive/40`} title="A photo is recorded for this person but the file could not be loaded." role="img" aria-label={`ID photo for ${name} could not be loaded`}><ImageOff className="size-4" aria-hidden />Photo file not found</div>;
  return (
    <button type="button" title="Open the full photo" className={`group relative aspect-[8/5] shrink-0 overflow-hidden rounded-lg border bg-muted p-1 ${className} focus-visible:outline-2 focus-visible:outline-ring`} onClick={() => ctx.open(companionId)} aria-label={`Open ID photo of ${name}`}>
      <span key={path} className="relative block size-full" style={{ containerType: 'size' }}>
        <img src={url} alt="" loading="lazy" className="absolute top-1/2 left-1/2 max-w-none object-contain" style={{ ...turnStyle(idPhotoTurn(ctx.rotations.get(companionId), nat)), visibility: nat || ctx.rotations.get(companionId) != null ? undefined : 'hidden' }} onLoad={(e) => setLoaded({ url: url!, w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} onError={() => setBrokenUrl(url)} />
      </span>
      <span aria-hidden className="absolute right-1 bottom-1 rounded bg-black/60 p-1 text-white opacity-70 group-hover:opacity-100"><Maximize2 className="size-3.5" /></span>
    </button>
  );
}

/** The empty tile in the same place and size a photo would take, so missing IDs stand out instead of hiding. */
export function NoIdPhotoTile({ text, warn = false, className = 'w-28', onClick }: { text: string; warn?: boolean; className?: string; onClick?: () => void }) {
  const cls = `${tile} ${className} border-dashed ${warn ? 'border-warn/60 text-warn' : ''}`;
  const body = <><ImageOff className="size-4" aria-hidden />{text}</>;
  return onClick ? <button type="button" className={`${cls} hover:bg-accent`} onClick={onClick}>{body}</button> : <div className={cls}>{body}</div>;
}

type Up = { file: File; src: string; stage: 'shrinking' | 'uploading' | 'saving' | 'failed' };
const STAGE = { shrinking: ['Shrinking photo…', 20], uploading: ['Uploading…', 55], saving: ['Saving…', 90] } as const;
const action = 'h-11 min-w-11 px-4 text-sm';

/** The guest's own ID on the guest card (s118): the photo or a calm placeholder, then Add / Replace / Remove. A pick shows at once as a local
 *  thumbnail and saves on its own (reason written for you, D-302); a failed save keeps the photo on screen with Retry. */
export function GuestIdPanel({ guestId, guestName, details }: { guestId: string; guestName: string; details: ProfileDetails | null }) {
  const qc = useQueryClient();
  const companions = useQuery({ queryKey: ['companions', guestId], queryFn: () => listGuestCompanions(guestId) });
  const self = findSelfCompanion(companions.data, guestName);
  const others = otherCompanions(companions.data, guestName).filter((c) => c.id_photo_path).length;
  const status = guestIdStatus(self, details, others);
  const [sheet, setSheet] = useState(false);
  const [drag, setDrag] = useState(false);
  const [up, setUp] = useState<Up | null>(null);
  // Survives a failed attempt so Retry resumes instead of creating a second companion or re-uploading.
  const progress = useRef<{ id?: string; version?: number; path?: string; photoSaved?: boolean; profileDone?: boolean; reason: string; prev: string | null }>({ reason: '', prev: null });
  const url = useRef<string | null>(null);
  useEffect(() => () => { if (url.current) URL.revokeObjectURL(url.current); }, []);
  const refresh = () => Promise.all([['companions', guestId], ['guest', guestId], ['timeline', guestId], ['id-photo-urls', guestId]].map((k) => qc.invalidateQueries({ queryKey: k })));
  const clear = () => { if (url.current) URL.revokeObjectURL(url.current); url.current = null; progress.current = { reason: '', prev: null }; setUp(null); };
  const stage = (s: Up['stage']) => setUp((u) => u && { ...u, stage: s });

  const run = async (file: File) => {
    const p = progress.current;
    try {
      stage('shrinking');
      if (!p.id) {
        if (self) { p.id = self.id; p.version = self.version; } // own row exists: no empty save, no extra audit entry
        else {
          const r = await saveGuestCompanion(guestId, null, selfCompanionPatch(guestName, '', self), undefined, p.reason);
          p.id = r.id; p.version = r.version;
        }
      }
      if (!p.photoSaved) {
        p.path ??= await uploadCompanionIdPhoto(p.id, file, (s) => stage(s === 'saved' ? 'saving' : s));
        stage('saving');
        const r = await saveGuestCompanion(guestId, p.id, { id_photo_path: p.path }, p.version, p.reason);
        p.version = r.version; p.photoSaved = true;
      }
      if (needsIdOnFile(details) && !p.profileDone) {
        await saveProfile(guestId, { id_on_file: true }, details?.version ?? null, p.reason);
        p.profileDone = true;
      }
      await refresh();
      const { id, version, prev } = p;
      clear();
      if (prev) toast.success('ID photo replaced', { duration: 6000, action: { label: 'Undo', onClick: () => { restoreIdPhoto(id!, prev, version!).then(refresh).catch((e) => toast.error(toAppError(e).message)); } } });
      else toast.success('ID photo saved');
    } catch (e) {
      if (p.photoSaved) void refresh();
      stage('failed');
      toast.error(toAppError(e).message);
    }
  };
  const start = (file: File) => {
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = URL.createObjectURL(file);
    progress.current = { reason: self?.id_photo_path ? 'ID photo replaced' : 'ID photo added', prev: self?.id_photo_path ?? null };
    setUp({ file, src: url.current, stage: 'shrinking' });
    void run(file);
  };
  const dropped = async (file: File | undefined) => {
    if (!file || up) return;
    try { await validateIdPhoto(file); start(file); } catch (e) { toast.error(toAppError(e).message); }
  };
  const removing = useRef(false);
  const remove = async () => {
    if (!self?.id_photo_path || removing.current) return;
    removing.current = true;
    try {
      const r = await removeIdPhoto(self.id, self.version);
      await refresh();
      toast('ID photo removed. The file stays in private storage.', { duration: 6000, action: { label: 'Undo', onClick: () => { restoreIdPhoto(self.id, r.previousPath!, r.version).then(refresh).catch((e) => toast.error(toAppError(e).message)); } } });
    } catch (e) { toast.error(toAppError(e).message); } finally { removing.current = false; }
  };

  const size = 'w-full max-w-72 @2xl/main:max-w-none';
  const text = { companion_photos: `No ID under the booking name. ${others === 1 ? 'The ID photo of the person who stayed is' : `${others} ID photos of the people who stayed are`} under Companions.`, marked_no_photo: 'Marked on file, no photo', none: 'No ID photo yet' } as const;
  const busy = !!up && up.stage !== 'failed';
  return (
    <div className="flex w-full shrink-0 flex-col gap-2 @2xl/main:w-60">
      <p className="text-xs font-medium text-muted-foreground">Guest ID</p>
      <div className={`relative ${size} ${drag ? 'rounded-lg ring-2 ring-ring' : ''}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); void dropped(e.dataTransfer.files[0]); }}>
        {up ? (
          <>
            <div className="aspect-[8/5] overflow-hidden rounded-lg border bg-card p-1"><img src={up.src} alt="The ID photo you chose" className="size-full object-contain" /></div>
            {up.stage === 'failed'
              ? <div role="alert" className="absolute inset-x-0 bottom-0 flex flex-col gap-2 rounded-b-lg border-t bg-background/95 p-2 text-sm">Upload stopped. Your photo is kept here.
                  <div className="flex gap-2"><Button type="button" className={action} onClick={() => void run(up.file)}>Retry</Button><Button type="button" variant="outline" className={action} onClick={clear}>Discard</Button></div></div>
              : <div role="status" className="absolute inset-x-0 bottom-0 rounded-b-lg border-t bg-background/95 p-2 text-sm">{STAGE[up.stage][0]}
                  <div role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={STAGE[up.stage][1]} className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${STAGE[up.stage][1]}%` }} /></div></div>}
          </>
        ) : status === 'photo'
          ? <IdPhotoThumb companionId={self!.id} path={self!.id_photo_path!} name={guestName} className="w-full" />
          : <div className="flex aspect-[8/5] flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-card p-2 text-center text-sm text-muted-foreground">
              <ImageOff className="size-5" aria-hidden /><span>{text[status]}</span>
              <Button type="button" className={action} onClick={() => setSheet(true)}>Add photo</Button>
              <span className="hidden text-xs @2xl/main:block">or drop an image here</span>
            </div>}
      </div>
      {status === 'photo' && !up && (
        <div className="flex gap-2">
          <Button type="button" variant="outline" className={action} onClick={() => setSheet(true)}>Replace</Button>
          <Button type="button" variant="outline" className={action} onClick={() => void remove()}>Remove</Button>
        </div>
      )}
      <PhotoSheet open={sheet && !busy} onClose={() => setSheet(false)} onPicked={start} />
    </div>
  );
}
