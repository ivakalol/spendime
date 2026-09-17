import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BarChart3, CalendarClock, CircleDollarSign, Landmark, LayoutDashboard, LogOut, Menu, Plus, ReceiptText, Settings, Shapes, WalletCards } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { keys, useMe } from '../api/queries';
import { QuickAdd } from '../features/QuickAdd';
import { Button, Modal } from './ui';

const primary = [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true }, { to: '/transactions', label: 'Transactions', icon: ReceiptText }, { to: '/accounts', label: 'Accounts', icon: WalletCards }, { to: '/assets', label: 'Assets', icon: BarChart3 }];
const secondary = [{ to: '/liabilities', label: 'Liabilities', icon: Landmark }, { to: '/recurring', label: 'Recurring', icon: CalendarClock }, { to: '/categories', label: 'Categories', icon: Shapes }, { to: '/settings', label: 'Settings', icon: Settings }];
type NavigationItem = (typeof primary)[number] | (typeof secondary)[number];

function NavItem({ item, onClick, light = false }: { item: NavigationItem; onClick?: () => void; light?: boolean }) {
  return <NavLink onClick={onClick} to={item.to} end={'end' in item ? item.end : undefined} className={({ isActive }) => `control-press group flex min-h-11 items-center gap-3 rounded-2xl px-3.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-[.985] ${light ? isActive ? 'bg-brand text-white shadow-sm' : 'text-muted hover:bg-brand/[.07] hover:text-ink' : isActive ? 'bg-white text-brand shadow-[0_7px_18px_rgba(0,0,0,.12)]' : 'text-white/60 hover:bg-white/10 hover:text-white'}`}><item.icon className="size-[1.15rem] transition-transform group-hover:scale-105" /><span>{item.label}</span></NavLink>;
}

export function AppShell() {
  const me = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [quick, setQuick] = useState(false);
  const [more, setMore] = useState(false);
  const logout = useMutation({ mutationFn: () => apiRequest('/api/auth/logout', { method: 'POST' }), onSuccess: () => { queryClient.clear(); queryClient.setQueryData(keys.me, null); navigate('/login', { replace: true }); } });

  return <div className="min-h-dvh lg:grid lg:grid-cols-[268px_1fr]">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[268px] flex-col overflow-hidden bg-brand px-4 safe-top safe-bottom lg:flex">
      <div aria-hidden="true" className="pointer-events-none absolute -right-28 -top-20 size-72 rounded-full border border-white/[.06] bg-white/[.025]" />
      <div className="relative mb-8 flex items-center gap-3 px-2 text-lg font-bold tracking-tight text-white"><span className="grid size-11 place-items-center rounded-2xl bg-white/10 shadow-inner ring-1 ring-white/10"><CircleDollarSign /></span>Spendime</div>
      <nav className="relative grid gap-1" aria-label="Primary navigation">{primary.map((item) => <NavItem key={item.to} item={item} />)}<div className="my-3 h-px bg-white/10" />{secondary.map((item) => <NavItem key={item.to} item={item} />)}</nav>
      <div className="relative mt-auto rounded-2xl border border-white/[.08] bg-white/[.06] p-3.5 text-white shadow-inner"><p className="truncate text-sm font-semibold">{me.data?.displayName}</p><p className="mt-0.5 truncate text-xs text-white/50">{me.data?.email}</p><button onClick={() => logout.mutate()} disabled={logout.isPending} className="control-press mt-3 flex min-h-10 w-full items-center gap-2 rounded-xl px-2 text-xs font-semibold text-white/60 outline-none hover:bg-white/[.07] hover:text-white focus-visible:ring-2 focus-visible:ring-accent active:scale-[.98] disabled:opacity-50"><LogOut className="size-4" />{logout.isPending ? 'Signing out…' : 'Sign out'}</button></div>
    </aside>
    <main className="min-w-0 pb-[calc(5.15rem+env(safe-area-inset-bottom))] lg:col-start-2 lg:pb-12"><div className="animate-enter mx-auto max-w-[1380px] px-4 safe-top sm:px-6 lg:px-9 lg:pt-8 xl:px-12"><Outlet /></div></main>
    <nav aria-label="Primary navigation" className="fixed inset-x-2 bottom-2 z-40 grid grid-cols-5 rounded-[1.35rem] border border-white/70 bg-surface/[.92] px-1.5 pb-[max(.25rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_12px_42px_rgba(18,42,43,.2)] backdrop-blur-xl lg:hidden">
      {primary.slice(0, 2).map((item) => <MobileItem key={item.to} item={item} />)}
      <button onClick={() => setQuick(true)} className="control-press mx-auto -mt-5 grid size-[3.15rem] place-items-center rounded-full bg-accent text-white shadow-[0_10px_24px_rgba(208,111,75,.38)] ring-[5px] ring-canvas outline-none hover:bg-accent/90 focus-visible:ring-accent/30 active:scale-95" aria-label="Quick add"><Plus className="size-5" /></button>
      <MobileItem item={primary[3]!} />
      <button onClick={() => setMore(true)} className="control-press flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold text-muted outline-none hover:bg-brand/[.05] focus-visible:ring-2 focus-visible:ring-accent active:scale-95"><Menu className="size-[1.15rem]" />More</button>
    </nav>
    <Modal open={more} onClose={() => setMore(false)} title="More" description="Accounts, planning, and preferences."><nav className="grid gap-1.5" aria-label="More navigation">{[primary[2]!, ...secondary].map((item) => <NavItem key={item.to} item={item} light onClick={() => setMore(false)} />)}</nav><Button variant="secondary" className="mt-4 w-full" disabled={logout.isPending} onClick={() => logout.mutate()}><LogOut className="size-4" />{logout.isPending ? 'Signing out…' : 'Sign out'}</Button></Modal>
    {quick && <QuickAdd open onClose={() => setQuick(false)} />}
  </div>;
}

function MobileItem({ item }: { item: (typeof primary)[number] }) {
  return <NavLink to={item.to} end={'end' in item ? item.end : undefined} className={({ isActive }) => `control-press relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-95 ${isActive ? 'bg-brand/[.055] text-accent' : 'text-muted hover:bg-brand/[.04] hover:text-ink'}`}><item.icon className="size-[1.15rem]" /><span>{item.label}</span></NavLink>;
}
