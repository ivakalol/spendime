-- Spendime initial PostgreSQL schema
-- Target: PostgreSQL 16+
-- Safe to run as a single script in DataGrip against an empty database.

BEGIN;

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS app;

CREATE TYPE user_status AS ENUM ('active', 'disabled');
CREATE TYPE auth_provider AS ENUM ('password', 'google');
CREATE TYPE account_kind AS ENUM ('cash', 'checking', 'savings', 'credit', 'investment', 'other');
CREATE TYPE category_kind AS ENUM ('expense', 'income', 'both');
CREATE TYPE transaction_kind AS ENUM (
    'expense',
    'income',
    'transfer',
    'asset_purchase',
    'asset_sale',
    'liability_drawdown',
    'liability_payment',
    'adjustment'
);
CREATE TYPE entry_method AS ENUM ('standard', 'amortized', 'recurring');
CREATE TYPE asset_classification AS ENUM ('depreciating', 'appreciating', 'custom');
CREATE TYPE depreciation_method AS ENUM ('none', 'straight_line');
CREATE TYPE recurrence_unit AS ENUM ('day', 'week', 'month', 'year');
CREATE TYPE liability_status AS ENUM ('active', 'paid', 'defaulted', 'cancelled');

CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email citext NOT NULL UNIQUE,
    display_name varchar(120) NOT NULL,
    base_currency varchar(3) NOT NULL DEFAULT 'EUR',
    timezone varchar(64) NOT NULL DEFAULT 'UTC',
    status user_status NOT NULL DEFAULT 'active',
    email_verified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT users_email_not_blank CHECK (btrim(email::text) <> ''),
    CONSTRAINT users_display_name_not_blank CHECK (btrim(display_name) <> ''),
    CONSTRAINT users_base_currency_format CHECK (base_currency ~ '^[A-Z]{3}$')
);

-- Password hashes are deliberately isolated from the user profile. Store only
-- Argon2id hashes here; never plaintext passwords or reversible encryption.
CREATE TABLE user_credentials (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    password_hash text NOT NULL,
    password_changed_at timestamptz NOT NULL DEFAULT now(),
    failed_login_attempts integer NOT NULL DEFAULT 0,
    locked_until timestamptz,
    CONSTRAINT user_credentials_hash_not_blank CHECK (btrim(password_hash) <> ''),
    CONSTRAINT user_credentials_failed_attempts_nonnegative CHECK (failed_login_attempts >= 0)
);

-- Provider-neutral identity table makes Google OAuth additive. Password users
-- receive a 'password' identity; Google supplies its stable subject identifier.
CREATE TABLE auth_identities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider auth_provider NOT NULL,
    provider_subject text NOT NULL,
    provider_email citext,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT auth_identities_subject_not_blank CHECK (btrim(provider_subject) <> ''),
    CONSTRAINT auth_identities_provider_subject_unique UNIQUE (provider, provider_subject),
    CONSTRAINT auth_identities_user_provider_unique UNIQUE (user_id, provider)
);

-- Store hashed refresh-token identifiers so sessions can be revoked without
-- retaining bearer tokens in plaintext.
CREATE TABLE auth_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    user_agent text,
    ip_address inet,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT auth_sessions_token_hash_not_blank CHECK (btrim(token_hash) <> ''),
    CONSTRAINT auth_sessions_expiry_after_creation CHECK (expires_at > created_at)
);

CREATE TABLE accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name varchar(100) NOT NULL,
    kind account_kind NOT NULL DEFAULT 'other',
    currency varchar(3) NOT NULL,
    opening_balance numeric(19, 4) NOT NULL DEFAULT 0,
    institution varchar(120),
    color varchar(7),
    icon varchar(50),
    is_archived boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT accounts_name_not_blank CHECK (btrim(name) <> ''),
    CONSTRAINT accounts_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT accounts_color_format CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
    CONSTRAINT accounts_user_name_unique UNIQUE (user_id, name),
    CONSTRAINT accounts_id_user_unique UNIQUE (id, user_id)
);

