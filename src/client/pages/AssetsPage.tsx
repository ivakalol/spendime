import { Archive, ArrowDownUp, BarChart3, Pencil, Plus, TrendingDown, TrendingUp, X } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import {
  useAccounts, useAddContribution, useAddValuation, useArchiveAsset,
  useAssetContributions, useAssets, useAssetValuations, useCreateAsset,
  useMe, useUpdateAssetValuation,
} from '../api/queries';
import type { Asset, AssetInput, AssetValuation } from '../api/types';
import {
  Badge, Button, Card, EmptyState, ErrorState, Field, FormError, Input,
  LoadingState, Modal, PageHeader, Select,
} from '../components/ui';
import { decimalToChartNumber } from '../utils/chartAdapter';
import { browserTimezone, formatInTimezone, localInputNow, todayInTimezone, zonedInputToIso } from '../utils/dateTime';
import { decimalSign, formatMoney, formatPercent } from '../utils/money';
import { useLanguage } from '../i18n';

export default function AssetsPage() {
  const query = useAssets(true);
  const [create, setCreate] = useState(false);
  const [selected, setSelected] = useState<Asset | null>(null);
  return <>
    <PageHeader eyebrow="Ownership" title="Assets" description="Principal, market value, and gain/loss stay separate—especially across repeated contributions." action={<Button onClick={() => setCreate(true)}><Plus className="size-4" />New</Button>} />
    {query.isPending ? <LoadingState /> : query.isError ? <ErrorState error={query.error} retry={() => query.refetch()} /> : query.data.length === 0 ? <EmptyState icon={<BarChart3 />} title="No assets yet" description="Add an investment, depreciating item, or custom asset to track its value over time." action={<Button onClick={() => setCreate(true)}>Create asset</Button>} /> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{query.data.map((asset) => <button key={asset.id} onClick={() => setSelected(asset)} className="group rounded-3xl text-left outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas active:scale-[.99]"><AssetCard asset={asset} /></button>)}</div>}
    <CreateAsset open={create} onClose={() => setCreate(false)} />
    {selected && <AssetDetail asset={selected} onClose={() => setSelected(null)} />}
  </>;
}

