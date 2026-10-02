import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MeterReadingBlock } from './meter-reading';

afterEach(cleanup);
const m = { id: 'r1', electric_prev: '4016', electric_curr: '4029', electric_delta: '13', water_prev: '75.215', water_curr: '75.541', water_delta: '0.326', kwh_per_night: '13', m3_per_night: '0.326', meter_flag: null, meter_override_note: null, recorded_at: '2026-09-29T00:00:00Z' };
const stay = { nights_stayed: 1, checkin_date: '2026-09-27', checkout_date: '2026-09-28' };
const baseline = { kwh: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16], m3: [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4] };

it('shows the stay, usage against the usual range and a status chip, with plain review wording', () => {
  render(<MeterReadingBlock m={m} stay={stay} baseline={baseline} canInspect pending={false} onReview={vi.fn()} />);
  expect(screen.getByText(/Covers the stay/)).toHaveTextContent('1 night');
  expect(screen.getAllByText('Normal').length).toBeGreaterThan(0);
  expect(screen.getByText(/13 kWh\/night/)).toBeInTheDocument();
  expect(screen.getByLabelText('Meter flag')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save review' })).toBeDisabled();
  expect(screen.getByText(/leaves it out of the utilities chart/)).toBeInTheDocument();
});

it('hides the review controls from people who cannot inspect', () => {
  render(<MeterReadingBlock m={m} stay={stay} baseline={baseline} canInspect={false} pending={false} onReview={vi.fn()} />);
  expect(screen.queryByLabelText('Meter flag')).not.toBeInTheDocument();
});

it('marks a reading that does not add up as check reading', () => {
  render(<MeterReadingBlock m={{ ...m, electric_delta: '99' }} stay={stay} baseline={baseline} canInspect={false} pending={false} onReview={vi.fn()} />);
  expect(screen.getAllByText('Check reading').length).toBeGreaterThan(0);
});
