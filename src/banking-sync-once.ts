import { readFileSync } from 'node:fs';
import { bankingCredentialConfig, bankingRuntimeEnabled, loadConfig } from './server/config.js';
import { assertSafeRuntimeRole, createPool } from './server/db/pool.js';
import { withUserTransaction } from './server/db/transactions.js';
import { EnableBankingProvider } from './server/domains/banking/enableBanking.js';
import { BankingSecrets } from './server/domains/banking/secrets.js';
import { syncConnection } from './server/domains/banking/sync.js';

// Run the same due-only pipeline as the Banking page, with an aggregate result
// suitable for pasting into a support conversation. No credentials or bank
// transaction content are printed.
const config = loadConfig();
if (!config.bankingOwnerUserId || !bankingRuntimeEnabled(config))
  throw new Error('Banking is disabled for this runtime');
const credentials = bankingCredentialConfig(config);
const privateKey = credentials.privateKeyFile ? readFileSync(credentials.privateKeyFile,'utf8')
  : credentials.privateKeyB64 ? Buffer.from(credentials.privateKeyB64,'base64').toString('utf8') : undefined;
if (!credentials.appId || !privateKey || !credentials.redirectUri || !credentials.encryptionKeyB64)
  throw new Error('Banking credentials are not configured for this runtime');

const provider = new EnableBankingProvider(credentials.appId,privateKey,credentials.environment,credentials.redirectUri);
const secrets = new BankingSecrets(credentials.encryptionKeyB64);
const pool = createPool(config.databaseUrl,Math.min(3,config.dbPoolMax));
try {
  await assertSafeRuntimeRole(pool);
  const connections = await withUserTransaction(pool,config.bankingOwnerUserId,async client =>
    (await client.query<{ id:string; institution_name:string; next_sync_at:Date|null; due:boolean }>(`
      SELECT id,institution_name,next_sync_at,
        (next_sync_at IS NULL OR next_sync_at<=now()) AS due
      FROM bank_connections
      WHERE provider=$1 AND environment=$2 AND status='active'
        AND provider_session_id IS NOT NULL
        AND (consent_expires_at IS NULL OR consent_expires_at>now())`,
    [provider.id,provider.environment])).rows);
  if (connections.length !== 1) throw new Error(`Expected one eligible bank connection; found ${connections.length}`);
  const connection = connections[0]!;
  console.log('Bank sync target',{
    institution:connection.institution_name,
    nextAvailableSync:connection.next_sync_at?.toISOString() ?? null,
    due:connection.due,
  });
  if (connection.due) {
    const result = await syncConnection(pool,provider,secrets,config.bankingOwnerUserId,connection.id,false,config.sandboxSyncIntervalMinutes);
    if (!result) console.log('Bank sync skipped: another sync is running or the connection became ineligible');
    else console.log('Bank sync counts',result);
  } else console.log('Bank sync skipped: provider cooldown is still active');
} catch (error) {
  console.error('Bank sync failed',{
    kind:error instanceof Error?error.name:'UnknownError',
    code:typeof error==='object' && error!==null && 'code' in error ? String(error.code) : null,
  });
  process.exitCode=1;
} finally {
  await pool.end();
}
