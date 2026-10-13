import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Lane D: the four raw fetch() paths (everything else goes through the Supabase client) answer from sample data in demo mode and
// never touch the network. Each assertion goes red if that function's DEMO guard line is removed.
vi.mock('@/lib/demo', () => ({ DEMO: true, DEMO_SAVED: 'Sample mode: nothing was saved.', DEMO_SENT: 'Sample mode: nothing was sent.', DEMO_STRIP: 'x' }));
vi.mock('@/lib/supabase', async () => {
  const { createDemoClient } = await import('@/lib/demo-client');
  return { supabase: createDemoClient(new Date('2026-10-13T02:00:00Z')) };
});

import { sendHostReply } from '@/features/guests/conversations-api';
import { draftGuestReply } from '@/features/guests/guest-reply-api';
import { previewQuote } from '@/features/pricing/api';
import { listStaff } from '@/features/settings/api';

const f = vi.fn(() => Promise.reject(new TypeError('no network in demo')));
beforeEach(() => { vi.stubGlobal('fetch', f); f.mockClear(); });
afterEach(() => vi.unstubAllGlobals());

describe('D_demo raw-fetch guards', () => {
  it('host-reply: Send answers locally and makes no call', async () => {
    const r = await sendHostReply({ psid: 'demo-psid-1', text: 'Hello', handoffId: null });
    expect(r.recorded).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });
  it('guest-reply-draft: drafts locally and makes no call', async () => {
    const d = await draftGuestReply({ text: 'Is parking free?', platform: 'messenger' });
    expect(d.replies.length).toBeGreaterThan(0);
    expect(f).not.toHaveBeenCalled();
  });
  it('rate-card preview: quotes locally and makes no call', async () => {
    const q = await previewQuote('2026-11-01', '2026-11-03');
    expect(q.n).toBe(2);
    expect(f).not.toHaveBeenCalled();
  });
  it('staff-users: lists the sample staff and makes no call', async () => {
    const s = await listStaff();
    expect(s[0]?.name).toBe('Demo Owner');
    expect(f).not.toHaveBeenCalled();
  });
});
