import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs without types
import { derive } from '../../scripts/derive-tokens.mjs';

// app/src is three levels under Projects/Cascade: the worktree is a sibling of staff-app under Projects/Cascade.
const staff = resolve(__dirname, '../../../staff-app/tokens.css');
const vendored = readFileSync(resolve(__dirname, 'v5-tokens.css'), 'utf8');

describe('v5 tokens', () => {
  it('the vendored copy matches the Staff app tokens.css (run: node scripts/sync-tokens.mjs)', () => {
    if (!existsSync(staff)) return; // separate repos: only checked where both are checked out
    expect(vendored).toBe(derive(readFileSync(staff, 'utf8')));
  });
  it('has a light :root and a .dark block with the key tokens', () => {
    for (const t of ['--v5-bg', '--v5-ink', '--v5-k1', '--v5-k8', '--v5-field-line', '--v5-gold-text']) expect(vendored).toContain(t + ':');
    expect(vendored).toMatch(/\n\.dark \{/);
  });
});
