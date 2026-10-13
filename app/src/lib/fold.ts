// Folded mode: the dashboard is published inside Cascade Staff at
// /Cascade-Staff/admin/ and opened in a same-origin frame by that shell.
// `?shell=1` forces it in dev builds only (never in production). One helper, used everywhere.
export function isFolded(loc: { pathname: string; search: string } = location, framed: boolean = isFramed()): boolean {
  return loc.pathname.includes('/Cascade-Staff/') || (import.meta.env.DEV && /[?&]shell=1(&|$)/.test(loc.search)) || framed;
}

/** The page sits inside another window (the staff shell frames it). A cross-origin parent throws on access; that counts as framed. */
export function isFramed(): boolean {
  try { return window.self !== window.top; } catch { return true; }
}

/** Embed mode (Lane D): framed, or `embed=1` in the query or the hash query. LAYOUT ONLY: the shell supplies the bar and Back, so the
 *  dashboard hides its own chrome. The session and sign-in behaviour stays with isFolded (staff path or actually framed). */
export function isEmbed(loc: { search: string; hash?: string } = location, framed: boolean = isFramed()): boolean {
  return framed || /[?&]embed=1(&|$)/.test(loc.search) || /[?&]embed=1(&|$)/.test(loc.hash ?? '');
}

/** Demo mode: `?demo` (or `demo=1`) in the QUERY STRING only. The hash form is not accepted: the router rewrites the hash on the
 *  first navigation and a reload would silently go live. Synthetic data only; no network call, no storage. */
export function isDemo(loc: { search: string } = location): boolean {
  return /[?&]demo(=1|=true)?(&|$)/.test(loc.search);
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & { length: number; key(i: number): string | null };

/** Same rule as Cascade Staff authStorage: "Trust this device" ON keeps the session in
 *  localStorage, OFF in sessionStorage. Reads look in both; a write goes to wherever the
 *  session already lives (sessionStorage if it is there) and never duplicates it. */
export function foldedAuthStorage(local: Store | null, session: Store | null) {
  const get = (s: Store | null, k: string) => { try { return s ? s.getItem(k) : null; } catch { return null; } };
  const put = (s: Store | null, k: string, v: string) => { try { s?.setItem(k, v); } catch { /* storage may throw */ } };
  const del = (s: Store | null, k: string) => { try { s?.removeItem(k); } catch { /* storage may throw */ } };
  return {
    getItem: (k: string) => get(session, k) ?? get(local, k),
    setItem: (k: string, v: string) => {
      if (get(session, k) != null) put(session, k, v);
      else { put(local, k, v); del(session, k); }
    },
    removeItem: (k: string) => { del(local, k); del(session, k); },
  };
}

/** After sign-out in folded mode the shell owns sign-in: send the TOP window there. */
export function toShell() {
  try { (window.top ?? window).location.href = new URL('../', location.href).href; }
  catch { location.href = new URL('../', location.href).href; }
}

/** The one pay-rates screen is the shell's top-level `#payrates` route (D-301, session 82). From the folded dashboard `../` is the shell. */
export const D_SHELL_PAYRATES = '../#payrates';
export function D_toShellPayRates() {
  const url = new URL(D_SHELL_PAYRATES, location.href).href;
  try { (window.parent ?? window).location.href = url; }
  catch { location.href = url; }
}
