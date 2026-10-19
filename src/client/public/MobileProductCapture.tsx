import { ArrowUpRight } from 'lucide-react';
import type { PreviewKind } from './ProductPreview';
import { screenshotUrl } from './screenshots';

const captures = {
  dashboard: ['analytics-mobile.jpg', 'Actual mobile spending charts, with fictional sample amounts.'],
  transactions: ['transactions-mobile.jpg', 'Actual mobile transaction list, with fictional sample entries.'],
  accounts: ['accounts-mobile.jpg', 'Actual mobile accounts, with fictional sample balances.'],
  planning: ['assets-mobile.jpg', 'Actual mobile asset overview, with fictional sample values.'],
} as const;

export function MobileProductCapture({ kind }: { kind: PreviewKind }) {
  const [file, alt] = captures[kind];
  return <figure className="sp-mobile-feature-capture"><a href={screenshotUrl(file)} target="_blank" rel="noreferrer" aria-label="View full mobile screenshot"><img src={screenshotUrl(file)} width="390" height="844" alt={alt} loading="lazy" decoding="async" /></a><figcaption>Real mobile interface · fictional data <ArrowUpRight size={14} aria-hidden="true" /></figcaption></figure>;
}
