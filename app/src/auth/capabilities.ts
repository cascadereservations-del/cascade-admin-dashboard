// Client-side mirror of public.staff_access_allowed (stay-site migration
// 20260828000500). This drives VISIBILITY only. Every request is re-checked by
// RLS and SECURITY DEFINER functions on the server.

export type StaffRole = 'owner' | 'admin' | 'finance' | 'inspector' | 'cleaner' | 'maintenance';
export type Aal = 'aal1' | 'aal2';

export type Action =
  | 'manage_staff'
  | 'approve_payment'
  | 'read_finance'
  | 'read_operations'
  | 'manage_operations'
  | 'inspect_cleaning'
  | 'submit_cleaning'
  | 'manage_inventory'
  | 'manage_maintenance'
  | 'publish_rate_policy'; // SPEC-34: the Pricing tab (owner/admin, as staff_access_allowed decides)

// D-094 (2026-09-13): no action needs a two-factor session any more. The server
// ignores aal in staff_access_allowed; this list stays so the gate can be
// reinstated by adding actions back, and so the tests document the decision.
const MFA_ACTIONS: Action[] = [];

const ROLE_ACTIONS: Record<StaffRole, Action[]> = {
  owner: ['manage_staff', 'approve_payment', 'read_finance', 'read_operations', 'manage_operations', 'inspect_cleaning', 'submit_cleaning', 'manage_inventory', 'manage_maintenance', 'publish_rate_policy'],
  admin: ['manage_staff', 'approve_payment', 'read_finance', 'read_operations', 'manage_operations', 'inspect_cleaning', 'submit_cleaning', 'manage_inventory', 'manage_maintenance', 'publish_rate_policy'],
  finance: ['approve_payment', 'read_finance', 'read_operations'],
  inspector: ['read_operations', 'inspect_cleaning', 'submit_cleaning'],
  cleaner: ['read_operations', 'submit_cleaning'],
  maintenance: ['read_operations', 'manage_maintenance'],
};

export function isStaffRole(v: unknown): v is StaffRole {
  return typeof v === 'string' && v in ROLE_ACTIONS;
}

export function allowed(role: StaffRole | null, action: Action, disabled: boolean, aal: Aal | null): boolean {
  if (!role || disabled) return false;
  if (MFA_ACTIONS.includes(action) && aal !== 'aal2') return false;
  return ROLE_ACTIONS[role].includes(action);
}

/** True when the action exists for the role but is gated only by MFA. */
export function needsMfa(role: StaffRole | null, action: Action, aal: Aal | null): boolean {
  if (!role) return false;
  return MFA_ACTIONS.includes(action) && aal !== 'aal2' && ROLE_ACTIONS[role].includes(action);
}

export type Capabilities = {
  role: StaffRole | null;
  aal: Aal | null;
  disabled: boolean;
  sessionCurrent: boolean;
  propertyIds: string[];
  can: (action: Action) => boolean;
  mfaRequiredFor: (action: Action) => boolean;
};

export function buildCapabilities(input: {
  role: StaffRole | null;
  aal: Aal | null;
  disabled: boolean;
  sessionCurrent: boolean;
  propertyIds: string[];
}): Capabilities {
  return {
    ...input,
    can: (a) => input.sessionCurrent && allowed(input.role, a, input.disabled, input.aal),
    mfaRequiredFor: (a) => needsMfa(input.role, a, input.aal),
  };
}

/** Landing route by role (PRD section 3 default experience). */
export function defaultRoute(role: StaffRole | null): string {
  switch (role) {
    case 'finance':
      return '/finance';
    case 'inspector':
      return '/operations';
    case 'maintenance':
      return '/operations/work-orders';
    case 'cleaner':
      return '/operations';
    default:
      return '/today';
  }
}