CREATE TABLE categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name varchar(80) NOT NULL,
    kind category_kind NOT NULL DEFAULT 'expense',
    color varchar(7),
    icon varchar(50),
    is_system boolean NOT NULL DEFAULT false,
    is_archived boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT categories_name_not_blank CHECK (btrim(name) <> ''),
    CONSTRAINT categories_color_format CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
    CONSTRAINT categories_user_name_unique UNIQUE (user_id, name),
    CONSTRAINT categories_id_user_unique UNIQUE (id, user_id)
);

CREATE TABLE assets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name varchar(120) NOT NULL,
    classification asset_classification NOT NULL,
    currency varchar(3) NOT NULL,
    acquisition_date date NOT NULL,
    initial_value numeric(19, 4) NOT NULL,
    current_value numeric(19, 4) NOT NULL,
    depreciation depreciation_method NOT NULL DEFAULT 'none',
    useful_life_days integer,
    residual_value numeric(19, 4),
    notes text,
    is_archived boolean NOT NULL DEFAULT false,
    absolute_return numeric(19, 4) GENERATED ALWAYS AS (current_value - initial_value) STORED,
    percentage_return numeric(12, 6) GENERATED ALWAYS AS (
        CASE
            WHEN initial_value = 0 THEN NULL
            ELSE ((current_value - initial_value) / initial_value) * 100
        END
    ) STORED,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT assets_name_not_blank CHECK (btrim(name) <> ''),
    CONSTRAINT assets_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT assets_values_nonnegative CHECK (
        initial_value >= 0 AND current_value >= 0 AND (residual_value IS NULL OR residual_value >= 0)
    ),
    CONSTRAINT assets_useful_life_positive CHECK (useful_life_days IS NULL OR useful_life_days > 0),
    CONSTRAINT assets_depreciation_details CHECK (
        (depreciation = 'none' AND useful_life_days IS NULL)
        OR (depreciation = 'straight_line' AND useful_life_days IS NOT NULL)
    ),
    CONSTRAINT assets_id_user_unique UNIQUE (id, user_id)
);

CREATE TABLE asset_valuations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    asset_id uuid NOT NULL,
    value numeric(19, 4) NOT NULL,
    valued_at timestamptz NOT NULL DEFAULT now(),
    note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT asset_valuations_value_nonnegative CHECK (value >= 0),
    CONSTRAINT asset_valuations_asset_same_user_fk
        FOREIGN KEY (asset_id, user_id) REFERENCES assets(id, user_id) ON DELETE CASCADE,
    CONSTRAINT asset_valuations_id_user_unique UNIQUE (id, user_id)
);

CREATE TABLE liabilities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name varchar(120) NOT NULL,
    lender varchar(120),
    currency varchar(3) NOT NULL,
    original_principal numeric(19, 4) NOT NULL,
    outstanding_balance numeric(19, 4) NOT NULL,
    annual_interest_rate numeric(9, 6) NOT NULL DEFAULT 0,
    opened_on date NOT NULL,
    due_on date,
    status liability_status NOT NULL DEFAULT 'active',
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT liabilities_name_not_blank CHECK (btrim(name) <> ''),
    CONSTRAINT liabilities_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT liabilities_amounts_nonnegative CHECK (
        original_principal >= 0 AND outstanding_balance >= 0
    ),
    CONSTRAINT liabilities_interest_rate_valid CHECK (annual_interest_rate >= 0),
    CONSTRAINT liabilities_due_date_valid CHECK (due_on IS NULL OR due_on >= opened_on),
    CONSTRAINT liabilities_id_user_unique UNIQUE (id, user_id)
);

