import { toast } from 'sonner';
import { DEMO, DEMO_SAVED, DEMO_SENT } from './demo';

/** Demo mode: every success toast says the sample-mode line instead of its real text ("Saved", "Posted", "Reply sent"). DEMO_SENT passes through.
 *  The description and the Undo action are dropped: nothing was written, so there is nothing to undo. */
export function installDemoToasts(target: { success: typeof toast.success } = toast): void {
  const original = target.success.bind(target);
  target.success = ((message: unknown, data?: { duration?: number }) => original(message === DEMO_SENT ? DEMO_SENT : DEMO_SAVED, { duration: data?.duration && data.duration < 8000 ? data.duration : undefined })) as typeof toast.success;
}

if (DEMO) installDemoToasts();
