-- Existing accounts retain their current reporting behavior until they opt in.
BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_month_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS month_start_day integer NOT NULL DEFAULT 1
  CHECK (month_start_day BETWEEN 1 AND 31);
COMMIT;
