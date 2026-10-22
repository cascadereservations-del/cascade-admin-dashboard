import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { TIER_BENEFITS, tierBenefits, tierHistory, tierLabel, tierReasonProblem } from './tier';
import { TierCard } from './tier-card';
import type { TimelineEvent } from './api';

const role = vi.hoisted(() => ({ value: 'owner' as string }));
const setGuestTier = vi.hoisted(() => vi.fn());
vi.mock('@/auth/session', () => ({ useSession: () => ({ caps: { role: role.value } }) }));
vi.mock('./api', () => ({ setGuestTier }));
// jsdom lacks the pointer/scroll APIs Radix Select calls.
Object.assign(Element.prototype, { hasPointerCapture: () => false, releasePointerCapture: () => {}, setPointerCapture: () => {}, scrollIntoView: () => {} });
afterEach(() => { cleanup(); setGuestTier.mockReset(); role.value = 'owner'; });

const ev = (reason: unknown, kind = 'profile_change'): TimelineEvent => ({ kind, at: '2026-10-23T01:00:00Z', source: 'guest_profile_history', body: { reason } });

it('labels tiers and keeps unknown values as stored', () => {
  expect([tierLabel('regular'), tierLabel('vip'), tierLabel('returning'), tierLabel('gold'), tierLabel(null)]).toEqual(['Regular', 'VIP', 'Returning', 'gold', null]);
});

it('benefits come from the one constant, nothing for no tier', () => {
  expect(tierBenefits(null)).toBeNull();
  expect(tierBenefits('regular')).toBe(`Regular guest: ${TIER_BENEFITS.regular}`);
  expect(TIER_BENEFITS.vip).toContain('handwritten welcome note');
});

it('reason must be 3 to 200 characters after trimming', () => {
  expect([tierReasonProblem('  ab '), tierReasonProblem('abc'), tierReasonProblem('x'.repeat(200)), tierReasonProblem('x'.repeat(201))].map((p) => p === null)).toEqual([false, true, true, false]);
});

it('history keeps only Tier: and Manual tier: profile changes', () => {
  const rows = [ev('Tier: Regular (4th completed stay)'), ev('Manual tier: VIP - friend of owner'), ev('Profile updated'), ev('Tier: none', 'stay'), ev(null)];
  expect(tierHistory(rows).map((e) => e.body.reason)).toEqual(['Tier: Regular (4th completed stay)', 'Manual tier: VIP - friend of owner']);
});

const renderCard = (props: Partial<Parameters<typeof TierCard>[0]> = {}) =>
  render(<QueryClientProvider client={new QueryClient()}><TierCard guestId="g1" tier="returning" manual={null} events={[ev('Tier: Returning (2nd completed stay)')]} {...props} /></QueryClientProvider>);

it('shows tier, benefits and history; saving needs a reason and calls the RPC with null for Automatic', async () => {
  const user = userEvent.setup();
  setGuestTier.mockResolvedValue({ ok: true });
  renderCard({ manual: 'vip', tier: 'vip' });
  expect(screen.getByText('Yes (VIP)')).toBeInTheDocument();
  expect(screen.getByText(/Tier: Returning \(2nd completed stay\)/)).toBeInTheDocument();
  const save = screen.getByRole('button', { name: 'Save tier' });
  expect(save).toBeDisabled();
  await user.click(screen.getByLabelText('Set by hand'));
  await user.click(await screen.findByRole('option', { name: 'Automatic' }));
  await user.type(screen.getByLabelText('Reason'), 'ab');
  expect(save).toBeDisabled();
  await user.type(screen.getByLabelText('Reason'), 'c');
  await user.click(save);
  await waitFor(() => expect(setGuestTier).toHaveBeenCalledWith('g1', null, 'abc'));
});

it('shows the server error plainly', async () => {
  const user = userEvent.setup();
  setGuestTier.mockRejectedValue(new Error('Not allowed'));
  renderCard();
  await user.click(screen.getByLabelText('Set by hand'));
  await user.click(await screen.findByRole('option', { name: 'Regular' }));
  await user.type(screen.getByLabelText('Reason'), 'owner asked');
  await user.click(screen.getByRole('button', { name: 'Save tier' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/Not allowed/);
});

it('hides the form for roles other than owner/admin', () => {
  role.value = 'finance';
  renderCard();
  expect(screen.queryByRole('button', { name: 'Save tier' })).not.toBeInTheDocument();
  expect(screen.getByText(/Returning guest:/)).toBeInTheDocument();
});
