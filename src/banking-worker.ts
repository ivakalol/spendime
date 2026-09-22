import { readFileSync } from 'node:fs';
import { loadConfig } from './server/config.js';
import { assertSafeRuntimeRole, createPool } from './server/db/pool.js';
import { EnableBankingProvider } from './server/domains/banking/enableBanking.js';
import { syncDueConnections } from './server/domains/banking/sync.js';
import { BankingSecrets } from './server/domains/banking/secrets.js';
import { classifyBankTransactions } from './server/domains/banking/gemini.js';

const config = loadConfig();
const privateKey = config.enableBankingPrivateKeyFile ? readFileSync(config.enableBankingPrivateKeyFile,'utf8')
  : config.enableBankingPrivateKeyB64 ? Buffer.from(config.enableBankingPrivateKeyB64,'base64').toString('utf8') : undefined;
if (!config.enableBankingAppId || !privateKey) throw new Error('Enable Banking sandbox credentials are required for the worker');
if (!config.bankingEncryptionKeyB64) throw new Error('BANKING_ENCRYPTION_KEY_B64 is required for the worker');
const provider = new EnableBankingProvider(config.enableBankingAppId,privateKey);
const secrets = new BankingSecrets(config.bankingEncryptionKeyB64);
const pool = createPool(config.databaseUrl,Math.min(3,config.dbPoolMax));
await assertSafeRuntimeRole(pool);
let stopping = false;
process.on('SIGTERM',()=>{ stopping=true; });
process.on('SIGINT',()=>{ stopping=true; });
while (!stopping) {
  try { await syncDueConnections(pool,provider,secrets); await classifyBankTransactions(pool,config); }
  catch (error) { console.error('Bank worker cycle failed',{ name:error instanceof Error?error.name:'UnknownError' }); }
  await new Promise((resolve)=>setTimeout(resolve,60_000));
}
await pool.end();
