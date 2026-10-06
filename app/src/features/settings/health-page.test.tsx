import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchErrors = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({ fetchClientErrors: fetchErrors }));
vi.mock('@/auth/session', () => ({ useSession: () => ({ propertyId: 'p1' }) }));

import { ClientErrorsSection } from './health-page';

function row(i: number, over: Record<string, unknown> = {}) {
  return { fingerprint: `fp${i}`, app: `app-${i}`, kind: `kind-${i}`, message: `message ${i}`, detail: { path: '/x' }, first_seen: '2026-10-01T00:00:00Z', last_seen: '2026-10-05T16:30:00Z', count: i, last_alerted_at: null, ...over };
}

function mount() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ClientErrorsSection /></QueryClientProvider>);
}

describe('ClientErrorsSection', () => {
  beforeEach(() => fetchErrors.mockReset());

  it('says so when there are no client errors', async () => {
    fetchErrors.mockResolvedValue({ rows: [], total: 0 });
    mount();
    expect(await screen.findByText('No client errors in 30 days.')).toBeInTheDocument();
  });

  it('lists each error with app, kind, message, page and the Manila last-seen time', async () => {
    fetchErrors.mockResolvedValue({ rows: [row(1), row(2), row(3)], total: 3 });
    mount();
    expect(await screen.findAllByRole('listitem')).toHaveLength(3);
    for (const i of [1, 2, 3]) {
      expect(screen.getByText(`app-${i}`)).toBeInTheDocument();
      expect(screen.getByText(`kind-${i}`)).toBeInTheDocument();
      expect(screen.getByText(`message ${i}`)).toBeInTheDocument();
    }
    // 2026-10-05T16:30Z is 6 Oct 00:30 in Asia/Manila (UTC+8)
    expect(screen.getAllByText(/page \/x/)).toHaveLength(3);
    expect(screen.getAllByText(/last seen 6 Oct 2026, 00:30/)).toHaveLength(3);
  });
});
