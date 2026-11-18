import { fitWithin } from '@/features/guests/guest-reply-image';

// Shrink a picked or pasted photo to a JPEG Blob before upload (s118: phone photos are 3-8 MB; an ID card read fine at 2000 px).
// createImageBitmap applies the EXIF rotation, so a portrait phone photo is not stored sideways. Never enlarges.
const SHRINK_EDGE = 2000;
const SHRINK_QUALITY = 0.85;

export async function shrinkToJpeg(file: Blob, opts: { maxEdge?: number; quality?: number } = {}): Promise<Blob> {
  if (file.type && !file.type.startsWith('image/')) throw new Error('not an image');
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { throw new Error('not an image'); }
  try {
    const { width, height } = fitWithin(bmp.width, bmp.height, opts.maxEdge ?? SHRINK_EDGE);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas unavailable');
    ctx.fillStyle = '#fff'; // JPEG has no transparency; a transparent PNG would otherwise turn black
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bmp, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', opts.quality ?? SHRINK_QUALITY));
    if (!blob) throw new Error('image encode failed');
    return blob;
  } finally { bmp.close(); }
}
