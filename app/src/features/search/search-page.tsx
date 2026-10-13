import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useSession } from '@/auth/session';
import { PageHeader } from '@/components/data/page-header';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/data/query-state';
import { Input } from '@/components/ui/input';
import { NAV } from '@/components/shell/nav';
import { globalSearch } from './api';

// D_ Search as a page: inside the Cascade Staff frame there is no header search box or Ctrl+K, so the same global search
// (bookings, guests, stock, cleanings, tasks; each source filtered by the server) gets a route of its own: #/search.

export default function SearchPage() {
  const s = useSession();
  const [q, setQ] = useState('');
  const term = q.trim();
  const hits = useQuery({ queryKey: ['search-page', s.propertyId, s.caps.role, term], queryFn: () => globalSearch(s.propertyId, term, s.caps), enabled: term.length >= 2, staleTime: 10_000 });
  const pages = NAV.filter((n) => s.caps.can(n.action)).flatMap((n) => [{ to: n.to, label: n.label }, ...(n.children ?? []).filter((c) => !c.action || s.caps.can(c.action)).map((c) => ({ to: c.to, label: `${n.label} › ${c.label}` }))]);
  return (
    <div>
      <PageHeader title="Search" description="Bookings, guests, stock, cleanings and tasks." />
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input aria-label="Search" type="search" inputMode="search" autoComplete="off" placeholder="Type a name, code or item" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {term.length < 2 ? (
        <ul className="divide-y rounded-lg border text-sm" aria-label="Pages">
          {pages.map((p) => <li key={p.to}><Link to={p.to} className="flex min-h-11 items-center px-3">{p.label}</Link></li>)}
        </ul>
      ) : hits.isPending ? <ListSkeleton rows={4} /> : hits.isError ? <ErrorState error={hits.error} onRetry={() => void hits.refetch()} /> : hits.data.length === 0 ? <EmptyState title="No matches" hint="Try a different spelling, or fewer letters." /> : (
        <ul className="divide-y rounded-lg border text-sm" aria-label="Results">
          {hits.data.map((r) => (
            <li key={`${r.kind}-${r.id}`}>
              <Link to={r.href} className="flex min-h-11 flex-col justify-center px-3 py-2">
                <span className="flex items-center gap-2"><span className="w-16 shrink-0 text-xs uppercase text-muted-foreground">{r.kind}</span><span className="truncate font-medium">{r.title}</span></span>
                {r.subtitle && <span className="pl-[4.5rem] text-xs text-muted-foreground">{r.subtitle}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
