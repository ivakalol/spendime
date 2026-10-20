// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { ScrollRail } from '../../src/client/components/ScrollRail';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('suppresses clipped label fragments while retaining an accessible option name', () => {
  let measure = () => {};
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { measure = callback; } observe() {} disconnect() {} });
  render(<ScrollRail role="group" aria-label="Types"><button aria-label="Refund" data-scroll-item><span>Refund</span></button></ScrollRail>);
  const rail = screen.getByRole('group', { name: 'Types' });
  const option = screen.getByRole('button', { name: 'Refund' });
  Object.defineProperties(rail, { clientWidth: { value: 200 }, scrollWidth: { value: 600 } });
  vi.spyOn(rail, 'getBoundingClientRect').mockReturnValue({ left: 20, right: 220 } as DOMRect);
  const label = vi.spyOn(option.querySelector('span')!, 'getBoundingClientRect').mockReturnValue({ left: 200, right: 250 } as DOMRect);
  act(measure);
  expect(option).toHaveAttribute('data-partial-label', 'true');
  expect(option).toHaveAccessibleName('Refund');
  label.mockReturnValue({ left: 140, right: 190 } as DOMRect);
  fireEvent.scroll(rail);
  expect(option).toHaveAttribute('data-partial-label', 'false');
});

it('shows controls only for overflow and updates both ends after swiping or resizing', async () => {
  let measure = () => {};
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { measure = callback; } observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  render(<ScrollRail role="group" aria-label="Types"><button>Expense</button><button>Income</button></ScrollRail>);
  const rail = screen.getByRole('group', { name: 'Types' });
  expect(screen.queryByRole('button', { name: 'More options' })).not.toBeInTheDocument();
  Object.defineProperties(rail, { clientWidth: { value: 200, configurable: true }, scrollWidth: { value: 600 } });
  rail.scrollBy = vi.fn();
  act(measure);
  expect(screen.getByRole('button', { name: 'Previous options' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'More options' }));
  expect(rail.scrollBy).toHaveBeenCalledWith({ left: 160, behavior: 'instant' });
  rail.scrollLeft = 200; fireEvent.scroll(rail);
  expect(screen.getByRole('button', { name: 'Previous options' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'More options' })).toBeEnabled();
  rail.scrollLeft = 400; fireEvent.scroll(rail);
  expect(screen.getByRole('button', { name: 'More options' })).toBeDisabled();
  expect(rail).toHaveAttribute('data-end', 'true');
  Object.defineProperty(rail, 'clientWidth', { value: 600 });
  act(measure);
  expect(screen.queryByRole('button', { name: 'More options' })).not.toBeInTheDocument();
});

it('reveals selected items horizontally without scrolling their page or sheet', () => {
  let measure = () => {};
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { measure = callback; } observe() {} disconnect() {} });
  const view = (active: string) => <ScrollRail activeValue={active} role="group" aria-label="Types"><button aria-pressed={active === 'a'}>Expense</button><button aria-pressed={active === 'b'}>Debt payment</button></ScrollRail>;
  const { rerender } = render(view('a'));
  const rail = screen.getByRole('group', { name: 'Types' });
  Object.defineProperties(rail, { clientWidth: { value: 200 }, scrollWidth: { value: 600 } });
  vi.spyOn(rail, 'getBoundingClientRect').mockReturnValue({ left: 20, right: 220 } as DOMRect);
  vi.spyOn(screen.getByRole('button', { name: 'Expense' }), 'getBoundingClientRect').mockReturnValue({ left: 24, right: 110 } as DOMRect);
  vi.spyOn(screen.getByRole('button', { name: 'Debt payment' }), 'getBoundingClientRect').mockReturnValue({ left: 450, right: 536 } as DOMRect);
  act(measure);
  rerender(view('b'));
  expect(rail.scrollLeft).toBe(320);
});
