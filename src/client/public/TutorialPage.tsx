import { ArrowLeft, ArrowRight, ArrowUpRight, Lightbulb } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { guides } from '../../shared/publicSite';
import { PublicLayout } from './PublicLayout';
import { ProductPreview } from './ProductPreview';
import NotFoundPage from './NotFoundPage';
import { usePhoneLayout } from './usePhoneLayout';
import { guideMobileScreenshot, screenshotUrl } from './screenshots';

export default function TutorialPage() {
  const { slug } = useParams();
  const phone = usePhoneLayout();
  const guide = guides.find(item => item.slug === slug);
  if (!guide) return <NotFoundPage />;
  const mobileFile = guideMobileScreenshot(guide.slug, guide.preview);
  const desktopFile = guide.preview === 'planning' ? mobileFile : `${guide.preview}-desktop.jpg`;
  return <PublicLayout><div className="sp-container sp-article"><Link to="/tutorials" className="sp-back"><ArrowLeft size={16} />All guides</Link><header className="sp-article-header"><span className="sp-eyebrow">{guide.group} / SPENDIME GUIDES</span><h1>{guide.title}</h1><p>{guide.description}</p><div className="sp-article-meta"><span>{guide.level}</span><span>{guide.minutes} min read</span><span>Based on the current application</span></div></header>
    <div className="sp-article-layout"><aside className="sp-contents"><nav aria-label="On this page"><h2>In this guide</h2>{guide.steps.map((step, i) => <a key={step.title} href={`#step-${i + 1}`}><span>{String(i + 1).padStart(2, '0')}</span>{step.title}</a>)}</nav><Link to={guide.appPath} className="sp-button">Open this feature <ArrowUpRight size={16} /></Link><p>Sign in to access your own records.</p></aside>
    <article><figure className="sp-article-preview">{guide.preview === 'planning' && !phone ? <ProductPreview kind="planning" sidebar={false} /> : <a className={`sp-guide-screenshot${phone ? ' sp-guide-screenshot-phone' : ''}`} href={screenshotUrl(phone ? mobileFile : desktopFile)} target="_blank" rel="noreferrer" aria-label="Enlarge example screenshot"><picture className="sp-responsive-picture"><source media="(max-width: 700px)" srcSet={screenshotUrl(mobileFile)} /><img src={screenshotUrl(desktopFile)} alt={`Actual Spendime ${phone ? 'mobile ' : ''}${guide.preview} interface with fictional sample records.`} width={phone ? 390 : 1430} height={phone ? 844 : guide.preview === 'dashboard' ? 1814 : 1100} loading="lazy" /></picture></a>}<figcaption>{guide.preview === 'planning' && !phone ? 'Illustrative product preview' : 'Real application screenshot'} with fictional sample data. Your records and layout may vary.</figcaption></figure>{guide.group === 'Banking' && <div className="sp-article-callout"><strong>Before you begin</strong><p>Banking is restricted to the designated owner and requires a configured, enabled installation. These steps do not grant access or guarantee institution availability.</p></div>}
      <ol className="sp-article-steps">{guide.steps.map((step, i) => <li key={step.title} id={`step-${i + 1}`}><span className="sp-article-step-number">{String(i + 1).padStart(2, '0')}</span><div><h2>{step.title}</h2><p>{step.body}</p></div></li>)}</ol><aside className="sp-article-tip"><Lightbulb size={22} /><div><h2>A useful detail</h2><p>{guide.tip}</p></div></aside><div className="sp-article-next"><div><span className="sp-eyebrow">PUT IT INTO PRACTICE</span><h2>A little learning. A clearer picture.</h2></div><Link className="sp-button" to={guide.appPath}>Open this feature <ArrowUpRight size={17} /></Link></div>
      <section className="sp-related"><h2>Keep exploring</h2>{guide.related.map(related => guides.find(item => item.slug === related)).filter(item => item !== undefined).map(item => <Link to={`/tutorials/${item.slug}`} key={item.slug}><span>{item.title}<small>{item.description}</small></span><ArrowRight size={19} /></Link>)}</section>
    </article></div></div></PublicLayout>;
}
