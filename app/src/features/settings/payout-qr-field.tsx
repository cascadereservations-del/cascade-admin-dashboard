import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { toAppError } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { saveStaffDetails } from './api';
import { describeLine, describeQrph } from './qrph';

// SPEC-37 7.E (D-298.4): the payout QR of a staff member, in the staff details card. Owner and admin only (the card itself is behind
// manage_staff and the parent mounts this for those roles). It shows bank, holder and the last four digits, never the code. A new
// code comes from an uploaded QR image (the browser's own BarcodeDetector, Chrome on Android and macOS; no dependency) or from
// pasted QR text where the browser cannot decode (Chrome on Windows, Safari). The checksum is verified before anything is saved,
// and no toast, log or error ever carries the payload.

type Detector = { detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string }>> };
type DetectorCtor = { new (options?: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> };
const detectorCtor = (): DetectorCtor | null => (typeof window === 'undefined' ? null : (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector ?? null);

const NOT_QRPH = 'That is not a QR Ph payment code, so nothing was saved.';

export function PayoutQrField({ userId, payload, version, onSaved }: { userId: string; payload: string | null; version: number; onSaved: () => void }) {
  const [canDecode, setCanDecode] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState('');
  const [candidate, setCandidate] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const Ctor = detectorCtor();
    if (!Ctor?.getSupportedFormats) return;
    let live = true;
    Ctor.getSupportedFormats().then((f) => { if (live) setCanDecode(f.includes('qr_code')); }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  const reset = () => { setPasting(false); setText(''); setCandidate(null); setConfirmRemove(false); };
  const save = useMutation({
    mutationFn: (value: string | null) => saveStaffDetails(userId, { payout_qrph: value }, version, value ? 'payout QR replaced' : 'payout QR removed'),
    onSuccess: (_r, value) => { toast.success(value ? 'Payout QR saved' : 'Payout QR removed'); reset(); onSaved(); },
    onError: (e) => {
      const kind = toAppError(e).kind;
      toast.error(kind === 'conflict' ? 'Staff details changed since they were loaded. Close this panel, open it again and retry.' : kind === 'forbidden' ? 'Only owner and admin can change the payout QR.' : 'The payout QR could not be saved. Nothing was changed.');
    },
  });

  const accept = (raw: string) => {
    if (!describeQrph(raw).ok) { toast.error(NOT_QRPH); return; }
    setCandidate(raw.trim()); setText(''); setPasting(false);
  };
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const Ctor = detectorCtor();
      if (!Ctor) throw new Error('no detector');
      const bitmap = await createImageBitmap(file);
      const found = await new Ctor({ formats: ['qr_code'] }).detect(bitmap);
      bitmap.close?.();
      const raw = found[0]?.rawValue;
      if (raw) accept(raw); else toast.error('No QR code found in that image. Try a clearer image, or paste the QR text instead.');
    } catch {
      toast.error('That image could not be read. Paste the QR text instead.');
    }
  };

  const preview = candidate ? describeQrph(candidate) : null;
  return (
    <div className="mt-4 space-y-2 rounded-lg border p-3" data-testid="payout-qr-field">
      <p className="text-sm font-medium">{describeLine(payload)}</p>
      <p className="text-xs text-muted-foreground">Used to build the amount QR on this person&apos;s payment requests. Only owner and admin can see or change it. The code itself is never shown.</p>

      {!candidate && (
        <div className="flex flex-wrap gap-2">
          {canDecode ? (
            <>
              <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>Upload QR image</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setPasting(true)}>Paste QR text</Button>
            </>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={() => setPasting(true)}>Paste QR text instead</Button>
          )}
          {payload && (confirmRemove
            ? <Button type="button" size="sm" variant="destructive" disabled={save.isPending} onClick={() => save.mutate(null)}>Yes, remove the payout QR</Button>
            : <Button type="button" size="sm" variant="outline" onClick={() => setConfirmRemove(true)}>Remove</Button>)}
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void onFile(f); }} />

      {pasting && !candidate && (
        <div className="space-y-2">
          <Textarea
            value={text} onChange={(e) => setText(e.target.value)} rows={3} autoComplete="off" autoCorrect="off" spellCheck={false}
            aria-label="QR Ph text" placeholder="Paste the QR text (it starts 000201)" className="font-mono text-xs [-webkit-text-security:disc]"
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={!text.trim()} onClick={() => accept(text)}>Check code</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setPasting(false); setText(''); }}>Cancel</Button>
          </div>
        </div>
      )}

      {preview?.ok && (
        <div className="space-y-2 rounded-md bg-muted/50 p-2 text-sm" role="status">
          <p>New code: <span className="font-medium">{[preview.bank, preview.name, preview.accountMasked ? `account ${preview.accountMasked}` : null].filter(Boolean).join(' · ')}</span> · checksum OK</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={save.isPending} onClick={() => save.mutate(candidate)}>Save payout QR</Button>
            <Button type="button" size="sm" variant="ghost" onClick={reset}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
