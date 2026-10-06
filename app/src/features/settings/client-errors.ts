// Display helpers for the client_errors list on Health (SPEC-42 9c). Unknown stays null, never a guess.

export function errorPage(detail: Record<string, unknown> | null): string | null {
  const p = detail?.path ?? detail?.url;
  return typeof p === 'string' && p.trim() ? p.trim().slice(0, 120) : null;
}

// "Chrome 129 · Android": the browser family and the OS family from a user-agent string, nothing more.
export function shortUa(detail: Record<string, unknown> | null): string | null {
  const ua = detail?.ua;
  if (typeof ua !== 'string' || !ua.trim()) return null;
  const browser = /Edg\/(\d+)/.exec(ua) ? ['Edge', /Edg\/(\d+)/.exec(ua)![1]]
    : /(?:Chrome|CriOS)\/(\d+)/.exec(ua) ? ['Chrome', /(?:Chrome|CriOS)\/(\d+)/.exec(ua)![1]]
    : /Firefox\/(\d+)/.exec(ua) ? ['Firefox', /Firefox\/(\d+)/.exec(ua)![1]]
    : /Version\/(\d+).*Safari/.exec(ua) ? ['Safari', /Version\/(\d+).*Safari/.exec(ua)![1]]
    : null;
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : null;
  const parts = [browser ? `${browser[0]} ${browser[1]}` : null, os].filter(Boolean);
  return parts.length ? parts.join(' · ') : ua.slice(0, 40);
}

export const CLIENT_ERROR_DAYS = 30;
export const CLIENT_ERROR_LIMIT = 50;

export function clientErrorSince(now: number = Date.now()): string {
  return new Date(now - CLIENT_ERROR_DAYS * 86_400_000).toISOString();
}
