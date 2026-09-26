import { describe, expect, it } from 'vitest';
import { categoryBreakdown, spendingChange } from '../../src/client/utils/analytics';
describe('exact category breakdown',()=>{
  const row=(name:string,amount:string,currency='EUR')=>({categoryId:name,categoryName:name,actualSpending:amount,currency});
  it('separates currencies and refund-only categories from positive proportions',()=>{
    const result=categoryBreakdown([row('Food','60'),row('Uncategorized','40'),row('Refunds','-20'),row('US spending','900','USD')],'EUR');
    expect(result.total).toBe('100.0000');expect(result.slices.map(r=>r.percentage)).toEqual(['60%','40%']);expect(result.refunds).toHaveLength(1);
  });
  it('groups small categories without losing decimal precision',()=>{
    const result=categoryBreakdown([row('Main','100'),...Array.from({length:12},(_,i)=>row(String(i),'0.0001'))],'EUR');
    expect(result.slices).toHaveLength(2);expect(result.slices[1]?.exact).toBe('0.0012');expect(result.total).toBe('100.0012');expect(result.other).toHaveLength(12);
  });
  it('handles empty and entirely refunded periods without division by zero',()=>{
    expect(categoryBreakdown([],'EUR').slices).toEqual([]);expect(categoryBreakdown([row('Refund','-40')],'EUR').slices).toEqual([]);
    expect(spendingChange('10','0')).toContain('No positive');expect(spendingChange('75','100')).toContain('25.0% less');
  });
});
