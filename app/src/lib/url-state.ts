import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

// Search, filters, sorting, pagination and period persist in the URL (UX03) so
// back navigation and shared links restore the same list (UX07).

export type UrlState = Record<string, string | undefined>;

export function useUrlState<T extends UrlState>(defaults: T) {
  const [params, setParams] = useSearchParams();

  const state = useMemo(() => {
    const out = { ...defaults } as T;
    for (const key of Object.keys(defaults)) {
      const v = params.get(key);
      if (v !== null && v !== '') (out as UrlState)[key] = v;
    }
    return out;
  }, [params, defaults]);

  const set = useCallback(
    (patch: Partial<T>, opts?: { replace?: boolean }) => {
      const next = new URLSearchParams(params);
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === '' || v === defaults[k]) next.delete(k);
        else next.set(k, String(v));
      }
      // Any filter change resets pagination unless the patch sets it.
      if (!('page' in patch) && 'page' in defaults) next.delete('page');
      setParams(next, { replace: opts?.replace ?? true });
    },
    [params, setParams, defaults],
  );

  const reset = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    for (const key of Object.keys(defaults)) {
      if (['page', 'sort', 'dir', 'view', 'density'].includes(key)) continue;
      const v = params.get(key);
      if (v && v !== defaults[key]) n += 1;
    }
    return n;
  }, [params, defaults]);

  return { state, set, reset, activeFilterCount };
}
