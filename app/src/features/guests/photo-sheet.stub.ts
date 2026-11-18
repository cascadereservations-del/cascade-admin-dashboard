import { createElement, type ReactElement } from 'react';

// STUB for lane P's PhotoSheet (contract s118): same props. Delete this file when s118/photo merges and
// change the one import in guest-detail-page.tsx to './photo-sheet'.
export function PhotoSheet({ open, onClose, onPicked }: { open: boolean; onClose(): void; onPicked(file: File): void; allowPaste?: boolean }): ReactElement {
  if (!open) return createElement('span');
  return createElement('div', { className: 'space-y-2 rounded-xl border p-3' },
    createElement('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', 'aria-label': 'Choose from Library', className: 'block min-h-11 w-full text-base', onChange: (e: { target: { files: FileList | null } }) => { const f = e.target.files?.[0]; if (f) { onPicked(f); onClose(); } } }),
    createElement('button', { type: 'button', className: 'min-h-11 rounded-md border px-4', onClick: onClose }, 'Cancel'));
}
