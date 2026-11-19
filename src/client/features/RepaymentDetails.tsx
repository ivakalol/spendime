import { useEffect, useState } from 'react';
import type { Transaction } from '../api/types';
import { Button, Field, Input, Select } from '../components/ui';
import { useLanguage } from '../i18n';
import { decimal, units } from '../utils/analytics';
import { formatMoney } from '../utils/money';
import { ExpenseLinkPicker } from './ExpenseLinkPicker';

type Share = { expenseId: string; amount: string };
export function RepaymentDetails({ original, shares, amount, currency, initialExpense, previous, onChange, onValidityChange }: {
  original: string | null | undefined; shares: Share[]; amount: string; currency: string;
  initialExpense?: Transaction | undefined; previous?: Transaction | undefined;
  onChange: (original: string | null, shares: Share[], category?: string | null) => void;
  onValidityChange: (invalid: boolean) => void;
}) {
  const { t } = useLanguage();
  const [mode, setMode] = useState(shares.length ? 'several' : 'one');
  const [singleInvalid, setSingleInvalid] = useState(true);
  const [shareInvalid, setShareInvalid] = useState<Record<string, boolean>>({});
  const shareKey = (item: Share) => `${currency}:${item.expenseId}:${item.amount}`;
  const validMoney = (value: string) => /^\d+(?:[.,]\d{1,4})?$/.test(value);
  const total = validMoney(amount) ? units(amount.replace(',', '.')) : 0n;
  const allocated = shares.reduce((sum, item) => sum + (validMoney(item.amount) ? units(item.amount.replace(',', '.')) : 0n), 0n);
  const invalid = mode === 'one' ? !original || singleInvalid : !shares.length || allocated !== total || shares.some(item => !item.expenseId || !validMoney(item.amount) || units(item.amount.replace(',', '.')) <= 0n || shareInvalid[shareKey(item)] !== false) || new Set(shares.map(item => item.expenseId)).size !== shares.length;
  useEffect(() => { onValidityChange(Boolean(invalid)); }, [invalid, onValidityChange]);
  const changeShare = (index: number, changes: Partial<Share>) => onChange(null, shares.map((item, i) => i === index ? { ...item, ...changes } : item));
  return <div className="grid gap-3">
    <Field label="What does this repayment cover?"><Select value={mode} onChange={event => { const next = event.target.value; setMode(next); onChange(null, next === 'several' ? [{ expenseId: '', amount }] : []); }}>
      <option value="one">{t('One expense')}</option><option value="several">{t('Several expenses')}</option>
    </Select></Field>
    {mode === 'one' && <ExpenseLinkPicker value={original} initialExpense={initialExpense} amount={amount} currency={currency} creditedAmount={previous?.originalTransactionId === original ? previous?.amount ?? '0' : '0'} onValidityChange={setSingleInvalid} onChange={(id, expense) => onChange(id || null, [], expense?.categoryId)} />}
    {mode === 'several' && <>
      <p className="text-sm text-muted">{t('One bank transfer, several expenses. Enter how much was returned for each payment. Each original expense keeps its own category.')}</p>
      {shares.map((item, index) => <div key={index} className="grid gap-2 rounded-2xl border border-brand/10 p-3">
        <Field label="Returned for this expense"><Input inputMode="decimal" value={item.amount} onChange={event => changeShare(index, { amount: event.target.value })} required /></Field>
        <ExpenseLinkPicker value={item.expenseId} amount={item.amount} currency={currency} creditedAmount={previous?.reimbursementAllocations?.find(old => old.expenseId === item.expenseId)?.amount ?? (previous?.originalTransactionId === item.expenseId ? previous?.amount ?? '0' : '0')} onValidityChange={invalid => setShareInvalid(old => old[shareKey(item)] === invalid ? old : {...old, [shareKey(item)]:invalid})} onChange={id => changeShare(index, { expenseId: id })} />
        <Button type="button" variant="ghost" onClick={() => onChange(null, shares.filter((_, i) => i !== index))}>{t('Remove expense')}</Button>
      </div>)}
      <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={shares.length >= 100} onClick={() => onChange(null, [...shares, { expenseId: '', amount: allocated < total ? decimal(total - allocated) : '' }])}>{t('Add another expense')}</Button>
      <Button type="button" variant="ghost" disabled={!shares.length || total <= 0n} onClick={() => { const each = total / BigInt(shares.length); onChange(null, shares.map((item, i) => ({ ...item, amount: decimal(i === shares.length - 1 ? total - each * BigInt(i) : each) }))); }}>{t('Split equally')}</Button></div>
      <p aria-live="polite" className="text-sm font-semibold">{t('Left to allocate: {amount}', { amount: formatMoney(decimal(total - allocated), currency) })}</p>
    </>}
  </div>;
}
