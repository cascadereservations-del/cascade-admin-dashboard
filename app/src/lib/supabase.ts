import { createClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './env';
import { foldedAuthStorage, isFolded } from './fold';

const store = (n: 'localStorage' | 'sessionStorage') => { try { return window[n]; } catch { return null; } };

// One client for the whole app. Sessions persist in localStorage (auth only);
// no CRM or finance data is cached by a service worker. The admin is
// online-first (PRD section 8).
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
    // Folded in Cascade Staff: share the shell's session (default key) wherever it lives.
    // Standalone keeps supabase-js's own localStorage, unchanged.
    ...(isFolded() ? { storage: foldedAuthStorage(store('localStorage'), store('sessionStorage')) } : {}),
  },
});
