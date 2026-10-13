import type { ReactNode } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { D_useCompact } from '@/lib/compact';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

// UX05: clear-filters control with an active count. Children are extra
// filters (selects, date inputs). Search is persisted by the caller via URL.

export function FilterBar({
  search,
  onSearch,
  searchPlaceholder = 'Search…',
  activeCount,
  onClear,
  children,
  density,
  onDensity,
  sheetTop,
  sheetBottom,
}: {
  search?: string;
  onSearch?: (v: string) => void;
  searchPlaceholder?: string;
  activeCount: number;
  onClear: () => void;
  children?: ReactNode;
  density?: 'comfortable' | 'compact';
  onDensity?: (d: 'comfortable' | 'compact') => void;
  /** Embed + narrow only: extra controls placed first / last inside the Filters sheet (a view switch, an export button). */
  sheetTop?: ReactNode;
  sheetBottom?: ReactNode;
}) {
  const compact = D_useCompact();
  if (compact) {
    // D_ F17: search stays visible; every other control sits behind one `Filters (n)` button. No density toggle: rows are cards here.
    return (
      <div className="mb-3 flex items-center gap-2">
        {onSearch && (
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input aria-label="Search" placeholder={searchPlaceholder} className="pl-8 text-base" value={search ?? ''} onChange={(e) => onSearch(e.target.value)} />
          </div>
        )}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="D_filters-button min-h-11 shrink-0">
              <SlidersHorizontal className="size-4" aria-hidden /> {activeCount > 0 ? `Filters (${activeCount})` : 'Filters'}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="D_filters-content max-h-[85svh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
              <SheetDescription className="sr-only">Narrow the list. Changes apply straight away.</SheetDescription>
            </SheetHeader>
            <div className="D_filters-sheet flex flex-col gap-3 px-4 pb-6">
              {sheetTop}
              {children}
              {sheetBottom}
              <div className="flex gap-2 pt-1">
                {activeCount > 0 && <Button variant="outline" className="min-h-11 flex-1" onClick={onClear}>Clear {activeCount} filter{activeCount > 1 ? 's' : ''}</Button>}
                <SheetClose asChild><Button className="min-h-11 flex-1">Done</Button></SheetClose>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    );
  }
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {onSearch && (
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input aria-label="Search" placeholder={searchPlaceholder} className="pl-8 text-base sm:text-sm" value={search ?? ''} onChange={(e) => onSearch(e.target.value)} />
        </div>
      )}
      {children}
      {activeCount > 0 && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X className="size-4" aria-hidden /> Clear {activeCount} filter{activeCount > 1 ? 's' : ''}
        </Button>
      )}
      {onDensity && (
        <ToggleGroup type="single" value={density ?? 'comfortable'} onValueChange={(v) => v && onDensity(v as 'comfortable' | 'compact')} className="ml-auto" aria-label="Table density" size="sm" variant="outline">
          <ToggleGroupItem value="comfortable" aria-label="Comfortable rows">Comfortable</ToggleGroupItem>
          <ToggleGroupItem value="compact" aria-label="Compact rows">Compact</ToggleGroupItem>
        </ToggleGroup>
      )}
    </div>
  );
}

/** A date field. In the phone Filters sheet it gets a visible label (a bare date input has none); elsewhere it is exactly the old input. */
export function FilterDate({ label, ariaLabel, value, onChange }: { label: string; ariaLabel: string; value: string; onChange: (v: string) => void }) {
  const compact = D_useCompact();
  const input = <Input type="date" aria-label={ariaLabel} className="w-40 text-base sm:text-sm" value={value} onChange={(e) => onChange(e.target.value)} />;
  return compact ? <label className="flex flex-col gap-1 text-sm font-medium">{label}{input}</label> : input;
}

export function FilterSelect({ label, value, onChange, options, allLabel = 'All' }: { label: string; value: string | undefined; onChange: (v: string | undefined) => void; options: Array<{ value: string; label: string }>; allLabel?: string }) {
  return (
    <Select value={value ?? '__all'} onValueChange={(v) => onChange(v === '__all' ? undefined : v)}>
      <SelectTrigger size="sm" aria-label={label} className="min-w-36">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all">{label}: {allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
