import type React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UsageKpi } from './api';

const h = vi.hoisted(() => ({ kpi: null as unknown, fail: false }));
vi.mock('@/auth/session', () => ({ useSession: () => ({ propertyId: 'p1', session: null, caps: { can: () => true } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('./api', () => ({ recordMissedRefill: vi.fn(), fetchUsageKpi: () => (h.fail ? Promise.reject(new Error('boom')) : Promise.resolve(h.kpi)) }));
import { recordMissedRefill } from './api';
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
  const wrap = (ui: React.ReactElement) => <QueryClientProvider client={new QueryClient()}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>;
  it('uses the approved wording and offers both buttons; Yes opens the field', () => {
    render(wrap(<RestockPrompts items={[w]} />));
    expect(screen.getByText('Demo coffee went 17 → 51')).toBeInTheDocument();
    expect(screen.getByText('Was stock added since 27 Oct? Without it this interval is skipped so usage stays accurate.')).toBeInTheDocument();
    expect(screen.queryByLabelText('How much was added?')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, record refill' }));
    expect(screen.getByLabelText('How much was added?')).toHaveFocus();
    expect(screen.getByRole('link', { name: 'No, recount' })).toHaveAttribute('href', '/inventory/counts');
  });
  it('one card per item, none when there are none', () => {
    const { container, rerender } = render(wrap(<RestockPrompts items={[w, { ...w, id: 'c2', name: 'Demo tea' }]} />));
    expect(screen.getAllByRole('button', { name: 'Yes, record refill' })).toHaveLength(2);
    rerender(wrap(<RestockPrompts items={[]} />));
    expect(container).toBeEmptyDOMElement();
  });
  it('buttons and the field are 44 px tall', () => {
    render(wrap(<RestockPrompts items={[w]} />));
    expect(screen.getByRole('button', { name: 'Yes, record refill' }).className).toContain('min-h-11');
    expect(screen.getByRole('link', { name: 'No, recount' }).className).toContain('min-h-11');
    fireEvent.click(screen.getByRole('button', { name: 'Yes, record refill' }));
    expect(screen.getByLabelText('How much was added?').className).toContain('min-h-11');
    expect(screen.getByRole('button', { name: 'Save refill' }).className).toContain('min-h-11');
  });

  const open = () => fireEvent.click(screen.getByRole('button', { name: 'Yes, record refill' }));
  const type = (v: string) => fireEvent.change(screen.getByLabelText('How much was added?'), { target: { value: v } });
  const save = () => screen.getByRole('button', { name: 'Save refill' });
  it('commas are thousands groups only: 1,200.5 sends 1200.5 and 12 sends 12', async () => {
    vi.mocked(recordMissedRefill).mockReset().mockResolvedValue({ ok: true });
    render(wrap(<RestockPrompts items={[w]} />));
    open(); type('1,200.5');
    expect(save()).toBeEnabled();
    fireEvent.click(save());
    await waitFor(() => expect(recordMissedRefill).toHaveBeenCalledWith('c1', '1200.5'));
    cleanup(); vi.mocked(recordMissedRefill).mockClear();
    render(wrap(<RestockPrompts items={[w]} />));
    open(); type('12'); fireEvent.click(save());
    await waitFor(() => expect(recordMissedRefill).toHaveBeenCalledWith('c1', '12'));
  });
  it.each(['1,2', '1,2,3', ',5', '1e2'])('%s shows the hint and keeps Save disabled', (v) => {
    render(wrap(<RestockPrompts items={[w]} />));
    open(); type(v);
    expect(screen.getByText('Enter a number, like 12 or 12.5.')).toBeInTheDocument();
    expect(screen.getByLabelText('How much was added?')).toHaveAttribute('aria-invalid', 'true');
    expect(save()).toBeDisabled();
  });
  it.each(['12.', '1,200.'])('%s is unfinished, not wrong: no hint, no aria-invalid, Save still off', (v) => {
    render(wrap(<RestockPrompts items={[w]} />));
    open(); type(v);
    expect(screen.queryByText('Enter a number, like 12 or 12.5.')).toBeNull();
    expect(screen.getByLabelText('How much was added?')).not.toHaveAttribute('aria-invalid');
    expect(save()).toBeDisabled();
  });
  it('shows the count-time quantity while the catalogue has no figure, the catalogue quantity once it does', () => {
    const { rerender } = render(wrap(<RestockPrompts items={[w]} qtyOf={() => undefined} />));
    open();
    expect(screen.getByText('This corrects the usage record. Stock stays at 51.')).toBeInTheDocument();
    rerender(wrap(<RestockPrompts items={[w]} qtyOf={() => '40'} />));
    expect(screen.getByText('This corrects the usage record. Stock stays at 40.')).toBeInTheDocument();
  });
  describe('focus never falls to the page body', () => {
    const w2 = { ...w, id: 'c2', name: 'Demo tea' };
    const page = (items: typeof w[]) => wrap(<><h1>Demo inventory</h1><RestockPrompts items={items} /></>);
    const saveRefill = async (card: number, qty = '3') => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Yes, record refill' })[card]!);
      fireEvent.change(screen.getByLabelText('How much was added?'), { target: { value: qty } });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save refill' })); });
    };
    it('two refills saved one after the other leave in one refetch: focus lands on the page heading', async () => {
      vi.mocked(recordMissedRefill).mockReset().mockResolvedValue({ ok: true });
      const { rerender } = render(page([w, w2]));
      await saveRefill(0);
      await saveRefill(0); // the first form is still open, so the second Yes button is index 0 of the remaining
      rerender(page([]));
      expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
    });
    it('one refill saved, one card left: focus lands on that card heading', async () => {
      vi.mocked(recordMissedRefill).mockReset().mockResolvedValue({ ok: true });
      const { rerender } = render(page([w, w2]));
      await saveRefill(0);
      rerender(page([w2]));
      expect(screen.getByRole('heading', { name: /Demo tea/ })).toHaveFocus();
    });
    it('a not_waiting answer that drops the focused card moves focus on', async () => {
      vi.mocked(recordMissedRefill).mockReset().mockResolvedValue({ ok: false, reason: 'not_waiting' });
      const { rerender } = render(page([w, w2]));
      await saveRefill(0);
      rerender(page([w2]));
      expect(screen.getByRole('heading', { name: /Demo tea/ })).toHaveFocus();
      cleanup();
      vi.mocked(recordMissedRefill).mockReset().mockResolvedValue({ ok: false, reason: 'not_learning' });
      const again = render(page([w]));
      await saveRefill(0);
      again.rerender(page([]));
      expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
    });
    it('takes no focus when the list changes with no prompt action, or when focus is on a live control', async () => {
      const { rerender } = render(wrap(<><h1>Demo inventory</h1><input aria-label="Elsewhere" /><RestockPrompts items={[w, w2]} /></>));
      rerender(wrap(<><h1>Demo inventory</h1><input aria-label="Elsewhere" /><RestockPrompts items={[w2]} /></>));
      expect(document.body).toHaveFocus();
      vi.mocked(recordMissedRefill).mockReset().mockResolvedValue({ ok: true });
      await saveRefill(0);
      screen.getByLabelText('Elsewhere').focus();
      rerender(wrap(<><h1>Demo inventory</h1><input aria-label="Elsewhere" /><RestockPrompts items={[]} /></>));
      expect(screen.getByLabelText('Elsewhere')).toHaveFocus();
    });
  });
});
