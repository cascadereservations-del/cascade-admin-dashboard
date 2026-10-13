import { isDemo } from './fold';

// D_ demo mode: `?demo` in the URL. One constant, read once at load. Sample data only when it is on; live starts empty.
// In demo mode the Supabase client is replaced by lib/demo-client (no network), nothing is written to storage, and the
// few raw fetch() calls (host-reply, guest-reply-draft, rate-card, staff-users) answer from here instead.
export const DEMO: boolean = isDemo();

/** Thrown by a raw fetch() path that has no demo answer. Never reaches the network. */
export function demoOffline(): never {
  throw new TypeError('Demo mode: no network call is made.');
}
