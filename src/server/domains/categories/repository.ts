import type pg from 'pg';

const CATEGORY_SELECT = `SELECT id, name, kind, color, icon,
  is_system AS "isSystem", is_archived AS "isArchived",
  created_at AS "createdAt", updated_at AS "updatedAt"
  FROM categories`;

export interface CategoryWrite {
  name: string;
  kind: string;
  color: string | null;
  icon: string | null;
}

export async function listCategories(client: pg.PoolClient, includeArchived: boolean): Promise<any[]> {
  const result = await client.query(
    `${CATEGORY_SELECT} WHERE ($1::boolean OR NOT is_archived)
     ORDER BY is_system DESC, is_archived, name`,
    [includeArchived],
  );
  return result.rows;
}

export async function getCategory(client: pg.PoolClient, id: string): Promise<any | undefined> {
  return (await client.query(`${CATEGORY_SELECT} WHERE id = $1`, [id])).rows[0];
}

export async function createCategory(
  client: pg.PoolClient, userId: string, input: CategoryWrite,
): Promise<any> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO categories (user_id, name, kind, color, icon)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [userId, input.name, input.kind, input.color, input.icon],
  );
  return getCategory(client, result.rows[0]!.id);
}

export async function updateCategory(
  client: pg.PoolClient, id: string, input: CategoryWrite,
): Promise<any | undefined> {
  const result = await client.query<{ id: string }>(
    `UPDATE categories SET name = $2, kind = $3, color = $4, icon = $5
     WHERE id = $1 AND NOT is_system AND NOT is_archived RETURNING id`,
    [id, input.name, input.kind, input.color, input.icon],
  );
  return result.rows[0] ? getCategory(client, id) : undefined;
}

export async function archiveCategory(client: pg.PoolClient, id: string): Promise<boolean> {
  const result = await client.query(
    `UPDATE categories SET is_archived = true
     WHERE id = $1 AND NOT is_system AND NOT is_archived`,
    [id],
  );
  return result.rowCount === 1;
}
