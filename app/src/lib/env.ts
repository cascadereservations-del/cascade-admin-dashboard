// Public configuration. The publishable key is designed to be shipped to the
// browser (it is already in the legacy index.html); RLS and server-side
// capability checks are the access control, never this file.
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://qkgfhsdppslwunarczeq.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_JFuRYZ9csmQULcMRmHXDSg_Abo9UeCj';
// Cascade Bria is the only active property. Server-side scope is enforced by
// staff_property_access; this is the client's default selection only.
export const DEFAULT_PROPERTY_ID =
  import.meta.env.VITE_PROPERTY_ID ?? '6ae230f4-c189-4547-84b1-cb6e0b2cc9bd';
export const BUSINESS_TIMEZONE = 'Asia/Manila';
export const CURRENCY = 'PHP';
export const APP_VERSION = '2.0.0-alpha';

export const EXTERNAL_APPS = [
  { key: 'guide', label: 'Guest guide', href: 'https://cascadereservations-del.github.io/Welcome-To-Cascades-/' },
  { key: 'cleaners', label: 'Cleaner checklist', href: 'https://cascadereservations-del.github.io/CH-Cleaners-Checklist/' },
  // 'inventory' removed 2026-09-16 (D-137): the dashboard's own Inventory tab
  // now covers what the standalone CH_Inventory PWA did. Keeping both linked
  // side by side was redundant, and the standalone app's shared-PIN gate is
  // weaker than this app's per-staff sign-in.
  { key: 'manual', label: 'Operations manual', href: 'https://cascadereservations-del.github.io/Cascade-Manual/' },
  { key: 'site', label: 'Booking site', href: 'https://cascadereservations-del.github.io/Stay_At_CascadeGSC/' },
  { key: 'legacy', label: 'Legacy admin', href: './legacy/index.html' },
] as const;
