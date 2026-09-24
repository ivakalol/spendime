# Owner-only Banking rollout

## Access model

`BANKING_OWNER_USER_ID` is the immutable **Spendime user UUID in this database**, not an email, bank account ID, or Enable Banking application ID. Missing or malformed values fail closed. The authenticated server-side session supplies the user ID; all `/api/banking/*` paths check it before validation, provider calls, or database access. Anonymous calls return 401; authenticated nonowners return 403. The worker reads only the configured owner's connections under the existing RLS user context. `/api/auth/me` returns only `bankingAccess` and `bankingEnabled` booleans, never the configured UUID.

`BANKING_PRODUCTION_ENABLED` defaults to `0`. In `NODE_ENV=production` it disables all banking API operations and the worker even for the owner. The owner can see a disabled Banking page, while everyone else has no Banking navigation and is redirected from `/banking` and `/banking/reconciliation`. The current Enable Banking adapter still checks for an active SANDBOX application; setting the production flag does **not** add real-bank support.

Configure the owner UUID independently in local development, staging, and production after querying each environment's own `users.id`. Never infer an ID from an email address. Keep the value in environment configuration outside Git. Restart the API and worker after changing it. Do not start a worker until its owner UUID and runtime gate are verified.

## Local validation

Use the isolated development PostgreSQL service and the existing SANDBOX application. Keep `BANKING_PRODUCTION_ENABLED=0`, `NODE_ENV=development`, and set `BANKING_OWNER_USER_ID` to the UUID of the local user that owns the Mock ASPSP connection. Do not rotate `BANKING_ENCRYPTION_KEY_B64`. The API and worker must use the same local configuration. A separate disposable test database is required for automated integration tests; never point `TEST_DATABASE_URL` at the database holding the live Mock connection.

On 2026-09-24, the original PostgreSQL 16 cluster was restarted from its existing data directory after an interrupted shutdown. Normal WAL recovery completed. The owner UUID configured locally was checked against the recovered user's immutable ID. The active Mock ASPSP connection, linked EUR account, 11 staged movements, 10 ledger entries, and migration 005 were present; account and ledger hashes matched the prior observation. A verified cold copy was made before startup. The banking worker remains stopped for owner-only browser validation. Automated tests used a separate database, and no new Mock ASPSP authorization was started.

Run `npm run typecheck`, `npm test`, and `npm run build`. Sign in as the owner and a second ordinary test user. Confirm Banking appears only for the owner; the ordinary user can still use Accounts and Transactions, but `/banking` redirects and direct banking API calls return 403. Without a session, banking API calls return 401. Owner Banking should list the pre-existing Mock connection. Confirm its records, ledger count, balances, and reconciliation state before and after; do not start a new authorization flow for this check.

## Isolated staging preparation

The existing Compose file can run a separate stack by using distinct project, volume, network, ports, database credentials, and hostname. Copy [the staging example](../.env.staging.example) to a Git-ignored `.env.staging.local`, replace placeholders with unique secrets, and keep the Enable Banking credential fields empty. Use an HTTPS hostname under a trusted reverse proxy forwarding to `127.0.0.1:3001`; keep PostgreSQL bound only to `127.0.0.1:55440`. The app stores random opaque session tokens in its own database rather than using a shared auth signing secret, so the separate staging database gives independent sessions. Use a distinct 32-byte banking encryption key even while banking is disabled.

Before starting, verify the resolved Compose configuration names `spendime_staging_postgres_data` and `spendime_staging_internal`, contains no production database URL or provider credentials, and exposes no public PostgreSQL port. Then start **only** `postgres` and `app` with `docker compose -p spendime-staging --env-file .env.staging.local up -d --build postgres app`. Do not enable the `banking` profile. Create a staging-only user, obtain its immutable staging UUID, set `BANKING_OWNER_USER_ID` in staging's private environment file, and recreate only the staging app. Keep `BANKING_PRODUCTION_ENABLED=0`.

Verify `/health` through the HTTPS hostname, secure host-scoped authentication cookies, 401/403 owner gates, ordinary users' financial routes, and restart recovery. The callback path is `/api/banking/callback`, but with the production gate off it must return 503 for the owner and must not contact Enable Banking. Test proxy Origin handling and confirm `/api/*` responses are not cached. Worker isolation is verified by leaving the worker absent; an accidental worker start with the production gate off exits before a provider request. Staging cannot complete a hosted authorization callback until a separate staging SANDBOX application and approved HTTPS redirect are configured in a future, explicitly authorized test.

## Controlled production plan — requires approval after staging validation

1. Read the production user's actual `users.id` using a privileged, read-only database query. Do not infer it from local or staging IDs.
2. Set the production owner UUID privately and leave `BANKING_PRODUCTION_ENABLED=0`; omit provider credentials and the banking worker profile.
3. Take and restore-verify a production database backup. Test any pending additive migrations against a separate restored copy. Do not apply them to production during staging preparation.
4. Present the exact Compose changes, backup verification, migration results, rollback, and maintenance window for approval.
5. After approval, deploy only the access mechanism. Verify the owner's disabled Banking view, another user's missing navigation and 403 API responses, both users' ordinary financial routes, HTTPS cookie behavior, and no worker activity.
6. Keep real-bank connections and synchronization disabled until separate explicit approval, provider commercial access, and a production adapter/security review are complete.
