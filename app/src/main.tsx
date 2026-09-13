import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import './index.css';
import { queryClient } from '@/lib/query-client';
import { ThemeProvider } from '@/hooks/use-theme';
import { SessionProvider } from '@/auth/session';
import { TooltipProvider } from '@/components/ui/tooltip';
import { router } from './routes';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SessionProvider>
          <TooltipProvider>
            <RouterProvider router={router} />
          </TooltipProvider>
        </SessionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
