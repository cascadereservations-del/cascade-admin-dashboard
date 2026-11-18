import { useEffect, useRef, useState } from 'react';
import { Camera, ClipboardPaste, Images } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toAppError } from '@/lib/errors';
import { validateIdPhoto } from './local-records';

// Where an ID photo comes from (s118): a bottom action sheet. Radix gives the focus trap and Esc; every row is 44 px.
// The file is checked on pick (type by its bytes, up to 10 MB), so a bad file is refused here and never reaches Save.

const ACCEPT = 'image/jpeg,image/png,image/webp';
const row = 'h-11 w-full justify-start gap-3 px-4 text-base';

export function PhotoSheet({ open, onClose, onPicked, allowPaste = true }: { open: boolean; onClose(): void; onPicked(file: File): void; allowPaste?: boolean }) {
  const [problem, setProblem] = useState('');
  const [drag, setDrag] = useState(false);
  const library = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const touch = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

  const take = async (file: File | null | undefined) => {
    if (!file) return;
    try { await validateIdPhoto(file); } catch (e) { setProblem(toAppError(e).message); return; }
    setProblem('');
    onPicked(file);
    onClose();
  };
  useEffect(() => { if (!open) { setProblem(''); setDrag(false); } }, [open]);
  // Ctrl+V while the sheet is open pastes a copied image (from Airbnb or Messenger).
  useEffect(() => {
    if (!open || !allowPaste) return;
    const on = (e: ClipboardEvent) => { const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); void take(f); } };
    document.addEventListener('paste', on);
    return () => document.removeEventListener('paste', on);
  }); // eslint-disable-line react-hooks/exhaustive-deps -- re-bound each render so it sees the current onPicked

  const paste = async () => {
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) return void take(new File([await item.getType(type)], 'pasted', { type }));
      }
      setProblem('No image on the clipboard yet. Copy one, then try again.');
    } catch { setProblem('Press Ctrl+V to paste the image.'); }
  };
  const input = (ref: React.RefObject<HTMLInputElement | null>, capture?: 'environment') => (
    <input ref={ref} type="file" accept={ACCEPT} capture={capture} hidden data-testid={capture ? 'photo-camera' : 'photo-library'} onChange={(e) => { void take(e.target.files?.[0]); e.target.value = ''; }} />
  );

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="mx-auto max-w-md rounded-t-2xl pb-4">
        <SheetHeader>
          <SheetTitle>Add photo</SheetTitle>
          <SheetDescription>JPEG, PNG or WebP, up to 10 MB. It is shrunk here before it is saved.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-1 px-2">
          {touch && <Button type="button" variant="ghost" className={row} onClick={() => camera.current?.click()}><Camera aria-hidden /> Take Photo</Button>}
          <Button type="button" variant="ghost" className={row} onClick={() => library.current?.click()}><Images aria-hidden /> {touch ? 'Choose from Library' : 'Choose File…'}</Button>
          {allowPaste && <Button type="button" variant="ghost" className={row} onClick={() => void paste()}><ClipboardPaste aria-hidden /> {touch ? 'Paste' : 'Paste (Ctrl+V)'}</Button>}
        </div>
        {!touch && (
          <div
            className={`mx-4 flex min-h-11 items-center justify-center rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground ${drag ? 'bg-accent' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); void take(e.dataTransfer.files[0]); }}
          >Or drop an image here</div>
        )}
        {problem && <p role="alert" className="px-4 text-sm">{problem}</p>}
        {input(library)}{input(camera, 'environment')}
        <div className="px-2"><Button type="button" variant="outline" className={row + ' justify-center'} onClick={onClose}>Cancel</Button></div>
      </SheetContent>
    </Sheet>
  );
}
