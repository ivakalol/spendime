import { CloudOff, Download, RefreshCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from './ui';

export function PwaStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const { needRefresh: [needRefresh, setNeedRefresh], offlineReady: [offlineReady, setOfflineReady], updateServiceWorker } = useRegisterSW({ onRegisteredSW(_url, registration) { if (registration) setInterval(() => registration.update(), 60 * 60 * 1000); } });
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return <>
    {!online && <div role="status" className="app-toast animate-enter fixed inset-x-3 top-[max(.75rem,env(safe-area-inset-top))] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-white/10 bg-amber-950/95 px-4 py-3 text-sm text-white shadow-2xl backdrop-blur"><CloudOff className="size-5 shrink-0" /><span><strong>Offline.</strong> Loaded screens remain available, but financial changes are disabled.</span></div>}
    {(needRefresh || offlineReady) && <div role="status" className="app-toast animate-enter fixed inset-x-3 bottom-[var(--mobile-nav-clearance)] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-white/10 bg-brand/95 p-3 text-sm text-white shadow-2xl backdrop-blur lg:bottom-5"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/10">{needRefresh ? <RefreshCw className="size-4" /> : <Download className="size-4" />}</span><span className="flex-1">{needRefresh ? 'New version available — update when ready.' : 'App shell is ready for offline launch.'}</span>{needRefresh && <Button className="min-h-9 bg-white px-3 text-brand shadow-none hover:bg-white/90" onClick={() => updateServiceWorker(true)}>Update</Button>}<button className="control-press grid size-9 shrink-0 place-items-center rounded-xl outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white active:scale-95" onClick={() => { setNeedRefresh(false); setOfflineReady(false); }} aria-label="Dismiss"><X className="size-4" /></button></div>}
  </>;
}
