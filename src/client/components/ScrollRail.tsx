import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useId, useRef, useState, type HTMLAttributes } from 'react';
import { useLanguage } from '../i18n';
import { cn } from '../utils/cn';

function revealItem(element: HTMLDivElement, target?: HTMLElement | null) {
  if (!target || element.scrollWidth <= element.clientWidth) return;
  const bounds = element.getBoundingClientRect(), item = target.getBoundingClientRect();
  // Change this rail only, never its page or bottom sheet.
  if (item.left < bounds.left + 4) element.scrollLeft += item.left - bounds.left - 4;
  else if (item.right > bounds.right - 4) element.scrollLeft += item.right - bounds.right + 4;
}

/** Horizontal controls keep their native touch scrolling; arrows never overlay items. */
export function ScrollRail({ children, className, activeValue, ...props }: HTMLAttributes<HTMLDivElement> & { activeValue?: string }) {
  const { t } = useLanguage();
  const id = useId();
  const rail = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ overflow: false, start: true, end: true });
  useEffect(() => {
    const element = rail.current;
    if (!element) return;
    const measure = () => {
      const start = element.scrollLeft <= 2;
      const end = element.scrollLeft + element.clientWidth >= element.scrollWidth - 2;
      setEdges({
        // Test the space available without arrows, so they cannot perpetuate overflow.
        overflow: element.scrollWidth > (element.parentElement?.clientWidth || element.clientWidth) + 2,
        start, end,
      });
      // An icon/card can peek out at the edge without leaving half a word visible.
      const bounds = element.getBoundingClientRect();
      const labels = [...element.querySelectorAll<HTMLElement>('[data-scroll-item]')].map(item => ({ item, text: item.querySelector('span')?.getBoundingClientRect() }));
      labels.forEach(({ item, text }) => { item.dataset.partialLabel = String(Boolean(text && (text.left < bounds.left + (start ? 0 : 8) || text.right > bounds.right - (end ? 0 : 8)))); });
    };
    const resize = () => { revealItem(element, element.querySelector<HTMLElement>('[aria-checked="true"], [aria-pressed="true"]')); measure(); };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    Array.from(element.children).forEach(child => observer?.observe(child));
    element.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', resize);
    return () => { observer?.disconnect(); element.removeEventListener('scroll', measure); window.removeEventListener('resize', resize); };
  }, [children]);

  useEffect(() => {
    const element = rail.current;
    const selected = element?.querySelector<HTMLElement>('[aria-checked="true"], [aria-pressed="true"]');
    if (element) revealItem(element, selected);
  }, [activeValue, edges.overflow]);

  const move = (direction: number) => {
    const element = rail.current;
    if (!element) return;
    element.scrollBy({ left: direction * element.clientWidth * .8, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  return <div className="scroll-rail" data-overflow={edges.overflow}>
    {edges.overflow && <button type="button" className="scroll-rail-arrow" aria-label={t('Previous options')} aria-controls={id} disabled={edges.start} onClick={() => move(-1)}><ChevronLeft aria-hidden="true" className="size-4" /></button>}
    <div {...props} id={id} ref={rail} className={cn('scroll-rail-content', className)} data-start={edges.start} data-end={edges.end} onFocusCapture={event => {
      props.onFocusCapture?.(event);
      const element = rail.current, target = event.target as HTMLElement;
      if (element && target !== element) revealItem(element, target);
    }}>{children}</div>
    {edges.overflow && <button type="button" className="scroll-rail-arrow" aria-label={t('More options')} aria-controls={id} disabled={edges.end} onClick={() => move(1)}><ChevronRight aria-hidden="true" className="size-4" /></button>}
  </div>;
}
