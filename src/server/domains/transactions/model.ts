export interface TransactionWrite {
  kind: 'expense' | 'income' | 'transfer' | 'asset_purchase' | 'asset_sale' |
    'liability_drawdown' | 'liability_payment' | 'adjustment';
  method: 'standard' | 'amortized' | 'recurring';
  sourceAccountId: string | null;
  destinationAccountId: string | null;
  categoryId: string | null;
  assetId: string | null;
  liabilityId: string | null;
  recurringRuleId: string | null;
  amount: string;
  currency: string;
  occurredAt: string;
  description: string | null;
  merchant: string | null;
  amortizationStart: string | null;
  amortizationEnd: string | null;
}
