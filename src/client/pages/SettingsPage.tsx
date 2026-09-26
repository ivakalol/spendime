import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMe, useSavePreferences } from '../api/queries';
import { CurrencySelect } from '../components/CurrencySelect';
import { Button, Card, ErrorState, Field, FormError, Input, LoadingState, PageHeader, Select } from '../components/ui';
import { useLanguage, type Language } from '../i18n';
import { browserTimezone } from '../utils/dateTime';

export default function SettingsPage() {
  const me=useMe(),save=useSavePreferences();
  const {language,setLanguage,t}=useLanguage();
  const [currency,setCurrency]=useState('EUR');
  const [timezone,setTimezone]=useState('UTC');
  useEffect(()=>{if(me.data){setCurrency(me.data.baseCurrency);setTimezone(me.data.timezone);}},[me.data?.baseCurrency,me.data?.timezone]);
  if(me.isPending)return <LoadingState/>;
  if(me.isError)return <ErrorState error={me.error} retry={()=>me.refetch()}/>;
  return <><PageHeader eyebrow="Preferences" title="Settings" description="Make Spendime work for the way you manage your money."/>
    <div className="grid items-start gap-5 xl:grid-cols-2"><Card><h2 className="font-bold">Money & dates</h2><form className="mt-5 grid gap-5" onSubmit={event=>{event.preventDefault();save.mutate({baseCurrency:currency,timezone});}}>
      <Field label="Reporting currency" hint="Used for new accounts and your default dashboard view. Existing amounts and account currencies never change."><CurrencySelect value={currency} onChange={value=>{setCurrency(value);save.reset();}}/></Field>
      <p className="text-sm text-muted">Spendime keeps currencies separate. Selecting a reporting currency does not convert your balances.</p>
      <Field label="Timezone" hint="Controls dates and reporting periods. Changing it may move transactions near midnight into a different day."><Input list="timezones" value={timezone} onChange={event=>{setTimezone(event.target.value);save.reset();}} required/><datalist id="timezones"><option value="UTC"/>{Intl.supportedValuesOf('timeZone').map(zone=><option key={zone} value={zone}/>)}</datalist></Field>
      <Button type="button" variant="ghost" onClick={()=>{setTimezone(browserTimezone());save.reset();}}>Use device timezone ({browserTimezone()})</Button>
      <FormError error={save.error}/>{save.isSuccess&&<p role="status" className="text-sm text-emerald-800">Preferences saved.</p>}<Button loading={save.isPending}>Save preferences</Button>
    </form></Card>
    <div className="grid gap-5"><Card><h2 className="font-bold">Your profile</h2><dl className="mt-4 grid gap-4 text-sm"><div><dt className="text-muted">Name</dt><dd className="font-semibold">{me.data?.displayName}</dd></div><div><dt className="text-muted">Email</dt><dd className="break-words font-semibold">{me.data?.email}</dd></div></dl></Card>
    <Card><h2 className="mb-4 font-bold">Language</h2><Field label={t('Interface language')} hint={t('Language preference is saved on this device.')}><Select value={language} onChange={event=>setLanguage(event.target.value as Language)}><option value="en">English</option><option value="bg">Bulgarian</option></Select></Field></Card>
    <Card><h2 className="font-bold">Privacy & security</h2><p className="mt-2 text-sm leading-relaxed text-muted">Your financial data belongs to your account. Sign out on shared devices when you are finished.</p><p className="mt-4 flex flex-wrap gap-4 text-sm"><Link className="font-semibold underline" to="/privacy">Privacy Policy</Link><Link className="font-semibold underline" to="/terms">Terms of Service</Link></p></Card></div></div>
  </>;
}
