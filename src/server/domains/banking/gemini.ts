import { GoogleGenAI } from '@google/genai';
import type pg from 'pg';
import { z } from 'zod';
import type { AppConfig } from '../../config.js';
import { withUserTransaction } from '../../db/transactions.js';
import { merchantKey } from './categorize.js';

const resultSchema = z.object({
  categoryId: z.string().uuid().nullable(),
  normalizedMerchant: z.string().max(120).nullable(),
  uncertain: z.boolean(),
  explanation: z.string().max(160),
}).strict();

export function parseGeminiDecision(text: string, allowedCategoryIds: readonly string[]): string | null {
  const result = resultSchema.parse(JSON.parse(text));
  return !result.uncertain && result.categoryId && allowedCategoryIds.includes(result.categoryId) ? result.categoryId : null;
}

export function geminiAvailable(config: AppConfig): boolean {
  return config.geminiEnabled && config.geminiPaidProject && config.geminiPrivacyApproved &&
    Boolean(config.geminiApiKey && config.geminiModel);
}

export function minimalBankingText(value: string | null): string | null {
  if (!value) return null;
  return value.slice(0, 220)
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gi, '[account]')
    .replace(/\b\d{5,}\b/g, '[number]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Z]{2,}/gi, '[email]')
    .trim() || null;
}

interface Candidate { id: string; user_id: string; ledger_transaction_id: string; merchant: string | null; description: string | null; direction: 'debit' | 'credit' }

export async function classifyBankTransactions(pool: pg.Pool, config: AppConfig): Promise<void> {
  if (!geminiAvailable(config)) return;
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey! });
  const users = await pool.query<{ id: string }>('SELECT id FROM users WHERE status=\'active\'');
  for (const user of users.rows) {
    const optedIn = await withUserTransaction(pool,user.id,async (client) =>
      (await client.query('SELECT enabled FROM bank_ai_preferences WHERE user_id=$1',[user.id])).rows[0]?.enabled === true);
    if (!optedIn) continue;
    const attemptsToday = await withUserTransaction(pool,user.id,async (client) =>
      Number((await client.query(`SELECT count(*)::integer AS n FROM bank_transactions WHERE ai_attempted_at>=now()-interval '1 day'`)).rows[0]?.n ?? 0));
    if (attemptsToday >= 100) continue;
    const candidates = await withUserTransaction(pool,user.id,async (client) =>
      (await client.query<Candidate>(`SELECT bt.id,bt.user_id,bt.ledger_transaction_id,bt.merchant,bt.description,bt.direction
        FROM bank_transactions bt JOIN transactions t ON t.id=bt.ledger_transaction_id
        JOIN bank_account_links l ON l.id=bt.bank_account_link_id
        JOIN bank_connections c ON c.id=l.connection_id
        WHERE bt.match_status='posted' AND bt.classification_source='uncategorized'
          AND (bt.ai_attempted_at IS NULL OR (bt.ai_attempts<3 AND bt.ai_attempted_at<now()-interval '1 hour'))
          AND t.category_id IS NULL AND NOT t.category_locked
          AND t.voided_at IS NULL AND t.kind IN ('expense','income') AND c.environment='sandbox'
        ORDER BY bt.first_seen_at LIMIT $1`,[Math.min(20,100-attemptsToday)])).rows);
    for (const candidate of candidates) {
      try { await classifyOne(pool,ai,config,user.id,candidate); }
      catch { /* Retry is deliberately deferred to operator review; sync remains independent. */ }
    }
  }
}

async function classifyOne(pool: pg.Pool, ai: GoogleGenAI, config: AppConfig, userId: string, candidate: Candidate): Promise<void> {
  const context = await withUserTransaction(pool,userId,async (client) => {
    const claimed = await client.query(`UPDATE bank_transactions SET ai_attempted_at=now(),ai_attempts=ai_attempts+1
      WHERE id=$1 AND (ai_attempted_at IS NULL OR (ai_attempts<3 AND ai_attempted_at<now()-interval '1 hour')) RETURNING id`,[candidate.id]);
    if (!claimed.rowCount) return null;
    const key = merchantKey(candidate.merchant);
    if (key) {
      const cached = await client.query<{ category_id: string }>(`SELECT r.category_id FROM bank_category_rules r JOIN categories c ON c.id=r.category_id
        WHERE r.user_id=$1 AND r.merchant_key=$2 AND r.direction=$3 AND r.source='ai'
          AND NOT c.is_archived AND c.kind IN ($4,'both') LIMIT 1`,[userId,key,candidate.direction,candidate.direction==='credit'?'income':'expense']);
      if (cached.rows[0]) {
        await client.query(`UPDATE transactions SET category_id=$2 WHERE id=$1 AND category_id IS NULL AND NOT category_locked`,[candidate.ledger_transaction_id,cached.rows[0].category_id]);
        await client.query(`UPDATE bank_transactions SET classification_source='ai_cache' WHERE id=$1`,[candidate.id]);
        return null;
      }
    }
    const categories = (await client.query<{ id: string; name: string }>(`SELECT id,name FROM categories
      WHERE NOT is_archived AND kind IN ($1,'both') ORDER BY name LIMIT 100`,[candidate.direction==='credit'?'income':'expense'])).rows;
    return { key,categories };
  });
  if (!context?.categories.length) return;
  const response = await ai.models.generateContent({
    model: config.geminiModel!,
    contents: JSON.stringify({ merchant:minimalBankingText(candidate.merchant), description:minimalBankingText(candidate.description), direction:candidate.direction,
      categories:context.categories }),
    config: { responseMimeType:'application/json', responseJsonSchema: {
      type:'object', additionalProperties:false,
      properties:{ categoryId:{ type:['string','null'] }, normalizedMerchant:{ type:['string','null'] }, uncertain:{ type:'boolean' }, explanation:{ type:'string' } },
      required:['categoryId','normalizedMerchant','uncertain','explanation'],
    }, maxOutputTokens:160, temperature:0, httpOptions:{ timeout:10000 } },
  });
  const categoryId = parseGeminiDecision(response.text ?? 'null',context.categories.map((x)=>x.id));
  if (!categoryId) {
    await withUserTransaction(pool,userId,async(client)=>{await client.query(`UPDATE bank_transactions SET classification_source='uncertain' WHERE id=$1`,[candidate.id]);});
    return;
  }
  await withUserTransaction(pool,userId,async (client) => {
    const applied = await client.query(`UPDATE transactions SET category_id=$2 WHERE id=$1 AND category_id IS NULL
      AND NOT category_locked AND voided_at IS NULL RETURNING id`,[candidate.ledger_transaction_id,categoryId]);
    if (!applied.rowCount) return;
    await client.query(`UPDATE bank_transactions SET classification_source='ai' WHERE id=$1`,[candidate.id]);
    if (context.key) await client.query(`INSERT INTO bank_category_rules(user_id,merchant_key,direction,category_id,source)
      VALUES($1,$2,$3,$4,'ai') ON CONFLICT(user_id,merchant_key,direction,source) DO UPDATE SET category_id=excluded.category_id`,
      [userId,context.key,candidate.direction,categoryId]);
  });
}
