import { afterEach, describe, expect, it, vi } from 'vitest';

// Lane D: sample data only when the demo flag is on. With it off, the app builds the live client and never the demo one.
afterEach(() => { vi.resetModules(); vi.doUnmock('./demo'); });

async function load(demo: boolean) {
  vi.resetModules();
  vi.doMock('./demo', () => ({ DEMO: demo, demoOffline: () => { throw new Error('offline'); } }));
  return (await import('./supabase')).supabase;
}

describe('D_demo gate', () => {
  it('flag on: the client answers from sample data, signed in as a synthetic owner', async () => {
    const sb = await load(true);
    const { data } = await sb.rpc('current_staff_access');
    expect((data as { role: string }).role).toBe('owner');
    const { data: g } = await sb.from('guests').select('*');
    expect((g as Array<{ name: string }>).every((r) => /^Demo Guest /.test(r.name))).toBe(true);
  });

  it('flag off: the live client is built, not the demo one (live starts empty)', async () => {
    const sb = await load(false);
    expect(sb.from('guests').constructor.name).not.toBe('DemoQuery');
    expect(typeof (sb as unknown as { realtime?: unknown }).realtime).toBe('object'); // only the real client has a realtime channel manager
  });
});
