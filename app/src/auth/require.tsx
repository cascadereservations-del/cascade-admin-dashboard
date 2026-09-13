import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { ShieldAlert } from 'lucide-react';
import { useSession } from './session';
import type { Action } from './capabilities';
import { Button } from '@/components/ui/button';

export function ForbiddenState({ action, mfa }: { action?: Action; mfa?: boolean }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center" role="alert">
      <ShieldAlert className="size-8 text-muted-foreground" aria-hidden />
      <h2 className="text-lg font-semibold">{mfa ? 'Sign in again' : 'Not available for your role'}</h2>
      <p className="text-sm text-muted-foreground">
        {mfa
          ? 'Your session is from before the sign-in change. Sign out and sign in again with your name and PIN.'
          : `Your staff profile does not include ${action ? action.replace('_', ' ') : 'this area'}. Ask the owner if you need it.`}
      </p>
    </div>
  );
}

export function RequireSession({ children }: { children: ReactNode }) {
  const s = useSession();
  const loc = useLocation();
  if (s.status === 'loading') {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground" aria-busy>
        Checking your sign-in…
      </div>
    );
  }
  if (s.status === 'signed_out') return <Navigate to="/sign-in" replace state={{ from: loc.pathname + loc.search }} />;
  if (s.status === 'no_profile' || s.caps.disabled || !s.caps.sessionCurrent) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center" role="alert">
        <ShieldAlert className="size-8 text-muted-foreground" aria-hidden />
        <h2 className="text-lg font-semibold">This account has no active staff access</h2>
        <p className="text-sm text-muted-foreground">
          {s.status === 'no_profile'
            ? 'No staff profile exists for this login.'
            : s.caps.disabled
              ? 'The profile is disabled.'
              : 'This session was revoked. Sign in again.'}
        </p>
        <Button variant="outline" onClick={() => void s.signOut()}>
          Sign out
        </Button>
      </div>
    );
  }
  if (s.status === 'error') {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center" role="alert">
        <h2 className="text-lg font-semibold">Could not load staff access</h2>
        <p className="text-sm text-muted-foreground">{s.errorMessage}</p>
        <div className="flex gap-2">
          <Button onClick={() => void s.refresh()}>Retry</Button>
          <Button variant="outline" onClick={() => void s.signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export function RequireCapability({ action, children }: { action: Action; children: ReactNode }) {
  const s = useSession();
  if (s.caps.can(action)) return <>{children}</>;
  return <ForbiddenState action={action} mfa={s.caps.mfaRequiredFor(action)} />;
}
