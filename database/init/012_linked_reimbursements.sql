BEGIN;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS original_transaction_id uuid;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_original_same_user_fk;
ALTER TABLE transactions ADD CONSTRAINT transactions_original_same_user_fk
  FOREIGN KEY (original_transaction_id,user_id) REFERENCES transactions(id,user_id) ON DELETE RESTRICT;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_original_valid;
ALTER TABLE transactions ADD CONSTRAINT transactions_original_valid CHECK (
  original_transaction_id IS NULL OR (kind='reimbursement' AND original_transaction_id<>id)
);
CREATE INDEX IF NOT EXISTS transactions_original_active_idx ON transactions(original_transaction_id)
  WHERE original_transaction_id IS NOT NULL AND voided_at IS NULL;

-- Serialize repayments against the expense, including concurrent partial repayments.
CREATE OR REPLACE FUNCTION app.validate_reimbursement_link() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE original transactions%ROWTYPE; returned numeric;
BEGIN
  IF NEW.original_transaction_id IS NOT NULL AND NEW.voided_at IS NULL THEN
    SELECT * INTO original FROM transactions WHERE id=NEW.original_transaction_id
      AND user_id=NEW.user_id FOR UPDATE;
    IF NOT FOUND OR original.kind<>'expense' OR original.voided_at IS NOT NULL
      OR original.currency<>NEW.currency THEN
      RAISE EXCEPTION 'Choose an active expense in the same currency.'
        USING ERRCODE='23514', CONSTRAINT='reimbursement_original_invalid';
    END IF;
    SELECT COALESCE(sum(amount),0) INTO returned FROM transactions
      WHERE original_transaction_id=original.id AND voided_at IS NULL AND id<>NEW.id;
    IF returned+NEW.amount>original.amount THEN
      RAISE EXCEPTION 'Money paid back exceeds the remaining expense.'
        USING ERRCODE='23514', CONSTRAINT='reimbursement_amount_exceeded';
    END IF;
    -- Category is derived from the original, so later recategorization cannot drift.
    NEW.category_id := NULL;
  END IF;
  IF TG_OP='UPDATE' AND OLD.kind='expense' THEN
    SELECT COALESCE(sum(amount),0) INTO returned FROM transactions
      WHERE original_transaction_id=OLD.id AND voided_at IS NULL;
    IF returned>0 AND (NEW.kind<>'expense' OR NEW.voided_at IS NOT NULL
      OR NEW.currency<>OLD.currency OR NEW.amount<returned) THEN
      RAISE EXCEPTION 'Update or remove the linked repayments first.'
        USING ERRCODE='23514', CONSTRAINT='expense_has_reimbursements';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS transactions_validate_reimbursement ON transactions;
CREATE TRIGGER transactions_validate_reimbursement BEFORE INSERT OR UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION app.validate_reimbursement_link();

-- Preserve bank movements; attribute linked repayments to the specific original expense.
CREATE OR REPLACE VIEW transaction_spending WITH (security_invoker=true) AS
SELECT t.*, COALESCE(r.returned,0)::numeric AS reimbursed_amount,
  CASE WHEN t.kind='expense' THEN t.amount-COALESCE(r.returned,0)
    WHEN t.original_transaction_id IS NOT NULL THEN 0 ELSE t.amount END::numeric AS spending_amount,
  CASE WHEN t.original_transaction_id IS NOT NULL THEN original.category_id
    ELSE t.category_id END AS effective_category_id
FROM transactions t
LEFT JOIN transactions original ON original.id=t.original_transaction_id AND original.user_id=t.user_id
LEFT JOIN LATERAL (SELECT sum(p.amount) AS returned FROM transactions p
  WHERE p.original_transaction_id=t.id AND p.voided_at IS NULL) r ON true;

CREATE OR REPLACE VIEW daily_financial_impact WITH (security_invoker=true) AS
SELECT t.user_id,d.impact_date,t.currency,t.effective_category_id AS category_id,t.id AS transaction_id,
  CASE WHEN t.kind IN ('refund','reimbursement') THEN -t.spending_amount
    WHEN t.method='amortized' THEN round(t.spending_amount/(t.amortization_end-t.amortization_start+1),6)
    ELSE t.spending_amount END AS expense_impact
FROM transaction_spending t JOIN users u ON u.id=t.user_id
CROSS JOIN LATERAL (SELECT day_value::date impact_date FROM generate_series(
  CASE WHEN t.method='amortized' THEN t.amortization_start ELSE (t.occurred_at AT TIME ZONE u.timezone)::date END,
  CASE WHEN t.method='amortized' THEN t.amortization_end ELSE (t.occurred_at AT TIME ZONE u.timezone)::date END,
  interval '1 day') day_value) d
WHERE t.kind IN ('expense','refund','reimbursement') AND t.voided_at IS NULL
  AND t.original_transaction_id IS NULL;

COMMIT;
