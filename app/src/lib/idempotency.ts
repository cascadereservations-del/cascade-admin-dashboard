// Mutations carry an idempotency key (16..160 chars per the deployed RPC
// contracts). Keys are minted once per form submission and reused on retry so
// a repeated request cannot create a second economic event.
export function newIdempotencyKey(prefix = 'admin'): string {
  const rand = crypto.randomUUID().replace(/-/g, '');
  return `${prefix}-${rand}`.slice(0, 160);
}

/** Deterministic key for replay-safe derived events (e.g. a usage row -> movement). */
export async function deterministicKey(...parts: Array<string | number | null | undefined>): Promise<string> {
  const data = new TextEncoder().encode(parts.map((p) => String(p ?? '')).join('|'));
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 64);
}
