BEGIN;

-- A permanent, user-local date boundary for bank history deliberately excluded
-- when switching from manual tracking. Existing ledger entries remain intact.
ALTER TABLE bank_account_links
  ADD COLUMN IF NOT EXISTS history_ignored_before date;

COMMIT;
