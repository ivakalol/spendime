import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../api/client';
import { useTransactions } from '../api/queries';
import type { ApiEnvelope, Transaction } from '../api/types';
import { Button, ErrorState, Field, Input, Select } from '../components/ui';
import { useLanguage } from '../i18n';
import { decimal, units } from '../utils/analytics';
import { formatMoney } from '../utils/money';

export function ExpenseLinkPicker({ value, onChange, currency, initialExpense, amount = '', creditedAmount = '0', onValidityChange }: {
  value: string | null | undefined; onChange: (id: string, expense?: Transaction) => void;
  currency: string; initialExpense?: Transaction | undefined; amount?: string; creditedAmount?: string;
  onValidityChange?: (invalid: boolean) => void;
}) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const expenses = useTransactions(new URLSearchParams({ kind: 'expense', search, limit: '25', offset: String(page * 25), sort: 'occurredAt', direction: 'desc' }));
  const options = expenses.data?.data.filter(item => item.currency === currency) ?? [];
  const selected = useQuery({ queryKey: ['transactions', 'detail', value], enabled: Boolean(value),
    initialData: initialExpense?.id === value ? initialExpense : options.find(item => item.id === value),
    staleTime: 30_000,
    queryFn: async () => (await apiRequest<ApiEnvelope<Transaction>>(`/api/transactions/${value}`)).data,
  });
  const pinned = selected.data && !options.some(item => item.id === value) ? selected.data : undefined;
  const remaining = selected.data ? units(selected.data.netExpenseAmount ?? selected.data.amount) + units(creditedAmount) : null;
  const entered = /^\d+(?:[.,]\d{1,4})?$/.test(amount) ? units(amount.replace(',', '.')) : 0n;
  const exceeds = remaining !== null && entered > remaining;
  const wrongExpense = Boolean(selected.data && (selected.data.currency !== currency || selected.data.kind !== 'expense' || selected.data.voidedAt));
  const invalid = !selected.data || wrongExpense || exceeds || selected.isError;
  useEffect(() => { onValidityChange?.(invalid); }, [invalid, onValidityChange]);
  const label = (item: Transaction) => `${item.description || item.merchant || t('Expense')} · ${item.occurredAt.slice(0, 10)} · ${formatMoney(item.amount, item.currency)}`;
  return <div className="grid gap-3 rounded-2xl border border-brand/10 bg-brand/[.025] p-4">
    <Field label="Search expenses"><Input type="search" value={search} maxLength={120} placeholder="e.g. Happy" onChange={event => { setSearch(event.target.value); setPage(0); }} /></Field>
    <Field label="Money back for" hint="Choose the exact payment. Its category is used automatically." error={exceeds ? 'Money paid back exceeds the remaining expense.' : wrongExpense ? 'Choose an active expense in the same currency.' : undefined}>
      <Select value={value ?? ''} required onChange={event => onChange(event.target.value, options.find(item => item.id === event.target.value) ?? pinned)}>
        <option value="">{t('Choose an expense')}</option>
        {pinned && <option value={pinned.id} translate="no">{label(pinned)}</option>}
        {options.map(item => <option key={item.id} value={item.id} translate="no">{label(item)}</option>)}
      </Select>
    </Field>
    {expenses.isPending && <p role="status" className="text-xs text-muted">{t('Loading expenses…')}</p>}
    {expenses.isError && <ErrorState error={expenses.error} retry={() => expenses.refetch()} />}
    {selected.isError && value && <ErrorState error={selected.error} retry={() => selected.refetch()} />}
    {expenses.isSuccess && !options.length && <p className="text-xs text-muted">{t('No matching expenses in this currency. Try another search or page.')}</p>}
    {expenses.data && (page > 0 || expenses.data.meta.total > 25) && <div className="flex justify-between"><Button type="button" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>{t('Previous')}</Button><Button type="button" variant="ghost" disabled={expenses.isPlaceholderData || (page + 1) * 25 >= expenses.data.meta.total} onClick={() => setPage(page + 1)}>{t('Next')}</Button></div>}
    {remaining !== null && !invalid && entered > 0n && <p aria-live="polite" className="font-semibold text-brand">{t('Your share after this repayment: {amount}', { amount: formatMoney(decimal(remaining - entered), currency) })}</p>}
    <p className="text-xs text-muted">{t('This updates the original expense, including its original period. The bank movements stay unchanged.')}</p>
  </div>;
}
