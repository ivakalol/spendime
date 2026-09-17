# Spendime project structure

Spendime is a same-origin React/Express application. Vite builds the browser
client into `dist/client`; TypeScript builds Express into `dist/src`. The single
ARM64 Node container serves both, while only Express connects to PostgreSQL.

```text
spendime/
|-- database/init/             # schema, app role, additive financial migration
|-- docs/                      # deployment, auth, API, and frontend contracts
|-- public/                    # source PWA icons and brand mark
|-- src/
|   |-- server.ts              # API entrypoint
|   |-- server/                # auth, RLS DB layer, domain routes/repositories
|   `-- client/
|       |-- api/               # typed API client and TanStack Query hooks
|       |-- app/               # root routes and query client
|       |-- auth/              # session restoration and auth screens
|       |-- components/        # design-system, shell, PWA status
|       |-- features/          # Quick Add workflow
|       |-- pages/             # lazy-loaded product areas
|       `-- utils/             # money, chart boundary, timezone helpers
|-- tests/
|   |-- client/                # jsdom UI/query/PWA tests
|   |-- auth.integration.test.ts
|   `-- finance.integration.test.ts
|-- Dockerfile
|-- docker-compose.yml
|-- vite.config.ts
|-- tailwind.config.ts
|-- tsconfig.json              # server
`-- tsconfig.client.json       # browser
```

## Key boundaries

- The backend and PostgreSQL are authoritative for balances, amortization,
  returns, analytics, ownership, and timezone buckets.
- The browser retains exact money as decimal strings. Only chart coordinates
  cross the documented lossy visualization adapter.
- HttpOnly session cookies are never exposed to React or stored in browser
  storage. A 401 invalidates authenticated client state.
- TanStack Query owns all remote data. Local React state is transient UI state.
- Every API request reaches the existing authenticated route layer, whose
  transaction-local `app.current_user_id` activates PostgreSQL RLS. The PWA
  cannot supply or override an owner ID.
