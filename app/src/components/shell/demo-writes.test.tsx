import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Lane D: in demo mode a write never claims success. A demo Send says nothing was sent, any other write says nothing was saved,
// the sidebar writes no cookie, and the footer does not say "Writes enabled".
vi.mock('@/lib/demo', () => ({ DEMO: true, DEMO_SAVED: 'Sample mode: nothing was saved.', DEMO_SENT: 'Sample mode: nothing was sent.', DEMO_STRIP: 'Sample data. Nothing here is real and nothing is saved.' }));
vi.mock('@/lib/supabase', async () => {
  const { createDemoClient } = await import('@/lib/demo-client');
  return { supabase: createDemoClient(new Date('2026-10-13T02:00:00Z')) };
});

import { routeObjects } from '@/routes';
import { SessionProvider } from '@/auth/session';
import { ThemeProvider } from '@/hooks/use-theme';
import { TooltipProvider } from '@/components/ui/tooltip';
import { installDemoToasts } from '@/lib/demo-toast';

const cookieSet = vi.spyOn(Document.prototype, 'cookie', 'set');

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-13T02:00:00Z') });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
});
afterAll(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
afterEach(() => { cleanup(); window.history.replaceState({}, '', '/'); });

function at(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><ThemeProvider><SessionProvider><TooltipProvider><RouterProvider router={createMemoryRouter(routeObjects, { initialEntries: [path] })} /></TooltipProvider></SessionProvider></ThemeProvider></QueryClientProvider>);
}

describe('D_demo writes', { timeout: 90_000 }, () => {
  it('a demo Send says nothing was sent, and never "Reply sent"', async () => {
    window.history.replaceState({}, '', '/?embed=1&demo');
    at('/guests/conversations');
    const box = await screen.findByLabelText(/Reply to Demo Guest Two/, undefined, { timeout: 60_000 });
    await userEvent.type(box, 'See you at 2:00 pm');
    await userEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    await screen.findByText('Sample mode: nothing was sent.', undefined, { timeout: 20_000 });
    expect(screen.queryByText(/Reply sent/)).toBeNull();
  });

  it('any other demo write says nothing was saved instead of its real success text', async () => {
    const success = vi.fn();
    const target = { success } as unknown as { success: typeof import("sonner").toast.success };
    installDemoToasts(target);
    const say = target.success as unknown as (...a: unknown[]) => void;
    say('Saved. Guests will be given X', { description: 'details', action: { label: 'Undo' }, duration: 8000 });
    say('Sample mode: nothing was sent.');
    const calls = success.mock.calls;
    expect(calls[0]![0]).toBe('Sample mode: nothing was saved.');
    expect(JSON.stringify(calls[0]![1])).not.toMatch(/Undo|details/);
    expect(calls[1]![0]).toBe('Sample mode: nothing was sent.');
  });

  it('the full shell has no "Writes enabled" line and the sidebar toggle writes no cookie', async () => {
    window.history.replaceState({}, '', '/?demo');
    at('/today');
    const toggle = await screen.findByRole('button', { name: 'Toggle navigation' }, { timeout: 60_000 });
    await userEvent.click(toggle);
    await waitFor(() => expect(document.querySelector('[data-demo-strip]')).not.toBeNull());
    expect(cookieSet).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/Writes enabled|Read-only rollout/);
  });
});
