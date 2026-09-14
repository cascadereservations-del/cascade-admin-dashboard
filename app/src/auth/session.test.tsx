import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { SessionProvider, useSession } from './session';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), rpc: vi.fn(), callback: null as null | ((event: string) => void) }));
vi.mock('@/lib/supabase', () => ({ supabase: {
  rpc: mocks.rpc,
  auth: { getSession: mocks.getSession, signOut: vi.fn(), mfa: { getAuthenticatorAssuranceLevel: vi.fn(async () => ({ data: { currentLevel: 'aal1' } })) }, onAuthStateChange: (callback: (event: string) => void) => { mocks.callback = callback; return { data: { subscription: { unsubscribe: vi.fn() } } }; } },
} }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function Status() { const s = useSession(); return <div>{s.status}:{s.caps.can('manage_operations') ? 'manager' : 'none'}</div>; }
function mount(qc: QueryClient) { return render(<QueryClientProvider client={qc}><SessionProvider><Status /></SessionProvider></QueryClientProvider>); }

it('does not restore access when a request finishes after sign-out', async () => {
  let resolve!: (value: unknown) => void;
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'synthetic-user' } } } });
  mocks.rpc.mockImplementation(() => new Promise((r) => { resolve = r; }));
  const qc = new QueryClient(); mount(qc);
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalled());
  qc.setQueryData(['private-test'], 'sensitive fixture');
  await act(async () => mocks.callback?.('SIGNED_OUT'));
  expect(qc.getQueryData(['private-test'])).toBeUndefined();
  await act(async () => resolve({ data: { role: 'owner', property_ids: ['test-property'], disabled: false, session_current: true }, error: null }));
  expect(screen.getByText('signed_out:none')).toBeInTheDocument();
});

it('fails closed on refresh errors and clears previously cached private data', async () => {
  mocks.getSession.mockRejectedValue(new Error('Session unavailable'));
  const qc = new QueryClient(); qc.setQueryData(['private-test'], 'sensitive fixture');
  mount(qc);
  await screen.findByText('error:none');
  expect(qc.getQueryData(['private-test'])).toBeUndefined();
});
