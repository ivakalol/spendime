import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Pencil, ReceiptText, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { apiRequest } from '../api/client';
import { useAccounts, useCategories, useMe, useTransactions, useUpdateTransaction, useVoidTransaction } from '../api/queries';
import type { Account, Category, Transaction, TransactionInput } from '../api/types';
import { Badge, Button, Card, EmptyState, ErrorState, Field, FormError, Input, LoadingState, Modal, PageHeader, Select } from '../components/ui';
import { addCalendarDays, formatInTimezone, toZonedLocalInput, zonedInputToIso } from '../utils/dateTime';
import { formatMoney } from '../utils/money';
import { useLanguage } from '../i18n';

export default function TransactionsPage() {
  const {t}=useLanguage();
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Transaction | null>(null);
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
    <Card className="mb-5 grid min-w-0 grid-cols-1 gap-3 bg-surface/80 sm:grid-cols-2 xl:grid-cols-3">
      <Select aria-label="Filter by type" value={kind} onChange={filter(setKind)}><option value="">All transaction types</option><option value="expense">Expenses</option><option value="refund">Refunds</option><option value="income">Income</option><option value="transfer">Transfers</option><option value="asset_purchase">Asset purchases</option><option value="liability_payment">Liability payments</option></Select>
      <Select aria-label="Filter by account" value={account} onChange={filter(setAccount)}><option value="">All accounts</option>{accounts.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
      <Select aria-label="Filter by category" value={category} onChange={filter(setCategory)}><option value="">All categories</option>{categories.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
      <Field label="From date"><Input className="min-w-0 max-w-full" type="date" value={from} onChange={filter(setFrom)} /></Field>
      <Field label="Through date"><Input className="min-w-0 max-w-full" type="date" value={to} onChange={filter(setTo)} /></Field>
      <Select aria-label="Sort transactions" value={sort} onChange={filter(setSort)}><option value="occurredAt">Newest occurrence</option><option value="createdAt">Recently added</option><option value="amount">Largest amount</option></Select>
    </Card>
    {query.isPending ? <LoadingState /> : query.isError ? <ErrorState error={query.error} retry={() => query.refetch()} /> : query.data.data.length === 0 ? <EmptyState icon={<ReceiptText />} title="No transactions yet" description="Use the centered Quick Add button to record your first money movement." /> : <>
      <div className="grid gap-2.5">{query.data.data.map((transaction) => <TransactionRow key={transaction.id} item={transaction} timezone={timezone} accounts={accounts.data ?? []} categories={categories.data ?? []} onEdit={() => setEditing(transaction)} onVoid={() => { if (confirm(t('Delete and fully reverse this transaction? Its audit record will be preserved.'))) voidTx.mutate(transaction.id); }} />)}</div>
      <div className="mt-4 flex items-center justify-between"><Button variant="secondary" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous</Button><span className="text-xs text-muted">{t('{count} total', {count: query.data.meta.total})}</span><Button variant="secondary" disabled={(page + 1) * 25 >= query.data.meta.total} onClick={() => setPage((value) => value + 1)}>Next</Button></div>
    </>}
    <TransactionDialog transaction={editing} accounts={accounts.data ?? []} categories={categories.data ?? []} timezone={timezone} onClose={() => setEditing(null)} />
  </>;
}

export function TransactionRow({ item, timezone, accounts, categories, onEdit, onVoid }: { item: Transaction; timezone: string; accounts: Array<{ id: string; name: string }>; categories: Array<{ id: string; name: string }>; onEdit?: () => void; onVoid: () => void }) {
  const {t}=useLanguage();
  const [remembered,setRemembered]=useState(false);
  const [rememberError,setRememberError]=useState<string|null>(null);
  const remember=async()=>{try{await apiRequest(`/api/banking/transactions/${item.id}/remember-category`,{method:'POST'});setRemembered(true);setRememberError(null);}catch(error){setRememberError(error instanceof Error?error.message:'Could not save preference.');}};
  const transfer = item.kind === 'transfer'; const income = !transfer && !item.sourceAccountId && Boolean(item.destinationAccountId); const icon = transfer ? <ArrowRightLeft /> : income ? <ArrowDownLeft /> : <ArrowUpRight />;
  const accountName = (id: string | null) => accounts.find((entry) => entry.id === id)?.name;
  const categoryName = categories.find((entry) => entry.id === item.categoryId)?.name;
  const title = item.description || item.merchant || categoryName || item.kind.replaceAll('_', ' ');
  return <Card className={`card-lift flex items-center gap-3 p-3.5 sm:p-4 ${item.voidedAt ? 'opacity-50' : ''}`}><span className={`grid size-11 shrink-0 place-items-center rounded-2xl ring-1 ring-inset ring-black/[.035] ${transfer ? 'bg-blue-50 text-blue-800' : income ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{icon}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><p className="truncate font-semibold capitalize">{title}</p>{categoryName && title !== categoryName && <Badge>{categoryName}</Badge>}{item.method === 'amortized' && <Badge tone="warning">Amortized</Badge>}{transfer && <Badge tone="info">Transfer</Badge>}{item.kind==='refund'&&<Badge tone="positive">Refund</Badge>}{item.voidedAt && <Badge>Reversed</Badge>}</div><p className="mt-0.5 truncate text-xs text-muted">{transfer ? `${accountName(item.sourceAccountId)} → ${accountName(item.destinationAccountId)}` : accountName(item.sourceAccountId || item.destinationAccountId)} · {formatInTimezone(item.occurredAt, timezone)}</p>{item.dailyImpact && <p className="mt-0.5 text-xs font-medium text-violet-800">{t('Utility:')} {formatMoney(item.dailyImpact, item.currency)}/{t('day')}</p>}</div><div className="shrink-0 text-right"><p className="money-value font-bold">{income ? '+' : transfer ? '↔' : '−'}{formatMoney(item.amount, item.currency)}</p>{!item.voidedAt && <div className="mt-1 flex flex-wrap justify-end gap-1">{item.categoryLocked&&item.categoryId&&item.merchant&&<button onClick={()=>void remember()} disabled={remembered} title={rememberError??undefined} className="control-press min-h-8 rounded-lg px-1.5 text-xs text-brand outline-none hover:bg-brand/[.06] focus-visible:ring-2 focus-visible:ring-accent">{remembered?'Saved for future':'Use for future'}</button>}<button aria-label={t('Edit transaction')} onClick={onEdit} className="control-press inline-flex min-h-8 items-center gap-1 rounded-lg px-1.5 text-xs text-muted outline-none hover:bg-brand/[.06] hover:text-ink focus-visible:ring-2 focus-visible:ring-accent active:scale-95"><Pencil className="size-3" />{t('Edit')}</button><button aria-label={t('Delete and reverse transaction')} onClick={onVoid} className="control-press inline-flex min-h-8 items-center gap-1 rounded-lg px-1.5 text-xs text-muted outline-none hover:bg-rose-50 hover:text-rose-800 focus-visible:ring-2 focus-visible:ring-accent active:scale-95"><Trash2 className="size-3" />{t('Delete')}</button></div>}</div></Card>;
}

function TransactionDialog({ transaction, accounts, categories, timezone, onClose }: { transaction: Transaction | null; accounts: Account[]; categories: Category[]; timezone: string; onClose: () => void }) {
  const {t}=useLanguage();
  const update = useUpdateTransaction(transaction?.id ?? '');
  const [form, setForm] = useState<TransactionInput | null>(null);
  const [when, setWhen] = useState('');
  useEffect(() => {
    if (!transaction) return;
    setForm({
      kind: transaction.kind, method: transaction.method,
      sourceAccountId: transaction.sourceAccountId, destinationAccountId: transaction.destinationAccountId,
      categoryId: transaction.categoryId, assetId: transaction.assetId,
      liabilityId: transaction.liabilityId, recurringRuleId: transaction.recurringRuleId,
      amount: transaction.amount, currency: transaction.currency, occurredAt: transaction.occurredAt,
      description: transaction.description, merchant: transaction.merchant,
      amortizationStart: transaction.amortizationStart, amortizationEnd: transaction.amortizationEnd,
    });
    setWhen(toZonedLocalInput(transaction.occurredAt, timezone));
    update.reset();
  }, [transaction, timezone]);
  if (!transaction || !form) return null;

  const hasSource = ['expense', 'transfer', 'asset_purchase', 'liability_payment'].includes(form.kind) ||
    (form.kind === 'adjustment' && transaction.sourceAccountId !== null);
  const hasDestination = ['income', 'refund', 'transfer', 'asset_sale', 'liability_drawdown'].includes(form.kind) ||
    (form.kind === 'adjustment' && transaction.destinationAccountId !== null);
  const accountOptions = accounts.filter((item) => item.currency === form.currency &&
    (!item.isArchived || item.id === transaction.sourceAccountId || item.id === transaction.destinationAccountId));
  const categoryKind = ['income', 'asset_sale', 'liability_drawdown'].includes(form.kind) ||
    (form.kind === 'adjustment' && hasDestination) ? 'income' : 'expense';
  const categoryOptions = categories.filter((item) =>
    (!item.isArchived || item.id === transaction.categoryId) &&
    (item.kind === 'both' || item.kind === categoryKind));
  const invalidTransfer = form.kind === 'transfer' && form.sourceAccountId === form.destinationAccountId;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    update.mutate({ ...form, occurredAt: zonedInputToIso(when, timezone) }, { onSuccess: onClose });
  };

  return <Modal open title="Edit transaction" description="Account changes automatically reverse the old balance effect and apply it to the new account." onClose={onClose}>
    <form className="grid gap-4" onSubmit={submit}>
      <div className="flex items-center justify-between rounded-2xl bg-brand/[.06] px-3 py-2 text-sm"><span className="font-semibold capitalize">{form.kind.replaceAll('_', ' ')}</span><Badge>{form.currency}</Badge></div>
      <Field label="Amount"><Input inputMode="decimal" pattern="\d+(\.\d{1,4})?" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required /></Field>
      {hasSource && <Field label={form.kind === 'transfer' ? 'From account' : 'Paid from'}><Select value={form.sourceAccountId ?? ''} onChange={(event) => setForm({ ...form, sourceAccountId: event.target.value })} required><option value="">Choose account</option>{accountOptions.map((item) => <option key={item.id} value={item.id}>{item.name}{item.isArchived ? ' · archived' : ''}</option>)}</Select></Field>}
      {hasDestination && <Field label={form.kind === 'transfer' ? 'To account' : 'Received into'} error={invalidTransfer ? 'Choose two different accounts.' : undefined}><Select value={form.destinationAccountId ?? ''} onChange={(event) => setForm({ ...form, destinationAccountId: event.target.value })} required><option value="">Choose account</option>{accountOptions.map((item) => <option key={item.id} value={item.id}>{item.name}{item.isArchived ? ' · archived' : ''}</option>)}</Select></Field>}
      {form.kind !== 'transfer' && <Field label="Category" hint="Optional"><Select value={form.categoryId ?? ''} onChange={(event) => setForm({ ...form, categoryId: event.target.value || null })}><option value="">Uncategorized</option>{categoryOptions.map((item) => <option key={item.id} value={item.id}>{item.name}{item.isArchived ? ' · archived' : ''}</option>)}</Select></Field>}
      <Field label={`${t('Date & time')} · ${timezone}`}><Input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} required /></Field>
      {form.method === 'amortized' && <div className="grid grid-cols-2 gap-3"><Field label="Use starts"><Input type="date" value={form.amortizationStart ?? ''} onChange={(event) => setForm({ ...form, amortizationStart: event.target.value })} required /></Field><Field label="Use ends"><Input type="date" value={form.amortizationEnd ?? ''} onChange={(event) => setForm({ ...form, amortizationEnd: event.target.value })} required /></Field></div>}
      <Field label="Note" hint="Optional"><Input value={form.description ?? ''} maxLength={2000} onChange={(event) => setForm({ ...form, description: event.target.value || null })} /></Field>
      <FormError error={update.error} />
      <div className="modal-actions"><Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button><Button className="flex-1" disabled={update.isPending || invalidTransfer}>{update.isPending ? 'Saving…' : 'Save changes'}</Button></div>
    </form>
  </Modal>;
}
