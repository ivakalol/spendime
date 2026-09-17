import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, LockKeyhole, WalletCards } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { apiRequest, jsonBody } from '../api/client';
import { keys, useMe } from '../api/queries';
import type { ApiEnvelope, User } from '../api/types';
import { Button, Field, FormError, Input, LoadingState } from '../components/ui';

function AuthFrame({ mode }: { mode: 'login' | 'register' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const mutation = useMutation({ mutationFn: async () => (await apiRequest<ApiEnvelope<{ user: User }>>(`/api/auth/${mode}`, { method: 'POST', ...jsonBody({ email, password, ...(mode === 'register' ? { displayName } : {}) }) })).data.user, onSuccess: (user) => { queryClient.setQueryData(keys.me, user); navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true }); } });
  const submit = (event: FormEvent) => { event.preventDefault(); if (!mutation.isPending) mutation.mutate(); };

  return <main className="auth-page safe-top flex min-h-dvh items-start justify-center px-4 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6"><div className="animate-enter grid w-full max-w-5xl overflow-hidden rounded-[1.75rem] border border-white/60 bg-surface shadow-[0_24px_70px_rgba(18,42,43,.13)] md:grid-cols-[1.05fr_.95fr]">
    <section className="relative hidden min-h-[650px] flex-col justify-between overflow-hidden bg-brand p-10 text-white md:flex"><div aria-hidden="true" className="absolute -right-32 -top-28 size-80 rounded-full border border-white/10 bg-white/[.025]" /><div aria-hidden="true" className="absolute -bottom-24 -left-24 size-64 rounded-full border border-white/[.06]" /><div className="relative flex items-center gap-3 text-lg font-bold tracking-tight"><span className="grid size-11 place-items-center rounded-2xl bg-white/10 shadow-inner ring-1 ring-white/10"><WalletCards /></span>Spendime</div><div className="relative"><p className="text-sm font-bold uppercase tracking-[.2em] text-white/55">Money, in context</p><h1 className="mt-4 max-w-lg text-4xl font-bold leading-[1.12] tracking-[-.035em]">See what your money does—not only where it goes.</h1><p className="mt-5 max-w-md leading-relaxed text-white/65">Cash flow and everyday utility stay distinct, so a long-lived purchase tells a truer story over time.</p></div><p className="relative text-sm text-white/45">Private by design · Self-hosted on your Pi</p></section>
    <section className="p-6 py-9 sm:p-10 md:py-12"><div className="mb-9 flex items-center gap-3 md:hidden"><span className="grid size-10 place-items-center rounded-2xl bg-brand text-white shadow-sm"><WalletCards className="size-5" /></span><span className="font-bold tracking-tight">Spendime</span></div><p className="text-[11px] font-bold uppercase tracking-[.2em] text-accent">{mode === 'login' ? 'Welcome back' : 'Start clearly'}</p><h2 className="mt-2 text-3xl font-bold leading-tight tracking-[-.035em]">{mode === 'login' ? 'Sign in to your finances' : 'Create your private account'}</h2><p className="mt-2 text-sm leading-relaxed text-muted">Your session stays in a secure HttpOnly cookie—never browser storage.</p>
      <form className="mt-8 grid gap-5" onSubmit={submit}>{mode === 'register' && <Field label="Name"><Input autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required minLength={1} maxLength={100} /></Field>}<Field label="Email"><Input type="email" inputMode="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></Field><Field label="Password" hint={mode === 'register' ? 'At least 12 characters, with upper/lowercase letters and a number.' : undefined}><Input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={12} /></Field><FormError error={mutation.error} /><Button type="submit" className="mt-1 w-full" disabled={mutation.isPending}>{mutation.isPending ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}<ArrowRight className="size-4" /></Button></form>
      <p className="mt-6 text-center text-sm text-muted">{mode === 'login' ? 'New to Spendime?' : 'Already have an account?'} <Link className="rounded font-semibold text-brand underline decoration-accent/50 underline-offset-4 outline-none hover:decoration-accent focus-visible:ring-2 focus-visible:ring-accent" to={mode === 'login' ? '/register' : '/login'}>{mode === 'login' ? 'Create an account' : 'Sign in'}</Link></p><div className="mt-8 flex items-center gap-2 rounded-2xl border border-brand/[.06] bg-brand/[.045] p-3 text-xs leading-relaxed text-muted"><LockKeyhole className="size-4 shrink-0 text-brand" />Password credentials are ready to coexist with future Google sign-in.</div>
    </section>
  </div></main>;
}

export const LoginPage = () => <AuthFrame mode="login" />;
export const RegisterPage = () => <AuthFrame mode="register" />;
export function PublicOnly({ children }: { children: React.ReactNode }) { const me = useMe(); if (me.isPending) return <LoadingState />; return me.data ? <Navigate to="/" replace /> : children; }
