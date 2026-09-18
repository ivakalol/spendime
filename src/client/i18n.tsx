import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Language = 'en' | 'bg';
const STORAGE_KEY = 'spendime.language';

const bg: Record<string, string> = {
  'Dashboard': 'Табло', 'Transactions': 'Транзакции', 'Accounts': 'Сметки', 'Assets': 'Активи',
  'Liabilities': 'Задължения', 'Recurring': 'Периодични', 'Categories': 'Категории', 'Settings': 'Настройки',
  'Sign out': 'Изход', 'Signing out…': 'Излизане…', 'More': 'Още', 'Quick add': 'Бързо добавяне',
  'Accounts, planning, and preferences.': 'Сметки, планиране и предпочитания.',
  'Profile': 'Профил', 'Your financial calendar follows the profile timezone stored on the server.': 'Финансовият календар следва часовата зона на профила.',
  'Account': 'Акаунт', 'Name': 'Име', 'Email': 'Имейл', 'Base currency': 'Основна валута',
  'Timezone': 'Часова зона', 'Profile:': 'Профил:', 'This device:': 'Това устройство:',
  'Browser detection is informational only and never overwrites your stored IANA timezone.': 'Разпознатата от браузъра зона е само информативна и не променя запазената IANA часова зона.',
  'Language': 'Език', 'Interface language': 'Език на интерфейса', 'English': 'Английски', 'Bulgarian': 'Български',
  'Language preference is saved on this device.': 'Избраният език се запазва на това устройство.',
  'Private session': 'Поверителна сесия',
  'Authentication uses a revocable, server-side session with a secure HttpOnly cookie. Spendime stores no token or financial dataset in localStorage, sessionStorage, or IndexedDB.': 'Удостоверяването използва отменяема сървърна сесия със защитена HttpOnly бисквитка. Spendime не пази токени или финансови данни в localStorage, sessionStorage или IndexedDB.',
  'Profile editing is intentionally deferred because the backend does not yet expose a profile update endpoint.': 'Редактирането на профила все още не е налично, защото сървърът не предоставя такава функция.',
  'Loading your finances…': 'Зареждане на финансите…', 'Something didn’t load': 'Нещо не се зареди', 'Please try again.': 'Моля, опитайте отново.', 'Retry': 'Опитай пак', 'Close dialog': 'Затвори прозореца',
  'Building your financial view…': 'Подготвяне на финансовия преглед…',
  'Day': 'Ден', 'Week': 'Седмица', 'Month': 'Месец', '6 months': '6 месеца', 'Year': 'Година',
  'Good morning, {name}': 'Добро утро, {name}', 'Good afternoon, {name}': 'Добър ден, {name}', 'Good evening, {name}': 'Добър вечер, {name}',
  'Cash movement and lived financial utility, kept deliberately separate.': 'Паричните движения и реалната финансова полза са показани отделно.',
  'Actual spending': 'Реални разходи', 'Actual income': 'Реални приходи', 'Net cash flow': 'Нетен паричен поток', 'Utility-adjusted cost': 'Разход според полезността',
  'Cash that left for consumption': 'Пари, изразходвани за потребление', 'Cash received in this period': 'Получени пари за периода', 'Income minus ordinary spending': 'Приходи минус обичайни разходи', 'Consumption impact across use days': 'Ефект от потреблението за дните на употреба',
  'Money movement vs. utility': 'Парични движения спрямо полезност', 'Visual estimates only; displayed totals above remain exact backend decimals.': 'Графиката е ориентировъчна; сумите по-горе остават точни.',
  'Your trends will appear after your first entries.': 'Тенденциите ще се появят след първите записи.', 'Long-term position': 'Дългосрочна позиция',
  'Outstanding balance': 'Оставащ баланс', 'Invested principal': 'Инвестирана главница', 'Cumulative contributions': 'Общо вноски',
  'Market appreciation is not cash income. Asset purchases are shown separately from ordinary consumption.': 'Пазарното поскъпване не е паричен приход. Покупките на активи са отделени от обичайното потребление.',
  'Spending by category': 'Разходи по категории', 'No spending in this period.': 'Няма разходи за периода.', 'Account balances': 'Баланси по сметки', 'Create an account to begin.': 'Създайте сметка, за да започнете.',
  'Income': 'Приходи', 'Utility impact': 'Ефект от полезността', 'Asset gain change': 'Промяна в печалбата от активи',
  'Welcome back': 'Добре дошли отново', 'Start clearly': 'Започнете ясно', 'Sign in to your finances': 'Влезте във финансите си', 'Create your private account': 'Създайте личен акаунт',
  'Your session stays in a secure HttpOnly cookie—never browser storage.': 'Сесията се пази в защитена HttpOnly бисквитка, а не в хранилището на браузъра.',
  'Password': 'Парола', 'Please wait…': 'Моля, изчакайте…', 'Sign in': 'Вход', 'Create account': 'Създай акаунт',
  'New to Spendime?': 'Нов потребител?', 'Already have an account?': 'Вече имате акаунт?', 'Create an account': 'Създай акаунт',
  'At least 12 characters, with upper/lowercase letters and a number.': 'Поне 12 знака, с главни и малки букви и цифра.',
  'Money, in context': 'Парите в контекст', 'See what your money does—not only where it goes.': 'Вижте какво правят парите ви, не само къде отиват.',
  'Cash flow and everyday utility stay distinct, so a long-lived purchase tells a truer story over time.': 'Паричният поток и ежедневната полезност са отделени, за да показват по-точно стойността във времето.',
  'Private by design · Self-hosted on your Pi': 'Поверително по дизайн · Хоствано на вашия Pi',
  'Offline.': 'Офлайн.', 'Loaded screens remain available, but financial changes are disabled.': 'Заредените екрани остават достъпни, но финансовите промени са изключени.',
  'Ledger': 'Дневник', 'Money accounts': 'Парични сметки', 'Ownership': 'Собственост', 'Organization': 'Организация', 'Templates': 'Шаблони',
  'New': 'Ново', 'Edit': 'Редакция', 'Delete': 'Изтрий', 'Save': 'Запази', 'Cancel': 'Отказ', 'Archive': 'Архивирай', 'Archived': 'Архивирана', 'Restore': 'Възстанови', 'Manage': 'Управление',
  'Liquid funds': 'Налични средства', 'Where your spendable money lives. Archived accounts stay out of balances and can be restored or removed.': 'Мястото на разполагаемите ви средства. Архивираните сметки не участват в балансите и могат да бъдат възстановени или изтрити.',
  'No accounts yet': 'Все още няма сметки', 'Add cash, a card, or savings account to start recording money movement.': 'Добавете пари в брой, карта или спестовна сметка, за да започнете да записвате движения.',
  'Opening balance': 'Начален баланс', 'Institution': 'Институция', 'Optional': 'По избор', 'Color': 'Цвят', 'Type': 'Тип', 'Currency': 'Валута',
  'Manage account': 'Управление на сметка', 'New money account': 'Нова парична сметка', 'Save account': 'Запази сметката', 'Saving…': 'Запазване…',
  'Restoring…': 'Възстановяване…', 'Deleting…': 'Изтриване…', 'Delete permanently': 'Изтрий завинаги',
  'Opening': 'Начален баланс', 'Permanently delete {name}? This cannot be undone.': 'Да се изтрие ли {name} завинаги? Това действие не може да бъде отменено.',
  'cash': 'в брой', 'checking': 'разплащателна', 'savings': 'спестовна', 'credit': 'кредитна', 'investment': 'инвестиционна', 'other': 'друга',
  'Actual cash movements, transfers, investments, and utility methods remain visibly distinct.': 'Реалните парични движения, преводи, инвестиции и методи за полезност остават ясно разграничени.',
  'Filter by type': 'Филтър по тип', 'All transaction types': 'Всички типове транзакции', 'Expenses': 'Разходи', 'Transfers': 'Преводи', 'Asset purchases': 'Покупки на активи', 'Liability payments': 'Плащания по задължения',
  'Filter by account': 'Филтър по сметка', 'All accounts': 'Всички сметки', 'Filter by category': 'Филтър по категория', 'All categories': 'Всички категории', 'From date': 'От дата', 'Through date': 'До дата',
  'Sort transactions': 'Сортиране на транзакциите', 'Newest occurrence': 'Най-нови по дата', 'Recently added': 'Последно добавени', 'Largest amount': 'Най-голяма сума',
  'No transactions yet': 'Все още няма транзакции', 'Use the centered Quick Add button to record your first money movement.': 'Използвайте централния бутон за бързо добавяне, за да запишете първото движение.',
  'Previous': 'Предишна', 'Next': 'Следваща', 'Amortized': 'Разпределена', 'Transfer': 'Превод', 'Reversed': 'Сторнирана', 'Utility:': 'Полезност:',
  'Delete and fully reverse this transaction? Its audit record will be preserved.': 'Да се изтрие и сторнира напълно тази транзакция? Одитният запис ще бъде запазен.', '{count} total': 'Общо: {count}',
  'Edit transaction': 'Редакция на транзакция', 'Delete and reverse transaction': 'Изтрий и сторнирай транзакцията',
  'Account changes automatically reverse the old balance effect and apply it to the new account.': 'Промяната на сметката автоматично отменя ефекта върху стария баланс и го прилага към новата сметка.',
  'Amount': 'Сума', 'From account': 'От сметка', 'Paid from': 'Платено от', 'Pay from': 'Плати от', 'To account': 'Към сметка', 'Received into': 'Получено в', 'Receive into': 'Получи в',
  'Choose account': 'Изберете сметка', 'Choose two different accounts.': 'Изберете две различни сметки.', 'Category': 'Категория', 'Uncategorized': 'Без категория', 'Date & time': 'Дата и час',
  'Use starts': 'Начало на употребата', 'Use ends': 'Край на употребата', 'Note': 'Бележка', 'Save changes': 'Запази промените',
  'Principal, market value, and gain/loss stay separate—especially across repeated contributions.': 'Главницата, пазарната стойност и печалбата/загубата се следят отделно — особено при последователни вноски.',
  'No assets yet': 'Все още няма активи', 'Add an investment, depreciating item, or custom asset to track its value over time.': 'Добавете инвестиция, амортизируем предмет или персонализиран актив, за да следите стойността му.', 'Create asset': 'Създай актив',
  'New asset': 'Нов актив', 'The initial contribution becomes the first immutable cost-basis event.': 'Първоначалната вноска става първото неизменно събитие в себестойността.',
  'Classification': 'Класификация', 'Appreciating': 'Поскъпващ', 'Depreciating': 'Амортизируем', 'Custom': 'Персонализиран', 'Initial contribution': 'Първоначална вноска', 'Current value': 'Текуща стойност', 'Current market value': 'Текуща пазарна стойност',
  'Acquisition date': 'Дата на придобиване', 'Depreciation model': 'Модел на амортизация', 'None': 'Няма', 'Straight line': 'Линейна', 'Useful life in days': 'Полезен живот в дни', 'Notes': 'Бележки',
  'Overview': 'Преглед', 'Contribute': 'Вноска', 'Valuation': 'Оценка', 'Contribution': 'Вноска', 'Source account': 'Изходна сметка', 'Principal only — no cash transaction': 'Само главница — без парична транзакция',
  'Record valuation': 'Запиши оценката', 'Valuation history': 'История на оценките', 'Contribution history': 'История на вноските', 'Contributed at': 'Внесено на', 'Valued at': 'Оценено на', 'Contributed': 'Внесено',
  'Contributed principal': 'Внесена главница', 'Market value': 'Пазарна стойност', 'Absolute gain/loss': 'Абсолютна печалба/загуба', 'Simple return': 'Проста доходност',
  'Account purchase': 'Покупка през сметка', 'Principal only': 'Само главница', 'Archive asset': 'Архивирай актива', 'Add contribution': 'Добави вноска', 'Adding…': 'Добавяне…',
  'Save valuation': 'Запази оценката', 'Editing': 'Редактиране', 'Cancel valuation edit': 'Откажи редакцията на оценка', 'Edit valuation from {date}': 'Редактирай оценката от {date}',
  'simple return on cumulative contributed principal': 'проста доходност върху общо внесената главница', 'appreciating': 'поскъпващ', 'depreciating': 'амортизируем', 'custom': 'персонализиран', 'Creating…': 'Създаване…',
  'System categories provide a stable base; your custom categories can be adapted or archived.': 'Системните категории осигуряват стабилна основа; вашите категории могат да се редактират или архивират.',
  'No categories': 'Няма категории', 'Create a category to make your spending breakdown more useful.': 'Създайте категория за по-полезна разбивка на разходите.', 'System': 'Системна', 'Edit category': 'Редакция на категория', 'New category': 'Нова категория', 'Used for': 'Използва се за', 'Both': 'И двете', 'Save category': 'Запази категорията',
  'Obligations': 'Задължения', 'Outstanding debt as recorded—without implying automatic interest accrual or a payment engine.': 'Записаните непогасени задължения — без автоматично начисляване на лихва или плащания.',
  'No liabilities': 'Няма задължения', 'Add a loan or future obligation when you need to track what remains outstanding.': 'Добавете заем или бъдещо задължение, за да следите оставащата сума.', 'No lender': 'Няма кредитор',
  'Manage liability': 'Управление на задължение', 'New liability': 'Ново задължение', 'Original principal': 'Първоначална главница', 'Outstanding': 'Оставаща сума', 'Stated APR %': 'Годишна лихва %', 'Lender': 'Кредитор', 'Opened': 'Открито', 'Due': 'Падеж', 'Status': 'Статус', 'Active': 'Активно', 'Paid': 'Платено', 'Defaulted': 'В просрочие', 'Cancel record': 'Анулирай записа',
  'Recurring rules': 'Периодични правила', 'Schedules are templates only. No background worker creates transactions automatically yet.': 'Графиците са само шаблони. Все още няма автоматично създаване на транзакции.',
  'No recurring rules': 'Няма периодични правила', 'Create a schedule template for subscriptions or regular income.': 'Създайте график за абонаменти или редовни приходи.', 'Paused': 'Пауза',
  'Manage rule': 'Управление на правило', 'New recurring rule': 'Ново периодично правило', 'Expense': 'Разход', 'Choose': 'Изберете', 'Every': 'На всеки', 'Unit': 'Единица', 'Starts': 'Начало', 'Next due': 'Следващ падеж', 'Pause': 'Пауза', 'Save rule': 'Запази правилото',
  'day': 'ден', 'week': 'седмица', 'month': 'месец', 'year': 'година',
  'Record a movement in a few taps. Saved backend totals remain authoritative.': 'Запишете движение с няколко докосвания. Запазените суми от сървъра са окончателни.',
  'Choose asset': 'Изберете актив', 'Liability': 'Задължение', 'Choose liability': 'Изберете задължение', 'Expected use (days)': 'Очаквана употреба (дни)',
  'The full price leaves your account today. Utility impact is spread across this inclusive period; the saved backend result is final.': 'Цялата цена се изважда от сметката днес. Ефектът от полезността се разпределя за периода; резултатът от сървъра е окончателен.',
  'What was this for?': 'За какво беше това?', 'Offline': 'Офлайн', 'Save entry': 'Запази записа', 'The request failed.': 'Заявката беше неуспешна.',
  'Entry type': 'Тип запис', 'Asset buy': 'Покупка на актив', 'Debt payment': 'Плащане на дълг',
  'Your device is in {timezone}; this entry uses your profile timezone.': 'Устройството ви е в {timezone}; записът използва часовата зона на профила.',
  'Create a money account before adding an entry.': 'Създайте парична сметка, преди да добавите запис.',
  'Password credentials are ready to coexist with future Google sign-in.': 'Входът с парола е подготвен да работи и с бъдещ вход чрез Google.',
};

export function translate(language: Language, key: string, values?: Record<string, string | number>): string {
  let result = language === 'bg' ? (bg[key] ?? key) : key;
  for (const [name, value] of Object.entries(values ?? {})) result = result.replaceAll(`{${name}}`, String(value));
  return result;
}

interface LanguageContextValue { language: Language; setLanguage: (language: Language) => void; t: (key: string, values?: Record<string, string | number>) => string }
const LanguageContext = createContext<LanguageContextValue>({ language: 'en', setLanguage: () => undefined, t: (key, values) => translate('en', key, values) });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => localStorage.getItem(STORAGE_KEY) === 'bg' ? 'bg' : 'en');
  const setLanguage = (next: Language) => { localStorage.setItem(STORAGE_KEY, next); setLanguageState(next); };
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const value = useMemo(() => ({ language, setLanguage, t: (key: string, values?: Record<string, string | number>) => translate(language, key, values) }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);
