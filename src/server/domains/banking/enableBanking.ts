import { createSign } from 'node:crypto';
import type { BankingProvider, BankAccount, BankBalance, BankInstitution, BankTransaction, BankTransactionPage, BankSession } from './provider.js';
import { BankingProviderError } from './provider.js';

type Json = Record<string, any>;
const API = 'https://api.enablebanking.com';
const AUTHORIZATION_ORIGINS = new Set([
  'https://auth.enablebanking.com',
  // The provider is migrating production flows to auth.enablebanking.com;
  // its documented legacy production origin remains in use during rollout.
  'https://tilisy.enablebanking.com',
  'https://tilisy-sandbox.enablebanking.com',
]);
const b64 = (value: string) => Buffer.from(value).toString('base64url');
const trim = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) || null : null;

export function retryAfterSeconds(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = /^\d+$/.test(value.trim()) ? Number(value.trim()) :
    (Date.parse(value) - now) / 1000;
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : undefined;
}

function validAuthorizationUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return AUTHORIZATION_ORIGINS.has(url.origin) &&
      url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

export class EnableBankingProvider implements BankingProvider {
  readonly id = 'enable_banking';
  readonly environment: 'sandbox' | 'production';
  private applicationVerified: Promise<void> | null = null;
  constructor(private readonly appId: string, private readonly privateKey: string,
    environment: 'sandbox' | 'production' = 'sandbox', private readonly redirectUri?: string) {
    this.environment = environment;
  }

  private async ensureApplication(): Promise<void> {
    if (!this.applicationVerified) this.applicationVerified = this.rawRequest('/application').then((data) => {
      const expected = this.environment === 'production' ? 'PRODUCTION' : 'SANDBOX';
      if (data.environment !== expected || data.active !== true ||
          (this.environment === 'production' && (data.kid !== this.appId ||
            !Array.isArray(data.services) || !data.services.includes('AIS') ||
            !Array.isArray(data.redirect_urls) || !data.redirect_urls.includes(this.redirectUri))))
        throw new BankingProviderError(this.environment === 'production' ? 'production_application_required' : 'sandbox_application_required');
    }).catch((error) => { this.applicationVerified = null; throw error; });
    await this.applicationVerified;
  }

