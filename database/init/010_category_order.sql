BEGIN;

ALTER TABLE categories ADD COLUMN IF NOT EXISTS sort_position integer
  CHECK (sort_position >= 0);

-- Preserve the existing display order until the owner chooses another order.
WITH positions AS (
  SELECT id, row_number() OVER (
    PARTITION BY user_id ORDER BY is_system DESC, is_archived, name, id
  ) - 1 AS position
  FROM categories
)
UPDATE categories c SET sort_position = p.position
FROM positions p WHERE c.id = p.id AND c.sort_position IS NULL;

COMMIT;
