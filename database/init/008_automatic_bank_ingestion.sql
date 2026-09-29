BEGIN;
ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS last_sync_attempt_at timestamptz;
ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS last_sync_failed_at timestamptz;
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS booking_date date;
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS transaction_date date;
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS value_date date;
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS provider_transaction_id text;
-- Two bank legs may legitimately point at one transfer ledger entry.
CREATE UNIQUE INDEX IF NOT EXISTS bank_transactions_manual_match_unique
  ON bank_transactions(ledger_transaction_id) WHERE match_status='matched_manual';
COMMIT;
