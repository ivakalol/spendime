import { describe, expect, it } from 'vitest';
import { budgetMonthWindow } from '../../src/shared/budgetMonth';

describe('personal budget months', () => {
  it('uses the previous cycle before payday and switches on payday', () => {
    expect(budgetMonthWindow('2026-10-04', 5)).toEqual({from:'2026-09-05',to:'2026-10-04',endExclusive:'2026-10-05'});
    expect(budgetMonthWindow('2026-10-05', 5)).toEqual({from:'2026-10-05',to:'2026-11-04',endExclusive:'2026-11-05'});
    expect(budgetMonthWindow('2026-10-08', 5, 1)).toEqual({from:'2026-09-05',to:'2026-10-04',endExclusive:'2026-10-05'});
  });
  it('clamps short months without drifting the following payday', () => {
    expect(budgetMonthWindow('2026-02-28', 31)).toEqual({from:'2026-02-28',to:'2026-03-30',endExclusive:'2026-03-31'});
    expect(budgetMonthWindow('2026-03-31', 31, 1).from).toBe('2026-02-28');
    expect(budgetMonthWindow('2024-02-29', 31).from).toBe('2024-02-29');
    expect(budgetMonthWindow('2026-01-04', 5).from).toBe('2025-12-05');
    expect(budgetMonthWindow('2026-01-05', 5, 1).from).toBe('2025-12-05');
  });
  it('has adjacent, gap-free cycles for all start days across leap and normal years', () => {
    for (const year of [2024, 2025, 2026]) for (let month = 1; month <= 12; month++) for (let day = 1; day <= 31; day++) {
      const anchor = `${year}-${String(month).padStart(2,'0')}-15`;
      const current = budgetMonthWindow(anchor, day), previous = budgetMonthWindow(anchor, day, 1);
      expect(current.from <= anchor && anchor <= current.to).toBe(true);
      expect(previous.endExclusive).toBe(current.from);
      expect(budgetMonthWindow(current.from, day)).toEqual(current);
    }
  });
});
