-- Preserve existing review decisions. Only an explicit user action enables
-- automatic posting for future booked movements on an existing money account.
BEGIN;
ALTER TABLE bank_account_links
  ADD COLUMN IF NOT EXISTS automatic_post_after timestamptz;
CREATE INDEX IF NOT EXISTS bank_transactions_ledger_date_idx
  ON bank_transactions(ledger_transaction_id,occurred_on) WHERE ledger_transaction_id IS NOT NULL;
COMMIT;
