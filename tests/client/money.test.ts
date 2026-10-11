// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { decimalSign, formatMoney, formatPercent, moneyInputValue } from '../../src/client/utils/money';
import { decimalToChartNumber } from '../../src/client/utils/chartAdapter';
describe('exact decimal presentation',()=>{
  it.each([
    ['200.2000', '200.20'], ['200.0000', '200.00'], ['-200.2000', '-200.20'],
    ['200.2010', '200.201'], ['200.2001', '200.2001'], ['0.0001', '0.0001'],
    ['999999999999999.9900', '999999999999999.99'], ['6.123456', '6.123456'],
    ['200.20', '200.20'], ['200.2', '200.2'], ['200', '200'], ['', ''],
  ])('loads %s into a form as %s without rounding', (value, expected) => {
    expect(moneyInputValue(value)).toBe(expected);
  });
  it('rounds using decimal digits rather than binary floating point',()=>{expect(formatMoney('1.005','EUR','en-US')).toBe('€1.01');expect(formatMoney('9007199254740993.125','EUR','en-US')).toBe('€9,007,199,254,740,993.13')});
  it('formats signs and percentages without arithmetic coercion',()=>{expect(formatPercent('6.363636')).toBe('+6.36%');expect(formatPercent('-1.235')).toBe('−1.24%');expect(decimalSign('-0.0001')).toBe(-1)});
  it('isolates lossy chart conversion',()=>{expect(decimalToChartNumber('29.99')).toBe(29.99);expect(decimalToChartNumber('not-money')).toBe(0)});
  it('uses currency minor units and locale grouping without losing integer precision',()=>{
    expect(formatMoney('1234.5','JPY','en-US')).toBe('¥1,235');
    expect(formatMoney('1.2345','KWD','en-US')).toContain('1.235');
    expect(formatMoney('1234.56','EUR','de-DE')).toBe('1.234,56 €');
  });
});
