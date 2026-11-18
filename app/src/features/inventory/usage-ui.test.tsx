import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UsageKpi } from './api';

const h = vi.hoisted(() => ({ kpi: null as unknown, fail: false }));
vi.mock('@/auth/session', () => ({ useSession: () => ({ propertyId: 'p1', session: null, caps: { can: () => true } }) }));
vi.mock('./api', () => ({ fetchUsageKpi: () => (h.fail ? Promise.reject(new Error('boom')) : Promise.resolve(h.kpi)) }));
import { RestockPrompts, UsageLearningCard, UsageTiles } from './usage-ui';

afterEach(cleanup);
const kpi = (o: Partial<UsageKpi> = {}): UsageKpi => ({ itemsTotal: 22, itemsMeasured: 9, itemsLearning: 5, medianForecastError: 0.18, forecastSamples: 6, underFourteenDays: { count: 4, items: [] }, waitingForRefill: { count: 2, items: [] }, ...o });
const card = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><UsageLearningCard /></MemoryRouter></QueryClientProvider>);

describe('Usage learning tiles', () => {
  it('shows the four tiles, the bar and the targets line', () => {
    render(<UsageTiles kpi={kpi()} />);
    expect(screen.getByText('9 of 22')).toBeInTheDocument();
    expect(screen.getByText('items with measured usage')).toBeInTheDocument();
    expect(screen.getByText('18%')).toBeInTheDocument();
    expect(screen.getByText('forecast error (median, last counts)')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('items under 14 days of stock')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('waiting for a recorded refill')).toBeInTheDocument();
    expect(screen.getByText('Targets: measured goes up, forecast error goes down each month. Rolling 90-day window.')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '9');
    expect(bar).toHaveAttribute('aria-valuemax', '22');
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('41%'); // 9 / 22 = 40.9
  });
  it('a null error says Not enough counts yet, never 0%', () => {
    render(<UsageTiles kpi={kpi({ medianForecastError: null })} />);
    expect(screen.getByText('Not enough counts yet')).toBeInTheDocument();
    expect(screen.queryByText(/%/)).toBeNull();
  });
  it('a real 0 error is shown as 0%', () => {
    render(<UsageTiles kpi={kpi({ medianForecastError: 0 })} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });
  it('zero items: 0 of 0, an empty bar, no NaN', () => {
    const { container } = render(<UsageTiles kpi={kpi({ itemsTotal: 0, itemsMeasured: 0, medianForecastError: null, underFourteenDays: { count: 0, items: [] }, waitingForRefill: { count: 0, items: [] } })} />);
    expect(screen.getByText('0 of 0')).toBeInTheDocument();
    expect((screen.getByRole('progressbar').firstElementChild as HTMLElement).style.width).toBe('0%');
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
  });
});

describe('Usage learning card', () => {
  it('renders the card with the title when the server answers', async () => {
    h.fail = false; h.kpi = kpi();
    card();
    expect(await screen.findByText('Usage learning')).toBeInTheDocument();
    expect(screen.getByText('9 of 22')).toBeInTheDocument();
  });
  it('the KPI function missing: no card, no error', async () => {
    h.fail = false; h.kpi = null;
    const { container } = card();
    await new Promise((r) => setTimeout(r, 50));
    expect(container).toBeEmptyDOMElement();
  });
  it('a real failure shows the title and one quiet line, not a blank page', async () => {
    h.fail = true;
    card();
    expect(await screen.findByText('Usage learning')).toBeInTheDocument();
    h.fail = false;
  });
});

describe('Restock prompt', () => {
  const w = { id: 'c1', name: 'Demo coffee', since: '2026-10-27T04:00:00Z', qtyBefore: '17', qtyNow: '51' };
  it('uses the approved wording and offers both buttons', () => {
    const onRecord = vi.fn();
    render(<MemoryRouter><RestockPrompts items={[w]} onRecord={onRecord} /></MemoryRouter>);
    expect(screen.getByText('Demo coffee went 17 → 51')).toBeInTheDocument();
    expect(screen.getByText('Was stock added since 27 Oct? Without it this interval is skipped so usage stays accurate.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, record refill' }));
    expect(onRecord).toHaveBeenCalledWith('c1');
    expect(screen.getByRole('link', { name: 'No, recount' })).toHaveAttribute('href', '/inventory/counts');
  });
  it('one card per item, none when there are none', () => {
    const { container, rerender } = render(<MemoryRouter><RestockPrompts items={[w, { ...w, id: 'c2', name: 'Demo tea' }]} onRecord={() => {}} /></MemoryRouter>);
    expect(screen.getAllByRole('button', { name: 'Yes, record refill' })).toHaveLength(2);
    rerender(<MemoryRouter><RestockPrompts items={[]} onRecord={() => {}} /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });
  it('buttons are 44 px tall', () => {
    render(<MemoryRouter><RestockPrompts items={[w]} onRecord={() => {}} /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Yes, record refill' }).className).toContain('min-h-11');
    expect(screen.getByRole('link', { name: 'No, recount' }).className).toContain('min-h-11');
  });
});
