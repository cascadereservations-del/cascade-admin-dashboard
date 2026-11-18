import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GlassSheet, PageBand } from './page-band';

const read = (f: string) => readFileSync(resolve(__dirname, f), 'utf8').split('\r\n').join('\n');
const block = (css: string, sel: string) => css.slice(css.indexOf(`${sel} {`), css.indexOf('\n}', css.indexOf(`${sel} {`)));
// the v5 tokens come from the generated v5-tokens.css; the s119 band/tile/type tokens live in index.css
const [v5, idx] = [read('../../v5-tokens.css'), read('../../index.css')];
const light = `${block(v5, ':root')}\n${block(idx, ':root')}`;
const dark = `${block(v5, '.dark')}\n${block(idx, '.dark')}`;
const hex = (block: string, name: string) => {
  const m = new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(block);
  if (!m) throw new Error(`${name} missing`);
  return m[1]!;
};
const lum = (h: string) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };

describe('PageBand', () => {
  it('shows the title, the description and actions; the wash and the mark are decorative', () => {
    const { container } = render(<PageBand title="Guests" description="Know your guests." actions={<button type="button">Add</button>} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Guests' })).toBeInTheDocument();
    expect(screen.getByText('Know your guests.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    const mark = container.querySelector('[data-slot="page-band-mark"]') as HTMLImageElement;
    expect(mark.getAttribute('src')).toMatch(/apple-touch-icon-180\.png$/);
    expect(mark.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('[data-slot="page-band-wash"]')?.getAttribute('aria-hidden')).toBe('true');
    // the title is sized by the fluid token, not a fixed px value
    expect(screen.getByRole('heading', { level: 1 }).style.fontSize).toBe('var(--t1)');
  });
});

describe('GlassSheet', () => {
  it('renders nothing while closed (vaul is not loaded yet)', () => {
    const { container } = render(<GlassSheet open={false} onOpenChange={() => {}} title="Filters"><p>body</p></GlassSheet>);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('body')).toBeNull();
  });
  it('loads vaul on first open and shows the titled dialog', async () => {
    render(<GlassSheet open onOpenChange={() => {}} title="Filters" description="Narrow the list."><p>body</p></GlassSheet>);
    expect(await screen.findByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
  });
  it('falls back to the plain sheet when the vaul chunk fails to load, with no unhandled rejection', async () => {
    vi.resetModules();
    vi.doMock('vaul', () => { throw new Error('chunk load failed'); });
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const { GlassSheet: Fresh } = await import('./page-band');
    render(<Fresh open onOpenChange={() => {}} title="Filters"><p>fallback body</p></Fresh>);
    expect(await screen.findByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
    expect(screen.getByText('fallback body')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 0));
    process.off('unhandledRejection', unhandled);
    vi.doUnmock('vaul');
    expect(unhandled).not.toHaveBeenCalled();
  });
});

describe('band and tile tokens (ML-39: both themes)', () => {
  it('has fluid type defaults and band tokens in light and dark', () => {
    for (const t of ['--t1: 2rem', '--t2: 1.0625rem', '--t3: .9375rem', '--t4: .8125rem']) expect(light).toContain(t);
    expect(hex(light, '--band-a')).toBe('#F6E7C4');
    expect(hex(dark, '--band-a')).toBe('#3A2E14');
  });
  it('title ink >= 4.5 and muted ink >= 4.5 on the band, light and dark', () => {
    expect(ratio(hex(light, '--v5-ink'), hex(light, '--band-a'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(hex(light, '--v5-ink-2'), hex(light, '--band-a'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(hex(dark, '--v5-ink'), hex(dark, '--band-a'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(hex(dark, '--v5-ink-2'), hex(dark, '--band-a'))).toBeGreaterThanOrEqual(4.5);
  });
  it('tile icons >= 3:1 on their tiles, light and dark', () => {
    for (const block of [light, dark]) for (const k of ['gold', 'elec', 'water', 'ok']) expect(ratio(hex(block, `--tile-${k}-fg`), hex(block, `--tile-${k}`))).toBeGreaterThanOrEqual(3);
  });
});
