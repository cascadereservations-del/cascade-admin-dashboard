import { supabase } from '@/lib/supabase';
import type { Capabilities } from '@/auth/capabilities';

export type SearchHit = { kind: 'booking' | 'guest' | 'stock' | 'task' | 'cleaning'; id: string; title: string; subtitle?: string; href: string };

// UX01 global search. Each source is queried with RLS; a forbidden source is
// skipped silently because the palette shows only authorised records.
// D_ opts.kinds (embed Search page): only those sources are queried, and a task hit opens the one task list (D-301).
export async function globalSearch(propertyId: string, q: string, caps: Capabilities, opts?: { kinds?: Array<SearchHit['kind']> }): Promise<SearchHit[]> {
  const want = (k: SearchHit['kind']) => !opts?.kinds || opts.kinds.includes(k);
  const term = q.trim();
  if (term.length < 2) return [];
  const like = `%${term.replace(/[%_]/g, '\$&')}%`;
  const hits: SearchHit[] = [];
  const jobs: PromiseLike<void>[] = [];

  if (want('booking')) jobs.push(
    supabase
      .from('airbnb_reservations')
      .select('id, confirmation_code, guest_name, checkin_date, checkout_date')
      .eq('property_id', propertyId)
      .or(`confirmation_code.ilike.${like},guest_name.ilike.${like}`)
      .order('checkin_date', { ascending: false })
      .limit(6)
      .then(({ data }) => {
        for (const r of data ?? []) hits.push({ kind: 'booking', id: r.id, title: `${r.guest_name ?? 'Guest'} · ${r.confirmation_code}`, subtitle: `${r.checkin_date} → ${r.checkout_date}`, href: `/bookings/airbnb/${r.id}` });
      }),
  );
  if (want('booking')) jobs.push(
    supabase
      .from('booking_inquiries')
      .select('id, guest_name, checkin_date, checkout_date, status')
      .eq('property_id', propertyId)
      .ilike('guest_name', like)
      .order('checkin_date', { ascending: false })
      .limit(4)
      .then(({ data }) => {
        for (const r of data ?? []) hits.push({ kind: 'booking', id: r.id, title: `${r.guest_name} · direct`, subtitle: `${r.checkin_date} → ${r.checkout_date} · ${r.status}`, href: `/bookings/direct/${r.id}` });
      }),
  );
  if (want('guest') && caps.can('manage_operations')) {
    jobs.push(
      supabase
        .from('guests')
        .select('id, name, phone, email')
        .eq('property_id', propertyId)
        .or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like}`)
        .limit(6)
        .then(({ data }) => {
          for (const g of data ?? []) hits.push({ kind: 'guest', id: g.id, title: g.name, subtitle: g.phone ?? g.email ?? undefined, href: `/guests/${g.id}` });
        }),
    );
  }
  if (want('stock')) jobs.push(
    supabase
      .from('inventory_items')
      .select('id, name, category, qty_on_hand, unit')
      .eq('property_id', propertyId)
      .ilike('name', like)
      .limit(6)
      .then(({ data }) => {
        for (const i of data ?? []) hits.push({ kind: 'stock', id: i.id, title: i.name, subtitle: `${i.qty_on_hand} ${i.unit} · ${i.category}`, href: `/inventory?q=${encodeURIComponent(i.name)}` });
      }),
  );
  if (want('cleaning')) jobs.push(
    supabase
      .from('cleaning_sessions')
      .select('id, last_guest_name, cleaner_name, cleaned_at')
      .eq('property_id', propertyId)
      .or(`last_guest_name.ilike.${like},cleaner_name.ilike.${like},submission_id.ilike.${like}`)
      .order('cleaned_at', { ascending: false })
      .limit(4)
      .then(({ data }) => {
        for (const c of data ?? []) hits.push({ kind: 'cleaning', id: c.id, title: `${c.last_guest_name ?? 'Cleaning'} · ${c.cleaner_name}`, subtitle: c.cleaned_at?.slice(0, 10), href: `/operations/cleaning/${c.id}` });
      }),
  );
  if (want('task')) jobs.push(
    supabase
      .from('follow_up_tasks')
      .select('id, title, status, due_at')
      .eq('property_id', propertyId)
      .ilike('title', like)
      .limit(4)
      .then(({ data }) => {
        for (const t of data ?? []) hits.push({ kind: 'task', id: t.id, title: t.title, subtitle: `${t.status} · due ${t.due_at?.slice(0, 10) ?? '—'}`, href: opts?.kinds ? '/operations/tasks' : `/guests?task=${t.id}` });
      }),
  );
  await Promise.allSettled(jobs);
  return hits;
}
