BEGIN;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reimbursement_allocations jsonb NOT NULL DEFAULT '[]';
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_allocations_valid;
ALTER TABLE transactions ADD CONSTRAINT transactions_allocations_valid CHECK (
  jsonb_typeof(reimbursement_allocations)='array' AND jsonb_array_length(reimbursement_allocations)<=100
  AND (reimbursement_allocations='[]' OR (kind='reimbursement' AND original_transaction_id IS NULL))
);
CREATE OR REPLACE VIEW reimbursement_shares WITH (security_invoker=true) AS
SELECT t.id AS repayment_id,t.user_id,t.original_transaction_id AS expense_id,t.amount
FROM transactions t WHERE t.kind='reimbursement' AND t.voided_at IS NULL AND t.original_transaction_id IS NOT NULL
UNION ALL
SELECT t.id,t.user_id,(a->>'expenseId')::uuid,(a->>'amount')::numeric
FROM transactions t CROSS JOIN LATERAL jsonb_array_elements(t.reimbursement_allocations) a
WHERE t.kind='reimbursement' AND t.voided_at IS NULL;

CREATE OR REPLACE FUNCTION app.validate_reimbursement_link() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE part record; original transactions%ROWTYPE; returned numeric; total numeric;
BEGIN
  IF NEW.original_transaction_id IS NOT NULL AND NEW.reimbursement_allocations<>'[]' THEN
    RAISE EXCEPTION 'Choose either one expense or a split.' USING ERRCODE='23514';
  END IF;
  IF NEW.kind='reimbursement' AND NEW.voided_at IS NULL THEN
    IF NEW.original_transaction_id IS NOT NULL OR NEW.reimbursement_allocations<>'[]' THEN NEW.category_id := NULL; END IF;
    IF NEW.reimbursement_allocations<>'[]' THEN
      SELECT sum((a->>'amount')::numeric) INTO total FROM jsonb_array_elements(NEW.reimbursement_allocations) a;
      IF total IS DISTINCT FROM NEW.amount OR EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.reimbursement_allocations) a
        WHERE (a->>'amount') IS NULL OR (a->>'expenseId') IS NULL OR (a->>'amount')::numeric<=0)
        OR (SELECT count(*)<>count(DISTINCT a->>'expenseId') FROM jsonb_array_elements(NEW.reimbursement_allocations) a) THEN
        RAISE EXCEPTION 'Allocate the full repayment once, using positive amounts.' USING ERRCODE='23514',CONSTRAINT='reimbursement_split_invalid';
      END IF;
    END IF;
    -- Sorted locks serialize simultaneous splits without reversing lock order.
    FOR part IN SELECT NEW.original_transaction_id AS expense_id,NEW.amount AS amount WHERE NEW.original_transaction_id IS NOT NULL
      UNION ALL SELECT (a->>'expenseId')::uuid,(a->>'amount')::numeric FROM jsonb_array_elements(NEW.reimbursement_allocations) a
      ORDER BY expense_id
    LOOP
      SELECT * INTO original FROM transactions WHERE id=part.expense_id AND user_id=NEW.user_id FOR UPDATE;
      IF NOT FOUND OR original.kind<>'expense' OR original.voided_at IS NOT NULL OR original.currency<>NEW.currency THEN
        RAISE EXCEPTION 'Choose an active expense in the same currency.' USING ERRCODE='23514',CONSTRAINT='reimbursement_original_invalid';
      END IF;
      SELECT COALESCE(sum(amount),0) INTO returned FROM reimbursement_shares WHERE expense_id=original.id AND repayment_id<>NEW.id;
      IF returned+part.amount>original.amount THEN
        RAISE EXCEPTION 'Money paid back exceeds the remaining expense.' USING ERRCODE='23514',CONSTRAINT='reimbursement_amount_exceeded';
      END IF;
    END LOOP;
  END IF;
  IF TG_OP='UPDATE' AND OLD.kind='expense' THEN
    SELECT COALESCE(sum(amount),0) INTO returned FROM reimbursement_shares WHERE expense_id=OLD.id;
    IF returned>0 AND (NEW.kind<>'expense' OR NEW.voided_at IS NOT NULL OR NEW.currency<>OLD.currency OR NEW.amount<returned) THEN
      RAISE EXCEPTION 'Update or remove the linked repayments first.' USING ERRCODE='23514',CONSTRAINT='expense_has_reimbursements';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
-- Append the new view column after existing columns, preserving dependent views.
DO $$ DECLARE cols text; BEGIN
 SELECT string_agg(format('t.%I',attname),',' ORDER BY attnum) INTO cols FROM pg_attribute
 WHERE attrelid='transactions'::regclass AND attnum>0 AND NOT attisdropped AND attname<>'reimbursement_allocations';
 EXECUTE 'CREATE OR REPLACE VIEW transaction_spending WITH (security_invoker=true) AS SELECT '||cols||',
 COALESCE(r.returned,0)::numeric AS reimbursed_amount,
 CASE WHEN t.kind=''expense'' THEN t.amount-COALESCE(r.returned,0)
 WHEN t.original_transaction_id IS NOT NULL OR t.reimbursement_allocations<>''[]''::jsonb THEN 0 ELSE t.amount END::numeric AS spending_amount,
 CASE WHEN t.original_transaction_id IS NOT NULL THEN original.category_id ELSE t.category_id END AS effective_category_id,t.reimbursement_allocations
 FROM transactions t LEFT JOIN transactions original ON original.id=t.original_transaction_id AND original.user_id=t.user_id
 LEFT JOIN LATERAL (SELECT sum(p.amount) AS returned FROM reimbursement_shares p WHERE p.expense_id=t.id) r ON true';
END $$;
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
  AND t.original_transaction_id IS NULL AND jsonb_array_length(t.reimbursement_allocations)=0;


COMMIT;
