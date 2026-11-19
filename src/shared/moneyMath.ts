// Exact ledger arithmetic at four decimal places; callers validate input first.
export function moneyUnits(value: string): bigint {
  const normalized = value.replace(',', '.');
  const [whole = '0', fraction = ''] = normalized.replace(/^-/, '').split('.');
  return BigInt(whole + fraction.padEnd(4, '0')) * (normalized.startsWith('-') ? -1n : 1n);
}
export function moneyDecimal(value: bigint): string {
  const digits = (value < 0n ? -value : value).toString().padStart(5, '0');
  return `${value < 0n ? '-' : ''}${digits.slice(0, -4)}.${digits.slice(-4)}`;
}
