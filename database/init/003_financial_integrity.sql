-- Additive Step 4 migration: DCA contribution history and safe transaction voiding.
-- Idempotent so it can be applied to both fresh and existing databases.

BEGIN;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS voided_at timestamptz;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS void_reason varchar(250);

CREATE TABLE IF NOT EXISTS asset_contributions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    asset_id uuid NOT NULL,
    transaction_id uuid,
    amount numeric(19, 4) NOT NULL,
    currency varchar(3) NOT NULL,
    contributed_at timestamptz NOT NULL,
    note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    voided_at timestamptz,
    CONSTRAINT asset_contributions_amount_positive CHECK (amount > 0),
    CONSTRAINT asset_contributions_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT asset_contributions_asset_same_user_fk
        FOREIGN KEY (asset_id, user_id) REFERENCES assets(id, user_id) ON DELETE RESTRICT,
    CONSTRAINT asset_contributions_transaction_same_user_fk
        FOREIGN KEY (transaction_id, user_id) REFERENCES transactions(id, user_id) ON DELETE RESTRICT,
    CONSTRAINT asset_contributions_transaction_unique UNIQUE (transaction_id),
    CONSTRAINT asset_contributions_id_user_unique UNIQUE (id, user_id)
);

ALTER TABLE asset_contributions ADD COLUMN IF NOT EXISTS voided_at timestamptz;

CREATE INDEX IF NOT EXISTS asset_contributions_asset_date_idx
    ON asset_contributions (asset_id, contributed_at DESC);
CREATE INDEX IF NOT EXISTS transactions_user_active_date_idx
    ON transactions (user_id, occurred_at DESC) WHERE voided_at IS NULL;

CREATE OR REPLACE FUNCTION app.recalculate_asset_principal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    target_asset_id uuid;
    target_user_id uuid;
BEGIN
    target_asset_id := COALESCE(NEW.asset_id, OLD.asset_id);
    target_user_id := COALESCE(NEW.user_id, OLD.user_id);

    UPDATE assets
    SET initial_value = COALESCE((
        SELECT sum(amount)
        FROM asset_contributions
        WHERE asset_id = target_asset_id AND user_id = target_user_id AND voided_at IS NULL
    ), 0)
    WHERE id = target_asset_id AND user_id = target_user_id;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS asset_contributions_recalculate_principal ON asset_contributions;
CREATE TRIGGER asset_contributions_recalculate_principal
    AFTER INSERT OR UPDATE OF amount, voided_at OR DELETE ON asset_contributions
    FOR EACH ROW EXECUTE FUNCTION app.recalculate_asset_principal();

-- Preserve every pre-migration asset's existing cost basis as its first
-- contribution. The NOT EXISTS clause makes repeated migration runs safe.
INSERT INTO asset_contributions (
    user_id, asset_id, amount, currency, contributed_at, note
)
SELECT
    a.user_id,
    a.id,
    a.initial_value,
    a.currency,
    a.acquisition_date::timestamp AT TIME ZONE 'UTC',
    'Opening principal migrated from asset initial value'
FROM assets a
WHERE a.initial_value > 0
  AND NOT EXISTS (
      SELECT 1 FROM asset_contributions c WHERE c.asset_id = a.id
  );

ALTER TABLE asset_contributions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'asset_contributions'
          AND policyname = 'asset_contributions_owner_policy'
    ) THEN
        CREATE POLICY asset_contributions_owner_policy ON asset_contributions
            USING (user_id = app.current_user_id())
            WITH CHECK (user_id = app.current_user_id());
    END IF;
END;
$$;

CREATE OR REPLACE VIEW account_balances WITH (security_invoker = true) AS
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
        ) FILTER (WHERE t.voided_at IS NULL), 0) AS current_balance
FROM accounts a
LEFT JOIN transactions t
    ON t.user_id = a.user_id
    AND (t.source_account_id = a.id OR t.destination_account_id = a.id)
GROUP BY a.id, a.user_id, a.name, a.currency, a.opening_balance;

CREATE OR REPLACE VIEW daily_financial_impact WITH (security_invoker = true) AS
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
JOIN users u ON u.id = t.user_id
CROSS JOIN LATERAL (
    SELECT day_value::date AS impact_date
    FROM generate_series(
        CASE WHEN t.method = 'amortized' THEN t.amortization_start ELSE (t.occurred_at AT TIME ZONE u.timezone)::date END,
        CASE WHEN t.method = 'amortized' THEN t.amortization_end ELSE (t.occurred_at AT TIME ZONE u.timezone)::date END,
        interval '1 day'
    ) AS day_value
) d
WHERE t.kind = 'expense' AND t.voided_at IS NULL;

COMMIT;
