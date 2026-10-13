import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// D_ F17: the phone form of a table row, used only in embed mode at container width <= 600. One card per row: who or what, when,
// a status chip (glyph + word, from StatusBadge), the amount only where the page already shows it. The card is the tap target
// (a link, or a button when it opens a sheet) and is at least 44 px tall. `lead` is an optional control to the left (a checkbox)
// that is NOT part of the tap target.

export type D_Card = {
  key: string;
  title: ReactNode;
  sub?: ReactNode;
  when?: ReactNode;
  chip?: ReactNode;
  amount?: ReactNode;
  href?: string;
  onOpen?: () => void;
  lead?: ReactNode;
  className?: string;
};

export function D_RowCards({ items, label, total, page = 1, pageSize = 25, onPageChange }: { items: D_Card[]; label: string; total?: number; page?: number; pageSize?: number; onPageChange?: (p: number) => void }) {
  const pageCount = total !== undefined ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  return (
    <div className="space-y-2">
      <ul aria-label={label} className="D_cards space-y-2">
        {items.map((c) => {
          const body = (
            <>
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0 font-medium break-words">{c.title}</span>
                {c.amount && <span className="tabular shrink-0 font-medium">{c.amount}</span>}
              </span>
              {c.sub && <span className="block text-xs text-muted-foreground break-words">{c.sub}</span>}
              {(c.when || c.chip) && (
                <span className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-sm">
                  {c.when && <span className="tabular text-muted-foreground">{c.when}</span>}
                  {c.chip}
                </span>
              )}
            </>
          );
          const cls = 'block min-h-11 min-w-0 flex-1 px-3 py-2 text-left';
          return (
            <li key={c.key} className={cn('flex items-stretch rounded-xl border bg-card', c.className)}>
              {c.lead && <span className="flex shrink-0 items-center pl-3">{c.lead}</span>}
              {c.href ? <Link to={c.href} className={cls}>{body}</Link> : c.onOpen ? <button type="button" onClick={c.onOpen} className={cn(cls, 'w-full')}>{body}</button> : <div className={cls}>{body}</div>}
            </li>
          );
        })}
      </ul>
      {total !== undefined && total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span className="tabular">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={page <= 1} onClick={() => onPageChange?.(page - 1)}><ChevronLeft className="size-4" aria-hidden /></Button>
            <span className="tabular px-1">{page} / {pageCount}</span>
            <Button variant="outline" size="icon-sm" aria-label="Next page" disabled={page >= pageCount} onClick={() => onPageChange?.(page + 1)}><ChevronRight className="size-4" aria-hidden /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
