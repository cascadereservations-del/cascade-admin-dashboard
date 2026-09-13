import { lazy, Suspense, type ReactNode } from 'react';
import { createHashRouter, Navigate } from 'react-router';
import { AppShell } from '@/components/shell/app-shell';
import { RequireCapability, RequireSession } from '@/auth/require';
import { SignInPage } from '@/auth/sign-in';
import type { Action } from '@/auth/capabilities';
import { ListSkeleton } from '@/components/data/query-state';

// Hash routing keeps GitHub Pages compatibility. Feature modules are lazy so
// charts, calendars and export libraries stay out of the initial bundle.

const TodayPage = lazy(() => import('@/features/today/today-page'));
const BookingsPage = lazy(() => import('@/features/bookings/bookings-page'));
const BookingCalendarPage = lazy(() => import('@/features/bookings/calendar-page'));
const InquiriesPage = lazy(() => import('@/features/bookings/inquiries-page'));
const BookingDetailPage = lazy(() => import('@/features/bookings/booking-detail-page'));
const GuestsPage = lazy(() => import('@/features/guests/guests-page'));
const GuestDetailPage = lazy(() => import('@/features/guests/guest-detail-page'));
const CleaningPage = lazy(() => import('@/features/operations/cleaning-page'));
const CleaningDetailPage = lazy(() => import('@/features/operations/cleaning-detail-page'));
const WorkOrdersPage = lazy(() => import('@/features/operations/work-orders-page'));
const NoticesPage = lazy(() => import('@/features/operations/notices-page'));
const InventoryPage = lazy(() => import('@/features/inventory/inventory-page'));
const PurchasesPage = lazy(() => import('@/features/inventory/purchases-page'));
const CountsPage = lazy(() => import('@/features/inventory/counts-page'));
const FinanceQueuePage = lazy(() => import('@/features/finance/queue-page'));
const TransactionsPage = lazy(() => import('@/features/finance/transactions-page'));
const AccountBookPage = lazy(() => import('@/features/finance/book-page'));
const ReconciliationPage = lazy(() => import('@/features/finance/reconciliation-page'));
const JournalsPage = lazy(() => import('@/features/finance/journals-page'));
const StatementsPage = lazy(() => import('@/features/finance/statements-page'));
const AccountingSetupPage = lazy(() => import('@/features/finance/setup-page'));
const InsightsPage = lazy(() => import('@/features/insights/insights-page'));
const StaffPage = lazy(() => import('@/features/settings/staff-page'));
const HealthPage = lazy(() => import('@/features/settings/health-page'));
const AuditPage = lazy(() => import('@/features/settings/audit-page'));

function guard(action: Action, el: ReactNode) {
  return (
    <RequireCapability action={action}>
      <Suspense fallback={<ListSkeleton />}>{el}</Suspense>
    </RequireCapability>
  );
}

export const router = createHashRouter([
  { path: '/sign-in', element: <SignInPage /> },
  {
    path: '/',
    element: (
      <RequireSession>
        <AppShell />
      </RequireSession>
    ),
    children: [
      { index: true, element: <Navigate to="/today" replace /> },
      { path: 'today', element: guard('read_operations', <TodayPage />) },
      { path: 'bookings', element: guard('read_operations', <BookingsPage />) },
      { path: 'bookings/calendar', element: guard('read_operations', <BookingCalendarPage />) },
      { path: 'bookings/inquiries', element: guard('read_operations', <InquiriesPage />) },
      { path: 'bookings/:kind/:id', element: guard('read_operations', <BookingDetailPage />) },
      { path: 'guests', element: guard('manage_operations', <GuestsPage />) },
      { path: 'guests/:id', element: guard('manage_operations', <GuestDetailPage />) },
      { path: 'operations', element: guard('read_operations', <CleaningPage />) },
      { path: 'operations/cleaning/:id', element: guard('read_operations', <CleaningDetailPage />) },
      { path: 'operations/work-orders', element: guard('read_operations', <WorkOrdersPage />) },
      { path: 'operations/notices', element: guard('read_operations', <NoticesPage />) },
      { path: 'inventory', element: guard('read_operations', <InventoryPage />) },
      { path: 'inventory/purchases', element: guard('read_operations', <PurchasesPage />) },
      { path: 'inventory/counts', element: guard('manage_inventory', <CountsPage />) },
      { path: 'finance', element: guard('read_finance', <FinanceQueuePage />) },
      { path: 'finance/transactions', element: guard('read_finance', <TransactionsPage />) },
      { path: 'finance/book', element: guard('read_finance', <AccountBookPage />) },
      { path: 'finance/reconciliation', element: guard('read_finance', <ReconciliationPage />) },
      { path: 'finance/journals', element: guard('read_finance', <JournalsPage />) },
      { path: 'finance/statements', element: guard('read_finance', <StatementsPage />) },
      { path: 'finance/setup', element: guard('read_finance', <AccountingSetupPage />) },
      { path: 'insights', element: guard('read_finance', <InsightsPage />) },
      { path: 'settings', element: guard('manage_staff', <StaffPage />) },
      { path: 'settings/health', element: guard('read_operations', <HealthPage />) },
      { path: 'settings/audit', element: guard('manage_staff', <AuditPage />) },
      { path: '*', element: <Navigate to="/today" replace /> },
    ],
  },
]);
