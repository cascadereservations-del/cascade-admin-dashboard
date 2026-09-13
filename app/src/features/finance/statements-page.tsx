import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/auth/session';
import { useUrlState } from '@/lib/url-state';
import { formatDate, formatDateTime, periodPreset } from '@/lib/dates';
import { formatPHP } from '@/lib/money';
import { exportCsv } from '@/lib/export';
import { PageHeader } from '@/components/data/page-header';
import { QueryState } from '@/components/data/query-state';
import { StatusBadge } from '@/components/data/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fetchStatement } from './api';

// ACC07/ACC09: statements from posted journals or a close snapshot. Screen,
// print and CSV use the same report JSON. Internal management accounts only.

const STATEMENTS: Array<[string, string]> = [['pnl', 'Profit and loss'], ['balance_sheet', 'Balance sheet'], ['cash_flow', 'Cash flow'], ['equity', 'Owner equity'], ['trial_balance', 'Trial balance'], ['ledger', 'General ledger'], ['ageing', 'Ageing'], ['budget_vs_actual', 'Budget vs actual'], ['channel', 'Channel profitability']];

type Row = Record<string, unknown>;
const money = (v: unknown) => (v === null || v === undefined ? '—' : formatPHP(String(v)));

function Rows({ rows, cols }: { rows: Row[]; cols: Array<[string, string, boolean?]> }) {
  return (
    <table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground">{cols.map(([k, l, num]) => <th key={k} className={num ? 'text-right' : ''}>{l}</th>)}</tr></thead>
      <tbody>{(rows ?? []).map((r, i) => <tr key={i} className="border-b last:border-0">{cols.map(([k, , num]) => <td key={k} className={`py-1 ${num ? 'tabular text-right' : ''}`}>{num ? money(r[k]) : String(r[k] ?? '')}</td>)}</tr>)}</tbody></table>
  );
}

