import { QuickAdd } from '../features/QuickAdd';
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, ChevronDown, Pencil, ReceiptText, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useEffect, useId, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, jsonBody } from '../api/client';
import { keys, useAccounts, useCategories, useMe, useTransactions, useUpdateTransaction, useVoidTransaction } from '../api/queries';
import type { Account, ApiEnvelope, Category, PaymentScheduleInput, Transaction, TransactionInput, TransactionMethod } from '../api/types';
import { Badge, Button, Card, EmptyState, ErrorState, Field, FormError, Input, LoadingState, Modal, PageHeader, Select } from '../components/ui';
import { addCalendarDays, addCalendarMonths, formatInTimezone, toZonedLocalInput, zonedInputToIso } from '../utils/dateTime';
import { formatMoney, moneyInputValue } from '../utils/money';
import { useLanguage } from '../i18n';

export default function TransactionsPage() {
  const {t}=useLanguage();
  const [adding, setAdding] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersId = useId();
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
  const filterCount = [kind, account, category, from, to].filter(Boolean).length;
  const resetFilters = () => { setKind(''); setAccount(''); setCategory(''); setFrom(''); setTo(''); setSort('occurredAt'); setPage(0); };
  const filter = (setter: (value: string) => void) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setter(event.target.value); setPage(0); };
  return <>
    <PageHeader eyebrow="Ledger" title="Transactions" description="Your money in and out. Transfers between your own accounts do not count as spending." action={<Button onClick={()=>setAdding(true)}>Add transaction</Button>} />
    <Card className="mb-4 bg-surface/80 sm:mb-5"><div className="flex items-center justify-between gap-2"><button type="button" aria-expanded={filtersOpen} aria-controls={filtersId} onClick={()=>setFiltersOpen(value=>!value)} className="flex min-h-11 flex-1 items-center gap-2 rounded-xl text-sm font-semibold sm:hidden"><SlidersHorizontal className="size-4" />{t("Filters")}{filterCount>0&&<Badge>{filterCount}</Badge>}<ChevronDown className={`ml-auto size-4 transition-transform ${filtersOpen?"rotate-180":""}`} /></button>{(filterCount>0||sort!=="occurredAt")&&<Button variant="ghost" onClick={resetFilters}>{t("Clear filters")}</Button>}</div><div id={filtersId} className={`transaction-filter-grid grid-cols-2 gap-3 xl:grid-cols-3 ${filtersOpen?"mt-3 grid sm:mt-0":"hidden sm:grid"}`}>
      <Field label="Type"><Select aria-label="Filter by type" value={kind} onChange={filter(setKind)}><option value="">All transaction types</option><option value="expense">Expenses</option><option value="refund">Refunds</option><option value="income">Income</option><option value="transfer">Transfers</option><option value="asset_purchase">Asset purchases</option><option value="liability_payment">Liability payments</option></Select></Field>
      <Field label="Account"><Select aria-label="Filter by account" value={account} onChange={filter(setAccount)}><option value="">All accounts</option>{accounts.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
      <Field label="Category"><Select aria-label="Filter by category" value={category} onChange={filter(setCategory)}><option value="">All categories</option>{categories.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
      <Field label="From date"><Input className="min-w-0 max-w-full" type="date" max={to || undefined} value={from} onChange={filter(setFrom)} /></Field>
      <Field label="Through date"><Input className="min-w-0 max-w-full" type="date" min={from || undefined} value={to} onChange={filter(setTo)} /></Field>
      <Field label="Sort by"><Select aria-label="Sort transactions" value={sort} onChange={filter(setSort)}><option value="occurredAt">Newest occurrence</option><option value="createdAt">Recently added</option><option value="amount">Largest amount</option></Select></Field>
    </div></Card>
    {me.data?.bankingEnabled && <BankTransferPairing />}
    {query.isPending ? <LoadingState /> : query.isError ? <ErrorState error={query.error} retry={() => query.refetch()} /> : query.data.data.length === 0 ? <EmptyState icon={<ReceiptText />} title="No transactions yet" description="Record an expense or income with Add transaction. Try clearing filters if you expected to see existing entries." /> : <>
      <div className="grid gap-2 sm:gap-2.5">{query.data.data.map((transaction) => <TransactionRow key={transaction.id} item={transaction} timezone={timezone} accounts={accounts.data ?? []} categories={categories.data ?? []} onEdit={() => setEditing(transaction)} onVoid={() => { if (confirm(t('Delete and fully reverse this transaction? Its audit record will be preserved.'))) voidTx.mutate(transaction.id); }} />)}</div>
      <div className="mt-4 flex items-center justify-between"><Button variant="secondary" disabled={page === 0 || query.isPlaceholderData} onClick={() => setPage((value) => value - 1)}>Previous</Button><span className="text-xs text-muted">{t('{count} total', {count: query.data.meta.total})}</span><Button variant="secondary" disabled={query.isPlaceholderData || (page + 1) * 25 >= query.data.meta.total} onClick={() => setPage((value) => value + 1)}>Next</Button></div>
    </>}
    {adding && <QuickAdd open onClose={()=>setAdding(false)}/>}
    <FormError error={voidTx.error}/>
    <TransactionDialog transaction={editing} accounts={accounts.data ?? []} categories={categories.data ?? []} timezone={timezone} onClose={() => setEditing(null)} />
  </>;
}

export function TransactionRow({ item, timezone, accounts, categories, onEdit, onVoid }: { item: Transaction; timezone: string; accounts: Array<{ id: string; name: string }>; categories: Array<{ id: string; name: string }>; onEdit?: () => void; onVoid: () => void }) {
  const {t}=useLanguage();
  const transfer = item.kind === 'transfer'; const income = !transfer && !item.sourceAccountId && Boolean(item.destinationAccountId); const icon = transfer ? <ArrowRightLeft /> : income ? <ArrowDownLeft /> : <ArrowUpRight />;
  const accountName = (id: string | null) => accounts.find((entry) => entry.id === id)?.name;
  const categoryName = categories.find((entry) => entry.id === item.categoryId)?.name;
  const title = item.description || item.merchant || categoryName || item.kind.replaceAll('_', ' ');
  return <Card className={`transaction-row card-lift grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2.5 p-3 sm:flex sm:gap-3 sm:p-4 ${item.voidedAt ? 'opacity-50' : ''}`}><span className={`grid size-11 shrink-0 place-items-center rounded-2xl ring-1 ring-inset ring-black/[.035] ${transfer ? 'bg-blue-50 text-blue-800' : income ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{icon}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><p className="break-words font-semibold capitalize">{title}</p>{categoryName && title !== categoryName && <Badge>{categoryName}</Badge>}{!categoryName&&!transfer&&<Badge>Uncategorized</Badge>}{item.bankSynced&&<Badge tone="info">Bank synced</Badge>}{item.method === 'amortized' && <Badge tone="warning">Spread cost</Badge>}{item.method === 'recurring' && <Badge tone="info">Regular payment</Badge>}{transfer && <Badge tone="info">Transfer</Badge>}{item.kind==='refund'&&<Badge tone="positive">Refund</Badge>}{item.voidedAt && <Badge>Reversed</Badge>}</div><p className="mt-0.5 break-words text-xs text-muted">{transfer ? `${accountName(item.sourceAccountId)} → ${accountName(item.destinationAccountId)}` : accountName(item.sourceAccountId || item.destinationAccountId)} · {item.bankOccurredOn??formatInTimezone(item.occurredAt, timezone)}</p>{item.dailyImpact && <p className="mt-0.5 text-xs font-medium text-violet-800">{t('Utility:')} {formatMoney(item.dailyImpact, item.currency)}/{t('day')}</p>}</div><div className="transaction-amount col-span-2 min-w-0 text-right sm:shrink-0"><p className="money-value font-bold">{income ? '+' : transfer ? '↔' : '−'}{formatMoney(item.amount, item.currency)}</p>{!item.voidedAt && <div className="mt-1 flex flex-wrap justify-end gap-1"><button disabled={!onEdit} aria-label={t('Edit transaction')} onClick={onEdit} className="control-press inline-flex min-h-11 items-center gap-1 rounded-lg px-1.5 text-xs text-muted outline-none hover:bg-brand/[.06] hover:text-ink focus-visible:ring-2 focus-visible:ring-accent active:scale-95"><Pencil className="size-3" />{t('Edit')}</button><button aria-label={t('Delete and reverse transaction')} onClick={onVoid} className="control-press inline-flex min-h-11 items-center gap-1 rounded-lg px-1.5 text-xs text-muted outline-none hover:bg-rose-50 hover:text-rose-800 focus-visible:ring-2 focus-visible:ring-accent active:scale-95"><Trash2 className="size-3" />{t('Delete')}</button></div>}</div></Card>;
}

type PairCandidate = { id:string; direction:'debit'|'credit'; amount:string; currency:string; occurredOn:string; merchant:string|null; accountName:string };
function BankTransferPairing() {
  const qc=useQueryClient();
  const [debit,setDebit]=useState(''); const [credit,setCredit]=useState('');
  const candidates=useQuery({queryKey:['banking','transfers'],queryFn:async()=>(await apiRequest<ApiEnvelope<PairCandidate[]>>('/api/banking/transfers/candidates')).data,retry:false});
  const pair=useMutation({mutationFn:()=>apiRequest('/api/banking/transfers/pair',{method:'POST',...jsonBody({debitId:debit,creditId:credit})}),onSuccess:async()=>{setDebit('');setCredit('');await Promise.all([qc.invalidateQueries({queryKey:['banking']}),qc.invalidateQueries({queryKey:keys.transactions}),qc.invalidateQueries({queryKey:keys.accounts}),qc.invalidateQueries({queryKey:keys.dashboard})]);}});
  if(candidates.isError||!candidates.data?.length) return null;
  return <Card className="mb-5"><h2 className="flex items-center gap-2 font-bold"><ArrowRightLeft className="size-5"/>Pair your own transfers</h2><p className="mt-1 text-sm text-muted">Choose opposite, unedited booked movements between your own accounts. Their original amounts and currencies remain intact.</p><div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"><Field label="Money sent"><Select value={debit} onChange={event=>setDebit(event.target.value)}><option value="">Choose debit</option>{candidates.data.filter(item=>item.direction==='debit').map(item=><option key={item.id} value={item.id}>{item.occurredOn} · {item.accountName} · {formatMoney(item.amount,item.currency)}{item.merchant?` · ${item.merchant}`:''}</option>)}</Select></Field><Field label="Money received"><Select value={credit} onChange={event=>setCredit(event.target.value)}><option value="">Choose credit</option>{candidates.data.filter(item=>item.direction==='credit').map(item=><option key={item.id} value={item.id}>{item.occurredOn} · {item.accountName} · {formatMoney(item.amount,item.currency)}{item.merchant?` · ${item.merchant}`:''}</option>)}</Select></Field></div><Button className="mt-3" disabled={!debit||!credit||pair.isPending} onClick={()=>pair.mutate()}>Pair transfer</Button><FormError error={pair.error}/></Card>;
}

export function TransactionDialog({ transaction, accounts, categories, timezone, onClose }: { transaction: Transaction | null; accounts: Account[]; categories: Category[]; timezone: string; onClose: () => void }) {
  const {t}=useLanguage();
  const update = useUpdateTransaction(transaction?.id ?? '');
  const [form, setForm] = useState<TransactionInput | null>(null);
  const [when, setWhen] = useState('');
  const [schedule, setSchedule] = useState<PaymentScheduleInput | null>(null);
  useEffect(() => {
    if (!transaction) return;
    setForm({
      kind: transaction.kind, method: transaction.method,
      sourceAccountId: transaction.sourceAccountId, destinationAccountId: transaction.destinationAccountId,
      categoryId: transaction.categoryId, assetId: transaction.assetId,
      liabilityId: transaction.liabilityId, recurringRuleId: transaction.recurringRuleId,
      amount: moneyInputValue(transaction.amount), currency: transaction.currency, occurredAt: transaction.occurredAt,
      description: transaction.description, merchant: transaction.merchant,
      amortizationStart: transaction.amortizationStart, amortizationEnd: transaction.amortizationEnd,
    });
    const localWhen = transaction.bankOccurredOn ? `${transaction.bankOccurredOn}T12:00` : toZonedLocalInput(transaction.occurredAt, timezone);
    setWhen(localWhen);
    const date = localWhen.slice(0, 10);
    setSchedule({ name: transaction.description || transaction.merchant || 'Regular payment', intervalCount: 1,
      intervalUnit: 'month', startsOn: date, nextDueOn: addCalendarMonths(date, 1), endsOn: null });
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
  const invalidTransfer = form.kind === 'transfer' && (!form.sourceAccountId || !form.destinationAccountId || form.sourceAccountId === form.destinationAccountId);
  const newRegularPayment = form.method === 'recurring' && !transaction.recurringRuleId;
  const invalidDates = form.method === 'amortized' && (!form.amortizationStart || !form.amortizationEnd || form.amortizationEnd < form.amortizationStart);
  const invalidSchedule = newRegularPayment && (!schedule?.name.trim() || !schedule.nextDueOn || schedule.nextDueOn <= when.slice(0, 10));
  const changeMethod = (method: TransactionMethod) => {
    const date = when.slice(0, 10);
    setForm({ ...form, kind: transaction.kind === 'expense' ? 'expense' : form.kind, method,
      destinationAccountId: transaction.kind === 'expense' ? null : form.destinationAccountId,
      categoryId: form.kind === 'transfer' ? transaction.categoryId : form.categoryId,
      recurringRuleId: method === 'recurring' ? transaction.recurringRuleId : null,
      amortizationStart: method === 'amortized' ? form.amortizationStart || date : null,
      amortizationEnd: method === 'amortized' ? form.amortizationEnd || addCalendarDays(date, 29) : null });
  };
  const changeExpenseType = (value: string) => {
    if (value !== 'transfer') { changeMethod(value as TransactionMethod); return; }
    setForm({ ...form, kind: 'transfer', method: 'standard', destinationAccountId: null,
      categoryId: null, assetId: null, liabilityId: null, recurringRuleId: null,
      amortizationStart: null, amortizationEnd: null });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (invalidTransfer || invalidDates || invalidSchedule) return;
    update.mutate({ ...form, occurredAt: zonedInputToIso(when, timezone),
      ...(newRegularPayment && schedule ? { paymentSchedule: { ...schedule, startsOn: when.slice(0, 10) } } : {}),
    }, { onSuccess: onClose });
  };

  return <Modal open closeDisabled={update.isPending} title="Edit transaction" description="Account changes automatically reverse the old balance effect and apply it to the new account." onClose={onClose}>
    <form className="grid gap-4" onSubmit={submit}>
      <div className="flex items-center justify-between rounded-2xl bg-brand/[.06] px-3 py-2 text-sm"><span className="font-semibold capitalize">{form.kind.replaceAll('_', ' ')}</span><Badge>{form.currency}</Badge></div>
      {transaction.kind === 'expense' && <Field label="Expense type"><Select value={form.kind === 'transfer' ? 'transfer' : form.method} onChange={event => changeExpenseType(event.target.value)} disabled={update.isPending}>
        <option value="standard">Expense</option><option value="amortized">Spread cost</option><option value="recurring">Regular payment</option><option value="transfer">Transfer</option>
      </Select></Field>}
      {form.kind === 'transfer' && transaction.kind === 'expense' && <p className="text-sm text-muted">{t('Choose the account that received this money, including cash for a withdrawal. Transfers between accounts in the same currency are excluded from spending. If both sides were imported, use Pair your own transfers.')}</p>}
      <Field label="Amount"><Input inputMode="decimal" pattern="\d+([.,]\d{1,4})?" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required /></Field>
      {hasSource && <Field label={form.kind === 'transfer' ? 'From account' : 'Paid from'}><Select value={form.sourceAccountId ?? ''} onChange={(event) => setForm({ ...form, sourceAccountId: event.target.value })} required><option value="">Choose account</option>{accountOptions.map((item) => <option key={item.id} value={item.id}>{item.name}{item.isArchived ? ' · archived' : ''}</option>)}</Select></Field>}
      {hasDestination && <Field label={form.kind === 'transfer' ? 'To account' : 'Received into'} error={invalidTransfer ? 'Choose two different accounts.' : undefined}><Select value={form.destinationAccountId ?? ''} onChange={(event) => setForm({ ...form, destinationAccountId: event.target.value })} required><option value="">Choose account</option>{accountOptions.filter(item => form.kind !== 'transfer' || item.id !== form.sourceAccountId).map((item) => <option key={item.id} value={item.id}>{item.name}{item.isArchived ? ' · archived' : ''}</option>)}</Select></Field>}
      {form.kind !== 'transfer' && <Field label="Category" hint="What kind of spending or income was this?"><Select value={form.categoryId ?? ''} onChange={(event) => setForm({ ...form, categoryId: event.target.value || null })}><option value="">Uncategorized</option>{categoryOptions.map((item) => <option key={item.id} value={item.id}>{item.name}{item.isArchived ? ' · archived' : ''}</option>)}</Select></Field>}
      <Field label={`${t('Date & time')} · ${timezone}`}><Input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} required /></Field>
      {form.method === 'amortized' && <div className="rounded-2xl bg-amber-50 p-4"><p className="mb-3 text-sm text-muted">{t('Your balance and spending include the full price today. The daily cost is also spread over the days you use it.')}</p><div className="grid grid-cols-2 gap-3"><Field label="Use starts"><Input type="date" value={form.amortizationStart ?? ''} onChange={(event) => setForm({ ...form, amortizationStart: event.target.value })} required /></Field><Field label="Use ends" error={invalidDates ? 'Use ends must be on or after use starts.' : undefined}><Input type="date" min={form.amortizationStart ?? undefined} value={form.amortizationEnd ?? ''} onChange={(event) => setForm({ ...form, amortizationEnd: event.target.value })} required /></Field></div></div>}
      {newRegularPayment && schedule && <div className="grid gap-3 rounded-2xl bg-brand/[.06] p-4">
        <p className="text-sm text-muted">{t('This payment is already recorded. Create a reminder for future payments without charging your account again.')}</p>
        <Field label="Payment name"><Input value={schedule.name} maxLength={120} onChange={event => setSchedule({ ...schedule, name: event.target.value })} required /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Every"><Input type="number" min="1" max="10000" value={schedule.intervalCount} onChange={event => setSchedule({ ...schedule, intervalCount: Number(event.target.value) })} required /></Field><Field label="Unit"><Select value={schedule.intervalUnit} onChange={event => setSchedule({ ...schedule, intervalUnit: event.target.value as PaymentScheduleInput['intervalUnit'] })}>{['day', 'week', 'month', 'year'].map(unit => <option key={unit} value={unit}>{unit}</option>)}</Select></Field></div>
        <Field label="Next payment" error={invalidSchedule && schedule.nextDueOn <= when.slice(0, 10) ? 'The next payment must be after this payment.' : undefined}><Input type="date" min={when ? addCalendarDays(when.slice(0, 10), 1) : undefined} value={schedule.nextDueOn} onChange={event => setSchedule({ ...schedule, nextDueOn: event.target.value })} required /></Field>
      </div>}
      {form.method === 'recurring' && transaction.recurringRuleId && <p className="text-sm text-muted">{t('This transaction is linked to a regular payment. Manage its schedule in Regular payments.')}</p>}
      {form.method !== 'recurring' && transaction.recurringRuleId && <p className="text-sm text-muted">{t('This change unlinks this transaction. Its regular payment schedule stays active; pause it in Regular payments if needed.')}</p>}
      <Field label="Note" hint="Optional"><Input value={form.description ?? ''} maxLength={2000} onChange={(event) => setForm({ ...form, description: event.target.value || null })} /></Field>
      <FormError error={update.error} />
      <div className="modal-actions"><Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={update.isPending}>Cancel</Button><Button className="flex-1" loading={update.isPending} disabled={invalidTransfer || invalidDates || invalidSchedule}>Save changes</Button></div>
    </form>
  </Modal>;
}
