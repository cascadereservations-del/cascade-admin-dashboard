import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { toAppError } from '@/lib/errors';
import { ErrorState } from './query-state';

afterEach(() => cleanup());

const online = (v: boolean) => vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(v);
afterEach(() => vi.restoreAllMocks());

// Lane D: a phone that is really offline reads "No connection" with a Try again button; a server that did not answer says so and keeps its detail.
it('D_reads a dropped network on an offline phone as No connection with a Try again button that retries', async () => {
  online(false);
  const onRetry = vi.fn();
  render(<ErrorState error={{ message: 'TypeError: Failed to fetch' }} onRetry={onRetry} />);
  expect(screen.getByText('No connection')).toBeInTheDocument();
  expect(screen.getByText('Check your signal, then try again.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /Try again/ }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

it('D_says the server did not answer (not "check your signal") when the phone is online, and keeps the detail line', () => {
  online(true);
  render(<ErrorState error={{ status: 503, message: 'upstream 503 detail' }} onRetry={() => undefined} />);
  expect(screen.getByText('The server did not answer. Try again.')).toBeInTheDocument();
  expect(screen.getByText('upstream 503 detail')).toBeInTheDocument();
  expect(screen.queryByText(/Check your signal/)).toBeNull();
  expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
});

it('D_keeps the other error titles and still offers Try again, but not for a forbidden read', () => {
  const { rerender } = render(<ErrorState error={{ code: '23505', message: 'conflict' }} onRetry={() => undefined} />);
  expect(screen.getByText('Conflict')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
  rerender(<ErrorState error={{ code: '42501', message: 'permission denied' }} onRetry={() => undefined} />);
  expect(screen.getByText('Not permitted')).toBeInTheDocument();
  expect(screen.queryByRole('button')).toBeNull();
});

it('D_classes a fetch failure as offline only when navigator.onLine is false', () => {
  online(false);
  expect(toAppError(new TypeError('Failed to fetch')).kind).toBe('offline');
  online(true);
  expect(toAppError({ status: 503, message: 'x' }).kind).toBe('unavailable');
  expect(toAppError(new TypeError('Failed to fetch')).kind).toBe('unavailable');
  expect(toAppError({ code: 'PGRST202', message: 'x' }).kind).toBe('unavailable');
});
