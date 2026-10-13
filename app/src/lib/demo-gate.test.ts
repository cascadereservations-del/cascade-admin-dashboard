import { afterEach, describe, expect, it, vi } from 'vitest';

// Lane D: sample data only when the demo flag is on. With it off, the app builds the live client and never the demo one;
// with it on, no real Supabase client is built at all.
const created = vi.fn();
afterEach(() => { vi.resetModules(); vi.doUnmock('./demo'); vi.doUnmock('@supabase/supabase-js'); created.mockClear(); });

async function load(demo: boolean) {
  vi.resetModules();
  vi.doMock('./demo', () => ({ DEMO: demo, DEMO_SAVED: 'Sample mode: nothing was saved.', DEMO_SENT: 'Sample mode: nothing was sent.', DEMO_STRIP: 'x' }));
  vi.doMock('@supabase/supabase-js', async (orig) => {
    const m = await orig<typeof import('@supabase/supabase-js')>();
    return { ...m, createClient: ((...a: Parameters<typeof m.createClient>) => { created(); return m.createClient(...a); }) as typeof m.createClient };
  });
  return (await import('./supabase')).supabase;
}

describe('D_demo gate', () => {
  it('flag on: the client answers from sample data, signed in as a synthetic owner, and no real Supabase client is built', async () => {
    const sb = await load(true);
    const { data } = await sb.rpc('current_staff_access');
    expect((data as { role: string }).role).toBe('owner');
    const { data: g } = await sb.from('guests').select('*');
    expect((g as Array<{ name: string }>).every((r) => /^Demo Guest /.test(r.name))).toBe(true);
    expect(created).not.toHaveBeenCalled();
  });

  it('flag off: the live client is built, not the demo one (live starts empty)', async () => {
    const sb = await load(false);
    expect(created).toHaveBeenCalledTimes(1);
    expect(sb.from('guests').constructor.name).not.toBe('DemoQuery');
    expect(typeof (sb as unknown as { realtime?: unknown }).realtime).toBe('object'); // only the real client has a realtime channel manager
  });
});
