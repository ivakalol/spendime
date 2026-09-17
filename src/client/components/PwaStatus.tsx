import { CloudOff } from 'lucide-react';
import { useEffect, useState } from 'react';

export function PwaStatus() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // updateViaCache: 'none' makes the browser revalidate sw.js and all of its
    // imports, independently of Safari's normal HTTP cache. Existing clients
    // reload once when the new worker takes control; first-time installs do not.
    const hadControllerAtStartup = Boolean(navigator.serviceWorker.controller);
    let reloadStarted = false;
    const handleControllerChange = () => {
      if (!hadControllerAtStartup || reloadStarted) return;
      reloadStarted = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    void navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((registration) => registration.update())
      .catch(() => {
        // PWA registration failure must not prevent the online application
        // from loading. The next launch performs the same update check.
      });

    return () => navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
  }, []);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return <>
    {!online && <div role="status" className="app-toast animate-enter fixed inset-x-3 top-[max(.75rem,env(safe-area-inset-top))] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-white/10 bg-amber-950/95 px-4 py-3 text-sm text-white shadow-2xl backdrop-blur"><CloudOff className="size-5 shrink-0" /><span><strong>Offline.</strong> Loaded screens remain available, but financial changes are disabled.</span></div>}
  </>;
}
