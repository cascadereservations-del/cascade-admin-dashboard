// Structured error classes so every screen can render forbidden, validation,
// conflict and unavailable states distinctly (PRD section 8, UX15).

export type AppErrorKind = 'forbidden' | 'validation' | 'conflict' | 'unavailable' | 'not_found' | 'unknown';

export class AppError extends Error {
  kind: AppErrorKind;
  detail?: string;
  constructor(kind: AppErrorKind, message: string, detail?: string) {
    super(message);
    this.kind = kind;
    this.detail = detail;
  }
}

type PgLike = { code?: string; message?: string; details?: string; hint?: string; status?: number };

/** Map a PostgREST / Supabase error to an AppError. */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const e = (err ?? {}) as PgLike;
  const code = e.code ?? '';
  const msg = e.message ?? 'Request failed';
  if (code === 'PGRST202' || code === '42883' || code === '42P01' || /could not find the function|does not exist/i.test(msg)) {
    return new AppError('unavailable', 'This backend interface is not deployed yet.', msg);
  }
  if (code === '42501' || e.status === 401 || e.status === 403 || /permission denied|denied|not authorized|authentication required/i.test(msg)) {
    return new AppError('forbidden', 'You are not permitted to do this.', msg);
  }
  if (code === '23505' || code === '40001' || code === '40P01' || /idempotency conflict|stale version|conflict/i.test(msg) || e.status === 409) {
    return new AppError('conflict', msg, e.details);
  }
  if (code === '22023' || code === '23514' || code === '22P02' || e.status === 400) {
    return new AppError('validation', msg, e.details);
  }
  if (code === 'PGRST116') return new AppError('not_found', 'Record not found.', msg);
  if (e.status === 503 || e.status === 502 || /fetch failed|Failed to fetch|network/i.test(msg)) {
    return new AppError('unavailable', 'The backend is unreachable.', msg);
  }
  return new AppError('unknown', msg, e.details ?? e.hint);
}
