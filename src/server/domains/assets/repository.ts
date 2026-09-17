import type pg from 'pg';

export const ASSET_SELECT = `SELECT id, name, classification, currency,
  acquisition_date::text AS "acquisitionDate",
  initial_value AS "cumulativePrincipal",
  current_value AS "currentValue",
  absolute_return AS "absoluteReturn",
  percentage_return AS "percentageReturn",
  depreciation, useful_life_days AS "usefulLifeDays",
  residual_value AS "residualValue", notes,
  is_archived AS "isArchived", created_at AS "createdAt", updated_at AS "updatedAt"
  FROM assets`;

export interface AssetWrite {
  name: string;
  classification: string;
  currency: string;
  acquisitionDate: string;
  currentValue: string;
  depreciation: string;
  usefulLifeDays: number | null;
  residualValue: string | null;
  notes: string | null;
}

export async function listAssets(
  client: pg.PoolClient, includeArchived: boolean, classification?: string,
): Promise<any[]> {
  const result = await client.query(
    `${ASSET_SELECT}
     WHERE ($1::boolean OR NOT is_archived)
       AND ($2::asset_classification IS NULL OR classification = $2)
     ORDER BY is_archived, name`,
    [includeArchived, classification ?? null],
  );
  return result.rows;
}

export async function getAsset(client: pg.PoolClient, id: string): Promise<any | undefined> {
  return (await client.query(`${ASSET_SELECT} WHERE id = $1`, [id])).rows[0];
}

export async function createAsset(
  client: pg.PoolClient,
  userId: string,
  input: AssetWrite & { initialContribution: string },
): Promise<any> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO assets (
      user_id, name, classification, currency, acquisition_date,
      initial_value, current_value, depreciation, useful_life_days,
      residual_value, notes
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [
      userId, input.name, input.classification, input.currency, input.acquisitionDate,
      input.initialContribution, input.currentValue, input.depreciation,
      input.usefulLifeDays, input.residualValue, input.notes,
    ],
  );
  const assetId = result.rows[0]!.id;
  await client.query(
    `INSERT INTO asset_contributions
      (user_id, asset_id, amount, currency, contributed_at, note)
     VALUES ($1, $2, $3, $4, $5::date::timestamp AT TIME ZONE 'UTC', 'Initial contribution')`,
    [userId, assetId, input.initialContribution, input.currency, input.acquisitionDate],
  );
  return getAsset(client, assetId);
}

export async function updateAsset(
  client: pg.PoolClient, id: string, input: AssetWrite,
): Promise<any | undefined> {
  const result = await client.query<{ id: string }>(
    `UPDATE assets SET name=$2, classification=$3, currency=$4,
       acquisition_date=$5, current_value=$6, depreciation=$7,
       useful_life_days=$8, residual_value=$9, notes=$10
     WHERE id=$1 AND NOT is_archived RETURNING id`,
    [id, input.name, input.classification, input.currency, input.acquisitionDate,
      input.currentValue, input.depreciation, input.usefulLifeDays,
      input.residualValue, input.notes],
  );
  return result.rows[0] ? getAsset(client, id) : undefined;
}

export async function archiveAsset(client: pg.PoolClient, id: string): Promise<boolean> {
  const result = await client.query(
    'UPDATE assets SET is_archived=true WHERE id=$1 AND NOT is_archived', [id]);
  return result.rowCount === 1;
}

export async function listContributions(
  client: pg.PoolClient, assetId: string, limit: number, offset: number,
) {
  const result = await client.query(
    `SELECT id, asset_id AS "assetId", transaction_id AS "transactionId",
       amount, currency, contributed_at AS "contributedAt", note,
       voided_at AS "voidedAt", created_at AS "createdAt",
       count(*) OVER()::integer AS "totalCount"
     FROM asset_contributions WHERE asset_id=$1
     ORDER BY contributed_at DESC, id DESC LIMIT $2 OFFSET $3`,
    [assetId, limit, offset],
  );
  const total = result.rows[0]?.totalCount ?? 0;
  return { items: result.rows.map(({ totalCount: _, ...row }) => row), total };
}

export async function listValuations(
  client: pg.PoolClient, assetId: string, limit: number, offset: number,
) {
  const result = await client.query(
    `SELECT id, asset_id AS "assetId", value, valued_at AS "valuedAt",
       note, created_at AS "createdAt", count(*) OVER()::integer AS "totalCount"
     FROM asset_valuations WHERE asset_id=$1
     ORDER BY valued_at DESC, id DESC LIMIT $2 OFFSET $3`,
    [assetId, limit, offset],
  );
  const total = result.rows[0]?.totalCount ?? 0;
  return { items: result.rows.map(({ totalCount: _, ...row }) => row), total };
}
