# Raspberry Pi deployment

The Compose stack uses official multi-architecture images:

- `postgres:16-bookworm` for PostgreSQL 16
- `node:22-bookworm-slim` for the Express API and React PWA application container

Both images support Linux ARM64. PostgreSQL data is retained in the named
volume `spendime_postgres_data`. The initialization script is mounted directly
from `database/init/001_schema.sql` and is executed only when that volume is
empty.

## Prerequisites

Install a 64-bit Raspberry Pi OS, Docker Engine, and the Docker Compose plugin.
Run these commands from the repository root.

## First-time configuration

Copy the environment template:

```bash
cp .env.example .env
```

PowerShell equivalent:

```powershell
Copy-Item .env.example .env
```

Generate a URL-safe database password:

```bash
openssl rand -hex 32
```

Generate two different values. Put one in `POSTGRES_PASSWORD`. Put the other in
`APP_DB_PASSWORD` and the password segment of `DATABASE_URL`. Never commit
`.env`. The application uses the non-superuser `APP_DB_USER`; this is important
because PostgreSQL superusers bypass row-level security.

By default PostgreSQL is reachable only from the Pi itself. For DataGrip access,
set `POSTGRES_BIND_ADDRESS` to the Pi's static LAN IP, such as `192.168.1.50`.
Do not set it to `0.0.0.0`. Ensure the router does not forward TCP 5432, and use
the Pi firewall to allow that port only from the trusted LAN subnet.

DataGrip connection settings are:

- Host: the value of `POSTGRES_BIND_ADDRESS`
- Port: the value of `POSTGRES_HOST_PORT` (default `5432`)
- Database: the value of `POSTGRES_DB`
- User: the value of `POSTGRES_USER` (administrator) or `APP_DB_USER` for
  application-level testing
- Password: the value of `POSTGRES_PASSWORD`

When using `APP_DB_USER`, use `APP_DB_PASSWORD` instead. The runtime user sees no
financial rows until its session sets `app.current_user_id`, as described in the
architecture document.

## Start the stack

```bash
docker compose up -d --build
docker compose ps
```

The app waits for PostgreSQL's healthcheck before starting. On first startup,
PostgreSQL runs `database/init/001_schema.sql` automatically, then creates the
least-privileged application login with `002_configure_app_role.sh`. The latter
contains no schema copy and reads its credentials from `.env`.

## Stop the stack

Stop containers while retaining database data:

```bash
docker compose down
```

## View logs

All services:

```bash
docker compose logs -f
```

PostgreSQL only:

```bash
docker compose logs -f postgres
```

## Verify initialization

Check that PostgreSQL is healthy and list the initialized tables:

```bash
docker compose ps
docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\dt"
```

If the shell has not loaded `.env`, use the configured values explicitly:

```bash
docker compose exec postgres psql -U spendime_admin -d spendime -c "\dt"
```

Test the application health endpoint:

```bash
curl http://localhost:3000/health
```

Open `http://<raspberry-pi-lan-ip>:3000` to use the production PWA. On iPhone,
open that HTTPS-served address in Safari, choose **Share → Add to Home Screen**,
and launch Spendime from the new icon. Service workers and secure production
cookies require HTTPS; place the app behind a trusted LAN reverse proxy with a
certificate before treating it as a production installation.

The endpoint now verifies a real database query. Authentication configuration,
cookie behavior, endpoints, and test commands are documented in
`docs/authentication.md`.

## Reverse-proxy and CDN cache rules

Express assigns resource-specific cache headers in production:

- `/`, `index.html`, `sw.js`, and `sw-cache-migration.js` must revalidate and
  must not be stored as long-lived objects.
- `manifest.webmanifest` must revalidate.
- fingerprinted `/assets/*` and `workbox-<hash>.js` are immutable for one year.
- `/api/*` and `/health` are `no-store` and remain outside PWA caches.

The reverse proxy/CDN must respect these origin headers. In Cloudflare, create
a highest-priority **Cache Rules → Bypass cache** rule for `/sw.js` and
`/sw-cache-migration.js`; do not apply a `Cache Everything` or Edge TTL override
to HTML, the manifest, or either worker script. After first deploying this cache
migration, purge the existing cached `/sw.js` once at Cloudflare. This purges
only the public worker response—not cookies or application data—and lets clients
obtain the new updater immediately instead of waiting for an old edge TTL.

Verify the deployed policy:

```bash
curl -I https://spendime.ivaylo.tech/
curl -I https://spendime.ivaylo.tech/sw.js
curl -I https://spendime.ivaylo.tech/manifest.webmanifest
curl -I https://spendime.ivaylo.tech/assets/<current-hashed-file>.js
```

The public Privacy Policy and Terms of Service are React routes at `/privacy`
and `/terms`; they do not require a session. Before publishing the drafts, review
the factual and legal open items in `docs/legal-publication-review.md`. After a
deployment, open both URLs in a signed-out browser and verify that an
unauthenticated request receives the app shell with HTTP 200:

```bash
curl -I https://spendime.ivaylo.tech/privacy
curl -I https://spendime.ivaylo.tech/terms
```

`sw.js` should never report a Cloudflare cache HIT. HTML and the worker should
show revalidation/no-store intent, while the fingerprinted asset should show
`max-age=31536000, immutable`.

Run the authentication integration tests without resetting the database:

```bash
docker compose --profile test run --rm --build auth-test
```

## Apply additive migrations to an existing volume

### Product preferences and login after the overhaul

The overhaul requires `006_product_preferences.sql`. If valid login credentials
return a generic 500 after an upgrade, check whether
`public.users.onboarding_completed_at` exists. The old deployment omitted this
migration; PostgreSQL initialization scripts also do not run on existing volumes.

From the production repository directory, apply the additive migration as the
database owner (no volume reset or password change):

```bash
docker compose exec -T postgres sh -c 'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1' < database/init/006_product_preferences.sql
```

Retry login immediately; this schema repair needs no app restart. Current Compose
also runs the idempotent `product-migrate` service before starting `app`, including
on existing volumes. Do not bypass dependencies with `--no-deps` during upgrades.
The migration administrator credentials are limited to the migration container;
the application keeps its restricted database role. Login tolerates the absence
of optional onboarding metadata during upgrades, but preferences still require
the migration. Custom deployment scripts must apply it before starting the app.

Fresh databases run every numbered file in `database/init` automatically. The
official PostgreSQL entrypoint does not rerun initialization files for an
existing volume. Before starting the Step 4 application against an existing
database, apply its idempotent migration once:

```bash
docker compose up -d postgres
docker compose exec -T postgres sh -c 'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1' < database/init/003_financial_integrity.sql
docker compose up -d --build app
```

PowerShell equivalent:

```powershell
Get-Content -Raw database/init/003_financial_integrity.sql | docker compose exec -T postgres sh -c 'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1'
docker compose up -d --build app
```

The migration is additive and safe to rerun. It does not reset the named volume.

The optional Enable Banking sandbox integration has a separate additive migration,
`database/init/004_banking.sql`, plus an opt-in worker. Apply it only after
reviewing [banking setup and migration steps](banking-integration.md).

## Completely reset the development database

This permanently deletes every database record in the named volume and reruns
the schema initialization on the next start. It does not delete source files.

```bash
docker compose down --volumes
docker compose up -d --build
```

Do not use the reset command on a production database without a verified backup.

## Resource budget

The database container is capped at 512 MB RAM and the Node container at 256 MB.
PostgreSQL is additionally tuned for this limit with a 128 MB shared buffer,
30 maximum connections, and conservative per-operation memory settings. CPU and
process-count limits provide additional protection for the Raspberry Pi.
