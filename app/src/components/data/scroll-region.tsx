import type { ReactNode } from 'react';

// D_ a raw <table> on a phone scrolls sideways inside this box, and keeps its table semantics (no display:block on the table).
// A scrollable region needs a name and a tab stop so a keyboard can reach it.
export function ScrollRegion({ label, children }: { label: string; children: ReactNode }) {
  return <div role="region" aria-label={label} tabIndex={0} className="max-w-full overflow-x-auto">{children}</div>;
}
