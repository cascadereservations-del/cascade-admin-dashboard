import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ThemeProvider } from './use-theme';

// Lane D: embedded in the staff shell, the dashboard follows the shell's theme, including a LATER change, and stops watching on unmount.
// (jsdom has no frame, so window.parent is this window and the "shell" root is document.documentElement.)
beforeEach(() => {
  window.history.replaceState({}, '', '/?embed=1');
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.classList.remove('dark');
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
});
afterEach(() => { cleanup(); window.history.replaceState({}, '', '/'); document.documentElement.removeAttribute('data-theme'); document.documentElement.classList.remove('dark'); vi.restoreAllMocks(); });

const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

it('D_follows a later change of the shell data-theme, and stops after unmount', async () => {
  const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
  const { unmount } = render(<ThemeProvider><i /></ThemeProvider>);
  expect(document.documentElement.classList.contains('dark')).toBe(false);
  document.documentElement.setAttribute('data-theme', 'dark');
  await tick();
  expect(document.documentElement.classList.contains('dark')).toBe(true);
  document.documentElement.setAttribute('data-theme', 'light');
  await tick();
  expect(document.documentElement.classList.contains('dark')).toBe(false);
  unmount();
  expect(disconnect).toHaveBeenCalled();
});

it('D_starts on the shell theme when the shell already has one', () => {
  document.documentElement.setAttribute('data-theme', 'dark');
  render(<ThemeProvider><i /></ThemeProvider>);
  expect(document.documentElement.classList.contains('dark')).toBe(true);
});
