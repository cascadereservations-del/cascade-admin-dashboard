import { Link, Outlet, useLocation } from 'react-router';
import { Toaster } from '@/components/ui/sonner';
import { useSession } from '@/auth/session';
import { NAV } from './nav';

// D_ embed frame: no header, sidebar or bottom bar (the Cascade Staff shell draws the bar and Back). The only chrome is a
// row of sibling links for the section you are in (Bookings: List, Calendar, Inquiries), scrolling sideways on a phone,
// so moving between routes still works inside the frame.

export function EmbedShell() {
  const s = useSession();
  const { pathname } = useLocation();
  const section = NAV.filter((n) => s.caps.can(n.action)).find((n) => pathname === n.to || pathname.startsWith(n.to + '/'));
  const kids = (section?.children ?? []).filter((c) => !c.action || s.caps.can(c.action));
  // The longest link that is the path or a parent of it wins, so /bookings/calendar lights Calendar, not List.
  const current = kids.filter((c) => pathname === c.to || pathname.startsWith(c.to + '/')).sort((a, b) => b.to.length - a.to.length)[0]?.to;
  return (
    <div data-embed className="min-h-svh">
      {section && kids.length > 1 && (
        <nav aria-label={`${section.label} sections`} className="D_embed-sections">
          {kids.map((c) => (
            <Link key={c.to} to={c.to} aria-current={c.to === current ? 'page' : undefined} data-active={c.to === current ? 'true' : undefined}>{c.label}</Link>
          ))}
        </nav>
      )}
      <main id="main" className="@container/main px-4 pt-3 pb-8">
        <Outlet />
      </main>
      <Toaster position="top-center" />
    </div>
  );
}
