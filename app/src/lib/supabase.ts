import { createClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './env';

// One client for the whole app. Sessions persist in localStorage (auth only);
// no CRM or finance data is cached by a service worker. The admin is
// online-first (PRD section 8).
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
