import { CalendarDays, Check, Globe2, Save, ShieldCheck, UserRound } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { budgetMonthWindow } from '../../shared/budgetMonth';
import { useMe, useSavePreferences } from '../api/queries';
import { CurrencySelect } from '../components/CurrencySelect';
import { Button, Card, ErrorState, Field, FormError, Input, LoadingState, PageHeader, Select } from '../components/ui';
import { useLanguage, type Language } from '../i18n';
import { browserTimezone, todayInTimezone } from '../utils/dateTime';

export default function SettingsPage() {
  const me = useMe(), save = useSavePreferences();
  const { language, setLanguage, t } = useLanguage();
  const [currency, setCurrency] = useState('EUR');
  const [timezone, setTimezone] = useState('UTC');
  const [customMonthEnabled, setCustomMonthEnabled] = useState(false);
  const [monthStartDay, setMonthStartDay] = useState(1);
  const switchId = useId(), hintId = useId();
  useEffect(() => {
    if (me.data) {
      setCurrency(me.data.baseCurrency);
      setTimezone(me.data.timezone);
      setCustomMonthEnabled(me.data.customMonthEnabled ?? false);
      setMonthStartDay(me.data.monthStartDay ?? 1);
    }
  }, [me.data?.baseCurrency, me.data?.timezone, me.data?.customMonthEnabled, me.data?.monthStartDay]);
  if (me.isPending) return <LoadingState />;
  if (me.isError) return <ErrorState error={me.error} retry={() => me.refetch()} />;
  // Keep the preview usable while someone is typing an incomplete timezone.
  let today: string;
  try { today = todayInTimezone(timezone); } catch { today = todayInTimezone(me.data?.timezone ?? 'UTC'); }
  const preview = budgetMonthWindow(today, monthStartDay);
  const date = (value: string) => new Intl.DateTimeFormat(language === 'bg' ? 'bg-BG' : 'en-US', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`));
  const dirty = currency !== me.data?.baseCurrency || timezone !== me.data?.timezone ||
    customMonthEnabled !== (me.data?.customMonthEnabled ?? false) || monthStartDay !== (me.data?.monthStartDay ?? 1);
  return <>
    <PageHeader eyebrow="Preferences" title="Settings" description="Make Spendime work for the way you manage your money." />
    <div className="grid items-start gap-4 sm:gap-5 xl:grid-cols-2">
      <Card>
        <h2 className="flex items-center gap-2 font-bold"><CalendarDays className="size-5 text-accent" />{t('Money & dates')}</h2>
        <form className="mt-5 grid gap-5" onSubmit={event => {
          event.preventDefault();
          if (!save.isPending) save.mutate({ baseCurrency: currency, timezone, customMonthEnabled, monthStartDay });
        }}>
          <fieldset disabled={save.isPending} className="grid min-w-0 gap-5">
          <Field label="Reporting currency" hint="Used for new accounts and your default dashboard view. Existing amounts and account currencies never change.">
            <CurrencySelect value={currency} onChange={value => { setCurrency(value); save.reset(); }} />
          </Field>
          <Field label="Timezone" hint="Controls dates and reporting periods. Changing it may move transactions near midnight into a different day.">
            <Input list="timezones" value={timezone} onChange={event => { setTimezone(event.target.value); save.reset(); }} required />
            <datalist id="timezones"><option value="UTC" />{Intl.supportedValuesOf('timeZone').map(zone => <option key={zone} value={zone} />)}</datalist>
          </Field>
          <Button type="button" variant="secondary" className="w-full whitespace-normal text-left" onClick={() => { setTimezone(browserTimezone()); save.reset(); }}>
            <Globe2 className="size-4" />{t('Use device timezone')} · {browserTimezone()}
          </Button>
          <div className={`rounded-2xl border p-4 transition-colors ${customMonthEnabled ? 'border-accent/30 bg-accent/[.055]' : 'border-brand/10 bg-brand/[.025]'}`}>
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p id={switchId} className="font-semibold">{t('Custom month start')}</p>
                <p id={hintId} className="mt-1 text-sm leading-relaxed text-muted">{t('Align your Month view with payday or your personal budget cycle.')}</p>
              </div>
              <button type="button" role="switch" aria-checked={customMonthEnabled} aria-labelledby={switchId} aria-describedby={hintId}
                className="control-press flex min-h-12 min-w-14 shrink-0 items-center justify-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent"
                onClick={() => { setCustomMonthEnabled(value => !value); save.reset(); }}>
                <span aria-hidden="true" className={`flex h-7 w-12 items-center rounded-full p-1 transition-colors ${customMonthEnabled ? 'bg-brand' : 'bg-brand/20'}`}>
                  <span className={`size-5 rounded-full bg-white shadow-sm transition-transform ${customMonthEnabled ? 'translate-x-5' : ''}`} />
                </span>
              </button>
            </div>
            {customMonthEnabled ? <div className="mt-4 grid gap-4 border-t border-accent/15 pt-4">
              <Field label="Start each month on" hint="For days 29–31, shorter months use their last day.">
                <Select value={monthStartDay} onChange={event => { setMonthStartDay(Number(event.target.value)); save.reset(); }}>
                  {Array.from({ length: 31 }, (_, index) => index + 1).map(day => <option key={day} value={day}>{t('Day {day}', { day })}</option>)}
                </Select>
              </Field>
              <div className="rounded-xl bg-surface p-3 ring-1 ring-brand/5" aria-live="polite">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t('Current cycle preview')}</p>
                <p className="mt-1 font-bold">{date(preview.from)} – {date(preview.to)}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{t('Applies to the Month view after you save. Day, Week, Year and Total stay the same.')}</p>
              </div>
            </div> : <p className="mt-3 text-xs leading-relaxed text-muted">{t('Off: your Month view keeps its current rolling 30-day window.')}</p>}
          </div>
          <FormError error={save.error} />
          {save.isSuccess && <p role="status" className="flex items-center gap-2 text-sm text-emerald-800"><Check className="size-4" />{t('Preferences saved.')}</p>}
          <Button loading={save.isPending} disabled={!dirty}><Save className="size-4" />Save preferences</Button>
          </fieldset>
        </form>
      </Card>
      <div className="grid gap-4 sm:gap-5">
        <Card><h2 className="flex items-center gap-2 font-bold"><UserRound className="size-5 text-accent" />{t('Your profile')}</h2>
          <dl className="mt-4 grid gap-4 text-sm"><div><dt className="text-muted">{t('Name')}</dt><dd className="break-words font-semibold">{me.data?.displayName}</dd></div><div><dt className="text-muted">{t('Email')}</dt><dd className="break-words font-semibold">{me.data?.email}</dd></div></dl>
        </Card>
        <Card><h2 className="mb-4 flex items-center gap-2 font-bold"><Globe2 className="size-5 text-accent" />{t('Language')}</h2>
          <Field label="Interface language" hint="Language preference is saved on this device."><Select value={language} onChange={event => setLanguage(event.target.value as Language)}><option value="en">English</option><option value="bg">Bulgarian</option></Select></Field>
        </Card>
        <Card><h2 className="flex items-center gap-2 font-bold"><ShieldCheck className="size-5 text-accent" />{t('Privacy & security')}</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">{t('Your financial data belongs to your account. Sign out on shared devices when you are finished.')}</p>
          <div className="mt-3 flex flex-wrap gap-x-5 text-sm"><Link className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4" to="/privacy">Privacy Policy</Link><Link className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4" to="/terms">Terms of Service</Link></div>
        </Card>
      </div>
    </div>
  </>;
}
