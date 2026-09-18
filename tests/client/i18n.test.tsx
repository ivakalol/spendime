// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { LanguageProvider, translate, useLanguage } from '../../src/client/i18n';

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.lang = '';
});

function LanguageControl() {
  const { language, setLanguage, t } = useLanguage();
  return <>
    <p>{t('Settings')}</p>
    <p>{language}</p>
    <button onClick={() => setLanguage('bg')}>switch</button>
  </>;
}

describe('interface translations', () => {
  it('uses English by default and interpolates Bulgarian messages', () => {
    expect(translate('en', 'Settings')).toBe('Settings');
    expect(translate('bg', 'Settings')).toBe('Настройки');
    expect(translate('bg', 'Good morning, {name}', { name: 'Иво' })).toBe('Добро утро, Иво');
  });

  it('switches immediately and persists the choice on this device', async () => {
    render(<LanguageProvider><LanguageControl /></LanguageProvider>);
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('en')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'switch' }));

    expect(screen.getByText('Настройки')).toBeInTheDocument();
    expect(screen.getByText('bg')).toBeInTheDocument();
    expect(localStorage.getItem('spendime.language')).toBe('bg');
    expect(document.documentElement.lang).toBe('bg');
  });
});
