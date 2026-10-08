import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { toAppError } from '@/lib/errors';
import { formatDate } from '@/lib/dates';
import { fromCentavos, toCentavos } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { confirmDirectBooking, declineDirectBooking, newConfirmKey } from './confirm-api';
import {
  DECLINE_REASONS, METHODS, confirmArgs, confirmSentence, declineReason, declineSentence, hasReceipt, paymentLine, validateConfirm,
  type ConfirmForm, type InquiryPayment, type Method,
} from './confirm-model';

// SPEC-44: one primary Confirm booking sheet. With a receipt on file the staff
// tick that the money arrived; without one they say how it was paid. The
// idempotency key is minted when the sheet opens and reused on a retry after a
// dropped connection; it is replaced after any answer the server gave, because
// the inputs may change before the next try.

export type SheetStay = { sourceId: string; guestName: string; checkin: string; checkout: string };

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    for (const k of ['stays', 'inquiry-payments', 'overview', 'transactions']) void qc.invalidateQueries({ queryKey: [k] });
  };
}

const toDecimal = (v: string | null) => (toCentavos(v) === null ? '' : fromCentavos(toCentavos(v)!));

function Field({ label, htmlFor, error, children }: { label: string; htmlFor?: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function ConfirmSheet({ stay, payment, onClose }: { stay: SheetStay; payment: InquiryPayment | null; onClose: () => void }) {
  const refresh = useRefresh();
  const receipt = hasReceipt(payment);
  const [form, setForm] = useState<ConfirmForm>({ checked: false, method: 'messenger_gcash', reference: '', amount: toDecimal(payment?.expected_amount ?? null), note: '' });
  const [key, setKey] = useState(newConfirmKey);
  const [message, setMessage] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const errors = showErrors ? validateConfirm(form, payment) : {};
  const set = (patch: Partial<ConfirmForm>) => { setForm({ ...form, ...patch }); setMessage(null); };

  const confirm = useMutation({
    mutationFn: () => confirmDirectBooking(confirmArgs(stay.sourceId, form, payment, key)),
    onSuccess: (res) => {
      if (res.ok === true && res.outcome === 'confirmed') {
        toast.success(confirmSentence(res));
        refresh();
        onClose();
        return;
      }
      setMessage(confirmSentence(res));
      setKey(newConfirmKey());
      if (res.outcome === 'conflict' || res.outcome === 'invalid_state') refresh();
    },
    onError: (e) => setMessage(toAppError(e).message),
  });

  const submit = () => {
    setShowErrors(true);
    if (Object.keys(validateConfirm(form, payment)).length > 0) return;
    setMessage(null);
    confirm.mutate();
  };
  const needsRef = receipt ? !payment.reference : form.method !== 'cash';

  return (
    <Sheet open onOpenChange={(o) => { if (!o && !confirm.isPending) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Confirm booking</SheetTitle>
          <SheetDescription>{stay.guestName}, {formatDate(stay.checkin, 'long')} to {formatDate(stay.checkout, 'long')}. Dates are rechecked when you confirm.</SheetDescription>
        </SheetHeader>
        <form className="space-y-4 px-4" onSubmit={(e) => { e.preventDefault(); if (!confirm.isPending) submit(); }} noValidate>
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{paymentLine(payment)}</p>
          {receipt ? (
            <div className="space-y-1">
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-0.5 size-4" checked={form.checked} onChange={(e) => set({ checked: e.target.checked })} />
                I checked the money arrived
              </label>
              {errors.checked && <p className="text-sm text-destructive">{errors.checked}</p>}
            </div>
          ) : (
            <fieldset className="space-y-1.5">
              <legend className="mb-1.5 text-sm font-medium">How was it paid?</legend>
              {METHODS.map((m) => (
                <label key={m.value} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="method" className="size-4" value={m.value} checked={form.method === m.value} onChange={() => set({ method: m.value as Method })} />
                  {m.label}
                </label>
              ))}
            </fieldset>
          )}
          {needsRef && (
            <Field label="Payment reference" htmlFor="confirm-ref" error={errors.reference}>
              <Input id="confirm-ref" value={form.reference} onChange={(e) => set({ reference: e.target.value })} autoComplete="off" />
            </Field>
          )}
          <Field label="Amount received (PHP)" htmlFor="confirm-amount" error={errors.amount}>
            <Input id="confirm-amount" inputMode="decimal" value={form.amount} onChange={(e) => set({ amount: e.target.value })} autoComplete="off" />
          </Field>
          {!receipt && (
            <Field label={form.method === 'cash' ? 'Note (required for cash)' : 'Note (optional)'} htmlFor="confirm-note" error={errors.note}>
              <Textarea id="confirm-note" rows={2} value={form.note} onChange={(e) => set({ note: e.target.value })} />
            </Field>
          )}
          {message && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">{message}</p>}
          <SheetFooter className="px-0">
            <Button type="submit" className="min-h-10" disabled={confirm.isPending}>{confirm.isPending ? 'Confirming…' : 'Confirm booking'}</Button>
            <Button type="button" variant="outline" className="min-h-10" onClick={onClose} disabled={confirm.isPending}>Cancel</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function DeclineSheet({ stay, onClose }: { stay: SheetStay; onClose: () => void }) {
  const refresh = useRefresh();
  const [chip, setChip] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [key, setKey] = useState(newConfirmKey);
  const [message, setMessage] = useState<string | null>(null);
  const reason = declineReason(chip, text);

  const decline = useMutation({
    mutationFn: () => declineDirectBooking(stay.sourceId, reason ?? '', key),
    onSuccess: (res) => {
      if (res.ok === true) {
        toast.success(declineSentence(res));
        refresh();
        onClose();
        return;
      }
      setMessage(declineSentence(res));
      setKey(newConfirmKey());
    },
    onError: (e) => setMessage(toAppError(e).message),
  });

  return (
    <Sheet open onOpenChange={(o) => { if (!o && !decline.isPending) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Decline request</SheetTitle>
          <SheetDescription>{stay.guestName}, {formatDate(stay.checkin, 'long')} to {formatDate(stay.checkout, 'long')}.</SheetDescription>
        </SheetHeader>
        <form className="space-y-4 px-4" onSubmit={(e) => { e.preventDefault(); if (reason && !decline.isPending) { setMessage(null); decline.mutate(); } }}>
          <div className="space-y-1.5">
            <p className="text-sm font-medium" id="decline-why">Why?</p>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby="decline-why">
              {DECLINE_REASONS.map((r) => (
                <Button key={r} type="button" size="sm" variant={chip === r ? 'default' : 'outline'} aria-pressed={chip === r} onClick={() => { setChip(chip === r ? null : r); setMessage(null); }}>{r}</Button>
              ))}
            </div>
          </div>
          <Field label="Anything to add (optional)" htmlFor="decline-text">
            <Textarea id="decline-text" rows={2} value={text} onChange={(e) => { setText(e.target.value); setMessage(null); }} />
          </Field>
          {message && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">{message}</p>}
          <SheetFooter className="px-0">
            <Button type="submit" variant="destructive" className="min-h-10" disabled={!reason || decline.isPending}>{decline.isPending ? 'Declining…' : 'Decline request'}</Button>
            <Button type="button" variant="outline" className="min-h-10" onClick={onClose} disabled={decline.isPending}>Cancel</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
