import { useEffect, useState } from 'react';
import { isEmbed } from '@/lib/fold';

// D_ F17: "embed mode and a narrow container". The container is <main id="main"> (the embed shell's @container/main); when it has
// no width yet (first paint, jsdom) the window width stands in. Outside embed mode this is always false, so the desktop layout
// never changes.
export const D_COMPACT_MAX = 600;

function narrow(): boolean {
  if (!isEmbed()) return false;
  const w = document.getElementById('main')?.clientWidth || window.innerWidth;
  return w <= D_COMPACT_MAX;
}

export function D_useCompact(): boolean {
  const [compact, setCompact] = useState(narrow);
  useEffect(() => {
    if (!isEmbed()) return;
    const update = () => setCompact(narrow());
    update();
    const el = document.getElementById('main');
    const ro = typeof ResizeObserver === 'function' && el ? new ResizeObserver(update) : null;
    if (el) ro?.observe(el);
    window.addEventListener('resize', update);
    return () => { ro?.disconnect(); window.removeEventListener('resize', update); };
  }, []);
  return compact;
}
