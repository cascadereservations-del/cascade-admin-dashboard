import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { PhotoLightbox, type LightboxItem } from './photo-lightbox';

afterEach(cleanup);
const items: LightboxItem[] = [1, 2, 3].map((n) => ({ src: `https://x.test/${n}.jpg`, label: `Photo label ${n}`, sub: `file-${n}.jpg` }));
function Harness({ start = 0 }: { start?: number | null }) {
  const [i, setI] = useState<number | null>(start);
  return <PhotoLightbox items={items} index={i} onIndexChange={setI} onClose={() => setI(null)} />;
}

it('shows counter and label, steps with arrows and keys, wraps, and closes on Escape', () => {
  render(<Harness />);
  expect(screen.getByText('1 / 3')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Photo label 1' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));
  expect(screen.getByText('2 / 3')).toBeInTheDocument();
  const dialog = screen.getByRole('dialog');
  fireEvent.keyDown(dialog, { key: 'ArrowRight' });
  fireEvent.keyDown(dialog, { key: 'ArrowRight' });
  expect(screen.getByText('1 / 3')).toBeInTheDocument();
  fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
  expect(screen.getByText('3 / 3')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Photo 2:/ }));
  expect(screen.getByText('2 / 3')).toBeInTheDocument();
  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('swipes between photos', () => {
  render(<Harness />);
  const stage = screen.getByRole('img', { name: 'Photo label 1' }).parentElement!;
  fireEvent.pointerDown(stage, { clientX: 200, clientY: 100 });
  fireEvent.pointerUp(stage, { clientX: 60, clientY: 105 });
  expect(screen.getByText('2 / 3')).toBeInTheDocument();
});

it('renders nothing when closed', () => {
  render(<Harness start={null} />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
