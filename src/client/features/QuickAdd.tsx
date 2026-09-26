import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, CalendarDays, Clock3, PackageOpen } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useAccounts, useAssets, useCategories, useCreateTransaction, useLiabilities, useMe } from '../api/queries';
import type { TransactionInput, TransactionKind } from '../api/types';
import { Button, Field, FormError, Input, Modal, Select } from '../components/ui';
import { useLanguage } from '../i18n';
import { browserTimezone, localInputNow, zonedInputToIso } from '../utils/dateTime';

const modes: Array<{ value: TransactionKind | 'amortized'; label: string; icon: typeof ArrowUpRight }> = [
  { value: 'expense', label: 'Expense', icon: ArrowUpRight }, { value: 'income', label: 'Income', icon: ArrowDownLeft },
  { value: 'refund', label: 'Refund', icon: ArrowDownLeft },
  { value: 'amortized', label: 'Spread cost', icon: CalendarDays }, { value: 'transfer', label: 'Transfer', icon: ArrowRightLeft },
  { value: 'asset_purchase', label: 'Asset buy', icon: PackageOpen }, { value: 'liability_payment', label: 'Debt payment', icon: Clock3 },
];

export function QuickAdd({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {t}=useLanguage();
  const accounts = useAccounts(false);
  const categories = useCategories(false);
  const assets = useAssets(false);
  const liabilities = useLiabilities(false);
  const me = useMe();
  const mutation = useCreateTransaction();
  const [mode, setMode] = useState<(typeof modes)[number]['value']>('expense');
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [category, setCategory] = useState('');
  const [asset, setAsset] = useState('');
  const [liability, setLiability] = useState('');
  const [when, setWhen] = useState(() => localInputNow(me.data?.timezone ?? browserTimezone()));
  const [description, setDescription] = useState('');
  const [days, setDays] = useState('365');
  const activeAccounts = accounts.data?.filter((item) => !item.isArchived) ?? [];
  const currency = activeAccounts.find((item) => item.id === (['income','refund'].includes(mode) ? destination : source))?.currency ?? me.data?.baseCurrency ?? 'EUR';
  const needsSource = ['expense', 'amortized', 'transfer', 'asset_purchase', 'liability_payment'].includes(mode);
  const needsDestination = ['income', 'refund', 'transfer'].includes(mode);
  const categoryOptions = useMemo(() => categories.data?.filter((item) => !item.isArchived && (item.kind === 'both' || item.kind === (mode === 'income' ? 'income' : 'expense'))) ?? [], [categories.data, mode]);
  useEffect(() => { if (open) { setWhen(localInputNow(me.data?.timezone ?? browserTimezone())); mutation.reset(); } }, [open, me.data?.timezone]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const kind: TransactionKind = mode === 'amortized' ? 'expense' : mode;
    const start = when.slice(0, 10);
    const endDate = new Date(`${start}T12:00:00Z`);
    endDate.setUTCDate(endDate.getUTCDate() + Math.max(1, parseInt(days || '1', 10)) - 1);
    const payload: TransactionInput = {
      kind,
      method: mode === 'amortized' ? 'amortized' : 'standard',
      sourceAccountId: needsSource ? source || null : null,
      destinationAccountId: needsDestination ? destination || null : null,
      categoryId: ['expense', 'income', 'refund', 'amortized', 'asset_purchase', 'liability_payment'].includes(mode) ? category || null : null,
      assetId: mode === 'asset_purchase' ? asset || null : null,
      liabilityId: mode === 'liability_payment' ? liability || null : null,
      recurringRuleId: null,
      amount,
      currency,
      occurredAt: zonedInputToIso(when, me.data?.timezone ?? browserTimezone()),
      description: description || null,
      merchant: null,
      amortizationStart: mode === 'amortized' ? start : null,
      amortizationEnd: mode === 'amortized' ? endDate.toISOString().slice(0, 10) : null,
    };
    mutation.mutate(payload, { onSuccess: () => { setAmount(''); setDescription(''); onClose(); } });
  };
  const invalidTransfer = mode === 'transfer' && source !== '' && destination !== '' && (source === destination || activeAccounts.find(a=>a.id===destination)?.currency !== currency);

  return <Modal open={open} onClose={onClose} title="Quick add" description="Add spending, income or a refund. Transfers move money between your own accounts.">
    <form className="grid gap-5" onSubmit={submit}>
      <div className="scroll-fade-x no-scrollbar -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-4 sm:overflow-visible" role="radiogroup" aria-label={t('Entry type')}>{modes.map((item) => <button key={item.value} type="button" role="radio" aria-checked={mode === item.value} onClick={() => setMode(item.value)} className={`control-press grid min-h-[4.25rem] min-w-[5.35rem] snap-start place-items-center gap-1 rounded-2xl px-2 text-[11px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 active:scale-[.97] sm:min-w-0 ${mode === item.value ? 'bg-brand text-white shadow-[0_8px_20px_rgba(16,42,44,.18)]' : 'bg-surface text-muted ring-1 ring-inset ring-brand/10 hover:bg-brand/[.055] hover:text-ink'}`}><item.icon className="size-[1.1rem]" />{t(item.label)}</button>)}</div>
      <Field label="Amount"><div className="relative"><Input className="money-value h-16 pr-16 text-3xl font-bold tracking-tight" inputMode="decimal" pattern="\d+([.,]\d{1,4})?" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} required /><span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rounded-lg bg-brand/[.06] px-2 py-1 text-xs font-bold text-muted">{currency}</span></div></Field>
      {needsSource && <Field label={mode === 'transfer' ? 'From account' : 'Pay from'}><Select value={source} onChange={(event) => setSource(event.target.value)} required><option value="">Choose account</option>{activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}</Select></Field>}
      {needsDestination && <Field label={mode === 'transfer' ? 'To account' : 'Receive into'} error={invalidTransfer ? 'Choose different accounts with the same currency.' : undefined}><Select value={destination} onChange={(event) => setDestination(event.target.value)} required><option value="">Choose account</option>{activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}</Select></Field>}
      {mode === 'asset_purchase' && <Field label="Asset"><Select value={asset} onChange={(event) => setAsset(event.target.value)} required><option value="">Choose asset</option>{assets.data?.filter((item) => item.currency === currency && !item.isArchived).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>}
      {mode === 'liability_payment' && <Field label="Liability"><Select value={liability} onChange={(event) => setLiability(event.target.value)} required><option value="">Choose liability</option>{liabilities.data?.filter((item) => item.currency === currency && item.status === 'active').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>}
      {['expense', 'income', 'refund', 'amortized', 'asset_purchase', 'liability_payment'].includes(mode) && <Field label="Category" hint="What kind of spending or income was this? Optional, but useful for your spending breakdown."><Select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Uncategorized</option>{categoryOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>}
      {mode === 'amortized' && <div className="rounded-2xl border border-amber-200/60 bg-amber-50/80 p-4 shadow-sm"><Field label="Expected use (days)" hint="Your balance and spending include the full price today. The daily cost is also spread over the days you use it."><Input type="number" inputMode="numeric" min="1" max="36500" value={days} onChange={(event) => setDays(event.target.value)} required /></Field></div>}
      <Field label={`${t('Date & time')} · ${me.data?.timezone ?? ''}`} hint={me.data?.timezone !== browserTimezone() ? t('Your device is in {timezone}; this entry uses your profile timezone.', {timezone: browserTimezone()}) : undefined}><Input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} required /></Field>
      <Field label="Note" hint="Optional"><Input value={description} maxLength={2000} onChange={(event) => setDescription(event.target.value)} placeholder="What was this for?" /></Field>
      {activeAccounts.length === 0 && <p className="rounded-2xl border border-amber-200/60 bg-amber-50 p-3 text-sm text-amber-900">{t('Create a money account before adding an entry.')}</p>}
      <FormError error={mutation.error} />
      <div className="modal-actions"><Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button><Button type="submit" className="flex-1" loading={mutation.isPending} disabled={!navigator.onLine || activeAccounts.length === 0 || invalidTransfer}>{!navigator.onLine ? 'Offline' : 'Save entry'}</Button></div>
    </form>
  </Modal>;
}
