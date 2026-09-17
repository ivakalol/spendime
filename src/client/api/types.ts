export type DecimalString = string;
export type CurrencyCode = string;
export type TransactionKind = 'expense' | 'income' | 'transfer' | 'asset_purchase' | 'asset_sale' | 'liability_drawdown' | 'liability_payment' | 'adjustment';
export type TransactionMethod = 'standard' | 'amortized' | 'recurring';

export interface User {
  id: string; email: string; displayName: string; baseCurrency: string; timezone: string;
  emailVerifiedAt: string | null; createdAt: string;
}
export interface Account {
  id: string; name: string; kind: 'cash' | 'checking' | 'savings' | 'credit' | 'investment' | 'other';
  currency: string; openingBalance: DecimalString; currentBalance: DecimalString; institution: string | null;
  color: string | null; icon: string | null; isArchived: boolean; createdAt: string; updatedAt: string;
}
export interface Category {
  id: string; name: string; kind: 'expense' | 'income' | 'both'; color: string | null; icon: string | null;
  isSystem: boolean; isArchived: boolean; createdAt: string; updatedAt: string;
}
export interface Transaction {
  id: string; kind: TransactionKind; method: TransactionMethod; sourceAccountId: string | null;
  destinationAccountId: string | null; categoryId: string | null; assetId: string | null;
  liabilityId: string | null; recurringRuleId: string | null; amount: DecimalString; currency: string;
  occurredAt: string; description: string | null; merchant: string | null; amortizationStart: string | null;
  amortizationEnd: string | null; dailyImpact: DecimalString | null; voidedAt: string | null; voidReason: string | null;
  createdAt: string; updatedAt: string;
}
export interface Asset {
  id: string; name: string; classification: 'depreciating' | 'appreciating' | 'custom'; currency: string;
  acquisitionDate: string; cumulativePrincipal: DecimalString; currentValue: DecimalString;
  absoluteReturn: DecimalString; percentageReturn: DecimalString | null; depreciation: 'none' | 'straight_line';
  usefulLifeDays: number | null; residualValue: DecimalString | null; notes: string | null;
  isArchived: boolean; createdAt: string; updatedAt: string;
}
export interface AssetContribution {
  id: string; assetId: string; transactionId: string | null; amount: DecimalString; currency: string;
  contributedAt: string; note: string | null; voidedAt: string | null; createdAt: string;
}
export interface AssetValuation {
  id: string; assetId: string; value: DecimalString; valuedAt: string; note: string | null; createdAt: string;
}
export interface Liability {
  id: string; name: string; lender: string | null; currency: string; originalPrincipal: DecimalString;
  outstandingBalance: DecimalString; annualInterestRate: DecimalString; openedOn: string; dueOn: string | null;
  status: 'active' | 'paid' | 'defaulted' | 'cancelled'; notes: string | null; createdAt: string; updatedAt: string;
}
export interface RecurringRule {
  id: string; name: string; kind: TransactionKind; sourceAccountId: string | null; destinationAccountId: string | null;
  categoryId: string | null; assetId: string | null; liabilityId: string | null; amount: DecimalString; currency: string;
  intervalCount: number; intervalUnit: 'day' | 'week' | 'month' | 'year'; startsOn: string; nextDueOn: string;
  endsOn: string | null; description: string | null; isActive: boolean; lastGeneratedAt: string | null;
  createdAt: string; updatedAt: string;
}
export interface DashboardData {
  timeframe: 'daily' | 'weekly' | 'monthly' | '6-month' | 'annual';
  bounds: { timezone: string; anchorDate: string; startLocal: string; endLocalExclusive: string; startUtc: string; endUtcExclusive: string };
  cashFlow: Array<{ currency: string; actualSpending: string; actualIncome: string; ordinaryNetCashFlow: string; assetPurchases: string; assetSaleProceeds: string; liabilityDrawdowns: string; liabilityPayments: string }>;
  utilityImpact: Array<{ currency: string; utilityAdjustedCost: string }>;
  assetSummary: Array<{ currency: string; cumulativePrincipal: string; currentValue: string; absoluteGainLoss: string; simpleReturnPercentage: string | null }>;
  liabilitySummary: Array<{ currency: string; originalPrincipal: string; outstandingBalance: string }>;
  spendingByCategory: Array<{ currency: string; categoryId: string | null; categoryName: string; actualSpending: string }>;
  accountBalances: Array<{ accountId: string; name: string; currency: string; openingBalance: string; currentBalance: string }>;
  trends: {
    actualCashFlow: Array<{ currency: string; bucketStartLocal: string; actualSpending: string; actualIncome: string; assetPurchases: string }>;
    utilityImpact: Array<{ currency: string; bucketStartLocal: string; utilityAdjustedCost: string }>;
    assetUnrealizedGainChange: Array<{ currency: string; bucketStartLocal: string; unrealizedGainChange: string }>;
  };
}
export interface ApiEnvelope<T> { data: T }
export interface PagedEnvelope<T> { data: T[]; meta: { limit: number; offset: number; total: number } }
export interface ApiErrorBody { error?: { code?: string; message?: string; fields?: Array<{ field: string; message: string }> } }

export interface AccountInput { name: string; kind: Account['kind']; currency: string; openingBalance: string; institution: string | null; color: string | null; icon: string | null }
export interface CategoryInput { name: string; kind: Category['kind']; color: string | null; icon: string | null }
export interface TransactionInput { kind: TransactionKind; method: TransactionMethod; sourceAccountId: string | null; destinationAccountId: string | null; categoryId: string | null; assetId: string | null; liabilityId: string | null; recurringRuleId: string | null; amount: string; currency: string; occurredAt: string; description: string | null; merchant: string | null; amortizationStart: string | null; amortizationEnd: string | null }
export interface AssetInput { name: string; classification: Asset['classification']; currency: string; acquisitionDate: string; initialContribution: string; currentValue: string; depreciation: Asset['depreciation']; usefulLifeDays: number | null; residualValue: string | null; notes: string | null }
export interface LiabilityInput { name: string; lender: string | null; currency: string; originalPrincipal: string; outstandingBalance: string; annualInterestRate: string; openedOn: string; dueOn: string | null; status: Liability['status']; notes: string | null }
export interface RecurringInput { name: string; kind: TransactionKind; sourceAccountId: string | null; destinationAccountId: string | null; categoryId: string | null; assetId: string | null; liabilityId: string | null; amount: string; currency: string; intervalCount: number; intervalUnit: RecurringRule['intervalUnit']; startsOn: string; nextDueOn: string; endsOn: string | null; description: string | null; isActive: boolean }
