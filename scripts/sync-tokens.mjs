// Re-derives app/src/v5-tokens.css from the Staff app's tokens.css (the one token sheet).
// Usage: node scripts/sync-tokens.mjs [path-to-staff-tokens.css]   (default ../staff-app/tokens.css)
// The dashboard keys dark off the .dark class (use-theme), the Staff app off a media query / data-theme, so:
// light = the bare :root block verbatim, dark = the :root[data-theme="dark"] block verbatim re-keyed to .dark.
// The prefers-color-scheme block is left out on purpose: it would turn a light dashboard dark on a dark phone.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { derive } from './derive-tokens.mjs';

const from = process.argv[2] ?? fileURLToPath(new URL('../../staff-app/tokens.css', import.meta.url));
writeFileSync(fileURLToPath(new URL('../app/src/v5-tokens.css', import.meta.url)), derive(readFileSync(from, 'utf8')));
console.log('wrote app/src/v5-tokens.css from ' + from);
