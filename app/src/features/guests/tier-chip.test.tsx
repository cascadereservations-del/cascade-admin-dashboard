import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TierChip, TierName, tierChipText, tierKey } from './tier-chip';

afterEach(cleanup);
const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8').split('\r\n').join('\n');
const block = (sel: string) => css.slice(css.indexOf(`\n${sel} {`), css.indexOf('\n}', css.indexOf(`\n${sel} {`)));

describe('tier chip mapping', () => {
  it('uses the stored tier and the stay count, short forms only', () => {
    expect(tierChipText(null, 1)).toBe('First');
    expect(tierChipText(null, null)).toBe('First');
    expect(tierChipText('returning', 2)).toBe('Returning · 2');
    expect(tierChipText('regular', 5)).toBe('Regular · 5');
    expect(tierChipText('vip', 12)).toBe('VIP · 12');
    expect(tierChipText('vip', null)).toBe('VIP'); // no count known: the word alone
    expect(tierKey('mystery')).toBe('first'); // an unknown stored value never invents a tier
  });
  it('renders the tier word as text with a spoken label, in one chip shape', () => {
    render(<><TierChip tier="returning" stays={2} /><TierChip tier="vip" stays={12} /><TierChip tier={null} stays={1} /></>);
    expect(screen.getByRole('img', { name: 'Returning, 2 stays' })).toHaveAttribute('data-tier', 'returning');
    expect(screen.getByRole('img', { name: 'VIP, 12 stays' }).textContent).toBe('VIP · 12');
    expect(screen.getByRole('img', { name: 'First stay' }).textContent).toBe('First');
  });
  it('marks the name by tier and keeps hostile text as text', () => {
    const hostile = '<img src=x onerror=alert(1)> & "Q"';
    const { container } = render(<TierName tier="vip">{hostile}</TierName>);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe(hostile);
    expect(container.querySelector('.tier-name')).toHaveAttribute('data-tier', 'vip');
  });
});

describe('tier tokens (mockup v4 alphas)', () => {
  it('has the light and dark chip tints and name colours', () => {
    const light = block(':root');
    const dark = block('.dark');
    expect(light).toContain('--t1-bg: rgba(70,80,96,.09)');
    expect(light).toContain('--t2-bg: rgba(27,140,116,.12)');
    expect(light).toContain('--t3-bg: rgba(181,142,95,.15)');
    expect(light).toContain('--t4-bg: rgba(215,179,119,.22)');
    expect(light).toContain('--t4-edge: inset 0 0 0 1.5px rgba(154,116,50,.62)');
    expect(light).toContain('--nm3: #7A5418');
    expect(dark).toContain('--t1-bg: rgba(201,211,222,.09)');
    expect(dark).toContain('--t2-bg: rgba(79,195,168,.13)');
    expect(dark).toContain('--t3-bg: rgba(215,179,119,.12)');
    expect(dark).toContain('--t4-bg: rgba(215,179,119,.20)');
    expect(dark).toContain('--nm4b: #F5DDA0');
  });
  it('is one 32 px, 15 px shape with no animation, and solid fallbacks for contrast and forced colours', () => {
    const chip = css.slice(css.indexOf('.tier-chip {'), css.indexOf('\n', css.indexOf('.tier-chip {')));
    expect(chip).toContain('min-height: 2rem');
    expect(chip).toContain('font-size: .9375rem');
    expect(chip).not.toMatch(/animation|transition/);
    expect(css).toMatch(/@media \(prefers-contrast: more\)[^]*tier-chip[^]*-webkit-text-fill-color: currentColor/);
    expect(css).toMatch(/@media \(forced-colors: active\)[^]*CanvasText/);
    expect(css).toContain('.tier-cell { width: 10.5rem');
  });
});
