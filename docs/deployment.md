# Raspberry Pi deployment

The Compose stack uses official multi-architecture images:

- `postgres:16-bookworm` for PostgreSQL 16
- `node:22-bookworm-slim` for the temporary Node application container

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

The endpoint now verifies a real database query. Authentication configuration,
cookie behavior, endpoints, and test commands are documented in
`docs/authentication.md`.

Run the authentication integration tests without resetting the database:

```bash
docker compose --profile test run --rm --build auth-test
```

## Apply additive migrations to an existing volume

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
