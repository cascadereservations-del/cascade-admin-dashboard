import type { ReactNode } from 'react';
import { Search, X } from 'lucide-react';
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
}: {
  search?: string;
  onSearch?: (v: string) => void;
  searchPlaceholder?: string;
  activeCount: number;
  onClear: () => void;
  children?: ReactNode;
  density?: 'comfortable' | 'compact';
  onDensity?: (d: 'comfortable' | 'compact') => void;
}) {
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
