import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, CalendarDays, Clock3, PackageOpen } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useAccounts, useAssets, useCategories, useCreateTransaction, useLiabilities, useMe } from '../api/queries';
import type { TransactionInput, TransactionKind } from '../api/types';
import { Button, ErrorState, Field, FormError, Input, Modal, Select } from '../components/ui';
import { ScrollRail } from '../components/ScrollRail';
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
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  const [days, setDays] = useState('365');
  const activeAccounts = accounts.data?.filter((item) => !item.isArchived) ?? [];
  const currency = activeAccounts.find((item) => item.id === (['income','refund'].includes(mode) ? destination : source))?.currency ?? me.data?.baseCurrency ?? 'EUR';
  const needsSource = ['expense', 'amortized', 'transfer', 'asset_purchase', 'liability_payment'].includes(mode);
  const needsDestination = ['income', 'refund', 'transfer'].includes(mode);
  const categoryOptions = useMemo(() => categories.data?.filter((item) => !item.isArchived && (item.kind === 'both' || item.kind === (mode === 'income' ? 'income' : 'expense'))) ?? [], [categories.data, mode]);
  useEffect(() => {
    // A type switch must not submit an invisible, incompatible category selection.
    if (categories.data && category && !categoryOptions.some(item => item.id === category)) setCategory('');
  }, [categories.data, categoryOptions, category]);
  useEffect(() => { if (open) { setWhen(localInputNow(me.data?.timezone ?? browserTimezone())); mutation.reset(); } }, [open, me.data?.timezone]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mutation.isPending) return;
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

  return <Modal open={open} onClose={onClose} closeDisabled={mutation.isPending} title="Quick add" description="Add spending, income or a refund. Transfers move money between your own accounts.">
    <form className="grid gap-5" onSubmit={submit}>
      <ScrollRail activeValue={mode} className="entry-types" role="radiogroup" aria-label={t('Entry type')} onKeyDown={event => {
        const index = modes.findIndex(item => item.value === mode);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? modes.length - 1 : ['ArrowRight', 'ArrowDown'].includes(event.key) ? (index + 1) % modes.length : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? (index + modes.length - 1) % modes.length : -1;
        if (next < 0) return;
        event.preventDefault();
        setMode(modes[next]!.value);
        event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus({ preventScroll: true });
      }}>{modes.map((item) => <button key={item.value} type="button" role="radio" aria-label={t(item.label)} data-scroll-item disabled={mutation.isPending} tabIndex={mode === item.value ? 0 : -1} aria-checked={mode === item.value} onClick={() => setMode(item.value)} className={`control-press entry-type grid min-h-16 snap-start place-items-center gap-1 rounded-2xl px-2 py-2 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent active:scale-[.97] sm:min-h-[4.25rem] ${mode === item.value ? 'bg-brand text-white shadow-[0_8px_20px_rgba(16,42,44,.18)]' : 'bg-surface text-muted ring-1 ring-inset ring-brand/10 hover:bg-brand/[.055] hover:text-ink'}`}><item.icon aria-hidden="true" className="size-[1.1rem]" /><span>{t(item.label)}</span></button>)}</ScrollRail>
      {accounts.isPending && <p role="status" className="text-sm text-muted">{t("Loading accounts…")}</p>}
      {accounts.isError && <ErrorState error={accounts.error} retry={() => accounts.refetch()} />}
      {categories.isError && mode !== "transfer" && <ErrorState error={categories.error} retry={() => categories.refetch()} />}
      {mode === "asset_purchase" && assets.isError && <ErrorState error={assets.error} retry={() => assets.refetch()} />}
      {mode === "liability_payment" && liabilities.isError && <ErrorState error={liabilities.error} retry={() => liabilities.refetch()} />}
      <Field label="Amount"><div className="relative"><Input className="money-value h-14 pr-16 text-2xl font-bold tracking-tight sm:h-16 sm:text-3xl" inputMode="decimal" pattern="\d+([.,]\d{1,4})?" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} required /><span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rounded-lg bg-brand/[.06] px-2 py-1 text-xs font-bold text-muted">{currency}</span></div></Field>
      {needsSource && <Field label={mode === 'transfer' ? 'From account' : 'Pay from'}><Select disabled={accounts.isPending || (accounts.isError && !accounts.data)} value={source} onChange={(event) => setSource(event.target.value)} required><option value="">Choose account</option>{activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}</Select></Field>}
      {needsDestination && <Field label={mode === 'transfer' ? 'To account' : 'Receive into'} error={invalidTransfer ? 'Choose different accounts with the same currency.' : undefined}><Select disabled={accounts.isPending || (accounts.isError && !accounts.data)} value={destination} onChange={(event) => setDestination(event.target.value)} required><option value="">Choose account</option>{activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}</Select></Field>}
      {mode === 'asset_purchase' && <Field label="Asset"><Select disabled={assets.isPending || (assets.isError && !assets.data)} value={asset} onChange={(event) => setAsset(event.target.value)} required><option value="">Choose asset</option>{assets.data?.filter((item) => item.currency === currency && !item.isArchived).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>}
      {mode === 'liability_payment' && <Field label="Liability"><Select disabled={liabilities.isPending || (liabilities.isError && !liabilities.data)} value={liability} onChange={(event) => setLiability(event.target.value)} required><option value="">Choose liability</option>{liabilities.data?.filter((item) => item.currency === currency && item.status === 'active').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>}
      {['expense', 'income', 'refund', 'amortized', 'asset_purchase', 'liability_payment'].includes(mode) && <Field label="Category" hint="What kind of spending or income was this? Optional, but useful for your spending breakdown."><Select disabled={categories.isPending || (categories.isError && !categories.data)} value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Uncategorized</option>{categoryOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>}
      {mode === 'amortized' && <div className="rounded-2xl border border-amber-200/60 bg-amber-50/80 p-4 shadow-sm"><Field label="Expected use (days)" hint="Your balance and spending include the full price today. The daily cost is also spread over the days you use it."><Input type="number" inputMode="numeric" min="1" max="36500" value={days} onChange={(event) => setDays(event.target.value)} required /></Field></div>}
      <Field label={`${t('Date & time')} · ${me.data?.timezone ?? ''}`} hint={me.data?.timezone !== browserTimezone() ? t('Your device is in {timezone}; this entry uses your profile timezone.', {timezone: browserTimezone()}) : undefined}><Input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} required /></Field>
      <Field label="Note" hint="Optional"><Input value={description} maxLength={2000} onChange={(event) => setDescription(event.target.value)} placeholder="What was this for?" /></Field>
      {accounts.isSuccess && activeAccounts.length === 0 && <p className="rounded-2xl border border-amber-200/60 bg-amber-50 p-3 text-sm text-amber-900">{t('Create a money account before adding an entry.')}</p>}
      <FormError error={mutation.error} />
      <div className="modal-actions"><Button type="button" variant="secondary" className="flex-1" disabled={mutation.isPending} onClick={onClose}>Cancel</Button><Button type="submit" className="flex-1" loading={mutation.isPending} disabled={!online || activeAccounts.length === 0 || invalidTransfer}>{!online ? 'Offline' : 'Save entry'}</Button></div>
    </form>
  </Modal>;
}
