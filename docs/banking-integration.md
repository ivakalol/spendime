# Banking integration: sandbox setup and deployment

## Current status

The Enable Banking adapter is restricted to an active **SANDBOX** application by a server-side `GET /application` check. The integration has no production provider mode. It supports authorization, account linking, balance retrieval, historical and six-hour incremental imports, pending/booked staging, manual reconciliation for accounts with existing entries, deterministic categorization, refunds, and manual pairing of own-account transfers including different currencies. Imported ledger entries remain after disconnection. Users can subsequently remove stored bank connection and staging records. If remote revocation cannot be confirmed during an outage, the UI instructs the user to revoke access in their bank settings.

The TypeScript checks, production build, and complete Vitest suite pass. On 2026-09-22, the database migrations and all 67 tests in 15 files were verified against an isolated PostgreSQL 16.15 database using a non-owner runtime role with RLS enforced. This covered the authentication, finance, and banking PostgreSQL integration suites. No end-to-end connection to Enable Banking's hosted Mock ASPSP was attempted without sandbox credentials. Bank availability and historical depth depend on Enable Banking and the institution.

## Database

`database/init/004_banking.sql` is additive to the existing schema. It adds the `refund` transaction kind, category lock flag, seven banking tables plus per-user AI preferences, RLS policies, and refund-aware spending view. It does not delete existing transactions or accounts. Fresh Docker volumes run the numbered init files automatically. Existing volumes require a deliberate manual migration before starting the updated app, because startup checks require all 16 RLS-protected tables.

PowerShell from the repository root, against the intended **development** database:

```powershell
Get-Content -Raw database/init/004_banking.sql | docker compose exec -T postgres sh -c 'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1'
```

For Bash:

```bash
docker compose exec -T postgres sh -c 'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1' < database/init/004_banking.sql
```

The migration was applied twice successfully to the isolated PostgreSQL 16.15 validation database. A separate pre-migration fixture confirmed that an existing expense, its amount, and its resulting account balance were unchanged after applying the migration. Validate it on a copy of the actual deployment database before production use because `ALTER TABLE` takes locks and real databases may contain schema drift or data that the new constraint rejects. `CREATE TABLE IF NOT EXISTS` makes a normal retry safe, but it does not repair an incompatible table that was created by an older or partial migration. The enum addition is intentionally outside the transaction because PostgreSQL requires a newly added enum value to be committed before it can be used by later statements; if a later statement fails, the `refund` enum value remains and a retry safely skips it. The application runtime database role must remain a non-owner, non-superuser role without `BYPASSRLS`.

## Enable Banking sandbox registration

