import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { toAppError } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getStaffPayoutDetails, saveStaffDetails } from './api';
import { checkPayoutLabel, describeQrph } from './qrph';

// s85 pay details: the bank or wallet name shown with a staff member's payout QR (for example MariBank or GCash). Owner and admin
// only (the parent mounts it for those roles; the server refuses anyone else). It reads through staff_payout_details_v1 and hides
// itself while that function is not deployed. Saving writes only the payout_bank_label key.

export function PayoutLabelField({ userId, version, qrPayload, onSaved }: { userId: string; version: number; qrPayload: string | null; onSaved: () => void }) {
  const q = useQuery({ queryKey: ['staff-payout', userId], queryFn: () => getStaffPayoutDetails(userId), retry: false });
  const saved = q.data?.payout_bank_label ?? '';
  const [text, setText] = useState('');
  useEffect(() => { setText(saved); }, [saved, userId]);
  const save = useMutation({
    mutationFn: (value: string | null) => saveStaffDetails(userId, { payout_bank_label: value }, version, value ? 'payout bank label set' : 'payout bank label removed'),
    onSuccess: (_r, value) => { toast.success(value ? 'Bank or wallet name saved' : 'Bank or wallet name removed'); void q.refetch(); onSaved(); },
    onError: (e) => {
      const kind = toAppError(e).kind;
      toast.error(kind === 'conflict' ? 'Staff details changed since they were loaded. Close this panel, open it again and retry.' : kind === 'forbidden' ? 'Only owner and admin can change payment details.' : 'The bank or wallet name could not be saved. Nothing was changed.');
    },
  });
  if (!q.data) return null; // loading, not deployed (null) or refused: nothing to show
  const checked = checkPayoutLabel(text);
  const decoded = qrPayload ? describeQrph(qrPayload) : null;
  const suggestion = decoded?.ok && !text.trim() ? decoded.bank : null;
  return (
    <div className="mt-4 space-y-2 rounded-lg border p-3" data-testid="payout-label-field">
      <Label htmlFor="po-label">Bank or wallet</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input id="po-label" value={text} maxLength={40} placeholder="For example MariBank or GCash" autoComplete="off" onChange={(e) => setText(e.target.value)} className="min-w-0 flex-1 text-base" />
        <Button type="button" size="sm" disabled={save.isPending || !checked.ok || text.trim() === saved} onClick={() => checked.ok && save.mutate(checked.value)}>Save name</Button>
      </div>
      {!checked.ok && <p className="text-xs text-destructive" role="alert">{checked.message}</p>}
      {suggestion && <Button type="button" size="sm" variant="ghost" onClick={() => setText(suggestion)}>Use {suggestion}, read from the QR</Button>}
      <p className="text-xs text-muted-foreground">Shown with this person&apos;s payout QR so you know which account it is. Only owner and admin can see or change it.</p>
    </div>
  );
}
