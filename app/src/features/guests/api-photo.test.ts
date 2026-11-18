import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ rpc: vi.fn(), upload: vi.fn(), remove: vi.fn(), shrink: vi.fn(), row: { data: { guest_id: 'g1', id_photo_path: 'c1/old.jpg' } as unknown, error: null as unknown } }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: h.rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(h.row) }) }) }),
    storage: { from: () => ({ upload: h.upload, remove: h.remove }) },
  },
}));
vi.mock('@/lib/image-shrink', () => ({ shrinkToJpeg: h.shrink }));

import { removeIdPhoto, restoreIdPhoto, uploadCompanionIdPhoto } from './api';

const jpeg = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])], 'a.jpg', { type: 'image/jpeg' });

beforeEach(() => {
  h.rpc.mockReset().mockResolvedValue({ data: { ok: true, id: 'c1', version: 5 }, error: null });
  h.upload.mockReset().mockResolvedValue({ error: null });
  h.remove.mockReset(); h.shrink.mockReset();
  h.row.data = { guest_id: 'g1', id_photo_path: 'c1/old.jpg' };
});

describe('uploadCompanionIdPhoto', () => {
  it('shrinks first, uploads the shrunk JPEG, and reports the stages in order', async () => {
    const small = new Blob(['s'], { type: 'image/jpeg' });
    h.shrink.mockResolvedValue(small);
    const stages: string[] = [];
    const path = await uploadCompanionIdPhoto('c1', jpeg(), (s) => stages.push(s));
    expect(stages).toEqual(['shrinking', 'uploading', 'saved']);
    expect(path).toMatch(/^c1\/[0-9a-f-]{36}\.jpg$/);
    expect(h.upload).toHaveBeenCalledWith(path, small, { upsert: false, contentType: 'image/jpeg' });
  });
  it('uploads the checked original when the browser cannot shrink it', async () => {
    h.shrink.mockRejectedValue(new Error('not an image'));
    const f = jpeg();
    await uploadCompanionIdPhoto('c1', f);
    expect(h.upload.mock.calls[0]![1]).toBe(f);
  });
  it('throws the storage error so the caller can retry', async () => {
    h.shrink.mockResolvedValue(new Blob(['s']));
    h.upload.mockResolvedValue({ error: new Error('offline') });
    await expect(uploadCompanionIdPhoto('c1', jpeg())).rejects.toThrow('offline');
  });
});

describe('removeIdPhoto / restoreIdPhoto', () => {
  it('clears the path through the companion save with the removed reason and never deletes the file', async () => {
    const r = await removeIdPhoto('c1', 4);
    expect(r).toEqual({ previousPath: 'c1/old.jpg', version: 5 });
    expect(h.rpc).toHaveBeenCalledWith('save_guest_companion_v1', { p_guest_id: 'g1', p_companion_id: 'c1', p_patch: { id_photo_path: null }, p_expected_version: 4, p_reason: 'ID photo removed' });
    expect(h.remove).not.toHaveBeenCalled();
  });
  it('writes the old path back on undo with the restored reason', async () => {
    await restoreIdPhoto('c1', 'c1/old.jpg', 5);
    expect(h.rpc).toHaveBeenCalledWith('save_guest_companion_v1', { p_guest_id: 'g1', p_companion_id: 'c1', p_patch: { id_photo_path: 'c1/old.jpg' }, p_expected_version: 5, p_reason: 'ID photo restored' });
    expect(h.remove).not.toHaveBeenCalled();
  });
  it('says plainly when the person is not found', async () => {
    h.row.data = null;
    await expect(removeIdPhoto('zz', 1)).rejects.toThrow('could not be found');
    expect(h.rpc).not.toHaveBeenCalled();
  });
});