CREATE TABLE recurring_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name varchar(120) NOT NULL,
    kind transaction_kind NOT NULL,
    source_account_id uuid,
    destination_account_id uuid,
    category_id uuid,
    asset_id uuid,
    liability_id uuid,
    amount numeric(19, 4) NOT NULL,
    currency varchar(3) NOT NULL,
    interval_count integer NOT NULL DEFAULT 1,
    interval_unit recurrence_unit NOT NULL,
    starts_on date NOT NULL,
    next_due_on date NOT NULL,
    ends_on date,
    description text,
    is_active boolean NOT NULL DEFAULT true,
    last_generated_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT recurring_rules_name_not_blank CHECK (btrim(name) <> ''),
    CONSTRAINT recurring_rules_amount_positive CHECK (amount > 0),
    CONSTRAINT recurring_rules_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT recurring_rules_interval_positive CHECK (interval_count > 0),
    CONSTRAINT recurring_rules_date_range CHECK (ends_on IS NULL OR ends_on >= starts_on),
    CONSTRAINT recurring_rules_next_due_range CHECK (next_due_on >= starts_on),
    CONSTRAINT recurring_rules_source_same_user_fk
        FOREIGN KEY (source_account_id, user_id) REFERENCES accounts(id, user_id) ON DELETE RESTRICT,
    CONSTRAINT recurring_rules_destination_same_user_fk
        FOREIGN KEY (destination_account_id, user_id) REFERENCES accounts(id, user_id) ON DELETE RESTRICT,
    CONSTRAINT recurring_rules_category_same_user_fk
        FOREIGN KEY (category_id, user_id) REFERENCES categories(id, user_id) ON DELETE RESTRICT,
    CONSTRAINT recurring_rules_asset_same_user_fk
        FOREIGN KEY (asset_id, user_id) REFERENCES assets(id, user_id) ON DELETE RESTRICT,
    CONSTRAINT recurring_rules_liability_same_user_fk
        FOREIGN KEY (liability_id, user_id) REFERENCES liabilities(id, user_id) ON DELETE RESTRICT,
    CONSTRAINT recurring_rules_id_user_unique UNIQUE (id, user_id),
    CONSTRAINT recurring_rules_distinct_transfer_accounts CHECK (
        source_account_id IS NULL OR destination_account_id IS NULL OR source_account_id <> destination_account_id
    )
);

CREATE TABLE transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind transaction_kind NOT NULL,
    method entry_method NOT NULL DEFAULT 'standard',
    source_account_id uuid,
    destination_account_id uuid,
    category_id uuid,
    asset_id uuid,
    liability_id uuid,
    recurring_rule_id uuid,
    amount numeric(19, 4) NOT NULL,
    currency varchar(3) NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    description text,
    merchant varchar(120),
    amortization_start date,
    amortization_end date,
    daily_impact numeric(19, 6) GENERATED ALWAYS AS (
        CASE
            WHEN method = 'amortized' AND amortization_start IS NOT NULL AND amortization_end IS NOT NULL
                THEN amount / ((amortization_end - amortization_start) + 1)
            ELSE NULL
        END
    ) STORED,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT transactions_amount_positive CHECK (amount > 0),
    CONSTRAINT transactions_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT transactions_amortization_valid CHECK (
        (method = 'amortized' AND amortization_start IS NOT NULL
            AND amortization_end IS NOT NULL AND amortization_end >= amortization_start)
        OR (method <> 'amortized' AND amortization_start IS NULL AND amortization_end IS NULL)
    ),
    CONSTRAINT transactions_recurring_link_valid CHECK (
        (method = 'recurring' AND recurring_rule_id IS NOT NULL)
        OR (method <> 'recurring' AND recurring_rule_id IS NULL)
    ),
    CONSTRAINT transactions_accounts_valid CHECK (
        (kind = 'expense' AND source_account_id IS NOT NULL AND destination_account_id IS NULL)
        OR (kind = 'income' AND source_account_id IS NULL AND destination_account_id IS NOT NULL)
        OR (kind = 'transfer' AND source_account_id IS NOT NULL AND destination_account_id IS NOT NULL
            AND source_account_id <> destination_account_id)
        OR (kind = 'asset_purchase' AND source_account_id IS NOT NULL AND destination_account_id IS NULL
            AND asset_id IS NOT NULL)
        OR (kind = 'asset_sale' AND source_account_id IS NULL AND destination_account_id IS NOT NULL
            AND asset_id IS NOT NULL)
        OR (kind = 'liability_drawdown' AND destination_account_id IS NOT NULL AND liability_id IS NOT NULL)
        OR (kind = 'liability_payment' AND source_account_id IS NOT NULL AND liability_id IS NOT NULL)
        OR (kind = 'adjustment' AND num_nonnulls(source_account_id, destination_account_id) = 1)
    ),
    CONSTRAINT transactions_source_same_user_fk
        FOREIGN KEY (source_account_id, user_id) REFERENCES accounts(id, user_id) ON DELETE RESTRICT,
    CONSTRAINT transactions_destination_same_user_fk
        FOREIGN KEY (destination_account_id, user_id) REFERENCES accounts(id, user_id) ON DELETE RESTRICT,
    CONSTRAINT transactions_category_same_user_fk
        FOREIGN KEY (category_id, user_id) REFERENCES categories(id, user_id) ON DELETE RESTRICT,
    CONSTRAINT transactions_asset_same_user_fk
        FOREIGN KEY (asset_id, user_id) REFERENCES assets(id, user_id) ON DELETE RESTRICT,
    CONSTRAINT transactions_liability_same_user_fk
        FOREIGN KEY (liability_id, user_id) REFERENCES liabilities(id, user_id) ON DELETE RESTRICT,
    CONSTRAINT transactions_recurring_rule_same_user_fk
        FOREIGN KEY (recurring_rule_id, user_id) REFERENCES recurring_rules(id, user_id) ON DELETE RESTRICT,
    CONSTRAINT transactions_id_user_unique UNIQUE (id, user_id)
);

