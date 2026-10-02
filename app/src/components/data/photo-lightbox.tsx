import { useEffect, useRef, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { counterText, swipeStep, wrapIndex } from '@/lib/lightbox';

// One photo viewer for the whole dashboard (cleaning log, guest and companion ID photos):
// full-size image, Left/Right/Esc, swipe, "3 / 24", a label per photo and a thumbnail strip
// so a whole set can be checked in sequence without opening files one by one.

export type LightboxItem = { src: string; thumb?: string; label: string; sub?: string; href?: string };

export function PhotoLightbox({ items, index, onIndexChange, onClose }: { items: LightboxItem[]; index: number | null; onIndexChange: (i: number) => void; onClose: () => void }) {
  const n = items.length;
  const open = index !== null && n > 0;
  const i = open ? wrapIndex(index, n) : 0;
  const item = items[i];
  const down = useRef<{ x: number; y: number } | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const go = (d: number) => onIndexChange(wrapIndex(i + d, n));

  useEffect(() => {
    // Keep the active thumbnail in view, and warm the neighbours so stepping is instant.
    strip.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
    if (!open) return;
    for (const d of [1, -1]) { const p = items[wrapIndex(i + d, n)]; if (p) new Image().src = p.src; }
  }, [open, i, items, n]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent showCloseButton={false} onKeyDown={onKey} className="max-w-[calc(100%-1rem)] gap-0 overflow-hidden border-0 bg-black/95 p-0 text-white sm:max-w-5xl">
        <DialogTitle className="sr-only">Photo viewer</DialogTitle>
        <DialogDescription className="sr-only">Use the arrow keys or swipe to move between photos. Escape closes.</DialogDescription>
        {item && (
          <>
            <div className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="tabular rounded bg-white/15 px-2 py-0.5 text-xs font-medium" aria-live="polite">{counterText(i, n)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.label}</p>
                {item.sub && <p className="truncate text-xs text-white/60">{item.sub}</p>}
              </div>
              <a href={item.href ?? item.src} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-white/80 hover:bg-white/10" aria-label="Open the original in a new tab"><ExternalLink className="size-3.5" aria-hidden /> Original</a>
              <button type="button" onClick={onClose} className="rounded p-1.5 hover:bg-white/10" aria-label="Close viewer"><X className="size-5" aria-hidden /></button>
            </div>
            <div
              className="relative flex h-[62vh] touch-pan-y select-none items-center justify-center"
              onPointerDown={(e) => { down.current = { x: e.clientX, y: e.clientY }; }}
              onPointerUp={(e) => { const s = down.current; down.current = null; if (s) { const step = swipeStep(e.clientX - s.x, e.clientY - s.y); if (step) go(step); } }}
              onPointerCancel={() => { down.current = null; }}
            >
              <img key={item.src} src={item.src} alt={item.label} draggable={false} className="max-h-full max-w-full object-contain" />
              {n > 1 && (
                <>
                  <button type="button" onClick={() => go(-1)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2.5 hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-white" aria-label="Previous photo"><ChevronLeft className="size-6" aria-hidden /></button>
                  <button type="button" onClick={() => go(1)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2.5 hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-white" aria-label="Next photo"><ChevronRight className="size-6" aria-hidden /></button>
                </>
              )}
            </div>
            {n > 1 && (
              <div ref={strip} className="flex gap-1.5 overflow-x-auto px-3 py-2" role="group" aria-label="All photos">
                {items.map((p, k) => (
                  <button key={k} type="button" aria-current={k === i} aria-label={`Photo ${k + 1}: ${p.label}`} onClick={() => onIndexChange(k)} className={`size-12 shrink-0 overflow-hidden rounded border-2 ${k === i ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                    <img src={p.thumb ?? p.src} alt="" loading="lazy" className="size-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
