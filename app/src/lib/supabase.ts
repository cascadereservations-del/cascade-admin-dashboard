import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './env';
import { foldedAuthStorage, isFolded } from './fold';
import { DEMO } from './demo';
import { createDemoClient } from './demo-client';

const store = (n: 'localStorage' | 'sessionStorage') => { try { return window[n]; } catch { return null; } };

// One client for the whole app. Sessions persist in localStorage (auth only);
// no CRM or finance data is cached by a service worker. The admin is
// online-first (PRD section 8).
const live = () => createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
    // Folded in Cascade Staff: share the shell's session (default key) wherever it lives.
    // Standalone keeps supabase-js's own localStorage, unchanged.
    ...(isFolded() ? { storage: foldedAuthStorage(store('localStorage'), store('sessionStorage')) } : {}),
  },
});

// D_ demo mode (`?demo`): synthetic data, no network, no storage. The live client is never built.
export const supabase: SupabaseClient = DEMO ? createDemoClient() : live();
