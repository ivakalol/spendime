-- Apply with psql in autocommit mode, not --single-transaction.
ALTER TYPE transaction_kind ADD VALUE IF NOT EXISTS 'reimbursement';

BEGIN;

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_accounts_valid;
ALTER TABLE transactions ADD CONSTRAINT transactions_accounts_valid CHECK (
    (kind = 'expense' AND source_account_id IS NOT NULL AND destination_account_id IS NULL)
    OR (kind IN ('income', 'refund', 'reimbursement') AND source_account_id IS NULL AND destination_account_id IS NOT NULL)
    OR (kind = 'transfer' AND source_account_id IS NOT NULL AND destination_account_id IS NOT NULL AND source_account_id <> destination_account_id)
    OR (kind = 'asset_purchase' AND source_account_id IS NOT NULL AND destination_account_id IS NULL AND asset_id IS NOT NULL)
    OR (kind = 'asset_sale' AND source_account_id IS NULL AND destination_account_id IS NOT NULL AND asset_id IS NOT NULL)
    OR (kind = 'liability_drawdown' AND destination_account_id IS NOT NULL AND liability_id IS NOT NULL)
    OR (kind = 'liability_payment' AND source_account_id IS NOT NULL AND liability_id IS NOT NULL)
    OR (kind = 'adjustment' AND num_nonnulls(source_account_id, destination_account_id) = 1)
);

CREATE OR REPLACE VIEW daily_financial_impact WITH (security_invoker=true) AS
SELECT t.user_id,d.impact_date,t.currency,t.category_id,t.id AS transaction_id,
    CASE WHEN t.kind IN ('refund','reimbursement') THEN -t.amount
         WHEN t.method='amortized' THEN t.daily_impact ELSE t.amount END AS expense_impact
FROM transactions t JOIN users u ON u.id=t.user_id
CROSS JOIN LATERAL (SELECT day_value::date impact_date FROM generate_series(
    CASE WHEN t.method='amortized' THEN t.amortization_start ELSE (t.occurred_at AT TIME ZONE u.timezone)::date END,
    CASE WHEN t.method='amortized' THEN t.amortization_end ELSE (t.occurred_at AT TIME ZONE u.timezone)::date END,
    interval '1 day') day_value) d
WHERE t.kind IN ('expense','refund','reimbursement') AND t.voided_at IS NULL;


COMMIT;
