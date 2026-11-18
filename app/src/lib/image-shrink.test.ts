import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fitWithin } from '@/features/guests/guest-reply-image';
import { shrinkToJpeg } from './image-shrink';

let size: { width: number; height: number };
let drawn: { w: number; h: number } | null;
let quality: number | undefined;
const bitmap = (width: number, height: number) => ({ width, height, close: vi.fn() });

beforeEach(() => {
  drawn = null; quality = undefined;
  vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap(size.width, size.height)));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return { fillRect: vi.fn(), drawImage: (_b: unknown, _x: number, _y: number, w: number, h: number) => { drawn = { w, h }; } } as unknown as CanvasRenderingContext2D;
  } as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb, _t, q) => { quality = q as number; cb(new Blob(['jpg'], { type: 'image/jpeg' })); });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('fitWithin', () => {
  it('scales the long edge to the max and keeps the ratio', () => {
    expect(fitWithin(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000 });
  });
  it('never enlarges', () => expect(fitWithin(800, 600, 2000)).toEqual({ width: 800, height: 600 }));
});

describe('shrinkToJpeg', () => {
  it('shrinks a 4000x3000 photo to 2000x1500 at quality 0.85 and returns a JPEG blob', async () => {
    size = { width: 4000, height: 3000 };
    const out = await shrinkToJpeg(new Blob(['x'], { type: 'image/png' }));
    expect(drawn).toEqual({ w: 2000, h: 1500 });
    expect(quality).toBe(0.85);
    expect(out.type).toBe('image/jpeg');
  });
  it('does not upscale a small photo', async () => {
    size = { width: 800, height: 600 };
    await shrinkToJpeg(new Blob(['x'], { type: 'image/jpeg' }));
    expect(drawn).toEqual({ w: 800, h: 600 });
  });
  it('honours maxEdge and quality options', async () => {
    size = { width: 4000, height: 2000 };
    await shrinkToJpeg(new Blob(['x'], { type: 'image/jpeg' }), { maxEdge: 1000, quality: 0.5 });
    expect(drawn).toEqual({ w: 1000, h: 500 });
    expect(quality).toBe(0.5);
  });
  it('rejects a non-image by type, and a file that will not decode', async () => {
    await expect(shrinkToJpeg(new Blob(['x'], { type: 'application/pdf' }))).rejects.toThrow('not an image');
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('decode'); }));
    await expect(shrinkToJpeg(new Blob(['x'], { type: 'image/jpeg' }))).rejects.toThrow('not an image');
  });
});
