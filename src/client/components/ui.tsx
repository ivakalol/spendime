import { AlertCircle, ChevronDown, LoaderCircle, RefreshCw, X } from 'lucide-react';
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../utils/cn';

export function Button({ className, variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return <button className={cn('control-press inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas active:scale-[.98] disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none', variant === 'primary' && 'bg-brand text-white shadow-[0_8px_20px_rgba(16,42,44,.16)] hover:bg-brand/90 hover:shadow-[0_10px_24px_rgba(16,42,44,.2)]', variant === 'secondary' && 'bg-brand/[.07] text-brand ring-1 ring-inset ring-brand/10 hover:bg-brand/[.12]', variant === 'ghost' && 'text-muted hover:bg-brand/[.07] hover:text-ink', variant === 'danger' && 'bg-rose-50 text-rose-800 ring-1 ring-inset ring-rose-200/60 hover:bg-rose-100', className)} {...props} />;
}
export function Card({ children, className }: { children: ReactNode; className?: string }) { return <section className={cn('relative rounded-[1.4rem] border border-brand/[.06] bg-surface p-5 shadow-[0_8px_28px_rgba(18,42,43,.055)] sm:rounded-3xl', className)}>{children}</section>; }
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) { return <label className="grid gap-2 text-sm font-semibold leading-none text-ink"><span>{label}</span>{children}{hint && <span className="text-xs font-normal leading-relaxed text-muted">{hint}</span>}{error && <span className="flex items-center gap-1.5 text-xs font-medium leading-relaxed text-rose-700"><AlertCircle className="size-3.5 shrink-0" />{error}</span>}</label>; }
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) { return <input className={cn('control-press min-h-12 w-full rounded-2xl border border-brand/[.14] bg-surface px-3.5 text-base text-ink shadow-[0_1px_0_rgba(255,255,255,.8),inset_0_1px_2px_rgba(18,42,43,.025)] outline-none placeholder:text-muted/55 hover:border-brand/25 focus:border-accent focus:ring-4 focus:ring-accent/10 disabled:cursor-not-allowed disabled:bg-brand/[.035] disabled:text-muted', className)} {...props} />; }
export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) { return <span className="relative block"><select className={cn('control-press min-h-12 w-full appearance-none rounded-2xl border border-brand/[.14] bg-surface py-2.5 pl-3.5 pr-10 text-base text-ink shadow-[0_1px_0_rgba(255,255,255,.8),inset_0_1px_2px_rgba(18,42,43,.025)] outline-none hover:border-brand/25 focus:border-accent focus:ring-4 focus:ring-accent/10 disabled:cursor-not-allowed disabled:bg-brand/[.035] disabled:text-muted', className)} {...props}>{children}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" /></span>; }
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'positive' | 'negative' | 'info' | 'warning' }) { return <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold', tone === 'neutral' && 'bg-brand/8 text-muted', tone === 'positive' && 'bg-emerald-50 text-emerald-800', tone === 'negative' && 'bg-rose-50 text-rose-800', tone === 'info' && 'bg-blue-50 text-blue-800', tone === 'warning' && 'bg-amber-50 text-amber-900')}>{children}</span>; }
export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) { return <header className="mb-6 flex items-start justify-between gap-3 sm:mb-7 sm:gap-6"><div className="min-w-0">{eyebrow && <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[.2em] text-accent">{eyebrow}</p>}<h1 className="text-[1.65rem] font-bold leading-tight tracking-[-.035em] text-ink sm:text-3xl">{title}</h1>{description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>}</div>{action && <div className="shrink-0">{action}</div>}</header>; }
export function LoadingState({ label = 'Loading your finances…' }: { label?: string }) { return <div className="grid min-h-56 place-items-center text-sm text-muted" role="status" aria-live="polite"><span className="flex flex-col items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-surface shadow-soft"><LoaderCircle className="size-5 animate-spin text-accent" /></span>{label}</span></div>; }
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) { return <Card className="grid place-items-center gap-3 py-10 text-center"><p className="font-semibold text-ink">Something didn’t load</p><p className="max-w-md text-sm text-muted">{error instanceof Error ? error.message : 'Please try again.'}</p>{retry && <Button variant="secondary" onClick={retry}><RefreshCw className="size-4" />Retry</Button>}</Card>; }
export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) { return <Card className="surface-grid grid place-items-center gap-4 overflow-hidden py-14 text-center"><div className="grid size-14 place-items-center rounded-[1.25rem] bg-brand/[.08] text-brand shadow-sm ring-1 ring-brand/[.07]">{icon}</div><div><h2 className="font-semibold text-ink">{title}</h2><p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{description}</p></div>{action}</Card>; }
export function Modal({ open, title, description, onClose, children }: { open: boolean; title: string; description?: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const element = panel.current;
    element?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key === 'Tab' && element) {
        const focusable = [...element.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]')];
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', keydown);
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
      previous?.focus();
    };
  }, [open]);
  if (!open) return null;
  return createPortal(<div className="modal-layer animate-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} className="modal-panel animate-sheet" data-modal-panel>
      <div className="modal-header">
        <div className="modal-handle" aria-hidden="true" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><h2 id={titleId} className="text-xl font-bold tracking-tight text-ink">{title}</h2>{description && <p id={descriptionId} className="mt-1 max-w-md text-sm leading-relaxed text-muted">{description}</p>}</div>
          <Button variant="ghost" className="-mr-2 size-11 shrink-0 px-0" onClick={onClose} aria-label="Close dialog"><X className="size-5" /></Button>
        </div>
      </div>
      <div className="modal-scroll" data-modal-scroll>{children}</div>
    </section>
  </div>, document.body);
}
export function FormError({ error }: { error: unknown }) { if (!error) return null; return <div role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-200/60 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle className="mt-0.5 size-4 shrink-0" />{error instanceof Error ? error.message : 'The request failed.'}</div>; }
