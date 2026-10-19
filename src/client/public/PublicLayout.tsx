import { ArrowRight, ArrowUpRight, Menu, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMe } from '../api/queries';
import './public.css';

export function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return <Link to="/" className="sp-brand" aria-label="Spendime home" onClick={() => { onNavigate?.(); window.scrollTo({ top: 0, behavior: 'instant' }); }}><img src="/brand-mark.svg" width="35" height="35" alt="" />spendime<span aria-hidden="true">.</span></Link>;
}

export function StartLink({ className = '', arrow = true }: { className?: string; arrow?: boolean }) {
  const me = useMe();
  return <Link className={`sp-button ${className}`} to={me.data ? '/app' : '/register'}>{me.data ? 'Open Dashboard' : 'Get started'}{arrow && <ArrowUpRight size={18} aria-hidden="true" />}</Link>;
}

export function PublicLayout({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState(false);
  const { pathname, hash } = useLocation();
  const menuButton = useRef<HTMLButtonElement>(null);
  const me = useMe();
  useEffect(() => { setMenu(false); }, [pathname, hash]);
  useEffect(() => {
    if (hash) { document.getElementById(hash.slice(1))?.scrollIntoView(); }
    else window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname, hash]);
  useEffect(() => {
    if (!menu) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenu(false); menuButton.current?.focus(); } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [menu]);
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('sp-seen'); observer.unobserve(entry.target); }
    }), { threshold: .08 });
    document.querySelectorAll('.sp-reveal').forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [pathname]);
  return <div className="sp-site">
    <a className="sp-skip" href="#public-main">Skip to content</a>
    <header className="sp-header"><div className="sp-container sp-header-inner"><Brand onNavigate={() => setMenu(false)} />
      <button ref={menuButton} className="sp-menu-button" aria-label={menu ? 'Close navigation' : 'Open navigation'} aria-expanded={menu} aria-controls="public-navigation" onClick={() => setMenu(!menu)}>{menu ? <X /> : <Menu />}</button>
      <nav id="public-navigation" className={`sp-nav ${menu ? 'sp-nav-open' : ''}`} aria-label="Website navigation">
        <Link to="/#features" onClick={() => setMenu(false)}>Features</Link><Link to="/#how-it-works" onClick={() => setMenu(false)}>How it works</Link><Link to="/tutorials" aria-current={pathname.startsWith('/tutorials') ? 'page' : undefined}>Tutorials</Link><Link to="/#faq" onClick={() => setMenu(false)}>FAQ</Link>
        <span className="sp-nav-actions">{!me.data && <Link to="/login">Log in</Link>}<StartLink className="sp-button-small" /></span>
      </nav>
    </div></header>
    <main id="public-main" tabIndex={-1}>{children}</main>
    <footer className="sp-footer"><div className="sp-container"><div className="sp-footer-grid"><div><Brand /><p>Your money. Your perspective.<br />A calmer place for everyday finances.</p><span className="sp-footer-note">Made for a clearer picture.</span></div>
      <nav aria-label="Product"><h2>Product</h2><Link to="/#features">Explore features</Link><Link to="/#how-it-works">How it works</Link><Link to="/app">Open app <ArrowUpRight size={14} /></Link></nav>
      <nav aria-label="Resources"><h2>Resources</h2><Link to="/tutorials">All tutorials</Link><Link to="/tutorials/getting-started">Getting started</Link><Link to="/#faq">Common questions</Link></nav>
      <nav aria-label="Legal"><h2>Legal</h2><Link to="/privacy">Privacy Policy</Link><Link to="/terms">Terms of Service</Link></nav>
    </div><div className="sp-footer-bottom"><span>© {new Date().getFullYear()} Spendime</span><span>Personal finance, with a little more perspective.</span><a href="#public-main" aria-label="Back to top">Back to top ↑</a></div></div></footer>
  </div>;
}

export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link className="sp-text-link" to={to}>{children}<ArrowRight size={17} aria-hidden="true" /></Link>;
}

export function FinalCTA() {
  return <section className="sp-final"><div className="sp-container sp-final-inner"><div><span className="sp-eyebrow">A little clarity goes a long way</span><h2>Make room for<br /><em>a clearer picture.</em></h2><p>Start with one account. One transaction. A new perspective.</p></div><div><StartLink className="sp-button-cream" /><Link to="/tutorials/getting-started">Take the first steps with our guide <ArrowRight size={16} /></Link></div><span className="sp-final-orbit" aria-hidden="true" /></div></section>;
}
