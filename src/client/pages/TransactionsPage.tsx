import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Ban, ReceiptText } from 'lucide-react';
import { useMemo, useState, type ChangeEvent } from 'react';
import { useAccounts, useCategories, useMe, useTransactions, useVoidTransaction } from '../api/queries';
import type { Transaction } from '../api/types';
import { Badge, Button, Card, EmptyState, ErrorState, Input, LoadingState, PageHeader, Select } from '../components/ui';
import { addCalendarDays, formatInTimezone, zonedInputToIso } from '../utils/dateTime';
import { formatMoney } from '../utils/money';

export default function TransactionsPage() {
  const [page, setPage] = useState(0);
  const [kind, setKind] = useState(''); const [account, setAccount] = useState(''); const [category, setCategory] = useState('');
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [sort, setSort] = useState('occurredAt');
  const me = useMe(); const accounts = useAccounts(); const categories = useCategories(); const voidTx = useVoidTransaction();
  const timezone = me.data?.timezone ?? 'UTC';
  const params = useMemo(() => new URLSearchParams({
    limit: '25', offset: String(page * 25), sort, direction: 'desc',
    ...(kind ? { kind } : {}), ...(account ? { accountId: account } : {}), ...(category ? { categoryId: category } : {}),
    ...(from ? { from: zonedInputToIso(`${from}T00:00`, timezone) } : {}),
    ...(to ? { to: zonedInputToIso(`${addCalendarDays(to, 1)}T00:00`, timezone) } : {}),
  }), [page, kind, account, category, from, to, sort, timezone]);
  const query = useTransactions(params);
  const filter = (setter: (value: string) => void) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setter(event.target.value); setPage(0); };
  return <>
    <PageHeader eyebrow="Ledger" title="Transactions" description="Actual cash movements, transfers, investments, and utility methods remain visibly distinct." />
    <Card className="mb-5 grid gap-3 bg-surface/80 sm:grid-cols-2 xl:grid-cols-3">
      <Select aria-label="Filter by type" value={kind} onChange={filter(setKind)}><option value="">All transaction types</option><option value="expense">Expenses</option><option value="income">Income</option><option value="transfer">Transfers</option><option value="asset_purchase">Asset purchases</option><option value="liability_payment">Liability payments</option></Select>
      <Select aria-label="Filter by account" value={account} onChange={filter(setAccount)}><option value="">All accounts</option>{accounts.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
      <Select aria-label="Filter by category" value={category} onChange={filter(setCategory)}><option value="">All categories</option>{categories.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
      <Input aria-label="From date" type="date" value={from} onChange={filter(setFrom)} />
      <Input aria-label="Through date" type="date" value={to} onChange={filter(setTo)} />
      <Select aria-label="Sort transactions" value={sort} onChange={filter(setSort)}><option value="occurredAt">Newest occurrence</option><option value="createdAt">Recently added</option><option value="amount">Largest amount</option></Select>
    </Card>
    {query.isPending ? <LoadingState /> : query.isError ? <ErrorState error={query.error} retry={() => query.refetch()} /> : query.data.data.length === 0 ? <EmptyState icon={<ReceiptText />} title="No transactions yet" description="Use the centered Quick Add button to record your first money movement." /> : <>
      <div className="grid gap-2.5">{query.data.data.map((transaction) => <TransactionRow key={transaction.id} item={transaction} timezone={timezone} accounts={accounts.data ?? []} categories={categories.data ?? []} onVoid={() => { if (confirm('Void this transaction? Historical data stays preserved.')) voidTx.mutate(transaction.id); }} />)}</div>
      <div className="mt-4 flex items-center justify-between"><Button variant="secondary" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous</Button><span className="text-xs text-muted">{query.data.meta.total} total</span><Button variant="secondary" disabled={(page + 1) * 25 >= query.data.meta.total} onClick={() => setPage((value) => value + 1)}>Next</Button></div>
    </>}
  </>;
}

export function TransactionRow({ item, timezone, accounts, categories, onVoid }: { item: Transaction; timezone: string; accounts: Array<{ id: string; name: string }>; categories: Array<{ id: string; name: string }>; onVoid: () => void }) {
  const transfer = item.kind === 'transfer'; const income = item.kind === 'income'; const icon = transfer ? <ArrowRightLeft /> : income ? <ArrowDownLeft /> : <ArrowUpRight />;
  const accountName = (id: string | null) => accounts.find((entry) => entry.id === id)?.name;
  const title = item.description || item.merchant || categories.find((entry) => entry.id === item.categoryId)?.name || item.kind.replaceAll('_', ' ');
  return <Card className={`card-lift flex items-center gap-3 p-3.5 sm:p-4 ${item.voidedAt ? 'opacity-50' : ''}`}><span className={`grid size-11 shrink-0 place-items-center rounded-2xl ring-1 ring-inset ring-black/[.035] ${transfer ? 'bg-blue-50 text-blue-800' : income ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{icon}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><p className="truncate font-semibold capitalize">{title}</p>{item.method === 'amortized' && <Badge tone="warning">Amortized</Badge>}{transfer && <Badge tone="info">Transfer</Badge>}{item.voidedAt && <Badge>Voided</Badge>}</div><p className="mt-0.5 truncate text-xs text-muted">{transfer ? `${accountName(item.sourceAccountId)} → ${accountName(item.destinationAccountId)}` : accountName(item.sourceAccountId || item.destinationAccountId)} · {formatInTimezone(item.occurredAt, timezone)}</p>{item.dailyImpact && <p className="mt-0.5 text-xs font-medium text-violet-800">Utility: {formatMoney(item.dailyImpact, item.currency)}/day</p>}</div><div className="shrink-0 text-right"><p className="money-value font-bold">{income ? '+' : transfer ? '↔' : '−'}{formatMoney(item.amount, item.currency)}</p>{!item.voidedAt && <button aria-label="Void transaction" onClick={onVoid} className="control-press mt-1 inline-flex min-h-8 items-center gap-1 rounded-lg px-1.5 text-xs text-muted outline-none hover:bg-rose-50 hover:text-rose-800 focus-visible:ring-2 focus-visible:ring-accent active:scale-95"><Ban className="size-3" />Void</button>}</div></Card>;
}
