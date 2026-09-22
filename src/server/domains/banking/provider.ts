export interface BankInstitution {
  name: string;
  country: string;
  beta: boolean;
  maximumConsentValiditySeconds: number | null;
}
export interface BankAccount {
  providerAccountId: string;
  identificationHash: string;
  name: string;
  currency: string;
}
export interface BankTransaction {
  entryReference: string | null;
  status: string;
  direction: 'debit' | 'credit';
  amount: string;
  currency: string;
  occurredOn: string;
  merchant: string | null;
  description: string | null;
  counterpartyHash: string | null;
}
export interface BankTransactionPage { transactions: BankTransaction[]; next: string | null }
export interface BankBalance { amount: string; currency: string; asOf: string | null }
export interface BankSession { sessionId: string; expiresAt: string; accounts: BankAccount[] }
export interface BankingProvider {
  readonly id: string;
  readonly environment: 'sandbox' | 'production';
  institutions(country: string): Promise<BankInstitution[]>;
  begin(input: { institution: BankInstitution; state: string; redirectUri: string }): Promise<{ url: string }>;
  complete(code: string): Promise<BankSession>;
  sessionStatus(sessionId: string): Promise<'active' | 'expired' | 'error'>;
  balance(accountId: string): Promise<BankBalance | null>;
  transactions(accountId: string, options: { from?: string; next?: string; initial: boolean }): Promise<BankTransactionPage>;
  disconnect(sessionId: string): Promise<void>;
}

export class BankingProviderError extends Error {
  constructor(public readonly code: string, public readonly retryAfterSeconds?: number) {
    super(code);
    this.name = 'BankingProviderError';
  }
}
