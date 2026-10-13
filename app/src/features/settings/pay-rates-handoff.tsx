import { useEffect } from 'react';
import { D_SHELL_PAYRATES, D_toShellPayRates, isFramed } from '@/lib/fold';
import { PageHeader } from '@/components/data/page-header';
import { Button } from '@/components/ui/button';

// D_ The shell has the only pay-rates screen (#payrates). In embed mode this route hands the PARENT window over to it; the link is
// the fallback when the page is not framed (embed=1 in its own tab) or the navigation is blocked.
export default function D_PayRatesHandoff() {
  useEffect(() => { if (isFramed()) D_toShellPayRates(); }, []);
  return (
    <div>
      <PageHeader title="Pay rates" description="Pay rates are managed in Cascade Staff, on one screen." />
      <Button asChild className="min-h-11"><a href={D_SHELL_PAYRATES} target="_parent">Open Pay rates</a></Button>
    </div>
  );
}
