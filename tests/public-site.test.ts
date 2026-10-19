import { describe, expect, it } from 'vitest';
import { appModules, guides, pageMetadata } from '../src/shared/publicSite.js';
import { isKnownPage, legacyAppDestination, publicSitemap, renderPageHtml } from '../src/server/publicSite.js';

describe('public routing and crawler responses', () => {
  const shell = '<html><head><title>Spendime</title><!-- spendime:page-meta --></head><body><div id="root"></div></body></html>';
  it.each(appModules)('redirects only the exact legacy %s module', module => {
    expect(legacyAppDestination(`/${module}/`, '?result=connected')).toBe(`/app/${module}?result=connected`);
    expect(legacyAppDestination(`/app/${module}`)).toBeNull();
  });
  it.each(['/', '/api/accounts', '/api/banking/callback', '/tutorials', '/privacy', '/accounts/unknown'])('leaves %s out of legacy redirects', path => {
    expect(legacyAppDestination(path)).toBeNull();
  });
  it('generates useful per-guide metadata in the initial HTML', () => {
    const html = renderPageHtml(shell, '/tutorials/accounts');
    expect(html).toContain('<title>Give every account a place · Spendime guides</title>');
    expect(html).toContain('property="og:title"');
    expect(html).toContain('https://spendime.ivaylo.tech/tutorials/accounts');
    expect(html).toContain('content="index, follow"');
    expect(html).not.toContain('spendime:page-meta');
  });
  it.each(['/app', '/app/transactions', '/login', '/register', '/no-such-page'])('does not index %s', path => {
    expect(pageMetadata(path).index).toBe(false);
    expect(renderPageHtml(shell, path)).toContain('content="noindex, nofollow"');
  });
  it('escapes arbitrary route text rather than injecting it into metadata', () => {
    const html = renderPageHtml(shell, '/bad"/><script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
  it('sitemaps only existing public pages and guides', () => {
    const sitemap = publicSitemap();
    for (const guide of guides) expect(sitemap).toContain(`/tutorials/${guide.slug}</loc>`);
    expect(sitemap).toContain('/privacy</loc>');
    expect(sitemap).toContain('/terms</loc>');
    expect(sitemap).not.toContain('/app');
    expect(sitemap).not.toContain('/login');
    expect(isKnownPage('/app/banking/reconciliation')).toBe(true);
    expect(isKnownPage('/app/no-such-page')).toBe(false);
    expect(isKnownPage('/tutorials/no-such-guide')).toBe(false);
  });
});
