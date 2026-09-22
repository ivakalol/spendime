import type pg from 'pg';

export const merchantKey = (value: string | null): string | null => {
  const key = value?.normalize('NFKC').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
  return key || null;
};

interface CategorizationInput { merchant: string | null; description: string | null; direction: 'debit' | 'credit' }

export async function categorizeDeterministically(client: pg.PoolClient, userId: string, tx: CategorizationInput): Promise<string | null> {
  const key = merchantKey(tx.merchant);
  if (key) {
    const preference = await client.query<{ category_id: string }>(`
      SELECT r.category_id FROM bank_category_rules r JOIN categories c ON c.id=r.category_id
      WHERE r.user_id=$1 AND r.merchant_key=$2 AND r.direction=$3 AND r.source IN ('explicit','confirmed')
        AND NOT c.is_archived AND c.kind IN ($4,'both')
      ORDER BY CASE r.source WHEN 'explicit' THEN 0 ELSE 1 END LIMIT 1`,
      [userId,key,tx.direction,tx.direction==='credit'?'income':'expense']);
    if (preference.rows[0]) return preference.rows[0].category_id;
  }
  const text = `${key ?? ''} ${merchantKey(tx.description) ?? ''}`;
  let categoryName: string | null = null;
  if (tx.direction === 'credit' && /\b(salary|payroll|wages)\b/i.test(text)) categoryName = 'Salary';
  if (tx.direction === 'debit') {
    if (/\b(uber|bolt|taxi|metro|bus ticket)\b/i.test(text)) categoryName = 'Transport';
    else if (/\b(pharmacy|apteka|аптека)\b/i.test(text)) categoryName = 'Medicine';
    else if (/\b(netflix|spotify)\b/i.test(text)) categoryName = 'Subscriptions';
  }
  if (!categoryName) return null;
  const category = await client.query<{ id: string }>(`SELECT id FROM categories WHERE user_id=$1
    AND name=$2 AND NOT is_archived AND kind IN ($3,'both') LIMIT 1`,
  [userId,categoryName,tx.direction==='credit'?'income':'expense']);
  return category.rows[0]?.id ?? null;
}
