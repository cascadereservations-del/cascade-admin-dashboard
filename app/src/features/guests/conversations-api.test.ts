import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.fn();
const getSession = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpcMock(...a), auth: { getSession: () => getSession() } } }));

import { fetchConversations, fetchThread, replyError, sendHostReply } from './conversations-api';

const ok = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

beforeEach(() => {
  rpcMock.mockReset();
  getSession.mockReset();
  getSession.mockResolvedValue({ data: { session: { access_token: 'jwt.token' } } });
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('reads', () => {
  it('lists conversations through the owner/admin RPC with a limit', async () => {
    rpcMock.mockResolvedValue({ data: [{ psid: 'zz-1', psid_short: 'abcd1234', open_handoffs: 1 }], error: null });
    const rows = await fetchConversations(10);
    expect(rpcMock).toHaveBeenCalledWith('concierge_conversations_v1', { p_limit: 10 });
    expect(rows).toHaveLength(1);
  });
  it('treats a null list as empty, never as an error', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    expect(await fetchConversations()).toEqual([]);
  });
  it('turns a refused read (not owner/admin) into a forbidden error, not empty data', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: '42501', message: 'only an owner or admin can read conversations' } });
    await expect(fetchConversations()).rejects.toMatchObject({ kind: 'forbidden' });
  });
  it('reports a missing RPC as unavailable', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.concierge_thread_v1' } });
    await expect(fetchThread('zz-1')).rejects.toMatchObject({ kind: 'unavailable' });
  });
  it('reads one thread by psid and defaults a missing history to []', async () => {
    rpcMock.mockResolvedValue({ data: { psid: 'zz-1', psid_short: 'abcd1234', guest_name: null, history: null, handoffs: undefined }, error: null });
    const t = await fetchThread('zz-1');
    expect(rpcMock).toHaveBeenCalledWith('concierge_thread_v1', { p_psid: 'zz-1' });
    expect(t?.history).toEqual([]);
    expect(t?.handoffs).toEqual([]);
  });
  it('returns null for an unknown thread', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    expect(await fetchThread('nope')).toBeNull();
  });
});

describe('sendHostReply', () => {
  it('posts exactly one explicit send with the caller token and the handoff id', async () => {
    const f = vi.mocked(fetch);
    f.mockReturnValue(ok({ ok: true, sent_text: 'Hi\n\n— Lloyd, Cascade Hideaway', recorded: true, handoff_marked: true }));
    const r = await sendHostReply({ psid: 'zz-1', text: 'Hi', handoffId: '11111111-1111-4111-8111-111111111111' });
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0]!;
    expect(String(url)).toMatch(/\/functions\/v1\/host-reply$/);
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer jwt.token');
    expect(JSON.parse(String(init!.body))).toEqual({ action: 'send', psid: 'zz-1', text: 'Hi', handoff_id: '11111111-1111-4111-8111-111111111111' });
    expect(r).toEqual({ sent_text: 'Hi\n\n— Lloyd, Cascade Hideaway', recorded: true, handoff_marked: true });
  });
  it('leaves handoff_id out when none is chosen', async () => {
    const f = vi.mocked(fetch);
    f.mockReturnValue(ok({ ok: true, sent_text: 'x', recorded: true, handoff_marked: false }));
    await sendHostReply({ psid: 'zz-1', text: 'Hi', handoffId: null });
    expect(JSON.parse(String(f.mock.calls[0]![1]!.body))).not.toHaveProperty('handoff_id');
  });
  it('sends nothing when signed out', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(sendHostReply({ psid: 'zz-1', text: 'Hi', handoffId: null })).rejects.toMatchObject({ kind: 'forbidden' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('shows the refusal and says nothing was sent when the function refuses', async () => {
    const f = vi.mocked(fetch);
    f.mockReturnValue(ok({ ok: false, error: 'staff_access_denied' }, 403));
    await expect(sendHostReply({ psid: 'zz-1', text: 'Hi', handoffId: null })).rejects.toMatchObject({ kind: 'forbidden' });
    f.mockReturnValue(ok({ ok: false, error: 'messenger_refused' }, 502));
    await expect(sendHostReply({ psid: 'zz-1', text: 'Hi', handoffId: null })).rejects.toMatchObject({ kind: 'unavailable', message: expect.stringMatching(/nothing was sent/i) });
    f.mockReturnValue(ok({ ok: false, error: 'reply_window_closed' }, 409));
    await expect(sendHostReply({ psid: 'zz-1', text: 'Hi', handoffId: null })).rejects.toMatchObject({ kind: 'conflict' });
  });
  it('treats a network failure as possibly sent, never claims nothing was sent, and never retries', async () => {
    const f = vi.mocked(fetch);
    f.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(sendHostReply({ psid: 'zz-1', text: 'Hi', handoffId: null })).rejects.toMatchObject({ kind: 'unavailable', message: 'The reply may have been sent. Refresh the conversation before trying again.' });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('says the reply may have been sent on a 504 or any unnamed 5xx', async () => {
    const f = vi.mocked(fetch);
    for (const status of [500, 504]) {
      f.mockReturnValue(ok({}, status));
      await expect(sendHostReply({ psid: 'zz-1', text: 'Hi', handoffId: null })).rejects.toMatchObject({ message: expect.stringMatching(/may have been sent/i) });
    }
  });
});

describe('replyError', () => {
  it('maps an unknown code by status and never claims a send', () => {
    expect(replyError('weird', 500)).toMatchObject({ kind: 'unavailable', message: expect.stringMatching(/may have been sent/i) });
    expect(replyError('weird', 400)).toMatchObject({ kind: 'validation', message: 'The reply was not sent.' });
    expect(replyError('duplicate_reply', 409)).toMatchObject({ kind: 'conflict' });
    expect(replyError('messenger_refused', 502).message).toMatch(/nothing was sent/i); // the function named it: Messenger said no
    expect(replyError(undefined, 404)).toMatchObject({ kind: 'not_found' });
    expect(replyError('handoff_not_open', 409)).toMatchObject({ kind: 'conflict' });
  });
});
