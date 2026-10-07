import type { ReplyImage } from './guest-reply-api';

export const MAX_EDGE = 1600;
export const JPEG_QUALITY = 0.82;

/** Fit w x h inside a max-edge square, keeping the ratio. Never enlarges. */
export function fitWithin(w: number, h: number, max = MAX_EDGE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** Shrink a picked or pasted image to a JPEG (long edge 1600 px, quality 0.82) so it stays well under the function's 4 MB limit. */
export async function shrinkImage(file: Blob): Promise<ReplyImage> {
  const bmp = await createImageBitmap(file);
  const { width, height } = fitWithin(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.fillStyle = '#fff'; // JPEG has no transparency; a transparent PNG would otherwise turn black
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bmp, 0, 0, width, height);
  bmp.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', JPEG_QUALITY));
  if (!blob) throw new Error('image encode failed');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { base64: btoa(bin), mime: 'image/jpeg' };
}
