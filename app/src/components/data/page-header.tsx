import { useId, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { D_useCompact } from '@/lib/compact';

export function PageHeader({ title, description, actions, compactActions }: { title: string; description?: ReactNode; actions?: ReactNode; compactActions?: ReactNode }) {
  const compact = D_useCompact();
  const [open, setOpen] = useState(false);
  const id = useId();
  if (compact) {
    // D_ F17: embed + narrow. Title, an (i) button that opens the explanation, and only the primary action (compactActions, `null` drops all; the
    // sibling links already sit in the embed section row, so a "Calendar" or "Open in list" button is not repeated here).
    return (
      <div className="mb-3">
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 flex-1">{title}</h1>
          {description && (
            <button type="button" aria-label={`About ${title}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
              <Info className="size-5" aria-hidden />
            </button>
          )}
          {compactActions}
        </div>
        {compactActions === undefined && actions && <div className="mt-2 flex flex-wrap items-center gap-2">{actions}</div>}
        {description && open && <p id={id} className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
    );
  }
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-[28px] leading-[34px] font-semibold">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 max-sm:w-full">{actions}</div>}
    </div>
  );
}

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
