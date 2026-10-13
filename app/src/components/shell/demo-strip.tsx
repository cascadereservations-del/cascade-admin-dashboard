import { DEMO, DEMO_STRIP } from '@/lib/demo';

// D_ demo mode label: on every screen, both shells, never dismissible. Fixed height, rendered from the first paint (DEMO is a load-time
// constant), so nothing shifts. Glyph plus words; warn colours are AA on their soft background in both themes.
export function DemoStrip() {
  if (!DEMO) return null;
  return (
    <div role="note" data-demo-strip className="D_demo-strip">
      <span aria-hidden>▲</span> {DEMO_STRIP}
    </div>
  );
}