export function AssetCard({ asset }: { asset: Asset }) {
  const {t}=useLanguage();
  const sign = decimalSign(asset.absoluteReturn);
  return <Card className={`card-lift h-full overflow-hidden ${asset.isArchived ? 'opacity-50' : ''}`}>
    <div aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 ${asset.classification === 'appreciating' ? 'bg-emerald-500' : asset.classification === 'depreciating' ? 'bg-amber-500' : 'bg-blue-500'}`} />
    <div className="flex items-center justify-between"><span className={`grid size-11 place-items-center rounded-2xl ring-1 ring-inset ring-black/[.035] ${asset.classification === 'appreciating' ? 'bg-emerald-50 text-emerald-800' : asset.classification === 'depreciating' ? 'bg-amber-50 text-amber-900' : 'bg-blue-50 text-blue-800'}`}>{asset.classification === 'depreciating' ? <TrendingDown /> : <TrendingUp />}</span><Badge>{asset.isArchived ? 'Archived' : asset.classification}</Badge></div>
    <h2 className="mt-5 font-bold tracking-tight">{asset.name}</h2>
    <p className="money-value mt-1 text-2xl font-bold">{formatMoney(asset.currentValue, asset.currency)}</p>
    <p className="mt-3 text-xs text-muted">{t('Contributed')} {formatMoney(asset.cumulativePrincipal, asset.currency)}</p>
    <p className={`mt-0.5 text-sm font-semibold ${sign > 0 ? 'text-emerald-800' : sign < 0 ? 'text-rose-800' : 'text-muted'}`}>{sign > 0 ? '▲' : sign < 0 ? '▼' : '—'} {formatMoney(asset.absoluteReturn, asset.currency)} · {formatPercent(asset.percentageReturn)}</p>
  </Card>;
}

function CreateAsset({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useMe();
  const mutation = useCreateAsset();
  const initial = () => ({
    name: '', classification: 'appreciating', currency: me.data?.baseCurrency ?? 'EUR',
    acquisitionDate: todayInTimezone(me.data?.timezone ?? 'UTC'), initialContribution: '', currentValue: '',
    depreciation: 'none', usefulLifeDays: null, residualValue: null, notes: null,
  } satisfies AssetInput);
  const [form, setForm] = useState<AssetInput>(initial);
  useEffect(() => { if (open) { setForm(initial()); mutation.reset(); } }, [open]);
  return <Modal open={open} onClose={onClose} title="New asset" description="The initial contribution becomes the first immutable cost-basis event.">
    <form className="grid gap-4" onSubmit={(event: FormEvent) => { event.preventDefault(); mutation.mutate(form, { onSuccess: onClose }); }}>
      <Field label="Name"><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
      <div className="grid grid-cols-2 gap-3"><Field label="Classification"><Select value={form.classification} onChange={(event) => setForm({ ...form, classification: event.target.value as Asset['classification'] })}><option value="appreciating">Appreciating</option><option value="depreciating">Depreciating</option><option value="custom">Custom</option></Select></Field><Field label="Currency"><Input value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} pattern="[A-Z]{3}" required /></Field></div>
      <div className="grid grid-cols-2 gap-3"><Field label="Initial contribution"><Input inputMode="decimal" value={form.initialContribution} onChange={(event) => setForm({ ...form, initialContribution: event.target.value, currentValue: form.currentValue || event.target.value })} required /></Field><Field label="Current value"><Input inputMode="decimal" value={form.currentValue} onChange={(event) => setForm({ ...form, currentValue: event.target.value })} required /></Field></div>
      <Field label="Acquisition date"><Input type="date" value={form.acquisitionDate} onChange={(event) => setForm({ ...form, acquisitionDate: event.target.value })} required /></Field>
      {form.classification === 'depreciating' && <><Field label="Depreciation model"><Select value={form.depreciation} onChange={(event) => setForm({ ...form, depreciation: event.target.value as Asset['depreciation'], usefulLifeDays: event.target.value === 'straight_line' ? 365 : null })}><option value="none">None</option><option value="straight_line">Straight line</option></Select></Field>{form.depreciation === 'straight_line' && <Field label="Useful life in days"><Input type="number" min="1" value={form.usefulLifeDays ?? ''} onChange={(event) => setForm({ ...form, usefulLifeDays: parseInt(event.target.value, 10) })} required /></Field>}</>}
      <Field label="Notes" hint="Optional"><Input value={form.notes ?? ''} onChange={(event) => setForm({ ...form, notes: event.target.value || null })} /></Field>
      <FormError error={mutation.error} /><Button disabled={mutation.isPending}>{mutation.isPending ? 'Creating…' : 'Create asset'}</Button>
    </form>
  </Modal>;
}

function AssetDetail({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const {t}=useLanguage();
  const contributions = useAssetContributions(asset.id);
  const valuations = useAssetValuations(asset.id);
  const accounts = useAccounts(false);
  const me = useMe();
  const timezone = me.data?.timezone ?? browserTimezone();
  const addContribution = useAddContribution(asset.id);
  const addValuation = useAddValuation(asset.id);
  const archive = useArchiveAsset();
  const [tab, setTab] = useState<'overview' | 'contribute' | 'value'>('overview');
  const [amount, setAmount] = useState('');
  const [account, setAccount] = useState('');
  const [current, setCurrent] = useState('');
  const [when, setWhen] = useState(() => localInputNow(timezone));
  const [value, setValue] = useState(asset.currentValue);
  const [note, setNote] = useState('');
  const [editingValuation, setEditingValuation] = useState<AssetValuation | null>(null);
  const updateValuation = useUpdateAssetValuation(asset.id, editingValuation?.id ?? '');
  useEffect(() => setWhen(localInputNow(timezone)), [timezone, asset.id]);
  const latest = useAssets(true).data?.find((item) => item.id === asset.id) ?? asset;
  const valuationChart = [...(valuations.data?.data ?? [])].reverse().map((item) => ({ date: item.valuedAt.slice(0, 10), value: decimalToChartNumber(item.value), exact: item.value }));
  const chooseValuation = (item: AssetValuation | null) => {
    setEditingValuation(item);
    setValue(item?.value ?? latest.currentValue);
    setNote(item?.note ?? '');
    updateValuation.reset();
  };
  const changeTab = (next: typeof tab) => {
    setTab(next);
    if (next === 'value') { chooseValuation(null); setWhen(localInputNow(timezone)); }
  };

  return <Modal open title={latest.name} description={`${t(latest.classification)} · ${t('simple return on cumulative contributed principal')}`} onClose={onClose}>
    <div className="grid grid-cols-3 gap-2">{(['overview', 'contribute', 'value'] as const).map((item) => <button key={item} onClick={() => changeTab(item)} className={`min-h-10 rounded-xl text-xs font-semibold capitalize ${tab === item ? 'bg-brand text-white' : 'bg-white text-muted'}`}>{t(item === 'value' ? 'Valuation' : item === 'overview' ? 'Overview' : 'Contribute')}</button>)}</div>

    {tab === 'overview' && <div className="mt-5 grid gap-4">
      <div className="grid grid-cols-2 gap-3"><Summary label="Contributed principal" value={formatMoney(latest.cumulativePrincipal, latest.currency)} /><Summary label="Market value" value={formatMoney(latest.currentValue, latest.currency)} /><Summary label="Absolute gain/loss" value={formatMoney(latest.absoluteReturn, latest.currency)} /><Summary label="Simple return" value={formatPercent(latest.percentageReturn)} /></div>
      {valuationChart.length > 0 && <Card><h3 className="text-sm font-semibold">{t('Valuation history')}</h3><div className="mt-3 h-40"><ResponsiveContainer><AreaChart data={valuationChart}><XAxis dataKey="date" tick={{ fontSize: 10 }} /><Tooltip formatter={(_, __, entry) => formatMoney(String(entry.payload.exact), latest.currency)} /><Area dataKey="value" stroke="#27846f" fill="#27846f33" /></AreaChart></ResponsiveContainer></div></Card>}
      <div><h3 className="mb-2 text-sm font-semibold">{t('Contribution history')}</h3>{contributions.isPending ? <LoadingState /> : <div className="grid gap-2">{contributions.data?.data.map((item) => <div key={item.id} className={`flex justify-between rounded-2xl bg-white p-3 ${item.voidedAt ? 'opacity-50' : ''}`}><div><p className="text-sm font-semibold">{formatMoney(item.amount, item.currency)}</p><p className="text-xs text-muted">{formatInTimezone(item.contributedAt, timezone)}</p></div><Badge tone={item.transactionId ? 'info' : 'neutral'}>{item.transactionId ? 'Account purchase' : 'Principal only'}</Badge></div>)}</div>}</div>
      {!latest.isArchived && <Button variant="danger" onClick={() => archive.mutate(latest.id, { onSuccess: onClose })}><Archive className="size-4" />Archive asset</Button>}
    </div>}

    {tab === 'contribute' && <form className="mt-5 grid gap-4" onSubmit={(event) => { event.preventDefault(); addContribution.mutate({ amount, currency: latest.currency, contributedAt: zonedInputToIso(when, timezone), note: note || null, sourceAccountId: account || null, ...(current ? { currentValue: current } : {}) }, { onSuccess: () => setTab('overview') }); }}>
      <Field label="Contribution"><Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required /></Field>
      <Field label="Source account" hint="Optional. Selecting one also creates an asset-purchase cash transaction."><Select value={account} onChange={(event) => setAccount(event.target.value)}><option value="">Principal only — no cash transaction</option>{accounts.data?.filter((item) => item.currency === latest.currency).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
      <Field label="Current market value" hint="Optional after this contribution"><Input inputMode="decimal" value={current} onChange={(event) => setCurrent(event.target.value)} /></Field>
      <Field label={`${t('Contributed at')} · ${timezone}`}><Input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} required /></Field>
      <Field label="Note"><Input value={note} onChange={(event) => setNote(event.target.value)} /></Field>
      <FormError error={addContribution.error} /><Button disabled={addContribution.isPending}>{addContribution.isPending ? 'Adding…' : 'Add contribution'}</Button>
    </form>}

    {tab === 'value' && <div className="mt-5 grid gap-5">
      <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); if (editingValuation) { updateValuation.mutate({ value, note: note || null }, { onSuccess: () => chooseValuation(null) }); } else { addValuation.mutate({ value, valuedAt: zonedInputToIso(when, timezone), note: note || null, setAsCurrent: true }, { onSuccess: () => setTab('overview') }); } }}>
        {editingValuation && <div className="flex items-center justify-between rounded-2xl bg-brand/[.06] px-3 py-2 text-sm"><span>{t('Editing')} {formatInTimezone(editingValuation.valuedAt, timezone)}</span><Button type="button" variant="ghost" className="size-9 min-h-9 px-0" onClick={() => chooseValuation(null)} aria-label={t('Cancel valuation edit')}><X className="size-4" /></Button></div>}
        <Field label={editingValuation ? 'Valuation' : 'Current market value'}><Input inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} required /></Field>
        {!editingValuation && <Field label={`${t('Valued at')} · ${timezone}`}><Input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} required /></Field>}
        <Field label="Note"><Input value={note} onChange={(event) => setNote(event.target.value)} /></Field>
        <FormError error={editingValuation ? updateValuation.error : addValuation.error} />
        <Button disabled={editingValuation ? updateValuation.isPending : addValuation.isPending}><ArrowDownUp className="size-4" />{editingValuation ? (updateValuation.isPending ? 'Saving…' : 'Save valuation') : (addValuation.isPending ? 'Saving…' : 'Record valuation')}</Button>
      </form>
      <div><h3 className="mb-2 text-sm font-semibold">{t('Valuation history')}</h3><div className="grid gap-2">{valuations.data?.data.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white p-3"><div><p className="money-value text-sm font-semibold">{formatMoney(item.value, latest.currency)}</p><p className="text-xs text-muted">{formatInTimezone(item.valuedAt, timezone)}{item.note ? ` · ${item.note}` : ''}</p></div>{!latest.isArchived && <Button type="button" variant="ghost" className="size-10 min-h-10 shrink-0 px-0" onClick={() => chooseValuation(item)} aria-label={t('Edit valuation from {date}', {date: formatInTimezone(item.valuedAt, timezone)})}><Pencil className="size-4" /></Button>}</div>)}</div></div>
    </div>}
  </Modal>;
}

function Summary({ label, value }: { label: string; value: string }) {
  const {t}=useLanguage();
  return <div className="rounded-2xl border border-brand/[.06] bg-surface p-3.5 shadow-sm"><p className="text-xs text-muted">{t(label)}</p><p className="money-value mt-1 font-bold">{value}</p></div>;
}
