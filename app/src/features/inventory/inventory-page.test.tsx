import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/auth/session', () => ({ useSession: () => ({ propertyId: 'p1', session: null, caps: { can: () => true } }) }));

import { StockCount } from './inventory-page';

afterEach(cleanup);

describe('StockCount (lazy NumberFlow)', () => {
  it('shows the plain count first, then the animated number with the same two-decimal text', async () => {
    const { container } = render(<StockCount value="12.5" unit="pack" />);
    expect(container).toHaveTextContent('12.50 pack'); // fallback while the chunk loads
    await waitFor(() => expect(container.querySelector('number-flow-react')).not.toBeNull());
    const el = container.querySelector('number-flow-react')!;
    expect(el.getAttribute('aria-label') ?? container.textContent).toContain('12.50');
  });
  it('shows a dash, not 0, when the quantity is unknown (ML-05)', () => {
    const { container } = render(<StockCount value={null} unit="pack" />);
    expect(container).toHaveTextContent('— pack');
    expect(screen.queryByText(/^0/)).toBeNull();
  });
  it('shows a dash for an unparseable string and keeps zero as a real zero', () => {
    const { container, rerender } = render(<StockCount value="n/a" unit="pc" />);
    expect(container).toHaveTextContent('— pc');
    rerender(<StockCount value="0" unit="pc" />);
    expect(container).toHaveTextContent('0.00 pc');
  });
});
