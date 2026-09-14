import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LocalRecordsPanel } from './local-records-panel';
import { parseGuestMarkdown } from './local-records';

beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function file(text: string) {
  const f = new File([text], 'guest-records.local.json', { type: 'application/json' });
  Object.defineProperty(f, 'text', { value: async () => text });
  return f;
}
const bundle = JSON.stringify({ schemaVersion: 1, generatedAt: '2026-09-14T12:00:00Z', records: [{ ...parseGuestMarkdown('# Test\n- Booking guest: Synthetic Guest\n## ID observations\n- Test holder: PRIVATE TEST OBSERVATION\n## Stay notes\n- Early check-in request: Requested, not confirmed', 'Collected/Synthetic'), key: 'record-synthetic', sourceHash: 'a'.repeat(64), photos: [] }] });

it('loads only in memory, reveals private fields on demand, and clears the collection', async () => {
  const user = userEvent.setup();
  const storage = vi.spyOn(Storage.prototype, 'setItem');
  render(<LocalRecordsPanel />);
  fireEvent.change(screen.getByLabelText('Choose collection file'), { target: { files: [file(bundle)] } });
  await screen.findByRole('button', { name: /Synthetic Guest/ });
  await user.click(screen.getByRole('button', { name: /Synthetic Guest/ }));
  expect(screen.getByText('Requested, not confirmed', { exact: false })).toBeInTheDocument();
  expect(screen.queryByText(/PRIVATE TEST OBSERVATION/)).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Reveal private details' }));
  expect(screen.getAllByText(/PRIVATE TEST OBSERVATION/).length).toBeGreaterThan(0);
  await user.click(screen.getByRole('button', { name: 'Close' }));
  await user.click(screen.getByRole('button', { name: 'Clear records' }));
  expect(screen.queryByText('Synthetic Guest')).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
  expect(storage).not.toHaveBeenCalled();
  storage.mockRestore();
});

it('never displays malformed private input in an error, and drops the previous collection', async () => {
  render(<LocalRecordsPanel />);
  const input = screen.getByLabelText('Choose collection file');
  fireEvent.change(input, { target: { files: [file(bundle)] } });
  await screen.findByRole('button', { name: /Synthetic Guest/ });
  fireEvent.change(input, { target: { files: [file('{PRIVATE BAD INPUT')] } });
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Choose a valid'));
  expect(screen.queryByText(/PRIVATE BAD INPUT/)).not.toBeInTheDocument();
  expect(screen.queryByText('Synthetic Guest')).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
