import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { TurnoverReport } from './turnover-report';

afterEach(cleanup);
const body = { sessionId: 'ad4f5e36', checkout: '2026-11-08', text: 'Stained duvet', issueCount: 2 };
const view = (b: Record<string, unknown>) => render(<MemoryRouter><TurnoverReport body={b} /></MemoryRouter>);

it('shows checkout date, text, issue count and links to the cleaning page', () => {
  view(body);
  expect(screen.getByText('Turnover report')).toBeTruthy();
  expect(screen.getByText('Stained duvet')).toBeTruthy();
  expect(screen.getByText(/2 issues/)).toBeTruthy();
  expect(screen.getByText(/\b8 Nov/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'cleaning detail' }).getAttribute('href')).toBe('/operations/cleaning/ad4f5e36');
});

it('copes with a missing session and count', () => {
  view({ text: 'x', checkout: null });
  expect(screen.queryByRole('link')).toBeNull();
  expect(screen.getByText(/unknown/)).toBeTruthy();
});

it('says 1 issue in the singular and survives an empty or malformed body', () => {
  view({ ...body, issueCount: 1 });
  expect(screen.getByText(/1 issue$/)).toBeTruthy();
  cleanup();
  view({ checkout: '2026-11-08T06:28:48Z', issueCount: 'x' });
  expect(screen.getByText('checkout unknown')).toBeTruthy();
  expect(screen.queryByText(/issue/)).toBeNull();
  expect(screen.queryByRole('link')).toBeNull();
});
