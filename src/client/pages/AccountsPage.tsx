import { CurrencySelect } from '../components/CurrencySelect';
import { Archive, Pencil, Plus, RotateCcw, Trash2, WalletCards } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { useMe, useAccounts, useArchiveAccount, useCreateAccount, usePermanentlyDeleteAccount, useRestoreAccount, useUpdateAccount } from '../api/queries';
import type { Account, AccountInput } from '../api/types';
import { Badge, Button, Card, EmptyState, ErrorState, Field, FormError, Input, LoadingState, Modal, PageHeader, Select } from '../components/ui';
import { formatMoney } from '../utils/money';
import { useLanguage } from '../i18n';

const blank: AccountInput = { name: '', kind: 'checking', currency: 'EUR', openingBalance: '0', institution: null, color: '#315f61', icon: null };

export default function AccountsPage() {
  const {t}=useLanguage();
  const query = useAccounts(true);
  const [editing, setEditing] = useState<Account | null | undefined>();
  return <>
    <PageHeader eyebrow="Liquid funds" title="Money accounts" description="Cash, bank accounts and cards, each in its own currency. Balances reflect the transactions you record." action={<Button onClick={() => setEditing(null)}><Plus className="size-4" />Add account</Button>} />
    {query.isPending ? <LoadingState /> : query.isError ? <ErrorState error={query.error} retry={() => query.refetch()} /> : query.data.length === 0 ? <EmptyState icon={<WalletCards />} title="No accounts yet" description="Add cash, a card, or savings account to start recording money movement." action={<Button onClick={() => setEditing(null)}>Create account</Button>} /> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{query.data.map((item) => <Card key={item.id} className={`card-lift overflow-hidden ${item.isArchived ? 'opacity-55' : ''}`}>
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: item.color ?? '#315f61' }} />
      <div className="mb-5 flex items-start justify-between"><span className="grid size-11 place-items-center rounded-2xl text-white shadow-sm ring-1 ring-black/5" style={{ backgroundColor: item.color ?? '#315f61' }}><WalletCards className="size-5" /></span>{item.isArchived ? <Badge>Archived</Badge> : <Badge tone="info">{item.kind}</Badge>}</div>
      <h2 className="break-words font-bold tracking-tight">{item.name}</h2><p className="mt-0.5 text-sm text-muted">{item.institution || item.currency}</p>
      <p className="money-value mt-5 text-2xl font-bold">{formatMoney(item.currentBalance, item.currency)}</p><p className="mt-1 text-xs text-muted">{t('Opening')} {formatMoney(item.openingBalance, item.currency)}</p>
      {item.isArchived ? <ArchivedAccountActions account={item} /> : <Button variant="ghost" className="mt-4 -ml-2 px-2" onClick={() => setEditing(item)}><Pencil className="size-4" />Manage</Button>}
    </Card>)}</div>}
    <AccountDialog value={editing} open={editing !== undefined} onClose={() => setEditing(undefined)} />
  </>;
}

function ArchivedAccountActions({ account }: { account: Account }) {
  const {t}=useLanguage();
  const restore = useRestoreAccount(account.id);
  const remove = usePermanentlyDeleteAccount();
  const permanentlyDelete = () => {
    if (confirm(t('Permanently delete {name}? This cannot be undone.', {name: account.name}))) remove.mutate(account.id);
  };
  return <div className="mt-4 grid gap-2">
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={() => restore.mutate()} disabled={restore.isPending || remove.isPending}><RotateCcw className="size-4" />{restore.isPending ? 'Restoring…' : 'Restore'}</Button>
      <Button variant="danger" onClick={permanentlyDelete} disabled={restore.isPending || remove.isPending}><Trash2 className="size-4" />{remove.isPending ? 'Deleting…' : 'Delete permanently'}</Button>
    </div>
    <FormError error={restore.error || remove.error} />
  </div>;
}

export function AccountDialog({ value, open, onClose }: { value: Account | null | undefined; open: boolean; onClose: () => void }) {
  const me = useMe();
  const [form, setForm] = useState<AccountInput>(() => value ? toInput(value) : {...blank, currency: me.data?.baseCurrency ?? 'EUR'});
  useEffect(() => setForm(value ? toInput(value) : {...blank,currency:me.data?.baseCurrency??'EUR'}), [value, open, me.data?.baseCurrency]);
  const create = useCreateAccount();
  const update = useUpdateAccount(value?.id ?? '');
  const archive = useArchiveAccount();
  const mutation = value ? update : create;
  const submit = (event: FormEvent) => { event.preventDefault(); mutation.mutate(form, { onSuccess: onClose }); };
  return <Modal open={open} onClose={onClose} title={value ? 'Manage account' : 'New money account'}><form className="grid gap-5" onSubmit={submit}>
    <Field label="Name"><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
    <div className="grid grid-cols-2 gap-3"><Field label="Type"><Select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as Account['kind'] })}>{['cash', 'checking', 'savings', 'credit', 'investment', 'other'].map((kind) => <option key={kind}>{kind}</option>)}</Select></Field><Field label="Currency" hint={value ? "Currency is fixed to protect your account history." : "Choose the currency this account actually holds."}><CurrencySelect value={form.currency} onChange={currency => setForm({ ...form, currency })} disabled={Boolean(value)} /></Field></div>
    <Field label="Opening balance" hint="The balance before the first transaction you record here. This is not income."><Input inputMode="decimal" value={form.openingBalance} onChange={(event) => setForm({ ...form, openingBalance: event.target.value })} required /></Field>
    <Field label="Institution" hint="Optional"><Input value={form.institution ?? ''} onChange={(event) => setForm({ ...form, institution: event.target.value || null })} /></Field>
    <Field label="Color"><Input type="color" value={form.color ?? '#315f61'} onChange={(event) => setForm({ ...form, color: event.target.value })} /></Field>
    <FormError error={mutation.error || archive.error} />
    <div className="modal-actions">{value && <Button type="button" variant="danger" onClick={() => archive.mutate(value.id, { onSuccess: onClose })} disabled={archive.isPending}><Archive className="size-4" />Archive</Button>}<Button className={value ? 'ml-auto' : 'w-full'} loading={mutation.isPending}>Save account</Button></div>
  </form></Modal>;
}

function toInput(account: Account): AccountInput { return { name: account.name, kind: account.kind, currency: account.currency, openingBalance: account.openingBalance, institution: account.institution, color: account.color, icon: account.icon }; }
