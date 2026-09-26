import { AlertCircle, ChevronDown, LoaderCircle, RefreshCw, X } from 'lucide-react';
import { Children, cloneElement, isValidElement, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../utils/cn';
import { useLanguage } from '../i18n';

type Translator = (key: string) => string;
function translateChildren(children: ReactNode, t: Translator): ReactNode {
  return Children.map(children, (child) => typeof child === 'string' ? t(child) : child);
}
function translateOptions(children: ReactNode, t: Translator): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement(child)) return typeof child === 'string' ? t(child) : child;
    const element = child as ReactElement<{ children?: ReactNode }>;
    if (element.type !== 'option' || typeof element.props.children !== 'string') return child;
    return cloneElement(element, undefined, t(element.props.children));
  });
}

export function Button({ className, variant = 'primary', loading = false, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; loading?: boolean }) {
  const {t}=useLanguage();
  return <button className={cn('control-press relative inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas active:scale-[.98] disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none', variant === 'primary' && 'bg-brand text-white shadow-[0_8px_20px_rgba(16,42,44,.16)] hover:bg-brand/90 hover:shadow-[0_10px_24px_rgba(16,42,44,.2)]', variant === 'secondary' && 'bg-brand/[.07] text-brand ring-1 ring-inset ring-brand/10 hover:bg-brand/[.12]', variant === 'ghost' && 'text-muted hover:bg-brand/[.07] hover:text-ink', variant === 'danger' && 'bg-rose-50 text-rose-800 ring-1 ring-inset ring-rose-200/60 hover:bg-rose-100', className)} {...props} disabled={props.disabled || loading} aria-busy={loading || undefined}><span className={cn('inline-flex items-center justify-center gap-2 [&_svg]:shrink-0', loading && 'opacity-0')}>{translateChildren(children,t)}</span>{loading && <span className="absolute inset-0 grid place-items-center"><LoaderCircle aria-hidden="true" className="size-4 animate-spin" /></span>}</button>;
}
export function Card({ children, className }: { children: ReactNode; className?: string }) { return <section className={cn('relative min-w-0 rounded-[1.4rem] border border-brand/[.06] bg-surface p-5 shadow-[0_8px_28px_rgba(18,42,43,.055)] sm:rounded-3xl', className)}>{children}</section>; }
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) { const {t}=useLanguage();return <label className="grid min-w-0 content-start gap-2 text-sm font-semibold leading-snug text-ink"><span>{t(label)}</span>{children}{hint && <span className="text-xs font-normal leading-relaxed text-muted">{t(hint)}</span>}{error && <span className="flex items-center gap-1.5 text-xs font-medium leading-relaxed text-rose-700"><AlertCircle className="size-3.5 shrink-0" />{t(error)}</span>}</label>; }
export function Input({ className, placeholder, 'aria-label': ariaLabel, ...props }: InputHTMLAttributes<HTMLInputElement>) { const {t}=useLanguage();return <input className={cn('control-press min-h-12 w-full rounded-2xl border border-brand/[.14] bg-surface px-3.5 text-base text-ink shadow-[0_1px_0_rgba(255,255,255,.8),inset_0_1px_2px_rgba(18,42,43,.025)] outline-none placeholder:text-muted/55 hover:border-brand/25 focus:border-accent focus:ring-4 focus:ring-accent/10 disabled:cursor-not-allowed disabled:bg-brand/[.035] disabled:text-muted', className)} placeholder={placeholder ? t(placeholder) : undefined} aria-label={ariaLabel ? t(ariaLabel) : undefined} {...props} />; }
export function Select({ className, children, 'aria-label': ariaLabel, ...props }: SelectHTMLAttributes<HTMLSelectElement>) { const {t}=useLanguage();return <span className="relative block min-w-0"><select className={cn('control-press min-h-12 w-full appearance-none rounded-2xl border border-brand/[.14] bg-surface py-2.5 pl-3.5 pr-10 text-base text-ink shadow-[0_1px_0_rgba(255,255,255,.8),inset_0_1px_2px_rgba(18,42,43,.025)] outline-none hover:border-brand/25 focus:border-accent focus:ring-4 focus:ring-accent/10 disabled:cursor-not-allowed disabled:bg-brand/[.035] disabled:text-muted', className)} aria-label={ariaLabel ? t(ariaLabel) : undefined} {...props}>{translateOptions(children,t)}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" /></span>; }
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'positive' | 'negative' | 'info' | 'warning' }) { const {t}=useLanguage();return <span className={cn('inline-flex max-w-full items-center break-words rounded-full px-2.5 py-1 text-xs font-semibold', tone === 'neutral' && 'bg-brand/8 text-muted', tone === 'positive' && 'bg-emerald-50 text-emerald-800', tone === 'negative' && 'bg-rose-50 text-rose-800', tone === 'info' && 'bg-blue-50 text-blue-800', tone === 'warning' && 'bg-amber-50 text-amber-900')}>{translateChildren(children,t)}</span>; }
export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) { const {t}=useLanguage();return <header className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:mb-7 sm:flex-nowrap sm:gap-6"><div className="min-w-0">{eyebrow && <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[.2em] text-accent">{t(eyebrow)}</p>}<h1 className="text-[1.65rem] font-bold leading-tight tracking-[-.035em] text-ink sm:text-3xl">{t(title)}</h1>{description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{t(description)}</p>}</div>{action && <div className="shrink-0">{action}</div>}</header>; }
export function LoadingState({ label }: { label?: string }) { const {t}=useLanguage();return <div className="grid min-h-56 place-items-center text-sm text-muted" role="status" aria-live="polite"><span className="flex flex-col items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-surface shadow-soft"><LoaderCircle className="size-5 animate-spin text-accent" /></span>{label??t('Loading your finances…')}</span></div>; }
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) { const {t}=useLanguage();return <Card className="grid place-items-center gap-3 py-10 text-center"><p className="font-semibold text-ink">{t('Something didn’t load')}</p><p className="max-w-md break-words text-sm text-muted">{error instanceof Error ? error.message : t('Please try again.')}</p>{retry && <Button variant="secondary" onClick={retry}><RefreshCw className="size-4" />{t('Retry')}</Button>}</Card>; }
export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) { const {t}=useLanguage();return <Card className="surface-grid grid place-items-center gap-4 overflow-hidden py-14 text-center"><div className="grid size-14 place-items-center rounded-[1.25rem] bg-brand/[.08] text-brand shadow-sm ring-1 ring-brand/[.07]">{icon}</div><div><h2 className="font-semibold text-ink">{t(title)}</h2><p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{t(description)}</p></div>{action}</Card>; }
export function Modal({ open, title, description, onClose, children }: { open: boolean; title: string; description?: string; onClose: () => void; children: ReactNode }) {
  const {t}=useLanguage();
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
        if (document.activeElement === element) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
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
          <div className="min-w-0"><h2 id={titleId} className="break-words text-xl font-bold tracking-tight text-ink">{t(title)}</h2>{description && <p id={descriptionId} className="mt-1 max-w-md text-sm leading-relaxed text-muted">{t(description)}</p>}</div>
          <Button variant="ghost" className="-mr-2 size-11 shrink-0 px-0" onClick={onClose} aria-label={t('Close dialog')}><X className="size-5" /></Button>
        </div>
      </div>
      <div className="modal-scroll" data-modal-scroll>{children}</div>
    </section>
  </div>, document.body);
}
export function FormError({ error }: { error: unknown }) { const {t}=useLanguage();if (!error) return null; const detail=(error as {fields?:Array<{message?:string}>}).fields?.[0]?.message;return <div role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-200/60 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle className="mt-0.5 size-4 shrink-0" />{detail||(error instanceof Error ? error.message : t('The request failed.'))}</div>; }
