import { ArrowLeft, ArrowRight, ArrowUpRight, Monitor, Smartphone } from 'lucide-react';
import { useRef, useState, type TouchEvent } from 'react';
import { desktopViews, mobileViews, screenshotUrl, screenshotViews, type ScreenshotView } from './screenshots';
import { usePhoneLayout } from './usePhoneLayout';

export function ScreenshotGallery() {
  const phone = usePhoneLayout();
  const [choice, setChoice] = useState<'desktop' | 'mobile' | null>(null);
  const [screen, setScreen] = useState<ScreenshotView>('Dashboard');
  const device = choice ?? (phone ? 'mobile' : 'desktop');
  const views: readonly ScreenshotView[] = device === 'mobile' ? mobileViews : desktopViews;
  const selected = views.includes(screen) ? screen : 'Dashboard';
  const index = views.indexOf(selected);
  const current = screenshotViews[selected];
  const file = device === 'mobile' ? current.mobile : current.desktop;
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const move = (delta: number) => setScreen(views[(index + delta + views.length) % views.length]!);
  const touchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    start.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
    swiped.current = false;
  };
  const touchEnd = (event: TouchEvent) => {
    const touch = event.changedTouches[0];
    if (!start.current || !touch || device !== 'mobile') return;
    const dx = touch.clientX - start.current.x, dy = touch.clientY - start.current.y;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      swiped.current = true;
      move(dx < 0 ? 1 : -1);
    }
    start.current = null;
  };
  return <>
    <div className="sp-capture-controls">
      <div className="sp-device-toggle" role="group" aria-label="Screenshot device">
        <button aria-pressed={device === 'desktop'} onClick={() => setChoice('desktop')}><Monitor size={16} />Desktop</button>
        <button aria-pressed={device === 'mobile'} onClick={() => setChoice('mobile')}><Smartphone size={16} />Mobile</button>
      </div>
      <div className="sp-screenshot-tabs" role="group" aria-label="Screenshot views">{views.map(name => <button key={name} aria-pressed={selected === name} onClick={() => setScreen(name)}>{name}</button>)}</div>
    </div>
    <div className="sp-gallery-carousel" role="region" aria-roledescription={device === 'mobile' ? 'carousel' : undefined} aria-label="Spendime product screenshots" tabIndex={0}
      onKeyDown={event => { if (device === 'mobile' && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1); } }}>
      <figure className={`sp-capture-stage sp-capture-${device}`}>
        <div className="sp-capture-frame" onTouchStart={touchStart} onTouchEnd={touchEnd} onTouchCancel={() => { start.current = null; }}>
          <div className="sp-capture-browser"><span aria-hidden="true">● ● ●</span><span>Spendime / {device === 'mobile' ? `Mobile ${selected}` : selected}</span><span>FICTIONAL SAMPLE DATA</span></div>
          <a href={screenshotUrl(file)} target="_blank" rel="noreferrer" aria-label="Enlarge screenshot in a new tab" onClick={event => { if (swiped.current) { event.preventDefault(); swiped.current = false; } }}>
            <img key={file} src={screenshotUrl(file)} alt={`${device === 'mobile' ? 'Mobile' : 'Desktop'} ${current.alt}`} width={device === 'mobile' ? 390 : 1430} height={device === 'mobile' ? 844 : selected === 'Dashboard' ? 1814 : 1100} loading="lazy" decoding="async" />
          </a>
        </div>
        {device === 'mobile' && <figcaption className="sp-mobile-capture-copy"><span className="sp-eyebrow">THE REAL APP, ON A SMALLER SCREEN</span><h3>Your everyday<br />money companion.</h3><p>Responsive charts, mobile navigation and quick transaction entry. Installable as a web app on supported browsers.</p><span>Actual interface. Entirely fictional records.</span></figcaption>}
      </figure>
      {device === 'mobile' && <div className="sp-gallery-pagination"><button onClick={() => move(-1)} aria-label="Previous mobile screenshot"><ArrowLeft size={19} /></button><span aria-live="polite">{selected} <small>{index + 1} / {views.length}</small></span><button onClick={() => move(1)} aria-label="Next mobile screenshot"><ArrowRight size={19} /></button></div>}
    </div>
    <div className="sp-capture-caption"><p>Captured from the real application using isolated, fictional fixtures. No personal records or bank connections.</p><a href={screenshotUrl(file)} target="_blank" rel="noreferrer">View full screenshot <ArrowUpRight size={14} /></a></div>
  </>;
}
