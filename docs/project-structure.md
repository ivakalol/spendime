# Spendime project structure

Spendime will use a Next.js App Router monolith. The browser never connects to
PostgreSQL directly: UI requests are handled by route handlers in the same Node
application, and those handlers apply authentication and user scoping.

```text
spendime/
|-- .env.example
|-- .dockerignore
|-- Dockerfile
|-- docker-compose.yml
|-- next.config.ts
|-- package.json
|-- postcss.config.mjs
|-- tailwind.config.ts
|-- tsconfig.json
|-- database/
|   |-- init/
|   |   |-- 001_schema.sql
|   |   `-- 002_configure_app_role.sh
|   `-- migrations/
|       `-- README.md
|-- docs/
|   `-- project-structure.md
|-- public/
|   |-- icons/
|   |-- manifest.webmanifest
|   `-- sw.js
|-- src/
|   |-- server.mjs             # Step 2 placeholder; replaced by Next.js later
|   |-- app/
|   |   |-- (auth)/
|   |   |   |-- login/page.tsx
|   |   |   `-- register/page.tsx
|   |   |-- (app)/
|   |   |   |-- accounts/page.tsx
|   |   |   |-- assets/page.tsx
|   |   |   |-- dashboard/page.tsx
|   |   |   |-- liabilities/page.tsx
|   |   |   |-- recurring/page.tsx
|   |   |   `-- transactions/page.tsx
|   |   |-- api/
|   |   |   |-- auth/
|   |   |   |-- accounts/
|   |   |   |-- analytics/
|   |   |   |-- assets/
|   |   |   |-- liabilities/
|   |   |   |-- recurring-rules/
|   |   |   `-- transactions/
|   |   |-- layout.tsx
|   |   |-- page.tsx
|   |   `-- globals.css
|   |-- components/
|   |   |-- charts/
|   |   |-- dashboard/
|   |   |-- forms/
|   |   `-- ui/
|   |-- lib/
|   |   |-- auth/
|   |   |-- db/
|   |   |-- validation/
|   |   `-- money.ts
|   |-- middleware.ts
|   `-- types/
|       `-- domain.ts
`-- tests/
    |-- integration/
    `-- unit/
```

## Architecture decisions

- **Next.js + TypeScript:** responsive React PWA and server APIs in one
  deployable ARM64-compatible Node container.
- **PostgreSQL:** exact monetary values use `numeric`, identifiers use UUIDs,
  and timestamps are stored as `timestamptz`.
- **Authentication:** local credentials are represented now; external identities
  are provider-neutral so Google OAuth can be added without changing `users`.
- **Tenant isolation:** every financial record carries `user_id`. Composite
  foreign keys prevent a record from referencing another user's account,
  category, asset, liability, or recurring rule. Row-level security provides a
  second boundary when the API sets `app.current_user_id` for a transaction.
- **Currency:** records retain their own ISO 4217 currency. Cross-currency totals
  must be grouped by currency until an exchange-rate feature is introduced.
- **Immutable history:** current asset values are cached on `assets`, while every
  update is retained in `asset_valuations` for growth charts.
- **Transfers:** one transaction references both a source and a destination
  account, avoiding two loosely linked transaction rows.
- **Amortization:** `amortization_start`, `amortization_end`, and the generated
  `daily_impact` implement `price / inclusive usage days`.

## Database session contract

Authenticated API operations will run in a database transaction and set the
current tenant before issuing queries:

```sql
BEGIN;
SELECT set_config('app.current_user_id', '<authenticated-user-uuid>', true);
-- user-scoped queries
COMMIT;
```

This convention activates the row-level security policies in
`database/init/001_schema.sql`. The dedicated login/registration path will be
implemented in Step 3 and does not trust a client-provided user ID.
