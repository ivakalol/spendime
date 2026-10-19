import { ArrowRight, ArrowUpRight, BookOpen, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { guides } from '../../shared/publicSite';
import { FinalCTA, PublicLayout } from './PublicLayout';

const groups = ['All guides', 'Start here', 'Everyday money', 'Plan ahead', 'Banking'] as const;
export default function TutorialsPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const [group, setGroup] = useState('All guides');
  const filtered = useMemo(() => guides.filter(guide => (group === 'All guides' || guide.group === group) && `${guide.title} ${guide.description} ${guide.steps.map(step => step.body).join(' ')}`.toLowerCase().includes(query.trim().toLowerCase())), [group, query]);
  return <PublicLayout><section className="sp-guide-hero"><div className="sp-container"><span className="sp-eyebrow">THE SPENDIME GUIDE LIBRARY</span><h1>Get to know<br /><em>your money’s new home.</em></h1><p>Practical guides. Real workflows. A little help for every step.</p><div className="sp-guide-search"><Search size={21} /><label className="sp-sr-only" htmlFor="guide-search">Search tutorials</label><input id="guide-search" type="search" placeholder="What would you like to learn?" value={query} onChange={event => { const next = new URLSearchParams(params); if (event.target.value) next.set('q', event.target.value); else next.delete('q'); setParams(next, { replace: true }); }} />{query && <button onClick={() => setParams({}, { replace: true })} aria-label="Clear search"><X size={18} /></button>}</div></div></section>
    <section className="sp-container sp-directory"><div className="sp-guide-filters" role="group" aria-label="Filter tutorials by topic">{groups.map(item => <button key={item} aria-pressed={group === item} onClick={() => setGroup(item)}>{item}</button>)}</div>
      {!query && group === 'All guides' && <Link className="sp-start-guide" to="/tutorials/getting-started"><span className="sp-start-guide-icon"><BookOpen size={32} /></span><div><span className="sp-eyebrow">NEW HERE? START WITH THE BASICS</span><h2>Your first account. Your first transaction.</h2><p>A few small steps toward a clearer financial picture.</p></div><span className="sp-button sp-button-outline">Let’s begin <ArrowRight size={17} /></span></Link>}
      <p className="sp-result-count" role="status">{filtered.length} {filtered.length === 1 ? 'guide' : 'guides'}{query && ` matching “${query}”`}</p><div className="sp-directory-grid">{filtered.map((guide, i) => <Link className="sp-directory-card" key={guide.slug} to={`/tutorials/${guide.slug}`}><span className="sp-guide-meta">{guide.group} <i />{guide.minutes} min read</span><span className="sp-directory-number" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span><h2>{guide.title}</h2><p>{guide.description}</p><span className="sp-directory-card-bottom">{guide.level}<ArrowUpRight size={21} /></span></Link>)}</div>
      {!filtered.length && <div className="sp-empty"><Search size={32} /><h2>No guides found.</h2><p>Try “accounts”, “payments” or a different topic.</p><button className="sp-button" onClick={() => { setParams({}); setGroup('All guides'); }}>Show all guides</button></div>}
      <p className="sp-directory-note">Banking guides describe conditional access for the designated owner. Ordinary accounts and transactions work without a bank connection.</p>
    </section><FinalCTA /></PublicLayout>;
}
