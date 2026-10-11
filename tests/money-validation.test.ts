import { describe, expect, it } from 'vitest';
import { nonnegativeMoneySchema, positiveMoneySchema, signedMoneySchema } from '../src/server/validation/common.js';

describe('money input precision', () => {
  it.each(['200', '200.2', '200.20', '200.200', '200.2000', '200.2001'])(
    'accepts %s for balances, transactions, assets, debts and recurring payments', (value) => {
      for (const schema of [signedMoneySchema, nonnegativeMoneySchema, positiveMoneySchema]) {
        expect(schema.parse(value)).toBe(value);
      }
    },
  );
  it('preserves negative opening balances and zero values', () => {
    expect(signedMoneySchema.parse('-200.20')).toBe('-200.20');
    expect(nonnegativeMoneySchema.parse('0.00')).toBe('0.00');
    expect(positiveMoneySchema.safeParse('0.00').success).toBe(false);
  });
  it.each(['200.20001', '200.20>', '1e2', ''])('rejects malformed or excessive precision: %s', (value) => {
    for (const schema of [signedMoneySchema, nonnegativeMoneySchema, positiveMoneySchema]) {
      expect(schema.safeParse(value).success).toBe(false);
    }
  });
});