export default function StatementsPage() {
  const s = useSession();
  const mtd = periodPreset('mtd');
  const { state, set } = useUrlState({ st: 'pnl', from: mtd.start, to: mtd.endExclusive, snapshot: '', account: '' });
  const query = useQuery({ queryKey: ['statement', s.propertyId, state], queryFn: () => fetchStatement(s.propertyId, state.st, state.from, state.to, state.snapshot || undefined, state.account || undefined) });
  const flatRows = (body: Row): Row[] => (body.rows ?? body.income ?? body.assets ?? []) as Row[];
  return (
    <div>
      <PageHeader
        title="Statements"
        description="Internal management accounts from posted journals. Not a BIR, statutory or IFRS output."
        actions={<div className="flex flex-wrap gap-2"><Input type="date" aria-label="From" className="w-36" value={state.from} onChange={(e) => set({ from: e.target.value })} /><Input type="date" aria-label="To (exclusive)" className="w-36" value={state.to} onChange={(e) => set({ to: e.target.value })} /><Button variant="outline" onClick={() => window.print()}>Print</Button><Button variant="outline" disabled={!query.data} onClick={() => query.data && exportCsv(`${state.st}-${state.from}-${state.to}.csv`, flatRows(query.data.body), { property: s.propertyId, period: `${state.from}..${state.to} (exclusive)`, basis: 'accrual', generated: String(query.data.meta.generatedAt), completeness: JSON.stringify(query.data.meta.completeness ?? {}) })}>CSV</Button></div>}
      />
      <Tabs value={state.st} onValueChange={(v) => set({ st: v })} className="mb-3"><TabsList className="flex-wrap">{STATEMENTS.map(([v, l]) => <TabsTrigger key={v} value={v}>{l}</TabsTrigger>)}</TabsList></Tabs>
      {state.st === 'ledger' && <Input placeholder="Account code (blank = all)" aria-label="Account code" className="mb-3 w-48" value={state.account} onChange={(e) => set({ account: e.target.value })} />}
      <QueryState query={query}>
        {(d) => {
          const b = d.body as Row;
          const c = (d.meta.completeness ?? {}) as Row;
          return (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>Period {formatDate(state.from, 'long')} to {formatDate(state.to, 'long')} (exclusive) · accrual · PHP · generated {formatDateTime(String(d.meta.generatedAt))}</span>
                <StatusBadge tone={c.openingBalancesApproved ? 'good' : 'warn'}>{c.openingBalancesApproved ? 'opening balances approved' : 'no approved opening balances'}</StatusBadge>
                {Number(c.unpostedLedgerRows) > 0 && <StatusBadge tone="warn">{String(c.unpostedLedgerRows)} confirmed ledger rows not yet posted</StatusBadge>}
                {Number(c.pendingReviewRows) > 0 && <StatusBadge tone="warn">{String(c.pendingReviewRows)} rows pending review</StatusBadge>}
                <span>· period {String(c.periodStatus ?? '')}</span>
              </div>
              {state.st === 'pnl' && <div className="grid gap-4 md:grid-cols-2"><div><h3 className="mb-1 text-sm font-semibold">Income</h3><Rows rows={b.income as Row[]} cols={[['code', 'Code'], ['name', 'Account'], ['amount', 'Amount', true]]} /><p className="tabular mt-1 text-right text-sm font-medium">Total {money(b.totalIncome)}</p></div><div><h3 className="mb-1 text-sm font-semibold">Expenses</h3><Rows rows={b.expenses as Row[]} cols={[['code', 'Code'], ['name', 'Account'], ['amount', 'Amount', true]]} /><p className="tabular mt-1 text-right text-sm font-medium">Total {money(b.totalExpenses)}</p></div><p className="tabular text-lg font-semibold md:col-span-2">Net profit {money(b.netProfit)}</p></div>}
              {state.st === 'balance_sheet' && <div className="grid gap-4 md:grid-cols-3"><div><h3 className="mb-1 text-sm font-semibold">Assets</h3><Rows rows={b.assets as Row[]} cols={[['code', 'Code'], ['name', 'Account'], ['amount', 'Balance', true]]} /><p className="tabular mt-1 text-right font-medium">{money(b.totalAssets)}</p></div><div><h3 className="mb-1 text-sm font-semibold">Liabilities</h3><Rows rows={b.liabilities as Row[]} cols={[['code', 'Code'], ['name', 'Account'], ['amount', 'Balance', true]]} /><p className="tabular mt-1 text-right font-medium">{money(b.totalLiabilities)}</p></div><div><h3 className="mb-1 text-sm font-semibold">Equity</h3><Rows rows={b.equity as Row[]} cols={[['code', 'Code'], ['name', 'Account'], ['amount', 'Balance', true]]} /><p className="tabular mt-1 text-right font-medium">{money(b.totalEquity)}</p></div><p className="text-sm md:col-span-3">Assets = Liabilities + Equity: <StatusBadge tone={b.identityHolds ? 'good' : 'bad'}>{b.identityHolds ? 'holds' : 'FAILS'}</StatusBadge> as at {formatDate(String(b.asAt), 'long')}</p></div>}
              {state.st === 'cash_flow' && <dl className="grid max-w-md grid-cols-2 gap-1 text-sm"><dt>Opening cash</dt><dd className="tabular text-right">{money(b.openingCash)}</dd><dt>Operating</dt><dd className="tabular text-right">{money(b.operating)}</dd><dt>Investing</dt><dd className="tabular text-right">{money(b.investing)}</dd><dt>Financing</dt><dd className="tabular text-right">{money(b.financing)}</dd><dt>Net change</dt><dd className="tabular text-right">{money(b.netChange)}</dd><dt>Closing cash</dt><dd className="tabular text-right font-medium">{money(b.closingCash)}</dd><dt className="col-span-2 text-xs text-muted-foreground">{String(b.note ?? '')} Reconciles: {b.reconciles ? 'yes' : 'NO'}</dt></dl>}
              {state.st === 'equity' && <dl className="grid max-w-md grid-cols-2 gap-1 text-sm"><dt>Opening equity</dt><dd className="tabular text-right">{money(b.openingEquity)}</dd><dt>Contributions</dt><dd className="tabular text-right">{money(b.contributions)}</dd><dt>Drawings</dt><dd className="tabular text-right">{money(b.drawings)}</dd><dt>Profit for period</dt><dd className="tabular text-right">{money(b.profitForPeriod)}</dd><dt>Closing equity</dt><dd className="tabular text-right font-medium">{money(b.closingEquity)}</dd><dt className="col-span-2 text-xs text-muted-foreground">Identity {b.identityHolds ? 'holds' : 'FAILS'}</dt></dl>}
              {state.st === 'trial_balance' && <><Rows rows={b.rows as Row[]} cols={[['code', 'Code'], ['name', 'Account'], ['opening', 'Opening', true], ['debits', 'Debits', true], ['credits', 'Credits', true], ['closing', 'Closing', true]]} /><p className="tabular mt-1 text-sm">Debits {money(b.totalDebits)} · Credits {money(b.totalCredits)} · {b.balanced ? 'balanced' : 'NOT BALANCED'}</p></>}
              {state.st === 'ledger' && <Rows rows={b.rows as Row[]} cols={[['journalNo', '#'], ['date', 'Date'], ['code', 'Account'], ['description', 'Description'], ['debit', 'Debit', true], ['credit', 'Credit', true], ['memo', 'Memo']]} />}
              {state.st === 'ageing' && <Rows rows={b.rows as Row[]} cols={[['side', 'Side'], ['account', 'Account'], ['source', 'Source'], ['sourceId', 'Ref'], ['since', 'Since'], ['bucket', 'Bucket'], ['balance', 'Balance', true]]} />}
              {state.st === 'budget_vs_actual' && <><Rows rows={b.rows as Row[]} cols={[['code', 'Code'], ['name', 'Account'], ['budget', 'Budget', true], ['actual', 'Actual', true], ['variance', 'Variance', true]]} /><p className="mt-1 text-xs text-muted-foreground">{String(b.note ?? '')}</p></>}
              {state.st === 'channel' && <Rows rows={b.rows as Row[]} cols={[['channel', 'Channel'], ['accommodation', 'Accommodation', true], ['channelFees', 'Channel fees', true], ['cleaning', 'Cleaning', true], ['consumables', 'Consumables', true], ['contribution', 'Contribution', true]]} />}
            </div>
          );
        }}
      </QueryState>
    </div>
  );
}
