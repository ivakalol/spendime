import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { queryClient } from './queryClient';
import { keys } from '../api/queries';
import { LoginPage, PublicOnly, RegisterPage } from '../auth/AuthPages';
import { ProtectedRoute } from '../auth/ProtectedRoute';
import { BankingRoute } from '../auth/BankingRoute';
import { AppShell } from '../components/AppShell';
import { LoadingState } from '../components/ui';
import { PwaStatus } from '../components/PwaStatus';
import { PrivacyPage, TermsPage } from '../pages/LegalPages';
import { appModules, pageMetadata, publicOrigin } from '../../shared/publicSite';

const Home = lazy(() => import('../public/HomePage'));
const Tutorials = lazy(() => import('../public/TutorialsPage'));
const Tutorial = lazy(() => import('../public/TutorialPage'));
const NotFound = lazy(() => import('../public/NotFoundPage'));
const Dashboard = lazy(() => import('../pages/DashboardPage'));
const Transactions = lazy(() => import('../pages/TransactionsPage'));
const Accounts = lazy(() => import('../pages/AccountsPage'));
const Categories = lazy(() => import('../pages/CategoriesPage'));
const Assets = lazy(() => import('../pages/AssetsPage'));
const Liabilities = lazy(() => import('../pages/LiabilitiesPage'));
const Recurring = lazy(() => import('../pages/RecurringPage'));
const Settings = lazy(() => import('../pages/SettingsPage'));
const Banking = lazy(() => import('../pages/BankingPage'));
const BankingReconciliation = lazy(() => import('../pages/BankingReconciliationPage'));

function HomeEntry() {
  // Existing iOS home-screen installs may retain the original root launch URL.
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone;
  return standalone ? <Navigate to="/app" replace /> : <Home />;
}

export function LegacyRedirect() {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={`/app${pathname.replace(/\/+$/, '')}${search}${hash}`} replace />;
}

function RouteMetadata() {
  const { pathname } = useLocation();
  useEffect(() => {
    const meta = pageMetadata(pathname);
    document.title = meta.title;
    const set = (selector: string, attribute: string, value: string) => {
      let node = document.head.querySelector<HTMLMetaElement>(`meta[${selector}="${attribute}"]`);
      if (!node) { node = document.createElement('meta'); node.setAttribute(selector, attribute); document.head.append(node); }
      node.content = value;
    };
    set('name', 'description', meta.description);
    set('name', 'robots', meta.index ? 'index, follow' : 'noindex, nofollow');
    set('property', 'og:title', meta.title);
    set('property', 'og:description', meta.description);
    set('property', 'og:url', `${publicOrigin}${meta.path}`);
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.append(canonical); }
    canonical.href = `${publicOrigin}${meta.path}`;
  }, [pathname]);
  return null;
}

export function App() {
  useEffect(() => {
    const unauthorized = () => {
      queryClient.removeQueries({ predicate: query => query.queryKey[0] !== 'auth' });
      queryClient.setQueryData(keys.me, null);
      if (location.pathname.startsWith('/app')) location.assign('/login?expired=1');
    };
    window.addEventListener('spendime:unauthorized', unauthorized);
    return () => window.removeEventListener('spendime:unauthorized', unauthorized);
  }, []);
  return <><Suspense fallback={<LoadingState label="Loading Spendime…" />}><Routes>
    <Route path="/" element={<HomeEntry />} />
    <Route path="/tutorials" element={<Tutorials />} />
    <Route path="/tutorials/:slug" element={<Tutorial />} />
    <Route path="/privacy" element={<PrivacyPage />} />
    <Route path="/terms" element={<TermsPage />} />
    <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
    <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
    <Route path="/app" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
      <Route index element={<Dashboard />} />
      <Route path="transactions" element={<Transactions />} />
      <Route path="accounts" element={<Accounts />} />
      <Route path="banking" element={<BankingRoute><Banking /></BankingRoute>} />
      <Route path="banking/reconciliation" element={<BankingRoute><BankingReconciliation /></BankingRoute>} />
      <Route path="categories" element={<Categories />} />
      <Route path="assets" element={<Assets />} />
      <Route path="liabilities" element={<Liabilities />} />
      <Route path="recurring" element={<Recurring />} />
      <Route path="settings" element={<Settings />} />
    </Route>
    {appModules.map(module => <Route key={module} path={`/${module}`} element={<LegacyRedirect />} />)}
    <Route path="*" element={<NotFound />} />
  </Routes></Suspense><RouteMetadata /><PwaStatus /></>;
}
