import { PageHeader } from '@/components/data/page-header';
import { EmptyState } from '@/components/data/query-state';

export default function JournalsPage() {
  return (
    <div>
      <PageHeader title="Journals" />
      <EmptyState title="Not built yet" hint="This module is scheduled in the implementation tracker." />
    </div>
  );
}
