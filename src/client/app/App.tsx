import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { queryClient } from './queryClient';
import { keys } from '../api/queries';
import { LoginPage, PublicOnly, RegisterPage } from '../auth/AuthPages';
import { ProtectedRoute } from '../auth/ProtectedRoute';
import { AppShell } from '../components/AppShell';
import { LoadingState } from '../components/ui';
import { PwaStatus } from '../components/PwaStatus';
const Dashboard=lazy(()=>import('../pages/DashboardPage'));const Transactions=lazy(()=>import('../pages/TransactionsPage'));const Accounts=lazy(()=>import('../pages/AccountsPage'));const Categories=lazy(()=>import('../pages/CategoriesPage'));const Assets=lazy(()=>import('../pages/AssetsPage'));const Liabilities=lazy(()=>import('../pages/LiabilitiesPage'));const Recurring=lazy(()=>import('../pages/RecurringPage'));const Settings=lazy(()=>import('../pages/SettingsPage'));const Banking=lazy(()=>import('../pages/BankingPage'));
export function App(){useEffect(()=>{const unauthorized=()=>{queryClient.removeQueries({predicate:(query)=>query.queryKey[0]!=='auth'});queryClient.setQueryData(keys.me,null);if(!location.pathname.startsWith('/login'))location.assign(`/login?expired=1`)};window.addEventListener('spendime:unauthorized',unauthorized);return()=>window.removeEventListener('spendime:unauthorized',unauthorized)},[]);return <><Suspense fallback={<LoadingState/>}><Routes><Route path="/login" element={<PublicOnly><LoginPage/></PublicOnly>}/><Route path="/register" element={<PublicOnly><RegisterPage/></PublicOnly>}/><Route path="/" element={<ProtectedRoute><AppShell/></ProtectedRoute>}><Route index element={<Dashboard/>}/><Route path="transactions" element={<Transactions/>}/><Route path="accounts" element={<Accounts/>}/><Route path="banking" element={<Banking/>}/><Route path="categories" element={<Categories/>}/><Route path="assets" element={<Assets/>}/><Route path="liabilities" element={<Liabilities/>}/><Route path="recurring" element={<Recurring/>}/><Route path="settings" element={<Settings/>}/></Route><Route path="*" element={<Navigate to="/" replace/>}/></Routes></Suspense><PwaStatus/></>}
