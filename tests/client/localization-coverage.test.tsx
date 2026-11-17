// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { bulgarianTranslations, LanguageProvider, useLanguage } from '../../src/client/i18n';
import { Field, Input, Select, FormError } from '../../src/client/components/ui';
import { formatMoney, formatPercent } from '../../src/client/utils/money';
import { formatCalendarDate } from '../../src/client/utils/dateTime';
import { formatInterval } from '../../src/client/utils/interval';
import { categoryLabel } from '../../src/client/utils/categoryLabel';

afterEach(() => { cleanup(); localStorage.clear(); document.documentElement.lang = ''; });
function Controls() {
  const { language, setLanguage, t } = useLanguage();
  return <>
    <button onClick={() => setLanguage(language === 'en' ? 'bg' : 'en')}>switch</button>
    <Field label="Type"><Select defaultValue="cash"><option value="cash">cash</option><option value="savings">savings</option></Select></Field>
    <Field label="Account"><Select defaultValue="a"><option translate="no" value="a">Home</option></Select></Field>
    <Field label="Every"><Select defaultValue="month"><option key="month">month</option></Select></Field>
    <Field label="Amount"><Input /></Field>
    <p>{formatMoney('9007199254740993.125', 'EUR')}</p>
    <p>{formatPercent('6.25')}</p>
    <p>{formatCalendarDate('2026-11-17')}</p>
    <p>{formatInterval('month', 2, language)}</p>
    <p>{categoryLabel({name:'Food',isSystem:true},t)}</p>
    <p>{categoryLabel({name:'Food',isSystem:false},t)}</p>
    <FormError error={new Error('Invalid email or password.')} />
  </>;
}
describe('complete Bulgarian interface', () => {
  it('formats the first render in the saved language before the document language effect runs', () => {
    localStorage.setItem('spendime.language','bg');
    document.documentElement.lang = 'en';
    render(<LanguageProvider><Controls /></LanguageProvider>);
    expect(screen.getByText('+6,25%')).toBeInTheDocument();
    expect(screen.getByText('2 месеца')).toBeInTheDocument();
  });
  it('covers literal interface messages and shared component labels throughout the app', () => {
    const root = join(process.cwd(), 'src/client');
    const files = readdirSync(root, {recursive:true}).map(String).filter(file => file.endsWith('.tsx') && !file.startsWith('public') && file !== 'i18n.tsx');
    const missing = new Set<string>();
    for (const file of files) {
      const source = readFileSync(join(root,file),'utf8');
      const patterns = [/\bt\(\s*(['"])(.*?)\1/g, /\b(?:label|title|description|hint|placeholder|eyebrow|aria-label)="([^"]+)"/g];
      for (const pattern of patterns) for (const match of source.matchAll(pattern)) {
        const key = match[2] ?? match[1]!;
        if (!['Spendime','0.00'].includes(key) && /[A-Za-z]/.test(key) && !bulgarianTranslations[key]) missing.add(`${file}: ${key}`);
      }
    }
    expect([...missing]).toEqual([]);
  });
  it('preserves English interpolation placeholders in every Bulgarian message', () => {
    const placeholders = (value:string) => [...value.matchAll(/\{(\w+)\}/g)].map(match=>match[1]).sort();
    for (const [key,value] of Object.entries(bulgarianTranslations)) expect(placeholders(value),key).toEqual(placeholders(key));
  });
  it('switches labels and formatting in both directions while keeping dropdown values and custom names', async () => {
    render(<LanguageProvider><Controls /></LanguageProvider>);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button',{name:'switch'}));
    expect(screen.getByLabelText('Тип')).toHaveValue('cash');
    expect(screen.getByLabelText('На всеки')).toHaveValue('month');
    expect(within(screen.getByLabelText('Тип')).getByRole('option',{name:'в брой'})).toHaveValue('cash');
    expect(screen.getByRole('option',{name:'Home'})).toHaveValue('a');
    expect(screen.getByText('Храна')).toBeInTheDocument();
    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.getByText('+6,25%')).toBeInTheDocument();
    expect(screen.getByText('2 месеца')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Невалиден имейл или парола.');
    expect(screen.getByText((_,element)=>element?.tagName === 'P' && element.textContent === formatMoney('9007199254740993.125','EUR','bg-BG'))).toBeInTheDocument();
    expect(screen.getByText(new Intl.DateTimeFormat('bg-BG',{dateStyle:'medium',timeZone:'UTC'}).format(new Date('2026-11-17T12:00:00Z')))).toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'switch'}));
    expect(screen.getByLabelText('Type')).toHaveValue('cash');
    expect(screen.getByLabelText('Every')).toHaveValue('month');
    expect(screen.getByText('+6.25%')).toBeInTheDocument();
    expect(screen.getByText('2 months')).toBeInTheDocument();
  });
});
