import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { PublicLayout } from './PublicLayout';
export default function NotFoundPage() {
  return <PublicLayout><section className="sp-container sp-not-found"><span className="sp-eyebrow">404 / A SMALL DETOUR</span><h1>Let’s get you<br /><em>back to clarity.</em></h1><p>We couldn’t find that page. Your next step is still close by.</p><div><Link to="/" className="sp-button"><ArrowLeft size={17} />Back to Spendime</Link><Link className="sp-button sp-button-outline" to="/tutorials">Explore the guides <ArrowRight size={17} /></Link></div></section></PublicLayout>;
}
