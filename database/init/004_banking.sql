-- Additive banking metadata and refund accounting. Apply to existing volumes manually.
ALTER TYPE transaction_kind ADD VALUE IF NOT EXISTS 'refund';

BEGIN;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS category_locked boolean NOT NULL DEFAULT false;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_accounts_valid;
ALTER TABLE transactions ADD CONSTRAINT transactions_accounts_valid CHECK (
    (kind = 'expense' AND source_account_id IS NOT NULL AND destination_account_id IS NULL)
    OR (kind IN ('income', 'refund') AND source_account_id IS NULL AND destination_account_id IS NOT NULL)
    OR (kind = 'transfer' AND source_account_id IS NOT NULL AND destination_account_id IS NOT NULL AND source_account_id <> destination_account_id)
    OR (kind = 'asset_purchase' AND source_account_id IS NOT NULL AND destination_account_id IS NULL AND asset_id IS NOT NULL)
    OR (kind = 'asset_sale' AND source_account_id IS NULL AND destination_account_id IS NOT NULL AND asset_id IS NOT NULL)
    OR (kind = 'liability_drawdown' AND destination_account_id IS NOT NULL AND liability_id IS NOT NULL)
    OR (kind = 'liability_payment' AND source_account_id IS NOT NULL AND liability_id IS NOT NULL)
    OR (kind = 'adjustment' AND num_nonnulls(source_account_id, destination_account_id) = 1)
);

CREATE TABLE IF NOT EXISTS bank_connections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider text NOT NULL,
    environment text NOT NULL CHECK (environment IN ('sandbox','production')),
    institution_name text NOT NULL,
    institution_country varchar(2) NOT NULL,
    provider_session_id text,
    status text NOT NULL DEFAULT 'authorizing' CHECK (status IN ('authorizing','active','expired','error','disconnected')),
    consent_expires_at timestamptz,
    last_synced_at timestamptz,
    next_sync_at timestamptz,
    sync_lease_until timestamptz,
    error_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id,user_id),
    UNIQUE (provider,environment,provider_session_id)
);
CREATE INDEX IF NOT EXISTS bank_connections_due_idx ON bank_connections(next_sync_at) WHERE status='active';

