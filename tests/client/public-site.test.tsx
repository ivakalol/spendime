// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, configure, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App, LegacyRedirect } from '../../src/client/app/App';
import { LoginPage, PublicOnly, RegisterPage } from '../../src/client/auth/AuthPages';
import { ProtectedRoute } from '../../src/client/auth/ProtectedRoute';
import { keys } from '../../src/client/api/queries';
import { LanguageProvider } from '../../src/client/i18n';
import { appModules, guides } from '../../src/shared/publicSite';
import { ScreenshotGallery } from '../../src/client/public/ScreenshotGallery';
import { guideMobileScreenshot } from '../../src/client/public/screenshots';

const fixtureUser = { id: 'sample', displayName: 'PRIVATE NAME MUST STAY HIDDEN', email: 'private@example.test', baseCurrency: 'EUR', timezone: 'UTC', bankingAccess: false, bankingEnabled: false };
const clients: QueryClient[] = [];
// Public pages are code-split; allow their first cold module load on slower CI hosts.
configure({ asyncUtilTimeout: 5_000 });
function Position() { const location = useLocation(); return <output data-testid="position">{location.pathname}{location.search}{location.hash}</output>; }
function open(path: string, authenticated = false, children = <App />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  client.setQueryData(keys.me, authenticated ? fixtureUser : null);
  render(<QueryClientProvider client={client}><LanguageProvider><MemoryRouter initialEntries={[path]}>{children}<Position /></MemoryRouter></LanguageProvider></QueryClientProvider>);
  return client;
}
beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { code: 'unauthenticated' } }), { status: 401 }));
});
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('public product experience', () => {
  it('selects real phone captures, supports gallery gestures, and preserves vertical scrolling', async () => {
    vi.stubGlobal('matchMedia', vi.fn(query => ({ matches: query === '(max-width: 700px)', addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    render(<ScreenshotGallery />);
    const gallery = screen.getByRole('region', { name: 'Spendime product screenshots' });
    const image = within(gallery).getByRole('img');
    expect(image).toHaveAttribute('src', expect.stringContaining('dashboard-mobile.jpg'));
    await userEvent.click(screen.getByRole('button', { name: 'Next mobile screenshot' }));
    expect(within(gallery).getByRole('img')).toHaveAttribute('src', expect.stringContaining('transactions-mobile.jpg'));
    const frame = gallery.querySelector('.sp-capture-frame')!;
    fireEvent.touchStart(frame, { touches: [{ clientX: 280, clientY: 200 }] });
    fireEvent.touchEnd(frame, { changedTouches: [{ clientX: 70, clientY: 210 }] });
    expect(within(gallery).getByRole('img')).toHaveAttribute('src', expect.stringContaining('accounts-mobile.jpg'));
    expect(fireEvent.click(within(gallery).getByRole('link'))).toBe(false);
    fireEvent.touchStart(frame, { touches: [{ clientX: 180, clientY: 500 }] });
    fireEvent.touchEnd(frame, { changedTouches: [{ clientX: 170, clientY: 200 }] });
    expect(within(gallery).getByRole('img')).toHaveAttribute('src', expect.stringContaining('accounts-mobile.jpg'));
    gallery.focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(within(gallery).getByRole('img')).toHaveAttribute('src', expect.stringContaining('categories-mobile.jpg'));
    await userEvent.click(screen.getByRole('button', { name: 'Next mobile screenshot' }));
    expect(within(gallery).getByRole('img')).toHaveAttribute('src', expect.stringContaining('dashboard-mobile.jpg'));
    await userEvent.click(screen.getByRole('button', { name: 'Previous mobile screenshot' }));
    expect(within(gallery).getByRole('img')).toHaveAttribute('src', expect.stringContaining('categories-mobile.jpg'));
    gallery.focus();
    await userEvent.keyboard('{ArrowRight}');
    await userEvent.click(screen.getByRole('button', { name: 'Desktop', exact: true }));
    expect(within(gallery).getByRole('img')).toHaveAttribute('src', expect.stringContaining('dashboard-desktop.jpg'));
    expect(screen.queryByRole('button', { name: 'Categories', exact: true })).not.toBeInTheDocument();
  });
  it('keeps desktop gallery defaults and maps tutorial screenshots to their actual modules', () => {
    render(<ScreenshotGallery />);
    expect(screen.getByRole('img')).toHaveAttribute('src', expect.stringContaining('dashboard-desktop.jpg'));
    expect(screen.queryByRole('button', { name: 'Next mobile screenshot' })).not.toBeInTheDocument();
    expect(guideMobileScreenshot('recurring-payments', 'planning')).toBe('recurring-mobile.jpg');
    expect(guideMobileScreenshot('debts', 'planning')).toBe('debts-mobile.jpg');
    expect(guideMobileScreenshot('categories', 'transactions')).toBe('categories-mobile.jpg');
  });
  it('uses responsive hero sources and actual mobile feature and tutorial captures on phones', async () => {
    vi.stubGlobal('matchMedia', vi.fn(query => ({ matches: query === '(max-width: 700px)', addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    open('/');
    await screen.findByRole('heading', { level: 1, name: /A little clarity/ });
    expect(document.querySelector('.sp-hero-screen source')).toHaveAttribute('srcset', expect.stringContaining('dashboard-mobile.jpg'));
    expect(document.querySelector('.sp-mobile-feature-capture img')).toHaveAttribute('src', expect.stringContaining('analytics-mobile.jpg'));
    await userEvent.click(screen.getByRole('tab', { name: /Track the everyday/ }));
    expect(document.querySelector('.sp-mobile-feature-capture img')).toHaveAttribute('src', expect.stringContaining('transactions-mobile.jpg'));
    expect(screen.queryByText('Hello, Alex')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps a legacy standalone PWA launch pointed at the protected application', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    open('/');
    expect(await screen.findByRole('heading', { name: 'Sign in to your finances' })).toBeInTheDocument();
    expect(screen.getByTestId('position')).toHaveTextContent('/login');
    expect(screen.queryByRole('heading', { name: /A little clarity/ })).not.toBeInTheDocument();
  });
  it('renders the homepage for a visitor without requesting financial data', async () => {
    open('/');
    expect(await screen.findByRole('heading', { level: 1, name: /A little clarity/ })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Get started' })[0]).toHaveAttribute('href', '/register');
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('offers an authenticated dashboard CTA without showing private user information', async () => {
    open('/', true);
    expect((await screen.findAllByRole('link', { name: 'Open Dashboard' }))[0]).toHaveAttribute('href', '/app');
    expect(screen.queryByText(fixtureUser.displayName)).not.toBeInTheDocument();
    expect(screen.queryByText(fixtureUser.email)).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('supports keyboard feature tabs and interactive sample filters', async () => {
    open('/');
    const first = await screen.findByRole('tab', { name: /Understand your money/ });
    first.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /Track the everyday/ })).toHaveAttribute('aria-selected', 'true');
    const panel = screen.getByRole('tabpanel');
    await userEvent.click(within(panel).getByRole('button', { name: 'Income', exact: true }));
    expect(within(panel).getByText('Salary')).toBeInTheDocument();
    expect(within(panel).queryByText('Weekly groceries')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('opens and dismisses the public navigation with Escape and restores focus', async () => {
    open('/');
    const button = await screen.findByRole('button', { name: 'Open navigation' });
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
  });
  it('searches and filters real guides, including an empty-result recovery', async () => {
    open('/tutorials');
    const search = await screen.findByRole('searchbox', { name: 'Search tutorials' });
    await userEvent.type(search, 'nonsense-no-such-guide');
    expect(screen.getByText(/^0 guides/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No guides found.' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all guides' }));
    expect(screen.getByText(/^13 guides/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Banking', exact: true }));
    expect(screen.getByText(/^2 guides/)).toBeInTheDocument();
    await userEvent.type(search, 'reconciliation');
    expect(screen.getByText(/^1 guide/)).toBeInTheDocument();
  });
  it('renders a useful guide and valid related links', async () => {
    open('/tutorials/recurring-payments');
    expect(await screen.findByRole('heading', { level: 1, name: 'Keep regular payments in view' })).toBeInTheDocument();
    expect(screen.getByText(/They do not send payments or automatically create ledger entries/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Open this feature' })[0]).toHaveAttribute('href', '/app/recurring');
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
    for (const guide of guides) for (const slug of guide.related) expect(guides.some(item => item.slug === slug)).toBe(true);
  });
  it.each(['/no-such-page', '/tutorials/no-such-guide', '/app/no-such-page'])('shows a noindex 404 for %s', async path => {
    open(path);
    expect(await screen.findByRole('heading', { level: 1, name: /back to clarity/ })).toBeInTheDocument();
    expect(screen.getByTestId('position')).toHaveTextContent(path);
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  });
  it('protects app routes and keeps the intended destination through registration', async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ data: { user: fixtureUser } }), { status: 200 }));
    open('/app/accounts?source=guide#details', false, <Routes>
      <Route path="/app/accounts" element={<ProtectedRoute><div>Account destination</div></ProtectedRoute>} />
      <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
    </Routes>);
    expect(await screen.findByRole('heading', { name: 'Sign in to your finances' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Create an account' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Demo');
    await userEvent.type(screen.getByLabelText('Email'), 'demo@example.test');
    await userEvent.type(screen.getByLabelText(/^Password/), 'Correct-Horse-47!');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Account destination')).toBeInTheDocument();
    expect(screen.getByTestId('position')).toHaveTextContent('/app/accounts?source=guide#details');
  });
  it.each(appModules)('preserves legacy /%s query strings and fragments without a loop', module => {
    open(`/${module}?result=connected#review`, false, <Routes><Route path={`/${module}`} element={<LegacyRedirect />} /><Route path={`/app/${module}`} element={<div>Canonical app destination</div>} /></Routes>);
    expect(screen.getByTestId('position')).toHaveTextContent(`/app/${module}?result=connected#review`);
  });
});
