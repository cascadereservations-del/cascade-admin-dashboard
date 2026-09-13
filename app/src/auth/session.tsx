import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { DEFAULT_PROPERTY_ID } from '@/lib/env';
import { buildCapabilities, isStaffRole, type Aal, type Capabilities, type StaffRole } from './capabilities';

// Capability adapter (P05). Role, property scope, disablement and revocation
// come from the server-owned staff_access_profiles via current_staff_access().
// The JWT app_metadata.role is captured separately because several older
// tables still key their RLS on it; the UI treats it as informational.

type StaffAccess = {
  user_id: string;
  role: string;
  property_ids: string[];
  disabled: boolean;
  session_current: boolean;
};

export type SessionState = {
  status: 'loading' | 'signed_out' | 'ready' | 'no_profile' | 'error';
  session: Session | null;
  caps: Capabilities;
  legacyRole: string | null;
  displayName: string;
  propertyId: string;
  errorMessage?: string;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<SessionState | null>(null);

const EMPTY = buildCapabilities({ role: null, aal: null, disabled: true, sessionCurrent: false, propertyIds: [] });

async function loadAccess(): Promise<{ access: StaffAccess | null; aal: Aal | null }> {
  const [{ data, error }, aalRes] = await Promise.all([
    supabase.rpc('current_staff_access'),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (error) throw error;
  const aal = (aalRes.data?.currentLevel ?? null) as Aal | null;
  return { access: (data as StaffAccess | null) ?? null, aal };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<SessionState['status']>('loading');
  const [caps, setCaps] = useState<Capabilities>(EMPTY);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const s = data.session;
    setSession(s);
    if (!s) {
      setCaps(EMPTY);
      setStatus('signed_out');
      return;
    }
    try {
      const { access, aal } = await loadAccess();
      if (!access) {
        setCaps(EMPTY);
        setStatus('no_profile');
        return;
      }
      const role: StaffRole | null = isStaffRole(access.role) ? access.role : null;
      setCaps(
        buildCapabilities({
          role,
          aal,
          disabled: access.disabled,
          sessionCurrent: access.session_current,
          propertyIds: access.property_ids ?? [],
        }),
      );
      setStatus('ready');
      setErrorMessage(undefined);
    } catch (e) {
      setCaps(EMPTY);
      setStatus('error');
      setErrorMessage(e instanceof Error ? e.message : 'Could not load staff access');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        qc.clear(); // sensitive cache never survives sign-out
        setSession(null);
        setCaps(EMPTY);
        setStatus('signed_out');
      } else if (event === 'SIGNED_IN' || event === 'MFA_CHALLENGE_VERIFIED' || event === 'USER_UPDATED') {
        void refresh();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [refresh, qc]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    qc.clear();
  }, [qc]);

  const value = useMemo<SessionState>(() => {
    const user = session?.user;
    const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
    const appMeta = (user?.app_metadata ?? {}) as Record<string, unknown>;
    const displayName = String(meta.name ?? appMeta.name ?? user?.email?.split('@')[0] ?? 'Staff');
    const propertyId = caps.propertyIds[0] ?? DEFAULT_PROPERTY_ID;
    return {
      status,
      session,
      caps,
      legacyRole: typeof appMeta.role === 'string' ? appMeta.role : null,
      displayName,
      propertyId,
      errorMessage,
      refresh,
      signOut,
    };
  }, [status, session, caps, errorMessage, refresh, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession must be used within SessionProvider');
  return v;
}
