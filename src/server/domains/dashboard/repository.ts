import type pg from 'pg';
import { ApiError } from '../../errors.js';

export type Timeframe = 'daily'|'weekly'|'monthly'|'6-month'|'annual';

interface Bounds {
  timezone:string; anchorDate:string; startLocal:string; endLocalExclusive:string;
  startUtc:string; endUtcExclusive:string;
}

export async function getDashboard(
  client:pg.PoolClient,userId:string,timeframe:Timeframe,anchor?:string,
){
  
  const boundsResult=await client.query<Bounds>(`
    WITH settings AS (
      SELECT timezone,COALESCE($3::date,(now() AT TIME ZONE timezone)::date) anchor_date
      FROM users WHERE id=$1
        AND EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=users.timezone)
    ), local_bounds AS (
      SELECT timezone,anchor_date,
        CASE $2
          WHEN 'daily' THEN anchor_date::timestamp
          WHEN 'weekly' THEN date_trunc('week',anchor_date::timestamp)
          WHEN 'monthly' THEN date_trunc('month',anchor_date::timestamp)
          WHEN '6-month' THEN date_trunc('month',anchor_date::timestamp)-interval '5 months'
          WHEN 'annual' THEN date_trunc('year',anchor_date::timestamp)
        END start_local
      FROM settings
    ), complete AS (
      SELECT *,CASE $2
        WHEN 'daily' THEN start_local+interval '1 day'
        WHEN 'weekly' THEN start_local+interval '7 days'
        WHEN 'monthly' THEN start_local+interval '1 month'
        WHEN '6-month' THEN start_local+interval '6 months'
        WHEN 'annual' THEN start_local+interval '1 year'
      END end_local FROM local_bounds
    )
    SELECT timezone,anchor_date AS "anchorDate",start_local::date AS "startLocal",
      end_local::date AS "endLocalExclusive",
      start_local AT TIME ZONE timezone AS "startUtc",
      end_local AT TIME ZONE timezone AS "endUtcExclusive" FROM complete`,
    [userId,timeframe,anchor??null]);
  const bounds=boundsResult.rows[0];
  if(!bounds)throw new ApiError(400,'invalid_timezone','The user timezone is not a valid IANA timezone.');

  const range=[bounds.startUtc,bounds.endUtcExclusive];
  const cashFlow=(await client.query(`
    SELECT currency,
      COALESCE(sum(amount) FILTER(WHERE kind='expense'),0)::numeric AS "actualSpending",
      COALESCE(sum(amount) FILTER(WHERE kind='income'),0)::numeric AS "actualIncome",
      (COALESCE(sum(amount) FILTER(WHERE kind='income'),0)-
       COALESCE(sum(amount) FILTER(WHERE kind='expense'),0))::numeric AS "ordinaryNetCashFlow",
      COALESCE(sum(amount) FILTER(WHERE kind='asset_purchase'),0)::numeric AS "assetPurchases",
      COALESCE(sum(amount) FILTER(WHERE kind='asset_sale'),0)::numeric AS "assetSaleProceeds",
      COALESCE(sum(amount) FILTER(WHERE kind='liability_drawdown'),0)::numeric AS "liabilityDrawdowns",
      COALESCE(sum(amount) FILTER(WHERE kind='liability_payment'),0)::numeric AS "liabilityPayments"
    FROM transactions WHERE voided_at IS NULL AND occurred_at >= $1 AND occurred_at < $2
    GROUP BY currency ORDER BY currency`,range)).rows;

  const utilityImpact=(await client.query(`
    SELECT currency,sum(expense_impact)::numeric AS "utilityAdjustedCost"
    FROM daily_financial_impact WHERE impact_date >= $1::date AND impact_date < $2::date
    GROUP BY currency ORDER BY currency`,[bounds.startLocal,bounds.endLocalExclusive])).rows;

  const assetSummary=(await client.query(`
    SELECT currency,sum(initial_value)::numeric AS "cumulativePrincipal",
      sum(current_value)::numeric AS "currentValue",
      sum(absolute_return)::numeric AS "absoluteGainLoss",
      CASE WHEN sum(initial_value)=0 THEN NULL
        ELSE ((sum(current_value)-sum(initial_value))/sum(initial_value)*100)::numeric
      END AS "simpleReturnPercentage"
    FROM assets WHERE NOT is_archived GROUP BY currency ORDER BY currency`)).rows;

  const liabilitySummary=(await client.query(`
    SELECT currency,sum(original_principal)::numeric AS "originalPrincipal",
      sum(outstanding_balance)::numeric AS "outstandingBalance"
    FROM liabilities WHERE status='active' GROUP BY currency ORDER BY currency`)).rows;

  const spendingByCategory=(await client.query(`
    SELECT t.currency,t.category_id AS "categoryId",COALESCE(c.name,'Uncategorized') AS "categoryName",
      sum(t.amount)::numeric AS "actualSpending"
    FROM transactions t LEFT JOIN categories c ON c.id=t.category_id
    WHERE t.voided_at IS NULL AND t.kind='expense' AND t.occurred_at >= $1 AND t.occurred_at < $2
    GROUP BY t.currency,t.category_id,c.name ORDER BY t.currency,"actualSpending" DESC`,range)).rows;

  const accountBalances=(await client.query(`
    SELECT b.account_id AS "accountId",b.name,b.currency,a.opening_balance AS "openingBalance",
      b.current_balance AS "currentBalance" FROM account_balances b
    JOIN accounts a ON a.id=b.account_id AND a.user_id=b.user_id
    WHERE NOT a.is_archived ORDER BY b.currency,b.name`)).rows;

  const actualTrend=(await client.query(`
    SELECT currency,
      (CASE WHEN $3 IN ('6-month','annual')
        THEN date_trunc('month',occurred_at AT TIME ZONE $4)
        ELSE date_trunc('day',occurred_at AT TIME ZONE $4) END)::text AS "bucketStartLocal",
      COALESCE(sum(amount) FILTER(WHERE kind='expense'),0)::numeric AS "actualSpending",
      COALESCE(sum(amount) FILTER(WHERE kind='income'),0)::numeric AS "actualIncome",
      COALESCE(sum(amount) FILTER(WHERE kind='asset_purchase'),0)::numeric AS "assetPurchases"
    FROM transactions WHERE voided_at IS NULL AND occurred_at >= $1 AND occurred_at < $2
      AND kind IN ('expense','income','asset_purchase')
    GROUP BY currency,"bucketStartLocal" ORDER BY "bucketStartLocal",currency`,
    [...range,timeframe,bounds.timezone])).rows;

  const utilityTrend=(await client.query(`
    SELECT currency,
      (CASE WHEN $3 IN ('6-month','annual') THEN date_trunc('month',impact_date::timestamp)
        ELSE impact_date::timestamp END)::text AS "bucketStartLocal",
      sum(expense_impact)::numeric AS "utilityAdjustedCost"
    FROM daily_financial_impact WHERE impact_date >= $1::date AND impact_date < $2::date
    GROUP BY currency,"bucketStartLocal" ORDER BY "bucketStartLocal",currency`,
    [bounds.startLocal,bounds.endLocalExclusive,timeframe])).rows;

  const assetGrowthTrend=(await client.query(`
    WITH valuation_gains AS (
      SELECT a.currency,v.asset_id,v.id,v.valued_at,
        v.value-COALESCE((
          SELECT sum(c.amount) FROM asset_contributions c
          WHERE c.asset_id=v.asset_id AND c.voided_at IS NULL AND c.contributed_at<=v.valued_at
        ),0) unrealized_gain
      FROM asset_valuations v JOIN assets a ON a.id=v.asset_id WHERE NOT a.is_archived
    ), changes AS (
      SELECT currency,valued_at,
        unrealized_gain-lag(unrealized_gain) OVER(PARTITION BY asset_id ORDER BY valued_at,id) gain_change
      FROM valuation_gains
    )
    SELECT currency,
      (CASE WHEN $3 IN ('6-month','annual')
        THEN date_trunc('month',valued_at AT TIME ZONE $4)
        ELSE date_trunc('day',valued_at AT TIME ZONE $4) END)::text AS "bucketStartLocal",
      sum(gain_change)::numeric AS "unrealizedGainChange"
    FROM changes WHERE valued_at >= $1 AND valued_at < $2 AND gain_change IS NOT NULL
    GROUP BY currency,"bucketStartLocal" ORDER BY "bucketStartLocal",currency`,
    [...range,timeframe,bounds.timezone])).rows;

  return {timeframe,bounds,cashFlow,utilityImpact,assetSummary,liabilitySummary,
    spendingByCategory,accountBalances,trends:{actualCashFlow:actualTrend,
      utilityImpact:utilityTrend,assetUnrealizedGainChange:assetGrowthTrend}};
}
