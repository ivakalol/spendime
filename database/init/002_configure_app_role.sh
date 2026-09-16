#!/usr/bin/env bash
set -Eeuo pipefail

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${APP_DB_USER:?APP_DB_USER is required}"
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD is required}"

# psql's identifier and literal variables keep environment values safely quoted.
# This role is intentionally not a superuser and does not own the schema, so the
# row-level security policies in 001_schema.sql apply to application queries.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=app_db_user="$APP_DB_USER" \
  --set=app_db_password="$APP_DB_PASSWORD" \
  --set=app_db_name="$POSTGRES_DB" <<'EOSQL'
SELECT format(
    'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT',
    :'app_db_user',
    :'app_db_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_db_user')
\gexec

SELECT format(
    'ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT',
    :'app_db_user',
    :'app_db_password'
)
\gexec

GRANT CONNECT ON DATABASE :"app_db_name" TO :"app_db_user";
GRANT USAGE ON SCHEMA public, app TO :"app_db_user";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_db_user";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app_db_user";
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO :"app_db_user";

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_db_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO :"app_db_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA app
    GRANT EXECUTE ON FUNCTIONS TO :"app_db_user";
EOSQL
