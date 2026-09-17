import type pg from 'pg';

const SELECT = `SELECT id,name,kind,
  source_account_id AS "sourceAccountId",destination_account_id AS "destinationAccountId",
  category_id AS "categoryId",asset_id AS "assetId",liability_id AS "liabilityId",
  amount,currency,interval_count AS "intervalCount",interval_unit AS "intervalUnit",
  starts_on::text AS "startsOn",next_due_on::text AS "nextDueOn",ends_on::text AS "endsOn",
  description,is_active AS "isActive",last_generated_at AS "lastGeneratedAt",
  created_at AS "createdAt",updated_at AS "updatedAt" FROM recurring_rules`;

export interface RecurringWrite {
  name:string; kind:string; sourceAccountId:string|null; destinationAccountId:string|null;
  categoryId:string|null; assetId:string|null; liabilityId:string|null;
  amount:string; currency:string; intervalCount:number; intervalUnit:string;
  startsOn:string; nextDueOn:string; endsOn:string|null; description:string|null; isActive:boolean;
}
export async function listRules(client: pg.PoolClient, includeInactive:boolean) {
  return (await client.query(
    `${SELECT} WHERE ($1::boolean OR is_active) ORDER BY is_active DESC,next_due_on,name`,
    [includeInactive],
  )).rows;
}
export async function getRule(client:pg.PoolClient,id:string):Promise<any|undefined>{
  return (await client.query(`${SELECT} WHERE id=$1`,[id])).rows[0];
}
export async function createRule(client:pg.PoolClient,userId:string,input:RecurringWrite){
  const result=await client.query<{id:string}>(
    `INSERT INTO recurring_rules
      (user_id,name,kind,source_account_id,destination_account_id,category_id,asset_id,
       liability_id,amount,currency,interval_count,interval_unit,starts_on,next_due_on,
       ends_on,description,is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
    [userId,input.name,input.kind,input.sourceAccountId,input.destinationAccountId,
      input.categoryId,input.assetId,input.liabilityId,input.amount,input.currency,
      input.intervalCount,input.intervalUnit,input.startsOn,input.nextDueOn,input.endsOn,
      input.description,input.isActive]);
  return getRule(client,result.rows[0]!.id);
}
export async function updateRule(client:pg.PoolClient,id:string,input:RecurringWrite){
  const result=await client.query<{id:string}>(
    `UPDATE recurring_rules SET name=$2,kind=$3,source_account_id=$4,
       destination_account_id=$5,category_id=$6,asset_id=$7,liability_id=$8,
       amount=$9,currency=$10,interval_count=$11,interval_unit=$12,starts_on=$13,
       next_due_on=$14,ends_on=$15,description=$16,is_active=$17 WHERE id=$1 RETURNING id`,
    [id,input.name,input.kind,input.sourceAccountId,input.destinationAccountId,
      input.categoryId,input.assetId,input.liabilityId,input.amount,input.currency,
      input.intervalCount,input.intervalUnit,input.startsOn,input.nextDueOn,input.endsOn,
      input.description,input.isActive]);
  return result.rows[0]?getRule(client,id):undefined;
}
export async function disableRule(client:pg.PoolClient,id:string):Promise<boolean>{
  const result=await client.query('UPDATE recurring_rules SET is_active=false WHERE id=$1 AND is_active',[id]);
  return result.rowCount===1;
}
