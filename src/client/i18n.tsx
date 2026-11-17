import { legalBulgarian } from './bgLegal';
import { bulgarianMessages } from './bg';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Language = 'en' | 'bg';
const STORAGE_KEY = 'spendime.language';
function readStoredLanguage(): Language {
  try { return globalThis.localStorage?.getItem(STORAGE_KEY) === 'bg' ? 'bg' : 'en'; }
  catch { return 'en'; }
}
export function getLanguage(): Language {
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (saved === 'bg' || saved === 'en') return saved;
  } catch { /* Fall back to the active page language when storage is unavailable. */ }
  return globalThis.document?.documentElement.lang === 'bg' ? 'bg' : 'en';
}
export function interfaceLocale(): string { return getLanguage() === 'bg' ? 'bg-BG' : 'en-US'; }

export const bulgarianTranslations: Readonly<Record<string, string>> = { ...bulgarianMessages, ...legalBulgarian };

export function translate(language: Language, key: string, values?: Record<string, string | number>): string {
  let result = language === 'bg' ? (bulgarianTranslations[key] ?? key) : key;
  for (const [name, value] of Object.entries(values ?? {})) result = result.replaceAll(`{${name}}`, String(value));
  return result;
}

interface LanguageContextValue { language: Language; setLanguage: (language: Language) => void; t: (key: string, values?: Record<string, string | number>) => string }
const LanguageContext = createContext<LanguageContextValue>({ language: 'en', setLanguage: () => undefined, t: (key, values) => translate('en', key, values) });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readStoredLanguage);
  const setLanguage = (next: Language) => { try { localStorage.setItem(STORAGE_KEY, next); } catch { /* Switching still works without storage. */ } document.documentElement.lang = next; setLanguageState(next); };
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const value = useMemo(() => ({ language, setLanguage, t: (key: string, values?: Record<string, string | number>) => translate(language, key, values) }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);
