import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { toAppError } from '@/lib/errors';
import { ErrorState } from './query-state';

afterEach(() => cleanup());

// Lane D: a failed first load is "No connection" with a Try again button, never an empty list or a raw TypeError.
it('D_reads a dropped network as No connection with a Try again button that retries', async () => {
  const onRetry = vi.fn();
  render(<ErrorState error={{ message: 'TypeError: Failed to fetch' }} onRetry={onRetry} />);
  expect(screen.getByText('No connection')).toBeInTheDocument();
  expect(screen.queryByText(/Failed to fetch/)).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: /Try again/ }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

it('D_keeps the other error titles and still offers Try again, but not for a forbidden read', () => {
  const { rerender } = render(<ErrorState error={{ code: '23505', message: 'conflict' }} onRetry={() => undefined} />);
  expect(screen.getByText('Conflict')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
  rerender(<ErrorState error={{ code: '42501', message: 'permission denied' }} onRetry={() => undefined} />);
  expect(screen.getByText('Not permitted')).toBeInTheDocument();
  expect(screen.queryByRole('button')).toBeNull();
});

it('D_classes a 503 and a fetch failure as offline', () => {
  expect(toAppError({ status: 503, message: 'x' }).kind).toBe('offline');
  expect(toAppError(new TypeError('Failed to fetch')).kind).toBe('offline');
  expect(toAppError({ code: 'PGRST202', message: 'x' }).kind).toBe('unavailable'); // a function that is not deployed is not a connection problem
});
