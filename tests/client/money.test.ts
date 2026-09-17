// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { decimalSign, formatMoney, formatPercent } from '../../src/client/utils/money';
import { decimalToChartNumber } from '../../src/client/utils/chartAdapter';
describe('exact decimal presentation',()=>{
  it('rounds using decimal digits rather than binary floating point',()=>{expect(formatMoney('1.005','EUR','en-US')).toBe('€1.01');expect(formatMoney('9007199254740993.125','EUR','en-US')).toBe('€9,007,199,254,740,993.13')});
  it('formats signs and percentages without arithmetic coercion',()=>{expect(formatPercent('6.363636')).toBe('+6.36%');expect(formatPercent('-1.235')).toBe('−1.24%');expect(decimalSign('-0.0001')).toBe(-1)});
  it('isolates lossy chart conversion',()=>{expect(decimalToChartNumber('29.99')).toBe(29.99);expect(decimalToChartNumber('not-money')).toBe(0)});
});
