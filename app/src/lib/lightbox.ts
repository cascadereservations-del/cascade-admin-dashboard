// Pure helpers for the photo viewer (components/data/photo-lightbox.tsx).

/** Step through n items with wrap-around, so the last photo's "next" is the first. */
export function wrapIndex(i: number, n: number): number {
  return n <= 0 ? 0 : ((i % n) + n) % n;
}

/** A horizontal swipe of at least `min` px that is mostly sideways. -1 = back, 1 = forward, 0 = not a swipe. */
export function swipeStep(dx: number, dy: number, min = 48): -1 | 0 | 1 {
  if (Math.abs(dx) < min || Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? 1 : -1;
}

/** "3 / 24" */
export function counterText(i: number, n: number): string {
  return `${Math.min(Math.max(i, 0), Math.max(n - 1, 0)) + 1} / ${n}`;
}

/**
 * Readable label from a stored photo file name: "afterclean_2026-09-28T10-12-00.jpg" -> "Afterclean",
 * "Kitchen 2 (3).png" -> "Kitchen 2". Falls back to the raw name when nothing readable is left.
 */
export function photoLabel(name: string): string {
  const base = name.replace(/\.[a-z0-9]{2,5}$/i, '');
  const cleaned = base
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[_-]?/gi, '') // session/photo uuid
    .replace(/[_-]?\d{4}-\d{2}-\d{2}.*$/, '')   // trailing timestamp
    .replace(/[_-]?\d{10,}.*$/, '')               // trailing epoch / long id
    .replace(/\s*\(\d+\)\s*$/, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (!cleaned) return name;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
