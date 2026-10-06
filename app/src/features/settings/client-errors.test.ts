import { describe, expect, it } from 'vitest';
import { clientErrorSince, errorPage, shortUa } from './client-errors';

describe('client error display helpers', () => {
  it('reads the page from detail.path, falls back to url, null when absent', () => {
    expect(errorPage({ path: '/stay.html' })).toBe('/stay.html');
    expect(errorPage({ url: ' /book ' })).toBe('/book');
    expect(errorPage({})).toBeNull();
    expect(errorPage(null)).toBeNull();
    expect(errorPage({ path: 5 })).toBeNull();
  });
  it('shortens a user agent to browser and OS', () => {
    expect(shortUa({ ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0.0.0 Mobile Safari/537.36' })).toBe('Chrome 129 · Android');
    expect(shortUa({ ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36 Edg/130.0' })).toBe('Edge 130 · Windows');
    expect(shortUa({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile Safari/604.1' })).toBe('Safari 17 · iOS');
  });
  it('is null when there is no user agent', () => {
    expect(shortUa({})).toBeNull();
    expect(shortUa({ ua: '' })).toBeNull();
    expect(shortUa(null)).toBeNull();
  });
  it('windows the list to 30 days', () => {
    expect(clientErrorSince(Date.UTC(2026, 9, 31))).toBe('2026-10-01T00:00:00.000Z');
  });
});
