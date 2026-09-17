/** Visualization boundary only. Never use this lossy number for financial calculations or API writes. */
export function decimalToChartNumber(value: string | null | undefined): number {
  if (value == null || !/^[+-]?\d+(?:\.\d+)?$/.test(value)) return 0;
  const visual = Number(value);
  return Number.isFinite(visual) ? visual : 0;
}
