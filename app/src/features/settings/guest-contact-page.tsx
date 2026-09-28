import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { toAppError } from '@/lib/errors';
import { PageHeader } from '@/components/data/page-header';
import { QueryState } from '@/components/data/query-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchGuestContact, saveGuestContact } from './api';
import { normalizeGuestContact } from './guest-contact';

// Settings > Guest contact (session 59): who guests call when the host is not answering - the on-ground partner.
export default function GuestContactPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['guest-contact'], queryFn: fetchGuestContact });
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { if (q.data) { setName(q.data.name ?? ''); setPhone(q.data.phone ?? ''); } }, [q.data]);
  const save = useMutation({
    mutationFn: saveGuestContact,
    onSuccess: (_d, c) => { toast.success(`Saved. Guests will be given ${c.name}, ${c.phone} within a minute.`); void qc.invalidateQueries({ queryKey: ['guest-contact'] }); },
    onError: (e) => toast.error(toAppError(e).message),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = normalizeGuestContact(name, phone);
    if (!r.ok) { setErr(r.error); return; }
    setErr(''); setName(r.value.name); setPhone(r.value.phone); save.mutate(r.value);
  };
  return (
    <div>
      <PageHeader title="Guest contact" description="The on-ground partner guests are told to call or text when they need someone at the unit. Cassy, the scheduled messages, the confirmation e-mail and the welcome guide all use it; a change reaches guests within a minute." />
      <QueryState query={q}>
        {() => (
          <form onSubmit={submit} className="max-w-md space-y-4">
            <div><Label htmlFor="gc-name">Name guests ask for</Label><Input id="gc-name" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} className="text-base" /></div>
            <div><Label htmlFor="gc-phone">Mobile number</Label><Input id="gc-phone" type="tel" inputMode="tel" autoComplete="off" placeholder="0991 853 8269" value={phone} onChange={(e) => setPhone(e.target.value)} className="text-base" /></div>
            {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
            <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</Button>
          </form>
        )}
      </QueryState>
    </div>
  );
}
