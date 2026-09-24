# Banking integration: sandbox and restricted production setup

Banking is restricted to the authenticated Spendime user whose internal UUID matches `BANKING_OWNER_USER_ID`. Missing or invalid configuration denies access. `BANKING_PRODUCTION_ENABLED=0` keeps banking operations disabled in a production runtime. `BANKING_PRODUCTION_WORKER_ENABLED=0` separately keeps the production scheduler stopped. Configure the owner UUID separately per database; see the [owner-only rollout guide](banking-owner-rollout.md).

## Current status

The adapter selects **SANDBOX** for local development and **PRODUCTION** only in a production runtime with `BANKING_PRODUCTION_ENABLED=1`. A server-side `GET /application` check requires the selected environment to match. Production additionally requires an active application with AIS permission, the configured application ID, and the exact registered callback URL. The API does **not** report whether an application is in Restricted Mode: verify that in the Enable Banking Control Panel. The provider's Restricted Mode limits retrieval to the owner's linked accounts. This code has only been tested with synthetic provider responses; no production banking request or real-bank connection was made.

The integration supports authorization, account linking, balance retrieval, historical and scheduled incremental imports, pending/booked staging, one-time historical reconciliation, uncategorized posting of later booked movements, refunds, and manual pairing of own-account transfers including different currencies. In production, **every first booked import remains in review**, including when the owner creates a new Spendime money account. The owner must resolve all booked history and click **Complete initial review** before later booked dates can post automatically. Pending records never post. Imported ledger entries remain after disconnection. Users can subsequently remove stored bank connection and staging records. If remote revocation cannot be confirmed during an outage, the UI instructs the user to revoke access in their bank settings.

The sandbox connection was manually tested previously. Restricted production behavior is verified only with mocked responses and a disposable PostgreSQL test database. Bank availability and historical depth depend on Enable Banking and the institution.

## Database

`database/init/004_banking.sql` is additive to the existing schema. It adds the `refund` transaction kind, category lock flag, banking tables, RLS policies, and refund-aware spending view. `database/init/005_banking_reconciliation.sql` adds a nullable automatic-posting cutoff to bank account links and a lookup index; it neither changes existing links to automatic posting nor changes existing transactions. **This production code adds no new migration.** Fresh Docker volumes run the numbered init files automatically. Existing volumes require deliberate manual application of 004 and 005 as needed before activating banking. Test both against an isolated restored copy of your production database and take a verified production backup before any live migration. Do not apply migrations as part of this code-only task.

PowerShell from the repository root, against the intended **development** database:

```powershell
Get-Content -Raw database/init/004_banking.sql | docker compose exec -T postgres sh -c 'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1'
Get-Content -Raw database/init/005_banking_reconciliation.sql | docker compose exec -T postgres sh -c 'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1'
```

For Bash:

```bash
docker compose exec -T postgres sh -c 'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1' < database/init/004_banking.sql
docker compose exec -T postgres sh -c 'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1' < database/init/005_banking_reconciliation.sql
```

The migration was applied twice successfully to the isolated PostgreSQL 16.15 validation database. A separate pre-migration fixture confirmed that an existing expense, its amount, and its resulting account balance were unchanged after applying the migration. Validate it on a copy of the actual deployment database before production use because `ALTER TABLE` takes locks and real databases may contain schema drift or data that the new constraint rejects. `CREATE TABLE IF NOT EXISTS` makes a normal retry safe, but it does not repair an incompatible table that was created by an older or partial migration. The enum addition is intentionally outside the transaction because PostgreSQL requires a newly added enum value to be committed before it can be used by later statements; if a later statement fails, the `refund` enum value remains and a retry safely skips it. The application runtime database role must remain a non-owner, non-superuser role without `BYPASSRLS`.

## Enable Banking sandbox registration

