import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('Direct Booking Site card opens the booking site', () => {
  const card = html.match(
    /<a class="app-card" href="([^"]+)"[^>]*>\s*<div[^>]*>[^<]*<\/div>\s*<div class="app-card-body"><div class="app-card-title">Direct Booking Site<\/div>/,
  );

  assert.ok(card, 'Direct Booking Site app card should be present');
  assert.equal(
    card[1],
    'https://cascadereservations-del.github.io/Stay_At_CascadeGSC/',
  );
});

test('staff row actions use delegated data attributes instead of inline server values', () => {
  const loadStaff = html.match(/async function loadStaff\(\) \{([\s\S]*?)\n\}\nfunction handleStaffGridAction/)?.[1] ?? '';

  assert.match(loadStaff, /data-staff-action="edit"/);
  assert.match(loadStaff, /data-staff-action="delete"/);
  assert.doesNotMatch(loadStaff, /onclick="openStaffModal\(/);
  assert.doesNotMatch(loadStaff, /onclick="staffDelete\(/);
  assert.match(html, /function handleStaffGridAction\(event\)/);
});

test('operator note limit matches the backend 500-character contract', () => {
  assert.match(html, /id="staff-note" maxlength="500"/);
});

test('every inline script parses as JavaScript', () => {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .filter((source) => source.trim());

  assert.ok(scripts.length > 0, 'expected at least one inline script');
  for (const source of scripts) {
    assert.doesNotThrow(() => new Function(source));
  }
});
