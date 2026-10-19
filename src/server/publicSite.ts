import { appModules, pageMetadata, publicOrigin, publicPageMeta } from '../shared/publicSite.js';

export function legacyAppDestination(path: string, search = ''): string | null {
  const module = path.replace(/^\//, '').replace(/\/+$/, '');
  return appModules.some(item => item === module) ? `/app/${module}${search}` : null;
}

export function isKnownPage(path: string): boolean {
  const normalized = path.replace(/\/+$/, '') || '/';
  return normalized in publicPageMeta || normalized === '/login' || normalized === '/register' ||
    normalized === '/app' || appModules.some(module => normalized === `/app/${module}`);
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

/** Only route-owned public copy is interpolated. Never include session or finance data. */
export function renderPageHtml(shell: string, path: string): string {
  const meta = pageMetadata(path);
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const canonical = escapeHtml(`${publicOrigin}${meta.path}`);
  return shell.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace('<!-- spendime:page-meta -->', [
      `<meta name="description" content="${description}" />`,
      `<meta name="robots" content="${meta.index ? 'index, follow' : 'noindex, nofollow'}" />`,
      `<link rel="canonical" href="${canonical}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="Spendime" />`,
      `<meta property="og:title" content="${title}" />`,
      `<meta property="og:description" content="${description}" />`,
      `<meta property="og:url" content="${canonical}" />`,
      `<meta property="og:image" content="${publicOrigin}/icons/icon-512.png" />`,
      `<meta property="og:image:width" content="512" />`,
      `<meta property="og:image:height" content="512" />`,
      `<meta property="og:image:alt" content="Spendime brand mark" />`,
      `<meta name="twitter:card" content="summary" />`,
    ].join('\n    '));
}

export function publicSitemap(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Object.keys(publicPageMeta).map(path => `<url><loc>${publicOrigin}${path}</loc></url>`).join('')}</urlset>`;
}
