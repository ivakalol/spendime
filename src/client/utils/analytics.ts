// Ledger precision is four decimal places. Numbers are used only for chart geometry.
export function units(value: string): bigint {
  const negative = value.startsWith('-');
  const [whole = '0', fraction = ''] = value.replace(/^[+-]/, '').split('.');
  return BigInt(whole + fraction.padEnd(4, '0').slice(0, 4)) * (negative ? -1n : 1n);
}
export function decimal(value: bigint): string {
  const absolute = (value < 0n ? -value : value).toString().padStart(5, '0');
  return `${value < 0n ? '-' : ''}${absolute.slice(0, -4)}.${absolute.slice(-4)}`;
}
export function spendingChange(current: string, previous: string): string {
  const before = units(previous), now = units(current);
  if (before <= 0n) return 'No positive spending in the previous period';
  const change = (now - before) * 1000n / before;
  if (change === 0n) return 'Unchanged from the previous period';
  const absolute = change < 0n ? -change : change;
  return `${absolute / 10n}.${absolute % 10n}% ${change > 0n ? 'more' : 'less'} than the previous period`;
}
type Category = { categoryId: string | null; categoryName: string; actualSpending: string; currency: string };
export function categoryBreakdown(rows: Category[], currency: string) {
  const selected = rows.filter(row => row.currency === currency);
  const positive = selected.filter(row => units(row.actualSpending) > 0n).sort((a,b) => units(a.actualSpending) > units(b.actualSpending) ? -1 : 1);
  const total = positive.reduce((sum, row) => sum + units(row.actualSpending), 0n);
  const main = positive.filter((row,index) => index < 7 && (index === 0 || units(row.actualSpending) * 100n >= total * 2n));
  const other = positive.filter(row => !main.includes(row));
  const slices = [...main.map(row => ({ name: row.categoryName, exact: row.actualSpending })),
    ...(other.length ? [{ name: 'Other categories', exact: decimal(other.reduce((sum,row) => sum + units(row.actualSpending), 0n)) }] : [])]
    .map(row => ({ ...row, value: Number(row.exact), percentage: `${Number(units(row.exact) * 1000n / total) / 10}%` }));
  return { slices, total: decimal(total), refunds: selected.filter(row => units(row.actualSpending) < 0n), other };
}
