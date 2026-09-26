-- Additive and safe to re-run on existing installations. No money is rewritten.
BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;
-- Existing users with financial data already know their way around the product.
UPDATE users u SET onboarding_completed_at = now()
WHERE onboarding_completed_at IS NULL AND EXISTS (SELECT 1 FROM accounts a WHERE a.user_id=u.id);
COMMIT;
