import { useEffect, useState, type ReactNode } from 'react';
import { D_useCompact } from '@/lib/compact';
import { PageHeader } from '@/components/data/page-header';
import { cn } from '@/lib/utils';

// s119 lane G, liquid-glass layer (docs/s118 DESIGN-liquid-glass.md section 0b, mockup-apple-glass-v3.html).
// Content layer: the warm header band. Functional layer: GlassSheet, the only glass here (blur 12 px, no saturate).

/** Fluid type: an inline-size container that swaps --t1..--t4 for the mockup's cqi clamps (root defaults live in index.css). */
export const FLUID = '[container-type:inline-size] [--t1:clamp(1.75rem,.296rem_+_7.27cqi,2.25rem)] [--t2:clamp(1rem,.636rem_+_1.82cqi,1.125rem)] [--t3:clamp(.875rem,.511rem_+_1.82cqi,1rem)] [--t4:clamp(.8125rem,.386rem_+_1.82cqi,.875rem)]';

// s119 lane G: under 640 px lists become row cards and sheets become bottom sheets. jsdom has no matchMedia, so this is false there.
const NARROW = '(max-width: 639px)';
export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(NARROW).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(NARROW);
    if (!mq) return;
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

const MARK = `${import.meta.env.BASE_URL}apple-touch-icon-180.png`;

/** Page title on a sand wash that fades into the page background, with the Cascade mark at --band-mark opacity. Embed + narrow keeps the compact header. */
export function PageBand({ title, description, actions, className }: { title: string; description?: ReactNode; actions?: ReactNode; className?: string }) {
  const compact = D_useCompact();
  if (compact) return <PageHeader title={title} description={description} actions={actions} />;
  return (
    <header data-slot="page-band" className={cn('relative isolate mb-4 overflow-hidden px-1 pt-4 pb-6', FLUID, className)}>
      <div aria-hidden data-slot="page-band-wash" className="pointer-events-none absolute inset-0 -z-10" style={{ background: 'linear-gradient(180deg, var(--band-a) 0%, var(--band-b) 100%)' }} />
      <img aria-hidden alt="" src={MARK} width={150} height={150} data-slot="page-band-mark" className="pointer-events-none absolute -top-2 -right-4 -z-10 size-[150px] select-none" style={{ opacity: 'var(--band-mark)' }} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-bold tracking-tight" style={{ fontSize: 'var(--t1)', lineHeight: 1.15 }}>{title}</h1>
          {description && <p className="mt-1 text-muted-foreground" style={{ fontSize: 'var(--t3)' }}>{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 max-sm:w-full">{actions}</div>}
      </div>
    </header>
  );
}

type Vaul = { Drawer: typeof import('vaul').Drawer };

/**
 * Bottom sheet on vaul, loaded on first open (own chunk). Glass on the sheet only: reduced transparency and increased contrast fall back to
 * the solid popover colour, reduced motion drops the slide. Escape, focus trap and focus return come from vaul's Radix dialog.
 */
export function GlassSheet({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: ReactNode }) {
  const [v, setV] = useState<Vaul | null>(null);
  useEffect(() => { if (open && !v) void import('vaul').then((m) => setV({ Drawer: m.Drawer })); }, [open, v]);
  if (!v) return null;
  const { Drawer } = v;
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/30" />
        <Drawer.Content
          data-slot="glass-sheet"
          className={cn(
            'fixed inset-x-2 bottom-2 z-50 mx-auto flex max-h-[85svh] max-w-xl flex-col rounded-[24px] border bg-popover/90 text-popover-foreground shadow-lg outline-none backdrop-blur-[12px]',
            '[@media(prefers-reduced-transparency:reduce)]:bg-popover [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none',
            'contrast-more:border-2 contrast-more:border-foreground contrast-more:bg-popover contrast-more:backdrop-blur-none',
            'motion-reduce:!transition-none motion-reduce:!animate-none',
            FLUID,
          )}
        >
          <div aria-hidden className="mx-auto mt-2.5 h-[5px] w-10 shrink-0 rounded-full bg-current opacity-30" />
          <Drawer.Title className="px-4 pt-2 font-bold" style={{ fontSize: 'var(--t2)' }}>{title}</Drawer.Title>
          <Drawer.Description className={description ? 'px-4 text-muted-foreground' : 'sr-only'} style={{ fontSize: 'var(--t3)' }}>{description ?? title}</Drawer.Description>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pt-3 pb-6">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
