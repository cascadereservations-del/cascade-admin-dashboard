// Local Vite workbench only. Not an input to the production build. No auth or
// backend client is imported; the user explicitly selects their local files.
import { createRoot } from 'react-dom/client';
import { LocalRecordsPanel } from './features/guests/local-records-panel';
import './index.css';

createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-7xl px-4 py-8 sm:px-8"><div className="mb-8 border-b pb-5"><p className="text-xs font-semibold uppercase tracking-widest text-primary">Cascade Hideaway</p><h1 className="mt-2 text-2xl font-semibold">Local guest review</h1><p className="mt-2 text-sm text-muted-foreground">Private records on this computer · No shared CRM writes</p></div><LocalRecordsPanel /></main>);
