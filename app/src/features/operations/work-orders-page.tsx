import { PageHeader } from '@/components/data/page-header';
import { EmptyState } from '@/components/data/query-state';

export default function WorkOrdersPage() {
  return (
    <div>
      <PageHeader title="WorkOrders" />
      <EmptyState title="Not built yet" hint="This module is scheduled in the implementation tracker." />
    </div>
  );
}
