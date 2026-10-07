import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: () => getSession() } } }));

import { draftGuestReply, guestReplyError } from './guest-reply-api';
import { fitWithin } from './guest-reply-image';

const respond = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const OK = { ok: true, guest_name: 'Maria', platform: 'messenger', guest_text: 'Is early check-in possible?', header: 'Maria on Messenger', replies: ['One', 'Two'] };
const fetchMock = () => vi.mocked(fetch);
const sentBody = () => JSON.parse(String(fetchMock().mock.calls[0]![1]!.body));

beforeEach(() => {
  getSession.mockReset();
  getSession.mockResolvedValue({ data: { session: { access_token: 'jwt.token' } } });
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('draftGuestReply', () => {
  it('posts the text with the session token and returns the drafts', async () => {
    fetchMock().mockReturnValue(respond(OK));
    const d = await draftGuestReply({ text: 'Is early check-in possible?', guestName: ' Maria ', platform: 'airbnb' });
    const [url, init] = fetchMock().mock.calls[0]!;
    expect(String(url)).toMatch(/\/functions\/v1\/guest-reply-draft$/);
    expect(init).toMatchObject({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer jwt.token', apikey: expect.any(String), 'Content-Type': 'application/json' }) });
    expect(sentBody()).toEqual({ text: 'Is early check-in possible?', guest_name: 'Maria', platform: 'airbnb' });
    expect(d.replies).toEqual(['One', 'Two']);
    expect(d.guest_text).toBe('Is early check-in possible?');
  });
  it('sends an image and no text, and omits a blank guest name', async () => {
    fetchMock().mockReturnValue(respond(OK));
    await draftGuestReply({ image: { base64: 'QUJD', mime: 'image/jpeg' }, guestName: '  ' });
    expect(sentBody()).toEqual({ image: { base64: 'QUJD', mime: 'image/jpeg' } });
  });
  it('asks for a sign-in when there is no session, without calling the function', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(draftGuestReply({ text: 'Hi' })).rejects.toMatchObject({ kind: 'forbidden' });
    expect(fetchMock()).not.toHaveBeenCalled();
  });
  it.each([
    [400, 'empty', /Add the guest message first/],
    [400, 'both', /either the text or the screenshot/],
    [400, 'too_long', /longer than 4,000 characters/],
    [400, 'bad_image', /could not be read/],
    [400, 'bad_json', /did not go through/],
    [401, 'invalid_or_expired_session', /session expired/],
    [403, 'staff_access_denied', /^Only owner and admin accounts can draft guest replies\.$/],
    [413, 'image_too_large', /too large/],
    [422, 'no_guest_message', /No guest message could be found/],
    [502, 'draft_failed', /could not write a draft/],
  ])('maps %i %s to one plain sentence', async (status, code, sentence) => {
    fetchMock().mockReturnValue(respond({ ok: false, error: code }, status));
    const err = await draftGuestReply({ text: 'Hi' }).catch((e) => e);
    expect(err.message).toMatch(sentence);
    expect(err.message).not.toMatch(/!|unfortunately/i);
    expect(err.detail).toBe(code);
  });
  it('gives a warm sentence for a gateway timeout whose body is not JSON', async () => {
    fetchMock().mockReturnValue(Promise.resolve(new Response('<html>Gateway Timeout</html>', { status: 504 })));
    const err = await draftGuestReply({ text: 'Hi' }).catch((e) => e);
    expect(err.message).toMatch(/could not draft a reply this time/);
    expect(err.message).not.toMatch(/!|unfortunately|html/i);
  });
  it('gives a warm sentence when the function is not configured (503 guest_reply_draft_unavailable)', async () => {
    fetchMock().mockReturnValue(respond({ ok: false, error: 'guest_reply_draft_unavailable' }, 503));
    const err = await draftGuestReply({ text: 'Hi' }).catch((e) => e);
    expect(err.message).toMatch(/could not draft a reply this time/);
    expect(err.message).not.toMatch(/!|unfortunately/i);
    expect(err.detail).toBe('guest_reply_draft_unavailable');
  });
  it('says the server could not be reached on a network failure', async () => {
    fetchMock().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(draftGuestReply({ text: 'Hi' })).rejects.toMatchObject({ kind: 'unavailable', message: expect.stringMatching(/Could not reach the server/) });
  });
  it('treats a 200 with no replies as a failed draft', async () => {
    fetchMock().mockReturnValue(respond({ ...OK, replies: [] }));
    await expect(draftGuestReply({ text: 'Hi' })).rejects.toMatchObject({ detail: 'draft_failed' });
  });
  it('falls back on the status for a code it does not know', () => {
    expect(guestReplyError('mystery', 403).kind).toBe('forbidden');
    expect(guestReplyError(undefined, 500).kind).toBe('unavailable');
  });
});

describe('fitWithin', () => {
  it('shrinks the long edge to 1600 and keeps the ratio', () => {
    expect(fitWithin(3200, 1600)).toEqual({ width: 1600, height: 800 });
    expect(fitWithin(1080, 2400)).toEqual({ width: 720, height: 1600 });
  });
  it('never enlarges a small image', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 1600)).toEqual({ width: 1600, height: 1600 });
  });
  it('never returns a zero side', () => {
    expect(fitWithin(100000, 10)).toEqual({ width: 1600, height: 1 });
  });
});
