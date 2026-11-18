import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSession } from '@/auth/session';
import { toAppError } from '@/lib/errors';
import { formatDateTime } from '@/lib/dates';
import { StatusBadge } from '@/components/data/status-badge';
import { Field } from '@/components/data/detail-sheet';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { setGuestTier, type TimelineEvent } from './api';
import { TIER_OPTIONS, tierBenefits, tierHistory, tierLabel } from './tier';
import { autoReason } from './auto-reason';

const SAVE_REFUSALS: Record<string, string> = {
  guest_not_found: 'This guest no longer exists. Refresh the page.',
  bad_reason: 'The tier could not be saved. Try again.',
  bad_tier: 'Pick a tier from the list.',
};

// SPEC-46: the tier is computed nightly from completed stays; an owner or admin can pin it by hand.
// s118: sits inside the "Tier and benefits" group and saves itself on choosing. The server wants a 3-200 character
// reason (admin_set_guest_tier_v1 bad_reason); the automatic one is "Tier set by hand".
export function TierCard({ guestId, tier, manual, events }: { guestId: string; tier: string | null; manual: string | null; events: TimelineEvent[] | undefined }) {
  const s = useSession();
  const qc = useQueryClient();
  const canEdit = s.caps.can('manage_staff');
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['guest', guestId] });
    void qc.invalidateQueries({ queryKey: ['timeline', guestId] });
    void qc.invalidateQueries({ queryKey: ['guests'] });
  };
  const save = useMutation({
    mutationFn: async ({ choice, reason }: { choice: string; reason?: string }) => {
      const res = await setGuestTier(guestId, choice === 'auto' ? null : choice, reason ?? autoReason(choice === 'auto' ? 'tier_auto' : 'tier'));
      // The RPC reports refusals as {ok:false, reason} without raising.
      if (!res.ok) throw new Error(SAVE_REFUSALS[(res as { reason?: string }).reason ?? ''] ?? 'Could not save the tier.');
      return res;
    },
    onSuccess: (_r, v) => {
      refresh();
      if (v.reason) return; // the Undo itself
      const before = manual ?? 'auto';
      toast.success('Tier saved', { duration: 6000, action: { label: 'Undo', onClick: () => save.mutate({ choice: before, reason: 'Undo of last change' }) } });
    },
  });
  const history = events ? tierHistory(events) : [];
  const benefits = tierBenefits(tier);
  return (
    <div className="space-y-3 px-4 py-3">
      <Field label="Tier">{tier ? <StatusBadge tone="info">{tierLabel(tier)}</StatusBadge> : 'None yet'}</Field>
      <Field label="Set by hand">{manual ? `Yes (${tierLabel(manual)})` : 'No, automatic'}</Field>
      <p className="text-base text-muted-foreground">{benefits ?? 'No tier benefits until the second completed stay.'}</p>
      {canEdit && (
        <div className="space-y-2 border-t pt-3">
          <Label htmlFor="tier-choice">Set by hand</Label>
          <Select value={manual ?? 'auto'} onValueChange={(choice) => { if (choice !== (manual ?? 'auto')) save.mutate({ choice }); }} disabled={save.isPending}>
            <SelectTrigger id="tier-choice" className="min-h-11 text-base"><SelectValue /></SelectTrigger>
            <SelectContent>{TIER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
          {save.isError && <p role="alert" className="text-base text-destructive">{toAppError(save.error).message}</p>}
        </div>
      )}
      {history.length > 0 && (
        <ul className="space-y-1 border-t pt-3 text-[0.8125rem] text-muted-foreground">
          {history.map((e, i) => <li key={i}><span className="tabular">{formatDateTime(e.at)}</span> · {String(e.body.reason)}</li>)}
        </ul>
      )}
    </div>
  );
}
