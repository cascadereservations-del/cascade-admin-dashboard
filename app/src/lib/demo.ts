import { isDemo } from './fold';

// D_ demo mode: `?demo` in the URL query. One constant, read once at load. Sample data only when it is on; live starts empty.
// In demo mode the Supabase client is replaced by lib/demo-client (no network), nothing is written to storage, and the
// few raw fetch() calls (host-reply, guest-reply-draft, rate-card, staff-users) answer from here instead.
export const DEMO: boolean = isDemo();

/** Every demo write answers with this instead of its real success text. */
export const DEMO_SAVED = 'Sample mode: nothing was saved.';
export const DEMO_SENT = 'Sample mode: nothing was sent.';
export const DEMO_STRIP = 'Sample data. Nothing here is real and nothing is saved.';

// Reserved room for the strip: set at load, so nothing shifts after first paint (see index.css html[data-demo]).
if (DEMO && typeof document !== 'undefined') document.documentElement.setAttribute('data-demo', '');
