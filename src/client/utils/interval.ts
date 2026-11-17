import type { Language } from '../i18n';

export function formatInterval(unit: 'day' | 'week' | 'month' | 'year', count: number, language: Language): string {
  if (language === 'en') return `${count === 1 ? '' : `${count} `}${unit}${count === 1 ? '' : 's'}`;
  const forms = { day: ['ден', 'дни'], week: ['седмица', 'седмици'], month: ['месец', 'месеца'], year: ['година', 'години'] };
  return `${count === 1 ? '' : `${count} `}${forms[unit][count === 1 ? 0 : 1]}`;
}

export function formatRecurrence(unit: 'day' | 'week' | 'month' | 'year', count: number, language: Language): string {
  const interval = formatInterval(unit, count, language);
  if (language === 'en') return `Every ${interval}`;
  return count === 1 ? `${unit === 'week' || unit === 'year' ? 'Всяка' : 'Всеки'} ${interval}` : `На всеки ${interval}`;
}