1. Register a **SANDBOX** application in the [Enable Banking control panel](https://enablebanking.com/docs/api/control-panel/). Upload its public key and allow the exact callback URL, for example `http://localhost:3000/api/banking/callback`. Obtain the application ID and keep the matching RSA private key server-side.
2. Configure `ENABLE_BANKING_APP_ID`, and either `ENABLE_BANKING_PRIVATE_KEY_FILE` (for a direct Node process) or `ENABLE_BANKING_PRIVATE_KEY_B64` (base64 of the PEM for Compose). Never put these values in Vite variables or client code.
3. Generate a distinct 32-byte encryption key with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` and set `BANKING_ENCRYPTION_KEY_B64`. Keep this key in a secret manager. Losing it makes stored session IDs unreadable; rotation requires a planned re-encryption procedure. It must be shared by the API and worker.
4. Set `BANKING_REDIRECT_URI` to the registered callback. For local Vite development, set `APP_ORIGIN=http://localhost:5173`; for a deployed site, set it to the public HTTPS origin. The callback may use localhost HTTP only outside production.
5. Run the API (`npm run dev:server`), UI (`npm run dev:client`), and worker (`npm run dev:worker`). With Compose, use `docker compose --profile banking up -d --build` after the migration. Vite proxies `/api` to the API on port 3000.
6. In Banking, choose **Mock ASPSP** and complete Enable Banking's hosted sandbox authorization. Link returned accounts to new Spendime money accounts. The worker imports authorized transactions; the page also offers Sync now when the six-hour interval permits it. Seed mock accounts and transactions in the Enable Banking control panel as described in the [sandbox guide](https://enablebanking.com/docs/api/sandbox/).

### Local Windows sandbox workflow

Keep workstation-only values in the Git-ignored `.env.sandbox.local` file. Set `NODE_ENV=development`, `COOKIE_SECURE=never`, `APP_ORIGIN=http://localhost:5173`, and `BANKING_REDIRECT_URI=http://localhost:3000/api/banking/callback`. Point `ENABLE_BANKING_PRIVATE_KEY_FILE` at the absolute path of the PEM outside this repository. The API and worker must read the same `BANKING_ENCRYPTION_KEY_B64`; do not regenerate it after connections have been stored.

Start the processes in three terminals:

```powershell
npm run dev:sandbox:server
npm run dev:sandbox:client
npm run dev:sandbox:worker
```

Open `http://localhost:5173`, using `localhost` consistently rather than `127.0.0.1`. Vite proxies `/api` and `/health` to `http://localhost:3000`, the session cookie is host-scoped and `SameSite=Lax`, and banking mutations accept the configured `http://localhost:5173` origin. The local scripts load only `.env.sandbox.local`; Vite still has `envDir: false`, so server secrets are not included in the browser bundle.

The callback uses the signed-in user's session and a one-use 15-minute state value. A different browser or an expired login requires starting authorization again. Enable Banking's sandbox application may expose only a limited set of simulated institutions; a listed production bank does not imply sandbox support.

## Financial behavior

- Provider transactions first enter a bank staging table. Only booked records post to the ledger. A pending item matching a booked item is ignored. Stable `entry_reference` values are used per account; otherwise a transaction fingerprint and same-page occurrence ordinal are used. Retries use database uniqueness constraints.
- New bank-created money accounts post booked transactions automatically. When linking an existing money account, booked items wait in Review. The user can match an existing ledger entry or post a new one. This prevents silent duplication of manual records.
- A credit with a refund or reversal description that matches exactly one recent same-merchant expense, with sufficient unrefunded amount, becomes a full or partial refund and reduces net spending in the original category. Credits without that evidence remain income for user review; the current UI does not offer a manual income-to-refund conversion.
- Own-account transfers can be paired in Banking. Same-currency equal-value legs become one `transfer`; differing currencies become linked account adjustments that preserve each original amount and currency and are excluded from income and spending. Pairing requires two booked legs in distinct linked accounts within three days. Unpaired legs still appear as income and expense; users should pair them promptly. Automatic identification of ambiguous transfers is not claimed.
- Bank balances are stored separately from ledger balances. The optional **Calibrate new account balance** action changes only the opening balance of an account created by the bank link, after a complete sync. Existing money account opening balances are never calibrated automatically.
- Explicit merchant rules take priority over confirmed merchant preferences, deterministic keywords, and AI suggestions. Editing an imported category locks it against automated changes. **Use for future** stores that merchant preference for the same user only. Existing manual entries are not modified by synchronization.

## Optional Gemini

Gemini is disabled by default. It requires all of `GEMINI_ENABLED=1`, `GEMINI_PAID_PROJECT=1`, `GEMINI_PRIVACY_APPROVED=1`, `GEMINI_API_KEY`, `GEMINI_MODEL`, and each user's explicit switch in Banking. `GEMINI_MODEL=gemini-2.5-flash-lite` is the documented stable model used in the example configuration. Enable the switches only after a paid Google project, privacy notice, lawful processing basis, applicable data processing terms, and cost controls have been reviewed. The free Gemini tier uses prompts to improve Google's products according to [official pricing terms](https://ai.google.dev/gemini-api/docs/pricing).

The worker sends short redacted merchant/description text, transaction direction, and existing category IDs/names. It sends no tokens, IBANs, account numbers, amount, date, or account balance. It validates structured JSON and category membership before applying a result. An uncertain result remains uncategorized. Per-user AI merchant results are cached; calls are capped at 20 per worker cycle and 100 attempts per user per rolling day. Failed calls retry after an hour, up to three attempts, while synchronization proceeds independently. The Gemini worker is only allowed for records from sandbox connections.

## Production prerequisites and limits

There is no production Enable Banking implementation or authorization to make this publicly available. Confirm institution coverage, commercial contract, regulatory role under Enable Banking's account information service, pricing, data protection terms, incident handling, and operational support before designing a production adapter. Register a separate production application and review its permissions. Do not reuse evaluation credentials for a public app. See [provider research](banking-research-and-design.md).

The current worker polls every minute for connections due at six-hour intervals. It does not assume real-time bank updates or webhooks. Rate limits defer the next sync. An interrupted import can be retried because staging keys and ledger links are durable. Bank history depth and transaction fields vary by institution. The first-party server enforces cookie authentication, Origin checks on mutations, RLS tenant policies, encrypted provider session IDs, and redacted error logs. These controls alone do not establish legal compliance.

## Validation commands

```bash
npm run typecheck
npm run test:client
npx vitest run tests/banking.unit.test.ts
npm run build
```

With a migrated PostgreSQL test database and `DATABASE_URL`/`TEST_DATABASE_URL` configured:

```bash
npm test
```

The database URL used by tests must name a disposable development database. The tests create uniquely named users and remove them afterward, but they are integration tests and must never be pointed at production financial data.

## File inventory

Created: `database/init/004_banking.sql`, `docs/banking-research-and-design.md`, this guide, `src/banking-worker.ts`, `src/client/pages/BankingPage.tsx`, `src/server/domains/banking/{provider,enableBanking,secrets,routes,sync,categorize,gemini}.ts`, `tests/banking.unit.test.ts`, and `tests/banking.integration.test.ts`.

Modified: `.env.example`, `README.md`, `docker-compose.yml`, `docs/deployment.md`, `package.json`, `package-lock.json`, `tsconfig.json`, `src/client/api/types.ts`, `src/client/app/App.tsx`, `src/client/components/AppShell.tsx`, `src/client/pages/TransactionsPage.tsx`, `src/server/app.ts`, `src/server/config.ts`, `src/server/db/pool.ts`, `src/server/domains/dashboard/repository.ts`, and `src/server/domains/transactions/{model,repository,routes,service}.ts`.
