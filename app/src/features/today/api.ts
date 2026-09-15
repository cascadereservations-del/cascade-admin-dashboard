import { rpc } from '@/lib/rpc';

export type OverviewStay = { kind: string; id: string; code: string; guest: string; guestId: string | null; checkin: string; checkout: string; nights?: number; daysUntil?: number; actualState?: string };
export type OverviewAction = { priority: number; kind: string; title: string; reason: string; href: string; dueAt: string | null; assignee?: string | null; sourceKind: string; sourceId: string | null };
export type Overview = {
  today: string;
  sourceAsOf: string | null;
  calendarSync: { syncedAt: string; status: string; error: string | null } | null;
  currentStays: OverviewStay[];
  arrivals: OverviewStay[];
  departures: OverviewStay[];
  nextArrival: OverviewStay | null;
  readiness: {
    state: 'ready' | 'not_ready' | 'unknown' | 'overdue' | 'awaiting_review';
    lastCleaning: { id: string; cleanedAt: string; cleaner: string; complete: boolean | null; completionPct: string | null; issues: number | null } | null;
    review: { id: string; outcome: string; reason: string | null; reviewedAt: string } | null;
    blockingWorkOrders: number;
    lastCheckout: string | null;
    nextCheckin: string | null;
    daysOverdue: number | null;
  };
  blockingWorkOrders: Array<{ id: string; title: string; priority: string; status: string; dueAt: string | null }>;
  lowStock: Array<{ id: string; name: string; qty: string; unit: string; reorderBelow: string; out: boolean }>;
  followUps: Array<{ id: string; title: string; purpose: string; priority: string; dueAt: string | null; guestId: string | null; status: string }>;
  handoffs: Array<{ id: string; guest: string | null; risk: string | null; status: string; createdAt: string; excerpt: string | null }> | null;
  finance: { pendingReviewCount: number; pendingReviewAmount: string; paymentReviewCount: number; unpaidCleanerFees: number } | null;
  notices: Array<{ id: string; type: string; title: string; effectiveDate: string; expiresAt: string | null; audience: string }>;
  actions: OverviewAction[];
};

// TOD01-TOD03: one server call, capability-filtered on the server.
export function fetchOverview(propertyId: string) {
  return rpc<Overview>('get_admin_overview_v1', { p_property_id: propertyId });
}
