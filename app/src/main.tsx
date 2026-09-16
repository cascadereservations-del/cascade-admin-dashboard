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

// Apple HIG token sheet (session 27, index.css [data-theme="hig"]): open with ?theme=hig to compare
// against the default, ?theme=default to go back; the choice is remembered on this browser only.
{
  const picked = new URLSearchParams(window.location.search).get('theme');
  if (picked) localStorage.setItem('cascade-theme', picked);
  if ((picked ?? localStorage.getItem('cascade-theme')) === 'hig') document.documentElement.dataset.theme = 'hig';
}

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
