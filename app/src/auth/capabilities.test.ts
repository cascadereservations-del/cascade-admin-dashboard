import { describe, expect, it } from 'vitest';
import { allowed, buildCapabilities, defaultRoute, isStaffRole, needsMfa } from './capabilities';

describe('capabilities mirror staff_access_allowed', () => {
  it('finance works on a password session (D-094: no two-factor gate)', () => {
    expect(allowed('owner', 'read_finance', false, 'aal1')).toBe(true);
    expect(allowed('owner', 'read_finance', false, null)).toBe(true);
    expect(allowed('admin', 'manage_staff', false, 'aal1')).toBe(true);
    expect(needsMfa('owner', 'read_finance', 'aal1')).toBe(false);
  });
  it('cleaner never reads finance or manages staff', () => {
    expect(allowed('cleaner', 'read_finance', false, 'aal2')).toBe(false);
    expect(allowed('cleaner', 'manage_staff', false, 'aal2')).toBe(false);
    expect(needsMfa('cleaner', 'read_finance', 'aal1')).toBe(false);
    expect(allowed('cleaner', 'submit_cleaning', false, 'aal1')).toBe(true);
  });
  it('disabled users get nothing', () => {
    expect(allowed('owner', 'read_operations', true, 'aal2')).toBe(false);
  });
  it('revoked sessions get nothing', () => {
    const caps = buildCapabilities({ role: 'admin', aal: 'aal2', disabled: false, sessionCurrent: false, propertyIds: [] });
    expect(caps.can('read_operations')).toBe(false);
  });
  it('inspector can inspect but not manage inventory', () => {
    expect(allowed('inspector', 'inspect_cleaning', false, 'aal1')).toBe(true);
    expect(allowed('inspector', 'manage_inventory', false, 'aal1')).toBe(false);
  });
  it('maintenance lands on work orders, finance on finance', () => {
    expect(defaultRoute('maintenance')).toBe('/operations/work-orders');
    expect(defaultRoute('finance')).toBe('/finance');
    expect(defaultRoute('owner')).toBe('/today');
  });
  it('laundry is read-only: no finance, staff, inventory or maintenance; lands on operations', () => {
    expect(isStaffRole('laundry')).toBe(true);
    expect(allowed('laundry', 'read_operations', false, 'aal1')).toBe(true);
    for (const a of ['read_finance', 'approve_payment', 'manage_staff', 'manage_operations', 'inspect_cleaning', 'submit_cleaning', 'manage_inventory', 'manage_maintenance', 'publish_rate_policy'] as const) {
      expect(allowed('laundry', a, false, 'aal2')).toBe(false);
    }
    expect(defaultRoute('laundry')).toBe('/operations');
  });
});
