BEGIN;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_lending boolean NOT NULL DEFAULT false;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS loan_borrower varchar(120);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS loan_due_on date;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_lending_valid;
ALTER TABLE transactions ADD CONSTRAINT transactions_lending_valid CHECK (
 (NOT is_lending AND loan_borrower IS NULL AND loan_due_on IS NULL) OR
 (is_lending AND kind='expense' AND method='standard' AND length(btrim(loan_borrower))>0 AND loan_borrower IS NOT NULL
 AND category_id IS NULL AND asset_id IS NULL AND liability_id IS NULL AND recurring_rule_id IS NULL
 AND amortization_start IS NULL AND amortization_end IS NULL)
);
CREATE OR REPLACE FUNCTION app.lock_lending_category() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.is_lending THEN NEW.category_locked := true; END IF; RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS transactions_lock_lending_category ON transactions;
CREATE TRIGGER transactions_lock_lending_category BEFORE INSERT OR UPDATE ON transactions
 FOR EACH ROW EXECUTE FUNCTION app.lock_lending_category();
CREATE INDEX IF NOT EXISTS transactions_lending_active_idx ON transactions(user_id,loan_due_on) WHERE is_lending AND voided_at IS NULL;
DO $$ DECLARE cols text; BEGIN
 SELECT string_agg(format('t.%I',attname),',' ORDER BY attnum) INTO cols FROM pg_attribute
 WHERE attrelid='transactions'::regclass AND attnum>0 AND NOT attisdropped
 AND attname NOT IN ('reimbursement_allocations','is_lending','loan_borrower','loan_due_on');
 EXECUTE 'CREATE OR REPLACE VIEW transaction_spending WITH (security_invoker=true) AS SELECT '||cols||',
 COALESCE(r.returned,0)::numeric AS reimbursed_amount,
 CASE WHEN t.is_lending THEN 0 WHEN t.kind=''expense'' THEN t.amount-COALESCE(r.returned,0)
 WHEN t.original_transaction_id IS NOT NULL OR t.reimbursement_allocations<>''[]''::jsonb THEN 0 ELSE t.amount END::numeric AS spending_amount,
 CASE WHEN t.original_transaction_id IS NOT NULL THEN original.category_id ELSE t.category_id END AS effective_category_id,
 t.reimbursement_allocations,t.is_lending,t.loan_borrower,t.loan_due_on,
 CASE WHEN t.is_lending THEN t.amount-COALESCE(r.returned,0) ELSE NULL END::numeric AS outstanding_amount
 FROM transactions t LEFT JOIN transactions original ON original.id=t.original_transaction_id AND original.user_id=t.user_id
 LEFT JOIN LATERAL (SELECT sum(p.amount) AS returned FROM reimbursement_shares p WHERE p.expense_id=t.id) r ON true';
END $$;
COMMIT;
