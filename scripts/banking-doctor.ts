import { existsSync, readFileSync } from 'node:fs';
import { createPrivateKey } from 'node:crypto';
import { bankingCredentialConfig, bankingRuntimeEnabled, loadConfig } from '../src/server/config.js';

// Reports presence/validity only. Never print environment values or credentials.
const config=loadConfig({...process.env,DATABASE_URL:process.env.DATABASE_URL||'postgresql://unused'});
const credentials=bankingCredentialConfig(config);
const checks:Record<string,boolean>={
  'Owner allowlist configured':Boolean(config.bankingOwnerUserId),
  'Environment activated':bankingRuntimeEnabled(config),
  'Provider application configured':Boolean(credentials.appId),
  'Session encryption key is 32 bytes':Boolean(credentials.encryptionKeyB64&&Buffer.from(credentials.encryptionKeyB64,'base64').length===32),
};
try {
  const pem=credentials.privateKeyFile&&existsSync(credentials.privateKeyFile)?readFileSync(credentials.privateKeyFile,'utf8'):credentials.privateKeyB64?Buffer.from(credentials.privateKeyB64,'base64').toString('utf8'):'';
  checks['Provider signing key is valid RSA']=createPrivateKey(pem).asymmetricKeyType==='rsa';
} catch { checks['Provider signing key is valid RSA']=false; }
try {
  const url=new URL(credentials.redirectUri??'');
  const localDevelopment=config.nodeEnv!=='production'&&url.hostname==='localhost'&&new URL(config.appOrigin??'').hostname==='localhost';
  checks['Callback matches application origin or local development ports']=Boolean(config.appOrigin&&(url.origin===config.appOrigin||localDevelopment)&&url.pathname==='/api/banking/callback'&&!url.search&&!url.hash&&!url.username&&!url.password&&(url.protocol==='https:'||localDevelopment));
} catch { checks['Callback matches application origin']=false; }
console.log(`Banking environment: ${credentials.environment}`);
for(const [label,ok] of Object.entries(checks))console.log(`${ok?'OK':'MISSING / INVALID'}: ${label}`);
console.log(`Scheduled production sync: ${config.bankingProductionWorkerEnabled?'enabled':'disabled (manual sync only when activated)'}`);
console.log('This checks local configuration only; it does not verify provider access or bank consent.');
if(Object.values(checks).some(ok=>!ok))process.exitCode=1;
