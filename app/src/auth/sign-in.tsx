import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { supabase } from '@/lib/supabase';
import { useSession } from './session';
import { defaultRoute } from './capabilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// Staff sign in with a name (slug@staff.cascade.invalid, never mailed) or an
// e-mail. Matches the live Module A flow. TOTP is offered when the account has
// an enrolled factor so finance actions can reach aal2.

const STAFF_DOMAIN = 'staff.cascade.invalid';

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

export function SignInPage() {
  const s = useSession();
  const loc = useLocation();
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [skipMfa, setSkipMfa] = useState(false);

  const mfaStep = !!factorId && !skipMfa && s.caps.aal !== 'aal2';

  if (s.status === 'ready' && !mfaStep) {
    const from = (loc.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== '/sign-in' ? from : defaultRoute(s.caps.role)} replace />;
  }

  async function afterPassword() {
    // Offer TOTP when a verified factor exists so finance screens can be reached.
    const { data } = await supabase.auth.mfa.listFactors();
    const verified = data?.totp?.find((f) => f.status === 'verified');
    if (verified) setFactorId(verified.id);
  }

  async function onPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email: toLoginEmail(identity), password });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    await afterPassword();
  }

  async function onTotp(e: FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: totp.trim() });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    await s.refresh();
    setSkipMfa(true);
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
    else setOtpSent(true);
  }

  async function verifyOtp(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({ email: toLoginEmail(identity), token: otpCode.trim(), type: 'email' });
    setBusy(false);
    if (err) setError(err.message);
    else await afterPassword();
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-mahogany p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Cascade Hideaway Admin</CardTitle>
          <CardDescription>Hotel Comfort. Home Warmth.</CardDescription>
        </CardHeader>
        <CardContent>
          {mfaStep ? (
            <form onSubmit={onTotp} className="space-y-4" aria-label="Two-factor code">
              <p className="text-sm text-muted-foreground">
                Enter the 6-digit code from your authenticator to unlock finance and staff settings. You can skip this for operations-only work.
              </p>
              <div className="space-y-2">
                <Label htmlFor="totp">Authenticator code</Label>
                <Input id="totp" inputMode="numeric" autoComplete="one-time-code" value={totp} onChange={(e) => setTotp(e.target.value)} className="text-base" />
              </div>
              {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
              <div className="flex gap-2">
                <Button type="submit" disabled={busy || totp.length < 6} className="min-h-11 flex-1">Verify</Button>
                <Button type="button" variant="outline" className="min-h-11" onClick={() => setSkipMfa(true)}>Skip</Button>
              </div>
            </form>
          ) : otpSent ? (
            <form onSubmit={verifyOtp} className="space-y-4" aria-label="E-mail code">
              <div className="space-y-2">
                <Label htmlFor="otp">Code from the e-mail</Label>
                <Input id="otp" inputMode="numeric" autoComplete="one-time-code" value={otpCode} onChange={(e) => setOtpCode(e.target.value)} className="text-base" />
              </div>
              {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
              <Button type="submit" disabled={busy} className="min-h-11 w-full">Sign in</Button>
            </form>
          ) : (
            <form onSubmit={onPassword} className="space-y-4" aria-label="Sign in">
              <div className="space-y-2">
                <Label htmlFor="identity">Name or e-mail</Label>
                <Input id="identity" autoComplete="username" value={identity} onChange={(e) => setIdentity(e.target.value)} className="text-base" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="text-base" required />
              </div>
              {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
              <Button type="submit" disabled={busy} className="min-h-11 w-full">
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
              <Button type="button" variant="link" className="w-full" disabled={busy || !identity} onClick={() => void sendOtp()}>
                E-mail me a sign-in code instead
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
