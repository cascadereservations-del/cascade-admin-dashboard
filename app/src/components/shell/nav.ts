import {
  BarChart3,
  BedDouble,
  CalendarCheck2,
  ClipboardCheck,
  Package,
  Settings,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Action } from '@/auth/capabilities';

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  action: Action;
  children?: Array<{ to: string; label: string; action?: Action }>;
};

// PRD section 4 navigation. Visibility follows capabilities; the server
// re-checks every request.
export const NAV: NavItem[] = [
  { to: '/today', label: 'Today', icon: CalendarCheck2, action: 'read_operations' },
  {
    to: '/bookings',
    label: 'Bookings',
    icon: BedDouble,
    action: 'read_operations',
    children: [
      { to: '/bookings', label: 'List' },
      { to: '/bookings/calendar', label: 'Calendar' },
      { to: '/bookings/inquiries', label: 'Inquiries' },
    ],
  },
  { to: '/guests', label: 'Guests', icon: Users, action: 'manage_operations' },
  {
    to: '/operations',
    label: 'Operations',
    icon: ClipboardCheck,
    action: 'read_operations',
    children: [
      { to: '/operations', label: 'Cleaning log' },
      { to: '/operations/work-orders', label: 'Work orders' },
      { to: '/operations/notices', label: 'Notices' },
    ],
  },
  {
    to: '/inventory',
    label: 'Inventory',
    icon: Package,
    action: 'read_operations',
    children: [
      { to: '/inventory', label: 'Stock' },
      { to: '/inventory/purchases', label: 'Purchases' },
      { to: '/inventory/counts', label: 'Counts', action: 'manage_inventory' },
    ],
  },
  {
    to: '/finance',
    label: 'Finance',
    icon: Wallet,
    action: 'read_finance',
    children: [
      { to: '/finance', label: 'Review queue' },
      { to: '/finance/book', label: 'Account book' },
      { to: '/finance/transactions', label: 'Transactions' },
      { to: '/finance/reconciliation', label: 'Reconciliation' },
      { to: '/finance/journals', label: 'Journals' },
      { to: '/finance/statements', label: 'Statements' },
      { to: '/finance/setup', label: 'Accounting setup' },
    ],
  },
  { to: '/insights', label: 'KPIs & Analytics', icon: BarChart3, action: 'read_finance' },
  {
    to: '/settings',
    label: 'Settings',
    icon: Settings,
    action: 'read_operations',
    children: [
      { to: '/settings', label: 'Staff', action: 'manage_staff' },
      { to: '/settings/health', label: 'System health' },
      { to: '/settings/audit', label: 'Audit history', action: 'manage_staff' },
    ],
  },
];
