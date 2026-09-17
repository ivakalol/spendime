const DECIMAL = /^([+-]?)(\d+)(?:\.(\d+))?$/;

function parts(value: string, fractionDigits = 2) {
  const match = DECIMAL.exec(value.trim());
  if (!match) return { negative: false, whole: '0', fraction: ''.padEnd(fractionDigits, '0') };
  const negative = match[1] === '-';
  let whole = (match[2] ?? '0').replace(/^0+(?=\d)/, '');
  const source = match[3] ?? '';
  let fraction = source.slice(0, fractionDigits).padEnd(fractionDigits, '0');
  const roundDigit = source[fractionDigits] ?? '0';
  if (roundDigit >= '5') {
    const scaled = BigInt(whole + fraction) + 1n;
    const padded = scaled.toString().padStart(fractionDigits + 1, '0');
    whole = padded.slice(0, -fractionDigits) || '0';
    fraction = padded.slice(-fractionDigits);
  }
  return { negative: negative && (whole !== '0' || /[1-9]/.test(fraction)), whole, fraction };
}

export function formatMoney(value: string | null | undefined, currency = 'EUR', locale?: string): string {
  const safe = value ?? '0';
  const { negative, whole, fraction } = parts(safe, 2);
  const resolvedLocale = locale ?? navigator.language ?? 'en';
  const sample = new Intl.NumberFormat(resolvedLocale, { style: 'currency', currency, currencyDisplay: 'symbol' }).formatToParts(0);
  const symbol = sample.find((part) => part.type === 'currency')?.value ?? currency;
  const group = sample.find((part) => part.type === 'group')?.value ?? ',';
  const decimal = sample.find((part) => part.type === 'decimal')?.value ?? '.';
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  const amount = `${negative ? '−' : ''}${grouped}${decimal}${fraction}`;
  const currencyFirst = sample.findIndex((part) => part.type === 'currency') < sample.findIndex((part) => part.type === 'integer');
  return currencyFirst ? `${symbol}${amount}` : `${amount}\u00a0${symbol}`;
}

export function formatPercent(value: string | null | undefined): string {
  if (value == null) return '—';
  const { negative, whole, fraction } = parts(value, 2);
  const positive = !negative && !/^0(?:\.0+)?$/.test(value);
  return `${positive ? '+' : negative ? '−' : ''}${whole}.${fraction}%`;
}

export function decimalSign(value: string | null | undefined): -1 | 0 | 1 {
  if (!value || /^[-+]?0*(?:\.0*)?$/.test(value)) return 0;
  return value.trim().startsWith('-') ? -1 : 1;
}