CREATE TABLE IF NOT EXISTS bank_auth_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    connection_id uuid NOT NULL,
    state_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY(connection_id,user_id) REFERENCES bank_connections(id,user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bank_account_links (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    connection_id uuid NOT NULL,
    provider_account_id text NOT NULL,
    identification_hash text NOT NULL,
    name text NOT NULL,
    currency varchar(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    account_id uuid,
    link_mode text CHECK (link_mode IN ('new','existing')),
    reported_balance numeric(19,4),
    balance_as_of timestamptz,
    balance_status text NOT NULL DEFAULT 'unreconciled' CHECK (balance_status IN ('unreconciled','reconciled')),
    last_synced_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(id,user_id),
    UNIQUE(connection_id,identification_hash),
    FOREIGN KEY(connection_id,user_id) REFERENCES bank_connections(id,user_id) ON DELETE CASCADE,
    FOREIGN KEY(account_id,user_id) REFERENCES accounts(id,user_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS bank_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bank_account_link_id uuid NOT NULL,
    identity_key text NOT NULL,
    entry_reference text,
    status text NOT NULL,
    direction text NOT NULL CHECK (direction IN ('debit','credit')),
    amount numeric(19,4) NOT NULL CHECK (amount > 0),
    currency varchar(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    occurred_on date NOT NULL,
    merchant text,
    description text,
    counterparty_hash text,
    proposed_amount numeric(19,4),
    proposed_currency varchar(3),
    proposed_occurred_on date,
    proposed_direction text,
    proposed_merchant text,
    proposed_description text,
    ledger_transaction_id uuid,
    match_status text NOT NULL DEFAULT 'new' CHECK (match_status IN ('new','posted','review','matched_manual','ignored')),
    classification_source text,
    ai_attempted_at timestamptz,
    ai_attempts smallint NOT NULL DEFAULT 0 CHECK (ai_attempts BETWEEN 0 AND 3),
    first_seen_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(id,user_id),
    UNIQUE(bank_account_link_id,identity_key),
    FOREIGN KEY(bank_account_link_id,user_id) REFERENCES bank_account_links(id,user_id) ON DELETE CASCADE,
    FOREIGN KEY(ledger_transaction_id,user_id) REFERENCES transactions(id,user_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS bank_transactions_review_idx ON bank_transactions(user_id,match_status,occurred_on DESC);

CREATE TABLE IF NOT EXISTS bank_category_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    merchant_key text NOT NULL,
    direction text NOT NULL CHECK (direction IN ('debit','credit')),
    category_id uuid NOT NULL,
    source text NOT NULL CHECK (source IN ('explicit','confirmed','ai')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id,merchant_key,direction,source),
    FOREIGN KEY(category_id,user_id) REFERENCES categories(id,user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bank_transfer_pairs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    debit_bank_transaction_id uuid NOT NULL,
    credit_bank_transaction_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(debit_bank_transaction_id), UNIQUE(credit_bank_transaction_id),
    FOREIGN KEY(debit_bank_transaction_id,user_id) REFERENCES bank_transactions(id,user_id) ON DELETE RESTRICT,
    FOREIGN KEY(credit_bank_transaction_id,user_id) REFERENCES bank_transactions(id,user_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS bank_refund_links (
    refund_transaction_id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_transaction_id uuid NOT NULL,
    FOREIGN KEY(refund_transaction_id,user_id) REFERENCES transactions(id,user_id) ON DELETE RESTRICT,
    FOREIGN KEY(original_transaction_id,user_id) REFERENCES transactions(id,user_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS bank_ai_preferences (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    enabled boolean NOT NULL DEFAULT false,
    accepted_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS bank_connections_updated ON bank_connections;
DROP TRIGGER IF EXISTS bank_account_links_updated ON bank_account_links;
DROP TRIGGER IF EXISTS bank_transactions_updated ON bank_transactions;
CREATE TRIGGER bank_connections_updated BEFORE UPDATE ON bank_connections FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER bank_account_links_updated BEFORE UPDATE ON bank_account_links FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER bank_transactions_updated BEFORE UPDATE ON bank_transactions FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE bank_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_auth_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_account_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_category_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transfer_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_refund_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_ai_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bank_connections_owner ON bank_connections;
DROP POLICY IF EXISTS bank_auth_attempts_owner ON bank_auth_attempts;
DROP POLICY IF EXISTS bank_account_links_owner ON bank_account_links;
DROP POLICY IF EXISTS bank_transactions_owner ON bank_transactions;
DROP POLICY IF EXISTS bank_category_rules_owner ON bank_category_rules;
DROP POLICY IF EXISTS bank_transfer_pairs_owner ON bank_transfer_pairs;
DROP POLICY IF EXISTS bank_refund_links_owner ON bank_refund_links;
DROP POLICY IF EXISTS bank_ai_preferences_owner ON bank_ai_preferences;
CREATE POLICY bank_connections_owner ON bank_connections USING (user_id=app.current_user_id()) WITH CHECK (user_id=app.current_user_id());
CREATE POLICY bank_auth_attempts_owner ON bank_auth_attempts USING (user_id=app.current_user_id()) WITH CHECK (user_id=app.current_user_id());
CREATE POLICY bank_account_links_owner ON bank_account_links USING (user_id=app.current_user_id()) WITH CHECK (user_id=app.current_user_id());
CREATE POLICY bank_transactions_owner ON bank_transactions USING (user_id=app.current_user_id()) WITH CHECK (user_id=app.current_user_id());
CREATE POLICY bank_category_rules_owner ON bank_category_rules USING (user_id=app.current_user_id()) WITH CHECK (user_id=app.current_user_id());
CREATE POLICY bank_transfer_pairs_owner ON bank_transfer_pairs USING (user_id=app.current_user_id()) WITH CHECK (user_id=app.current_user_id());
CREATE POLICY bank_refund_links_owner ON bank_refund_links USING (user_id=app.current_user_id()) WITH CHECK (user_id=app.current_user_id());
CREATE POLICY bank_ai_preferences_owner ON bank_ai_preferences USING (user_id=app.current_user_id()) WITH CHECK (user_id=app.current_user_id());

-- Refunds reduce net spending and utility impact, without becoming income.
CREATE OR REPLACE VIEW daily_financial_impact WITH (security_invoker=true) AS
SELECT t.user_id,d.impact_date,t.currency,t.category_id,t.id AS transaction_id,
    CASE WHEN t.kind='refund' THEN -t.amount
         WHEN t.method='amortized' THEN t.daily_impact ELSE t.amount END AS expense_impact
FROM transactions t JOIN users u ON u.id=t.user_id
CROSS JOIN LATERAL (SELECT day_value::date impact_date FROM generate_series(
    CASE WHEN t.method='amortized' THEN t.amortization_start ELSE (t.occurred_at AT TIME ZONE u.timezone)::date END,
    CASE WHEN t.method='amortized' THEN t.amortization_end ELSE (t.occurred_at AT TIME ZONE u.timezone)::date END,
    interval '1 day') day_value) d
WHERE t.kind IN ('expense','refund') AND t.voided_at IS NULL;

COMMIT;
