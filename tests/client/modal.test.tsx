// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button, Field, Input, Modal, Select } from '../../src/client/components/ui';

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('responsive modal primitive', () => {
  it('skips hidden and untabbable controls when trapping focus', async () => {
    render(<Modal open title="Dialog" onClose={vi.fn()}><div hidden><Button>Hidden</Button></div><input type="hidden" /><Button tabIndex={-1}>Radio sibling</Button><div style={{display:'none'}}><Button>Also hidden</Button></div><Button>Visible action</Button><div tabIndex={0}>Chart values</div></Modal>);
    await userEvent.tab({shift:true});
    expect(screen.getByText('Chart values')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button',{name:'Close dialog'})).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button',{name:'Visible action'})).toHaveFocus();
  });

  it('associates field hints and errors without adding them to the field name', () => {
    render(<><Field label="Amount" hint="In EUR" error="Enter a positive amount"><Input /></Field><Field label="Account" hint="Where you paid"><Select><option>Cash</option></Select></Field></>);
    expect(screen.getByRole('textbox',{name:'Amount'})).toHaveAccessibleDescription('In EUR Enter a positive amount');
    expect(screen.getByRole('textbox',{name:'Amount'})).toHaveAttribute('aria-invalid','true');
    expect(screen.getByRole('combobox',{name:'Account'})).toHaveAccessibleDescription('Where you paid');
  });
  it('keeps backward keyboard navigation inside the initially focused dialog', async () => {
    render(<Modal open title="Dialog" onClose={vi.fn()}><Button>Last action</Button></Modal>);
    expect(screen.getByRole('dialog')).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Last action' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();
  });

  it('preserves the action label and disables a busy button', () => {
    render(<Button loading>Save changes</Button>);
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  });
  it('keeps its header outside the single scrolling content region', () => {
    render(<Modal open title="New money account" description="Account details" onClose={vi.fn()}><form><label>Name<input /></label><Button>Save account</Button></form></Modal>);
    const dialog = screen.getByRole('dialog', { name: 'New money account' });
    const scrollRegion = dialog.querySelector('[data-modal-scroll]');
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    expect(dialog).toHaveAccessibleDescription('Account details');
    expect(scrollRegion).toBeInTheDocument();
    expect(scrollRegion).toContainElement(screen.getByRole('button', { name: 'Save account' }));
    expect(scrollRegion).not.toContainElement(screen.getByRole('heading', { name: 'New money account' }));
  });

  it('locks both page scroll roots and restores them after closing', () => {
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'scroll';
    const { rerender } = render(<Modal open title="Dialog" onClose={vi.fn()}><Button>Action</Button></Modal>);
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');
    rerender(<Modal open={false} title="Dialog" onClose={vi.fn()}><Button>Action</Button></Modal>);
    expect(document.body.style.overflow).toBe('auto');
    expect(document.documentElement.style.overflow).toBe('scroll');
  });

  it('closes from Escape and the accessible close control', async () => {
    const onClose = vi.fn();
    const { rerender } = render(<Modal open title="Dialog" onClose={onClose}><Button>Action</Button></Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(<Modal open title="Dialog" onClose={onClose}><Button>Action</Button></Modal>);
    await userEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('prevents dismissal while an important request is pending', () => {
    const onClose = vi.fn();
    render(<Modal open closeDisabled title="Signing out" onClose={onClose}><Button loading>Confirm</Button></Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement!);
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('resizes phone sheets to the visible area when a software keyboard opens', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390);
    const viewport = Object.assign(new EventTarget(), {height:844,offsetTop:0,scale:1});
    vi.stubGlobal('visualViewport', viewport);
    render(<Modal open title="Entry" onClose={vi.fn()}><input /></Modal>);
    const layer = screen.getByRole('dialog').parentElement!;
    expect(layer.style.getPropertyValue('--dialog-height')).toBe('844px');
    viewport.height = 350; viewport.offsetTop = 120;
    viewport.dispatchEvent(new Event('resize'));
    expect(layer.style.getPropertyValue('--dialog-height')).toBe('350px');
    expect(layer.style.getPropertyValue('--dialog-top')).toBe('120px');
  });
});
