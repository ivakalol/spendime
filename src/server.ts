import { createServer } from 'node:http';
import { createApp } from './server/app.js';
import { loadConfig } from './server/config.js';
import { assertSafeRuntimeRole, createPool } from './server/db/pool.js';

const config = loadConfig();
const pool = createPool(config.databaseUrl, config.dbPoolMax);
await assertSafeRuntimeRole(pool);

const server = createServer(createApp(pool, config));
server.listen(config.port, config.host, () => {
  console.log(`Spendime API listening on http://${config.host}:${config.port}`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received; shutting down.`);
  server.close(async (error) => {
    await pool.end();
    if (error) {
      console.error('HTTP shutdown failed', { name: error.name });
      process.exitCode = 1;
    }
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