CREATE INDEX accounts_user_active_idx ON accounts (user_id, is_archived);
CREATE INDEX categories_user_active_idx ON categories (user_id, is_archived);
CREATE INDEX assets_user_classification_idx ON assets (user_id, classification) WHERE NOT is_archived;
CREATE INDEX asset_valuations_asset_date_idx ON asset_valuations (asset_id, valued_at DESC);
CREATE INDEX liabilities_user_status_idx ON liabilities (user_id, status);
CREATE INDEX recurring_rules_due_idx ON recurring_rules (next_due_on) WHERE is_active;
CREATE INDEX transactions_user_date_idx ON transactions (user_id, occurred_at DESC);
CREATE INDEX transactions_user_kind_date_idx ON transactions (user_id, kind, occurred_at DESC);
CREATE INDEX transactions_source_account_idx ON transactions (source_account_id, occurred_at DESC)
    WHERE source_account_id IS NOT NULL;
CREATE INDEX transactions_destination_account_idx ON transactions (destination_account_id, occurred_at DESC)
    WHERE destination_account_id IS NOT NULL;
CREATE INDEX auth_sessions_user_active_idx ON auth_sessions (user_id, expires_at)
    WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER auth_identities_set_updated_at BEFORE UPDATE ON auth_identities
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER accounts_set_updated_at BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER categories_set_updated_at BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER assets_set_updated_at BEFORE UPDATE ON assets
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER liabilities_set_updated_at BEFORE UPDATE ON liabilities
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER recurring_rules_set_updated_at BEFORE UPDATE ON recurring_rules
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER transactions_set_updated_at BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE OR REPLACE FUNCTION app.record_asset_value()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' OR NEW.current_value IS DISTINCT FROM OLD.current_value THEN
        INSERT INTO asset_valuations (user_id, asset_id, value, valued_at, note)
        VALUES (
            NEW.user_id,
            NEW.id,
            NEW.current_value,
            CASE WHEN TG_OP = 'INSERT' THEN NEW.created_at ELSE now() END,
            CASE WHEN TG_OP = 'INSERT' THEN 'Initial valuation' ELSE 'Value updated' END
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER assets_record_value
    AFTER INSERT OR UPDATE OF current_value ON assets
    FOR EACH ROW EXECUTE FUNCTION app.record_asset_value();

CREATE OR REPLACE FUNCTION app.seed_default_categories()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    INSERT INTO public.categories (user_id, name, kind, color, icon, is_system)
    VALUES
        (NEW.id, 'Food', 'expense', '#F97316', 'utensils', true),
        (NEW.id, 'Medicine', 'expense', '#EF4444', 'heart-pulse', true),
        (NEW.id, 'Household', 'expense', '#8B5CF6', 'house', true),
        (NEW.id, 'Transport', 'expense', '#3B82F6', 'car', true),
        (NEW.id, 'Subscriptions', 'expense', '#EC4899', 'repeat', true),
        (NEW.id, 'Salary', 'income', '#22C55E', 'wallet-cards', true),
        (NEW.id, 'Investment income', 'income', '#14B8A6', 'trending-up', true),
        (NEW.id, 'Other', 'both', '#64748B', 'shapes', true);
    RETURN NEW;
END;
$$;

CREATE TRIGGER users_seed_default_categories
    AFTER INSERT ON users
    FOR EACH ROW EXECUTE FUNCTION app.seed_default_categories();

-- Returns NULL outside an authenticated API transaction. The boolean argument
-- avoids an exception when app.current_user_id has not been set.
CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid;
$$;

-- Account balances include the opening balance and every directionally relevant
-- transaction. Amounts are not converted between currencies.
CREATE VIEW account_balances WITH (security_invoker = true) AS
SELECT
    a.id AS account_id,
    a.user_id,
    a.name,
    a.currency,
    a.opening_balance
        + COALESCE(SUM(
            CASE
                WHEN t.destination_account_id = a.id THEN t.amount
                WHEN t.source_account_id = a.id THEN -t.amount
                ELSE 0
            END
        ), 0) AS current_balance
FROM accounts a
LEFT JOIN transactions t
    ON t.user_id = a.user_id
    AND (t.source_account_id = a.id OR t.destination_account_id = a.id)
GROUP BY a.id, a.user_id, a.name, a.currency, a.opening_balance;

-- Effective daily expense stream. Standard/recurring entries affect their
-- occurrence date; amortized entries expand across each inclusive usage day.
CREATE VIEW daily_financial_impact WITH (security_invoker = true) AS
SELECT
    t.user_id,
    d.impact_date,
    t.currency,
    t.category_id,
    t.id AS transaction_id,
    CASE
        WHEN t.kind = 'expense' AND t.method = 'amortized' THEN t.daily_impact
        WHEN t.kind = 'expense' THEN t.amount
        ELSE 0::numeric
    END AS expense_impact
FROM transactions t
CROSS JOIN LATERAL (
    SELECT day_value::date AS impact_date
    FROM generate_series(
        CASE WHEN t.method = 'amortized' THEN t.amortization_start ELSE t.occurred_at::date END,
        CASE WHEN t.method = 'amortized' THEN t.amortization_end ELSE t.occurred_at::date END,
        interval '1 day'
    ) AS day_value
) d
WHERE t.kind = 'expense';

-- Defense-in-depth tenant isolation. Authentication tables are intentionally
-- excluded: Step 3 will access them through narrowly scoped auth operations.
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_valuations ENABLE ROW LEVEL SECURITY;
ALTER TABLE liabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY accounts_owner_policy ON accounts
    USING (user_id = app.current_user_id())
    WITH CHECK (user_id = app.current_user_id());
CREATE POLICY categories_owner_policy ON categories
    USING (user_id = app.current_user_id())
    WITH CHECK (user_id = app.current_user_id());
CREATE POLICY assets_owner_policy ON assets
    USING (user_id = app.current_user_id())
    WITH CHECK (user_id = app.current_user_id());
CREATE POLICY asset_valuations_owner_policy ON asset_valuations
    USING (user_id = app.current_user_id())
    WITH CHECK (user_id = app.current_user_id());
CREATE POLICY liabilities_owner_policy ON liabilities
    USING (user_id = app.current_user_id())
    WITH CHECK (user_id = app.current_user_id());
CREATE POLICY recurring_rules_owner_policy ON recurring_rules
    USING (user_id = app.current_user_id())
    WITH CHECK (user_id = app.current_user_id());
CREATE POLICY transactions_owner_policy ON transactions
    USING (user_id = app.current_user_id())
    WITH CHECK (user_id = app.current_user_id());

COMMIT;