  private jwt(): string {
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${b64(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: this.appId }))}.${b64(JSON.stringify({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: now, exp: now + 300 }))}`;
    const signature = createSign('RSA-SHA256').update(unsigned).sign(this.privateKey).toString('base64url');
    return `${unsigned}.${signature}`;
  }

  private async request(path: string, method = 'GET', body?: unknown): Promise<Json> {
    await this.ensureApplication();
    return this.rawRequest(path, method, body);
  }

  private async rawRequest(path: string, method = 'GET', body?: unknown): Promise<Json> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(`${API}${path}`, {
        method, signal: controller.signal,
        headers: { Accept: 'application/json', Authorization: `Bearer ${this.jwt()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as Json;
        const code = typeof payload.error === 'string' ? payload.error : typeof payload.code === 'string' ? payload.code : `http_${response.status}`;
        throw new BankingProviderError(code,retryAfterSeconds(response.headers.get('retry-after')),response.status);
      }
      if (response.status === 204) return {};
      return await response.json() as Json;
    } catch (error) {
      if (error instanceof BankingProviderError) throw error;
      throw new BankingProviderError('provider_unavailable');
    } finally { clearTimeout(timer); }
  }

  async institutions(country: string): Promise<BankInstitution[]> {
    const data = await this.request(`/aspsps?country=${encodeURIComponent(country)}&service=AIS&psu_type=personal`);
    if (!Array.isArray(data.aspsps)) throw new BankingProviderError('invalid_provider_response');
    return data.aspsps.filter((x: Json) => typeof x.name === 'string' && x.country === country).map((x: Json) => ({
      name: x.name, country: x.country, beta: x.beta === true,
      maximumConsentValiditySeconds: Number.isFinite(x.maximum_consent_validity) ? x.maximum_consent_validity : null,
    }));
  }

  async begin(input: { institution: BankInstitution; state: string; redirectUri: string }): Promise<{ url: string }> {
    if (this.environment === 'production' && input.redirectUri !== this.redirectUri)
      throw new BankingProviderError('invalid_production_redirect');
    const validity = Math.min(90 * 86400, input.institution.maximumConsentValiditySeconds ?? 90 * 86400);
    if (validity <= 120) throw new BankingProviderError('invalid_consent_validity');
    const data = await this.request('/auth', 'POST', {
      access: { valid_until: new Date(Date.now() + (validity - 60) * 1000).toISOString(), balances: true, transactions: true },
      aspsp: { name: input.institution.name, country: input.institution.country },
      state: input.state, redirect_url: input.redirectUri, psu_type: 'personal',
    });
    if (!validAuthorizationUrl(data.url)) throw new BankingProviderError('invalid_provider_redirect');
    return { url: data.url };
  }

  async complete(code: string): Promise<BankSession> {
    const data = await this.request('/sessions', 'POST', { code });
    if (typeof data.session_id !== 'string' || !Array.isArray(data.accounts) || typeof data.access?.valid_until !== 'string') throw new BankingProviderError('invalid_provider_response');
    const accounts: BankAccount[] = data.accounts.map((x: Json) => ({
      providerAccountId: x.uid, identificationHash: x.identification_hash,
      name: trim(x.name, 100) ?? 'Bank account', currency: x.currency,
    }));
    if (accounts.some((x) => typeof x.providerAccountId !== 'string' || typeof x.identificationHash !== 'string' || !/^[A-Z]{3}$/.test(x.currency))) throw new BankingProviderError('invalid_provider_response');
    return { sessionId: data.session_id, expiresAt: data.access.valid_until, accounts };
  }

  async sessionStatus(sessionId: string): Promise<'active' | 'expired' | 'error'> {
    const data = await this.request(`/sessions/${encodeURIComponent(sessionId)}`);
    return data.status === 'AUTHORIZED' ? 'active' : data.status === 'EXPIRED' || data.status === 'CLOSED' ? 'expired' : 'error';
  }

  async balance(accountId: string): Promise<BankBalance | null> {
    const data = await this.request(`/accounts/${encodeURIComponent(accountId)}/balances`);
    const booked = Array.isArray(data.balances) ? data.balances.find((x: Json) => x.balance_type === 'CLAV') : null;
    if (!booked || typeof booked.balance_amount?.amount !== 'string') return null;
    return { amount: booked.balance_amount.amount, currency: booked.balance_amount.currency, asOf: booked.last_change_date_time ?? null };
  }

  async transactions(accountId: string, options: { from?: string; next?: string; initial: boolean }): Promise<BankTransactionPage> {
    const params = new URLSearchParams();
    if (options.next) params.set('continuation_key', options.next);
    else if (options.initial) params.set('strategy', 'longest');
    else if (options.from) params.set('date_from', options.from);
    const data = await this.request(`/accounts/${encodeURIComponent(accountId)}/transactions?${params}`);
    if (!Array.isArray(data.transactions)) throw new BankingProviderError('invalid_provider_response');
    const transactions: BankTransaction[] = data.transactions.map((x: Json) => {
      const party = x.credit_debit_indicator === 'DBIT' ? x.creditor : x.debtor;
      const description = Array.isArray(x.remittance_information) ? x.remittance_information.join(' ') : x.additional_information ?? null;
      return {
        entryReference: trim(x.entry_reference, 250), status: x.status,
        direction: (x.credit_debit_indicator === 'DBIT' ? 'debit' : 'credit') as BankTransaction['direction'],
        amount: x.transaction_amount?.amount, currency: x.transaction_amount?.currency,
        // Booked movements use their booking date. Pending movements may only
        // have a transaction or value date; these never post before BOOK.
        occurredOn: x.status === 'BOOK'
          ? x.booking_date ?? x.transaction_date ?? x.value_date
          : x.transaction_date ?? x.value_date ?? x.booking_date,
        merchant: trim(party?.name, 120), description: trim(description, 500),
        counterpartyHash: null,
      };
    });
    if (data.transactions.some((x: Json) => !['DBIT','CRDT'].includes(x.credit_debit_indicator)) ||
        transactions.some((x) => typeof x.amount !== 'string' || !/^[A-Z]{3}$/.test(x.currency) || !/^\d{4}-\d{2}-\d{2}$/.test(x.occurredOn) || typeof x.status !== 'string')) throw new BankingProviderError('invalid_provider_response');
    return { transactions, next: typeof data.continuation_key === 'string' ? data.continuation_key : null };
  }

  async disconnect(sessionId: string): Promise<void> { await this.request(`/sessions/${encodeURIComponent(sessionId)}`, 'DELETE'); }
}
