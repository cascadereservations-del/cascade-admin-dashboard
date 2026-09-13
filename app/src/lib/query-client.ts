import { QueryClient } from '@tanstack/react-query';
import { toAppError } from './errors';

// Query keys are scoped by property and user capability in each adapter.
// Forbidden and validation errors are not retried; unavailable ones are, briefly.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => {
        const k = toAppError(err).kind;
        if (k === 'forbidden' || k === 'validation' || k === 'not_found' || k === 'unavailable') return false;
        return count < 2;
      },
    },
    mutations: { retry: false },
  },
});
