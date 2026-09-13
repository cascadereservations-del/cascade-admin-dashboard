import { describe, expect, it } from 'vitest';
import { ENABLED_MUTATION_MODULES, RPC_MODULE, assertMutationEnabled, assertRpcEnabled } from './rollout';
import { AppError } from './errors';

describe('rollout gate (PRD section 11 step 5)', () => {
  it('read RPCs are never gated', () => {
    for (const fn of ['get_admin_overview_v1', 'get_hospitality_metrics_v1', 'current_staff_access', 'get_financial_statement_v1']) {
      expect(() => assertRpcEnabled(fn)).not.toThrow();
    }
  });
  it('a disabled module surfaces as unavailable, not as a server error', () => {
    const disabled = Object.entries(RPC_MODULE).filter(([, m]) => !ENABLED_MUTATION_MODULES.includes(m)).map(([fn]) => fn);
    for (const fn of disabled) {
      try {
        assertRpcEnabled(fn);
        throw new Error(`${fn} should be gated`);
      } catch (e) {
        expect(e).toBeInstanceOf(AppError);
        expect((e as AppError).kind).toBe('unavailable');
      }
    }
  });
  it('an enabled module passes', () => {
    for (const m of ENABLED_MUTATION_MODULES) expect(() => assertMutationEnabled(m)).not.toThrow();
  });
});
