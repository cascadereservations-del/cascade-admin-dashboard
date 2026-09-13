import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { supabase } from '@/lib/supabase';
import { useSession } from './session';
import { defaultRoute } from './capabilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// Staff sign in with their name and the 4-digit PIN they already use in the
// cleaner and inventory apps. The Auth password is the fixed prefix + PIN
// (D-059); the prefix is added here and never shown as something to remember.
// A full-password form stays available for the owner mailbox login.
// No two-factor step since D-094: a password session is enough for everything.

const STAFF_DOMAIN = 'staff.cascade.invalid';
const STAFF_PIN_PREFIX = '8888';
const PIN_RE = /^\d{4}$/;

export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function toLoginEmail(identity: string): string {
  const v = identity.trim();
  return v.includes('@') ? v : `${slugify(v)}@${STAFF_DOMAIN}`;
}

/** What is sent to Auth: a 4-digit PIN becomes prefix+PIN, anything else is used as typed. */
export function toAuthPassword(secret: string): string {
  const v = secret.trim();
  return PIN_RE.test(v) ? STAFF_PIN_PREFIX + v : v;
}

type Mode = 'pin' | 'password' | 'otp';

export function SignInPage() {
  const s = useSession();
  const loc = useLocation();
  const [identity, setIdentity] = useState('');
  const [secret, setSecret] = useState('');
  const [mode, setMode] = useState<Mode>('pin');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');

  if (s.status === 'ready') {
    const from = (loc.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== '/sign-in' ? from : defaultRoute(s.caps.role)} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email: toLoginEmail(identity), password: toAuthPassword(secret) });
    setBusy(false);
    if (err) setError(mode === 'pin' ? 'That name and PIN did not match. Check both and try again.' : err.message);
  }

  async function sendOtp() {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: toLoginEmail(identity),
      options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname },
    });
    setBusy(false);
    if (err) setError(err.message);
    else setMode('otp');
  }

  async function verifyOtp(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({ email: toLoginEmail(identity), token: otpCode.trim(), type: 'email' });
    setBusy(false);
    if (err) setError(err.message);
  }

  const pinMode = mode === 'pin';

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl">Cascade Hideaway</CardTitle>
          <CardDescription>Staff admin · Hotel Comfort. Home Warmth.</CardDescription>
        </CardHeader>
        <CardContent>
          {mode === 'otp' ? (
            <form onSubmit={verifyOtp} className="space-y-4" aria-label="E-mail code">
              <div className="space-y-2">
                <Label htmlFor="otp">Code from the e-mail</Label>
                <Input id="otp" inputMode="numeric" autoComplete="one-time-code" value={otpCode} onChange={(e) => setOtpCode(e.target.value)} className="text-base" autoFocus />
              </div>
              {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
              <Button type="submit" disabled={busy} className="min-h-11 w-full">Sign in</Button>
              <Button type="button" variant="link" className="w-full" onClick={() => setMode('pin')}>Back</Button>
            </form>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4" aria-label="Sign in">
              <div className="space-y-2">
                <Label htmlFor="identity">{pinMode ? 'Your name' : 'Name or e-mail'}</Label>
                <Input id="identity" autoComplete="username" placeholder={pinMode ? 'e.g. Honey' : ''} value={identity} onChange={(e) => setIdentity(e.target.value)} className="text-base" required autoFocus />
              </div>
              <div className="space-y-2">
                <Label htmlFor="secret">{pinMode ? '4-digit PIN' : 'Password'}</Label>
                <Input
                  id="secret"
                  type="password"
                  autoComplete="current-password"
                  inputMode={pinMode ? 'numeric' : undefined}
                  pattern={pinMode ? '\\d{4}' : undefined}
                  maxLength={pinMode ? 4 : undefined}
                  value={secret}
                  onChange={(e) => setSecret(pinMode ? e.target.value.replace(/\D/g, '').slice(0, 4) : e.target.value)}
                  className={pinMode ? 'text-center text-2xl tracking-[0.5em]' : 'text-base'}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
              <Button type="submit" disabled={busy || (pinMode && secret.length < 4)} className="min-h-11 w-full">
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
              <div className="flex flex-col gap-1 text-center text-sm">
                <Button type="button" variant="link" className="h-auto p-0" onClick={() => { setMode(pinMode ? 'password' : 'pin'); setSecret(''); setError(null); }}>
                  {pinMode ? 'Use a full password instead' : 'Use my 4-digit PIN instead'}
                </Button>
                <Button type="button" variant="link" className="h-auto p-0" disabled={busy || !identity} onClick={() => void sendOtp()}>
                  E-mail me a sign-in code
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
