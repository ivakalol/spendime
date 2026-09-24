import { Globe2, Languages, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMe } from '../api/queries';
import { Card, Field, PageHeader, Select } from '../components/ui';
import { useLanguage, type Language } from '../i18n';
import { browserTimezone } from '../utils/dateTime';

export default function SettingsPage() {
  const me = useMe();
  const { language, setLanguage, t } = useLanguage();
  return <>
    <PageHeader eyebrow={t('Profile')} title={t('Settings')} description={t('Your financial calendar follows the profile timezone stored on the server.')} />
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><h2 className="font-bold">{t('Account')}</h2><dl className="mt-4 grid gap-4 text-sm"><div><dt className="text-muted">{t('Name')}</dt><dd className="font-semibold">{me.data?.displayName}</dd></div><div><dt className="text-muted">{t('Email')}</dt><dd className="font-semibold">{me.data?.email}</dd></div><div><dt className="text-muted">{t('Base currency')}</dt><dd className="font-semibold">{me.data?.baseCurrency}</dd></div></dl></Card>
      <Card><div className="flex gap-3"><Globe2 className="text-accent" /><div><h2 className="font-bold">{t('Timezone')}</h2><p className="text-sm text-muted">{t('Profile:')} <strong>{me.data?.timezone}</strong></p><p className="text-sm text-muted">{t('This device:')} {browserTimezone()}</p><p className="mt-3 text-xs text-muted">{t('Browser detection is informational only and never overwrites your stored IANA timezone.')}</p></div></div></Card>
      <Card className="lg:col-span-2"><div className="flex gap-3"><Languages className="text-accent" /><div className="min-w-0 flex-1"><h2 className="font-bold">{t('Language')}</h2><div className="mt-3 max-w-sm"><Field label={t('Interface language')} hint={t('Language preference is saved on this device.')}><Select value={language} onChange={(event) => setLanguage(event.target.value as Language)}><option value="en">{t('English')}</option><option value="bg">{t('Bulgarian')}</option></Select></Field></div></div></div></Card>
      <Card className="lg:col-span-2"><div className="flex gap-3"><ShieldCheck className="text-emerald-700" /><div><h2 className="font-bold">{t('Private session')}</h2><p className="text-sm text-muted">{t('Authentication uses a revocable, server-side session with a secure HttpOnly cookie. Spendime stores no token or financial dataset in localStorage, sessionStorage, or IndexedDB.')}</p></div></div><div className="mt-4 flex gap-3"><LockKeyhole className="text-brand" /><p className="text-sm text-muted">{t('Profile editing is intentionally deferred because the backend does not yet expose a profile update endpoint.')}</p></div></Card>
      <Card className="lg:col-span-2"><div className="flex gap-3"><ShieldCheck className="text-emerald-700" /><div><h2 className="font-bold">{t('Private session')}</h2><p className="text-sm text-muted">{t('Authentication uses a revocable, server-side session with a secure HttpOnly cookie. Spendime stores no token or financial dataset in localStorage, sessionStorage, or IndexedDB.')}</p></div></div><div className="mt-4 flex gap-3"><LockKeyhole className="text-brand" /><p className="text-sm text-muted">{t('Profile editing is intentionally deferred because the backend does not yet expose a profile update endpoint.')}</p></div></Card>
      <Card className="lg:col-span-2"><h2 className="font-bold">Legal information</h2><p className="mt-2 flex flex-wrap gap-4 text-sm"><Link className="font-semibold text-brand underline" to="/privacy">Privacy Policy</Link><Link className="font-semibold text-brand underline" to="/terms">Terms of Service</Link></p></Card>
    </div>
  </>;
}
