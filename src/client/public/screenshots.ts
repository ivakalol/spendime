// Bump when captures change so cached public images cannot retain an old demo.
export const screenshotUrl = (file: string) => `/showcase/${file}?v=ivo-2`;

export const screenshotViews = {
  Dashboard: { desktop: 'dashboard-desktop.jpg', mobile: 'dashboard-mobile.jpg', alt: 'Spendime Dashboard with fictional balances, period controls and cash flow.' },
  Transactions: { desktop: 'transactions-desktop.jpg', mobile: 'transactions-mobile.jpg', alt: 'Spendime Transactions with fictional entries, categories and account details.' },
  Accounts: { desktop: 'accounts-desktop.jpg', mobile: 'accounts-mobile.jpg', alt: 'Spendime Money accounts with fictional checking and savings balances.' },
  Analytics: { desktop: 'dashboard-desktop.jpg', mobile: 'analytics-mobile.jpg', alt: 'Real Spendime spending trend and category charts with fictional data.' },
  Categories: { desktop: 'transactions-desktop.jpg', mobile: 'categories-mobile.jpg', alt: 'Real Spendime category management with fictional example categories.' },
} as const;

export const desktopViews = ['Dashboard', 'Transactions', 'Accounts'] as const;
export const mobileViews = ['Dashboard', 'Transactions', 'Accounts', 'Analytics', 'Categories'] as const;
export type ScreenshotView = keyof typeof screenshotViews;

export function guideMobileScreenshot(slug: string, preview: string) {
  if (slug === 'assets') return 'assets-mobile.jpg';
  if (slug === 'debts') return 'debts-mobile.jpg';
  if (slug === 'recurring-payments') return 'recurring-mobile.jpg';
  if (slug === 'categories') return 'categories-mobile.jpg';
  if (slug === 'dashboard' || slug === 'spread-cost') return 'analytics-mobile.jpg';
  return preview === 'accounts' ? 'accounts-mobile.jpg' : preview === 'transactions' ? 'transactions-mobile.jpg' : 'dashboard-mobile.jpg';
}
