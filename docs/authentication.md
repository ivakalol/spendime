# Authentication architecture

Spendime uses opaque, revocable server-side sessions. It does not expose a JWT
to browser JavaScript and stores nothing in `localStorage`.

## Passwords

Passwords are hashed with Argon2id before a database transaction starts. The
parameters are deliberately bounded for the Raspberry Pi app container:

- memory cost: 32 MiB (`32768` KiB)
- time cost: 3 iterations
- parallelism: 1 lane
- output length: 32 bytes

The database stores only the encoded Argon2id hash in `user_credentials`.
Passwords and hashes are never included in API responses or application logs.
Passwords must be 12–128 characters. A password below 15 characters needs at
least three character classes; longer passphrases are accepted.

## Session lifecycle

Registration and login generate 32 cryptographically random bytes. The raw,
base64url-encoded value is sent only in the `spendime_session` cookie. PostgreSQL
stores its SHA-256 hash in `auth_sessions`, so a database read does not reveal a
usable bearer token.

The cookie is:

- `HttpOnly`, so browser JavaScript cannot read it;
- `SameSite=Lax`, reducing cross-site request risks while supporting normal PWA
  navigation;
- host-only (no `Domain` attribute);
- scoped to `/`;
- `Secure` for HTTPS requests when `COOKIE_SECURE=auto`, or always when set to
  `always`;
- expired after `SESSION_TTL_HOURS` (30 days by default).

State-changing auth routes also reject cross-site Fetch Metadata and mismatched
`Origin` headers. Logout marks the active database session as revoked and clears
the cookie. Each device/login has its own `auth_sessions` row, so a future
"logout all devices" operation can revoke every row for a user.

For local HTTP, use `COOKIE_SECURE=auto` or `never`. For an HTTPS deployment
behind a trusted reverse proxy, set `TRUST_PROXY=1` and `COOKIE_SECURE=always`.
Never enable `TRUST_PROXY` when untrusted clients can connect directly to the
Node port and forge forwarding headers.

## Endpoints

All responses are JSON. Errors use `{ "error": { "code", "message" } }`.

- `POST /api/auth/register` accepts `email`, `password`, and optional
  `displayName`; creates the user, credential, password identity, and session in
  one transaction; returns `201`.
- `POST /api/auth/login` accepts `email` and `password`; returns the same generic
  `401` for missing accounts, wrong passwords, disabled users, and locked users.
- `POST /api/auth/logout` revokes the presented session and clears its cookie.
- `GET /api/auth/me` returns safe profile fields or `401`.

The password identity uses the existing provider-neutral `auth_identities`
table. A future Google OAuth identity can be attached with provider `google`
without changing the user or session model.

## PostgreSQL and row-level security

The application must connect through `APP_DB_USER`, never `POSTGRES_USER`.
Startup fails if the runtime role is a superuser, can bypass RLS, or owns any
protected financial table.

Authentication middleware derives the user from the hash of the session cookie.
Future protected data handlers must use `withUserTransaction` and the user ID
from that middleware. The helper starts a transaction and executes:

```sql
SELECT set_config('app.current_user_id', $1, true);
```

The value is parameterized and transaction-local. PostgreSQL RLS policies then
filter every protected table, and pooled connections cannot retain the previous
request's identity. A request body, URL parameter, or query string must never be
trusted as the current user ID.

## Abuse protection

Register and login share an in-memory per-IP rate limit. Five consecutive bad
passwords temporarily lock that credential for 15 minutes. The login response
does not reveal which condition failed. The in-memory limiter is suitable for
one self-hosted Node container; a multi-instance deployment would require a
shared rate-limit store.

## Development and tests

Start or rebuild the application:

```bash
docker compose up -d --build app
curl http://localhost:3000/health
```

Run the PostgreSQL-backed authentication suite:

```bash
docker compose --profile test run --rm --build auth-test
```

If `TEST_DATABASE_URL` is blank, tests use `DATABASE_URL`. They create unique
test users and delete only those users afterward. A dedicated test database is
still recommended for CI or repeated development.

Run static checks outside Docker:

```bash
npm ci
npm run typecheck
npm run build
```
