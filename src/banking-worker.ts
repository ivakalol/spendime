import { readFileSync } from 'node:fs';
import { bankingCredentialConfig, bankingRuntimeEnabled, loadConfig } from './server/config.js';
import { assertSafeRuntimeRole, createPool } from './server/db/pool.js';
import { EnableBankingProvider } from './server/domains/banking/enableBanking.js';
import { rescheduleSandboxMockConnections, syncDueConnections } from './server/domains/banking/sync.js';
import { BankingSecrets } from './server/domains/banking/secrets.js';

const config = loadConfig();
if (!config.bankingOwnerUserId || !bankingRuntimeEnabled(config) ||
    (config.nodeEnv === 'production' && !config.bankingProductionWorkerEnabled)) {
  console.info('Banking worker disabled by owner or production configuration');
  process.exit(0);
}
const credentials = bankingCredentialConfig(config);
const privateKey = credentials.privateKeyFile ? readFileSync(credentials.privateKeyFile,'utf8')
  : credentials.privateKeyB64 ? Buffer.from(credentials.privateKeyB64,'base64').toString('utf8') : undefined;
if (!credentials.appId || !privateKey || !credentials.redirectUri || !credentials.encryptionKeyB64)
  throw new Error('Environment-specific banking credentials are required for the worker');
const provider = new EnableBankingProvider(credentials.appId,privateKey,credentials.environment,credentials.redirectUri);
const secrets = new BankingSecrets(credentials.encryptionKeyB64);
const pool = createPool(config.databaseUrl,Math.min(3,config.dbPoolMax));
await assertSafeRuntimeRole(pool);
if (provider.environment === 'sandbox')
  await rescheduleSandboxMockConnections(pool,provider,config.sandboxSyncIntervalMinutes,config.bankingOwnerUserId);
let stopping = false;
process.on('SIGTERM',()=>{ stopping=true; });
process.on('SIGINT',()=>{ stopping=true; });
while (!stopping) {
  try { await syncDueConnections(pool,provider,secrets,config.sandboxSyncIntervalMinutes,config.bankingOwnerUserId); }
  catch (error) { console.error('Bank worker cycle failed',{ name:error instanceof Error?error.name:'UnknownError' }); }
  await new Promise((resolve)=>setTimeout(resolve,60_000));
}
await pool.end();
