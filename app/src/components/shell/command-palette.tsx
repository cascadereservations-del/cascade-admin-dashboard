import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { useSession } from '@/auth/session';
import { NAV } from './nav';
import { globalSearch } from '@/features/search/api';

// UX01 + UX02: Ctrl/Cmd+K palette for navigation and global search across
// authorised bookings, guests, inventory and tasks. Results come from the
// server (RLS filtered); nothing is searched client-side from cached data.

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const nav = useNavigate();
  const s = useSession();
  const [q, setQ] = useState('');

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [open, onOpenChange]);

  const search = useQuery({
    queryKey: ['search', s.propertyId, s.caps.role, q],
    queryFn: () => globalSearch(s.propertyId, q, s.caps),
    enabled: open && q.trim().length >= 2,
    staleTime: 10_000,
  });

  const go = (to: string) => {
    onOpenChange(false);
    setQ('');
    nav(to);
  };

  const pages = NAV.filter((n) => s.caps.can(n.action)).flatMap((n) => [
    { to: n.to, label: n.label },
    ...(n.children ?? []).filter((c) => !c.action || s.caps.can(c.action)).map((c) => ({ to: c.to, label: `${n.label} › ${c.label}` })),
  ]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search and navigate" description="Type to search bookings, guests, stock and tasks, or jump to a page.">
      <CommandInput placeholder="Search bookings, guests, stock, tasks… or type a page" value={q} onValueChange={setQ} />
      <CommandList>
        <CommandEmpty>{search.isFetching ? 'Searching…' : q.length < 2 ? 'Type at least two characters to search records.' : 'No matches.'}</CommandEmpty>
        {search.data && search.data.length > 0 && (
          <CommandGroup heading="Records">
            {search.data.map((r) => (
              <CommandItem key={`${r.kind}-${r.id}`} value={`${r.kind} ${r.title} ${r.subtitle ?? ''}`} onSelect={() => go(r.href)}>
                <span className="w-20 shrink-0 text-xs uppercase text-muted-foreground">{r.kind}</span>
                <span className="truncate">{r.title}</span>
                {r.subtitle && <span className="ml-auto truncate text-xs text-muted-foreground">{r.subtitle}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {search.isError && <div className="px-3 py-2 text-xs text-destructive">Search failed: {(search.error as Error).message}</div>}
        <CommandSeparator />
        <CommandGroup heading="Pages">
          {pages.map((p) => (
            <CommandItem key={p.to} value={`page ${p.label}`} onSelect={() => go(p.to)}>
              {p.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
