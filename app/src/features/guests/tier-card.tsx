import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Award } from 'lucide-react';
import { useSession } from '@/auth/session';
import { toAppError } from '@/lib/errors';
import { formatDateTime } from '@/lib/dates';
import { StatusBadge } from '@/components/data/status-badge';
import { Field } from '@/components/data/detail-sheet';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { setGuestTier, type TimelineEvent } from './api';
import { TIER_OPTIONS, tierBenefits, tierHistory, tierLabel, tierReasonProblem } from './tier';

const SAVE_REFUSALS: Record<string, string> = {
  guest_not_found: 'This guest no longer exists. Refresh the page.',
  bad_reason: 'Add a reason of 3 to 200 characters.',
  bad_tier: 'Pick a tier from the list.',
};

// SPEC-46: the tier is computed nightly from completed stays; an owner or admin can pin it by hand.
export function TierCard({ guestId, tier, manual, events }: { guestId: string; tier: string | null; manual: string | null; events: TimelineEvent[] | undefined }) {
  const s = useSession();
  const qc = useQueryClient();
  const canEdit = s.caps.can('manage_staff');
  const [choice, setChoice] = useState(manual ?? 'auto');
  const [reason, setReason] = useState('');
  const problem = tierReasonProblem(reason);
  const save = useMutation({
    mutationFn: async () => {
      const res = await setGuestTier(guestId, choice === 'auto' ? null : choice, reason.trim());
      // The RPC reports refusals as {ok:false, reason} without raising.
      if (!res.ok) throw new Error(SAVE_REFUSALS[(res as { reason?: string }).reason ?? ''] ?? 'Could not save the tier.');
      return res;
    },
    onSuccess: () => {
      toast.success('Tier saved');
      setReason('');
      void qc.invalidateQueries({ queryKey: ['guest', guestId] });
      void qc.invalidateQueries({ queryKey: ['timeline', guestId] });
      void qc.invalidateQueries({ queryKey: ['guests'] });
    },
  });
  const history = events ? tierHistory(events) : [];
  const benefits = tierBenefits(tier);
  return (
    <Card className="py-4 gap-3"><CardHeader><CardTitle className="flex items-center gap-2"><Award className="size-4 text-muted-foreground" aria-hidden /> Tier and benefits</CardTitle></CardHeader><CardContent className="space-y-3">
      <Field label="Tier">{tier ? <StatusBadge tone={tier === 'vip' ? 'warn' : 'info'}>{tierLabel(tier)}</StatusBadge> : 'None yet'}</Field>
      <Field label="Set by hand">{manual ? `Yes (${tierLabel(manual)})` : 'No, automatic'}</Field>
      <p className="text-sm text-muted-foreground">{benefits ?? 'No tier benefits until the second completed stay.'}</p>
      {canEdit && (
        <form className="space-y-2 border-t pt-3" onSubmit={(e) => { e.preventDefault(); if (!problem) save.mutate(); }}>
          <div><Label htmlFor="tier-choice">Set by hand</Label>
            <Select value={choice} onValueChange={setChoice}><SelectTrigger id="tier-choice"><SelectValue /></SelectTrigger><SelectContent>{TIER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
          <div><Label htmlFor="tier-reason">Reason</Label><Input id="tier-reason" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} className="text-base sm:text-sm" /></div>
          {save.isError && <p role="alert" className="text-sm text-destructive">{toAppError(save.error).message}</p>}
          <Button type="submit" size="sm" disabled={save.isPending || !!problem || choice === (manual ?? 'auto')}>{save.isPending ? 'Saving…' : 'Save tier'}</Button>
        </form>
      )}
      {history.length > 0 && (
        <ul className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
          {history.map((e, i) => <li key={i}><span className="tabular">{formatDateTime(e.at)}</span> · {String(e.body.reason)}</li>)}
        </ul>
      )}
    </CardContent></Card>
  );
}
