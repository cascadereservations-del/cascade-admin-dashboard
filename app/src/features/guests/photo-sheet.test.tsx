import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PhotoSheet } from './photo-sheet';

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0];
const jpeg = (name = 'id.jpg') => new File([new Uint8Array(JPEG)], name, { type: 'image/jpeg' });
const coarse = (on: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({ matches: on && q.includes('coarse'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
beforeEach(() => coarse(false));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function view(over: Partial<React.ComponentProps<typeof PhotoSheet>> = {}) {
  const onPicked = vi.fn(), onClose = vi.fn();
  render(<PhotoSheet open onClose={onClose} onPicked={onPicked} {...over} />);
  return { onPicked, onClose };
}

it('is a named dialog with the three sources on a phone, Take Photo using the rear camera', () => {
  coarse(true);
  view();
  expect(screen.getByRole('dialog', { name: 'Add photo' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Take Photo' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Choose from Library' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Paste' })).toBeInTheDocument();
  expect(screen.getByTestId('photo-camera')).toHaveAttribute('capture', 'environment');
  expect(screen.getByTestId('photo-library')).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
});

it('on desktop hides Take Photo, offers a drop zone, and allowPaste=false hides Paste', () => {
  view({ allowPaste: false });
  expect(screen.queryByRole('button', { name: 'Take Photo' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Choose File…' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Paste/ })).toBeNull();
  expect(screen.getByText('Or drop an image here')).toBeInTheDocument();
});

it('hands a picked file to onPicked and closes', async () => {
  const { onPicked, onClose } = view();
  const f = jpeg();
  await userEvent.upload(screen.getByTestId('photo-library'), f);
  await waitFor(() => expect(onPicked).toHaveBeenCalledWith(f));
  expect(onClose).toHaveBeenCalled();
});

it('refuses a non-image on pick with a plain message and does not call onPicked', async () => {
  const { onPicked } = view();
  fireEvent.change(screen.getByTestId('photo-library'), { target: { files: [new File(['%PDF-1.4 xxxxxx'], 'a.pdf', { type: 'application/pdf' })] } });
  expect(await screen.findByRole('alert')).toHaveTextContent('Choose a JPEG, PNG or WebP image.');
  expect(onPicked).not.toHaveBeenCalled();
});

it('takes an image pasted with Ctrl+V', async () => {
  const { onPicked } = view();
  const f = jpeg('pasted.jpg');
  const ev = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData?: unknown };
  ev.clipboardData = { files: [f] };
  document.dispatchEvent(ev);
  await waitFor(() => expect(onPicked).toHaveBeenCalledWith(f));
});

it('Paste button explains Ctrl+V when the clipboard is blocked, and reads an image when it is not', async () => {
  const { onPicked } = view();
  vi.stubGlobal('navigator', { ...navigator, clipboard: { read: vi.fn().mockRejectedValue(new Error('denied')) } });
  await userEvent.click(screen.getByRole('button', { name: /^Paste/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Press Ctrl+V to paste the image.');
  const blob = new Blob([new Uint8Array(JPEG)], { type: 'image/jpeg' });
  vi.stubGlobal('navigator', { ...navigator, clipboard: { read: vi.fn().mockResolvedValue([{ types: ['image/jpeg'], getType: async () => blob }]) } });
  await userEvent.click(screen.getByRole('button', { name: /^Paste/ }));
  await waitFor(() => expect(onPicked).toHaveBeenCalled());
});

it('closes on Cancel and on Esc', async () => {
  const { onClose } = view();
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onClose).toHaveBeenCalledTimes(1);
  await userEvent.keyboard('{Escape}');
  expect(onClose).toHaveBeenCalledTimes(2);
});