1. Register a **SANDBOX** application in the [Enable Banking control panel](https://enablebanking.com/docs/api/control-panel/). Upload its public key and allow the exact callback URL, for example `http://localhost:3000/api/banking/callback`. Obtain the application ID and keep the matching RSA private key server-side.
2. Configure `ENABLE_BANKING_APP_ID`, and either `ENABLE_BANKING_PRIVATE_KEY_FILE` (for a direct Node process) or `ENABLE_BANKING_PRIVATE_KEY_B64` (base64 of the PEM for Compose). Never put these values in Vite variables or client code.
3. Generate a distinct 32-byte encryption key with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` and set `BANKING_ENCRYPTION_KEY_B64`. Keep this key in a secret manager. Losing it makes stored session IDs unreadable; rotation requires a planned re-encryption procedure. It must be shared by the API and worker.
4. Set `BANKING_REDIRECT_URI` to the registered callback. For local Vite development, set `APP_ORIGIN=http://localhost:5173`; for a deployed site, set it to the public HTTPS origin. The callback may use localhost HTTP only outside production.
5. Run the API (`npm run dev:server`), UI (`npm run dev:client`), and worker (`npm run dev:worker`). With Compose, use `docker compose --profile banking up -d --build` after the migration. Vite proxies `/api` to the API on port 3000.
6. In Banking, choose **Mock ASPSP** and complete Enable Banking's hosted sandbox authorization. Link returned accounts to new Spendime money accounts. The worker imports authorized transactions; the page also offers Sync now when the configured interval permits it. Seed mock accounts and transactions in the Enable Banking control panel as described in the [sandbox guide](https://enablebanking.com/docs/api/sandbox/).

### Local Windows sandbox workflow

Keep workstation-only values in the Git-ignored `.env.sandbox.local` file. Set `NODE_ENV=development`, `COOKIE_SECURE=never`, `APP_ORIGIN=http://localhost:5173`, and `BANKING_REDIRECT_URI=http://localhost:3000/api/banking/callback`. Set `BANKING_OWNER_USER_ID` to the immutable UUID of the local Spendime user who owns the Mock connection and `BANKING_PRODUCTION_ENABLED=0`; use a separately verified UUID for staging and production. Point `ENABLE_BANKING_PRIVATE_KEY_FILE` at the absolute path of the PEM outside this repository. The API and worker must read the same `BANKING_ENCRYPTION_KEY_B64`; do not regenerate it after connections have been stored. Set `BANKING_SANDBOX_SYNC_INTERVAL_MINUTES=5` for faster local **Mock ASPSP only** polling; omit it for the six-hour default. Restart both API and worker after changing the setting.

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
- In the sandbox, new bank-created money accounts post booked transactions automatically as **Uncategorized**. In production, new and existing money accounts both keep the first booked history in review. The owner explicitly matches a manual entry or posts each historical movement, then completes initial review. Later booked movements are posted automatically when they are first seen after that completion and their booking date is later than the completion day in the user's timezone. Same-day or older late arrivals still wait for review to prevent historical double counting. Pending movements never post.
- A credit with a refund or reversal description that matches exactly one recent same-merchant expense, with sufficient unrefunded amount, becomes a full or partial refund and reduces net spending in the original category. Credits without that evidence remain income for user review; the current UI does not offer a manual income-to-refund conversion.
- Own-account transfers can be paired in **Transactions**. Same-currency equal-value legs become one `transfer`; differing currencies become linked account adjustments that preserve each original amount and currency and are excluded from income and spending. Pairing requires two booked, unedited legs in distinct linked accounts within three days. Unpaired legs still appear as income and expense; users should pair them promptly. Automatic identification of ambiguous transfers is not claimed.
- Bank balances are stored separately from ledger balances. The optional **Calibrate new account balance** action changes only the opening balance of an account created by the bank link, after a complete sync. Existing money account opening balances are never calibrated automatically.
- Automatic merchant rules, deterministic categorization, and Gemini classification are inactive for this workflow. Every new imported ledger movement starts with a null category, displayed as **Uncategorized**. Users can edit its category and description in Transactions; later synchronization does not overwrite those edits. Existing manual entries and previously imported entries are not reclassified.

## Optional Gemini

Gemini classification is disabled for the current import workflow. The worker never calls it, and the opt-in route rejects enable requests. The existing Gemini module and stored preferences remain for possible future work; no stored preference is changed by this release. Any future reactivation requires separate billing and privacy review.

No imported transaction data is sent to Gemini by the current worker.

## Restricted production mode: operator checklist

Enable Banking's [Control Panel guide](https://enablebanking.com/docs/api/control-panel/) describes Restricted Mode as activation by linking your own bank accounts for internal testing; account retrieval is limited to those linked accounts. Its [FAQ](https://enablebanking.com/docs/faq/) says a production application cannot be made available to the public before a contract. Do not treat the `active` flag returned by `GET /application` as proof of Restricted Mode. Verify the mode and allowed accounts manually in the Control Panel before enabling real banking. This implementation is for the configured owner only; it does not authorize public banking access.

1. On your own deployment, verify the **production** database and immutable UUID of your intended Spendime account. Back up the database, restore the backup to an isolated database, and test migrations 004 and 005 there. Apply any missing migration to the live database only as a separate, deliberate step. Keep the application database login non-owner and without `BYPASSRLS`.
2. In the Enable Banking Control Panel, register a **separate PRODUCTION** AIS application, activate **Restricted Mode** by linking only your own permitted accounts, and whitelist exactly `https://spendime.ivaylo.tech/api/banking/callback`. Keep its private RSA key outside Git. Do not copy the sandbox app ID, key, or session encryption key. Enable Banking's [API reference](https://enablebanking.com/docs/api/reference/) confirms that sandbox and production applications cannot be transferred between environments.
3. In secure **server-side** production configuration, set `NODE_ENV=production`, `BANKING_OWNER_USER_ID=<verified production user UUID>`, `BANKING_PRODUCTION_ENABLED=0`, and `BANKING_PRODUCTION_WORKER_ENABLED=0` initially. Set `ENABLE_BANKING_PRODUCTION_APP_ID`, one of `ENABLE_BANKING_PRODUCTION_PRIVATE_KEY_FILE` or `ENABLE_BANKING_PRODUCTION_PRIVATE_KEY_B64`, a fresh 32-byte `BANKING_PRODUCTION_ENCRYPTION_KEY_B64`, and `BANKING_PRODUCTION_REDIRECT_URI=https://spendime.ivaylo.tech/api/banking/callback`. Both API and worker must receive the same production key. Keep `GEMINI_ENABLED=0`. `ENABLE_BANKING_APP_ID`, `ENABLE_BANKING_PRIVATE_KEY_*`, `BANKING_ENCRYPTION_KEY_B64`, and `BANKING_REDIRECT_URI` are sandbox-only and are never used by a production runtime.
4. Set `APP_ORIGIN=https://spendime.ivaylo.tech`, `COOKIE_SECURE=always`, and `TRUST_PROXY=1` only when Express is directly behind your trusted HTTPS reverse proxy. The callback URL must be HTTPS, have the `/api/banking/callback` path, contain no query or fragment, and match `APP_ORIGIN`. An authenticated browser session is required during the callback. Check cookie and proxy behavior before any real authorization.
5. Deploy and verify the owner-only, disabled Banking page with both production flags still `0`. Other users must not see Banking; direct banking API calls must return 403 for authenticated non-owners and 401 for unauthenticated callers. The owner sees the disabled state. Do not start the banking worker.
6. **Only after you choose to activate real banking**, set `BANKING_PRODUCTION_ENABLED=1` and restart the API. The API then validates the production application on its first provider call. The code cannot verify Restricted Mode itself. Connect only an account linked in Enable Banking Restricted Mode. The callback stores an encrypted session and account metadata, but no transaction posts merely from authorization.
7. Keep `BANKING_PRODUCTION_WORKER_ENABLED=0` while you test initial import and reconciliation. The owner can use **Sync now** when due. Link the account, review each booked historical movement on **Bank reconciliation**, and explicitly click **Complete initial review** after resolving all booked items. Only then can later booked dates post automatically as Uncategorized. To enable scheduled synchronization separately, set `BANKING_PRODUCTION_WORKER_ENABLED=1` and start the worker intentionally. Production uses the six-hour sync interval; provider `Retry-After` and rate-limit backoff remain in force. A newly linked account does not shorten an already established production due time.
8. Preserve both production encryption and private keys across restarts and backups. Losing the encryption key makes stored provider sessions unreadable. Never place these settings in `VITE_*`, the frontend bundle, source control, or a publicly readable environment file. Use a distinct production database and credentials from the local sandbox deployment. Do not copy sandbox connections or data into production.

The runtime validates the production app's environment, active status, application ID, AIS service, and registered redirect URL using the documented `GET /application` response. This does **not** verify the Control Panel's linked-account allowlist, pricing, privacy terms, or eligibility. Confirm institution coverage, provider contract and fees, regulatory role, data protection terms, and support arrangements before broader use. See [provider research](banking-research-and-design.md).

The worker checks due connections every minute. The default successful-sync interval is six hours. An explicit `BANKING_SANDBOX_SYNC_INTERVAL_MINUTES` value from 5 to 360 minutes applies only to an Enable Banking **Mock ASPSP** connection in a SANDBOX environment and a non-production Spendime runtime. Other institutions and production runtimes always use six hours. On startup, the worker shortens an existing successful Mock ASPSP schedule to the configured interval; it does not shorten a rate-limited or failed retry. Manual Sync now uses the same due time and cross-process connection lock as the worker. A rate-limit response defers requests at least six hours, or longer if the provider's `Retry-After` requires it. Other provider errors also honor a longer `Retry-After`.

[Enable Banking's FAQ](https://enablebanking.com/docs/faq/) says many real ASPSPs limit background fetching to four times per day and recommends resuming six hours after `ASPSP_RATE_LIMIT_EXCEEDED`. Its [Mock ASPSP sandbox documentation](https://enablebanking.com/docs/api/sandbox/) describes transaction retrieval and batching but publishes no numeric minimum polling interval; its [terms](https://enablebanking.com/terms/) allow API quotas. Five minutes is Spendime's configurable local floor, **not a provider-guaranteed minimum**. If Mock ASPSP responds with a limit, the worker backs off instead of retrying rapidly. The worker does not assume real-time updates or webhooks. An interrupted import can be retried because staging keys and ledger links are durable. Bank history depth and transaction fields vary by institution. The first-party server enforces cookie authentication, Origin checks on mutations, RLS tenant policies, encrypted provider session IDs, and redacted error logs. These controls alone do not establish legal compliance.

## Validation commands

```bash
npm run typecheck
npx vitest run tests/banking.unit.test.ts tests/client/banking-access.test.tsx
npm run build
```

With a migrated PostgreSQL test database and `DATABASE_URL`/`TEST_DATABASE_URL` configured:

```bash
npm test
```

The database URL used by tests must name a disposable development database with 004 and 005 applied. The tests create uniquely named users and remove them afterward, but they are integration tests and must never be pointed at production financial data. Production provider tests use mocked responses and synthetic accounts; they make no live Enable Banking requests.

## File inventory

Created: `database/init/004_banking.sql`, `docs/banking-research-and-design.md`, this guide, `src/banking-worker.ts`, `src/client/pages/BankingPage.tsx`, `src/server/domains/banking/{provider,enableBanking,secrets,routes,sync,categorize,gemini}.ts`, `tests/banking.unit.test.ts`, and `tests/banking.integration.test.ts`.

Modified: `.env.example`, `README.md`, `docker-compose.yml`, `docs/deployment.md`, `package.json`, `package-lock.json`, `tsconfig.json`, `src/client/api/types.ts`, `src/client/app/App.tsx`, `src/client/components/AppShell.tsx`, `src/client/pages/TransactionsPage.tsx`, `src/server/app.ts`, `src/server/config.ts`, `src/server/db/pool.ts`, `src/server/domains/dashboard/repository.ts`, and `src/server/domains/transactions/{model,repository,routes,service}.ts`.
