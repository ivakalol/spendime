# Frontend and PWA architecture

Spendime's browser client is React 19 + TypeScript, built by Vite and styled
with Tailwind CSS. Express serves the generated `dist/client` application in
production, so the API and PWA remain same-origin and cookie authentication
works in Safari, installed iOS mode, and desktop browsers without exposing a
token to JavaScript.

## Local development

Start the API and Vite dev server in two terminals:

```bash
npm run dev:server
npm run dev:client
```

Open `http://localhost:5173`. Vite proxies `/api` and `/health` to port 3000.
For a production-equivalent build use `npm run build` then `npm start`, or use
`docker compose up -d --build` and open port 3000.

## Structure and state

- `src/client/api` owns request handling, exact backend types, query keys, and
  mutations. Every request includes cookie credentials and translates the
  backend error envelope consistently.
- TanStack Query is the only store for server financial data. Mutations
  invalidate affected lists, details, balances, transactions, and dashboard
  aggregates. React state is limited to open sheets, form values, filters, and
  navigation.
- `src/client/pages` is route-lazy-loaded. The authenticated shell provides a
  desktop sidebar and iPhone-safe bottom navigation with a central Quick Add.
- A global 401 event removes financial cache entries, clears the current user,
  and returns the browser to login. Logout calls the revocation endpoint and
  clears the query cache. No session token is accessible to or persisted by the
  client.

## Money and charts

All `NUMERIC` money values remain decimal strings in types, queries, forms, and
API payloads. `utils/money.ts` rounds and groups decimal digits without
`Number`, `parseFloat`, or binary floating-point arithmetic. Examples:

```json
{ "amount": "29.9900", "currentValue": "2340.0000" }
```

Recharts requires JavaScript numbers. The only intentionally lossy conversion
is `utils/chartAdapter.ts`; its values are used only to place marks on a chart,
never to calculate labels, totals, returns, or API writes. Exact backend strings
drive all visible monetary labels and textual context.

## Financial and timezone semantics

The dashboard consumes `/api/dashboard` without recomputing totals. Actual
spending/income/net cash flow are presented separately from utility-adjusted
cost. Transfers are labeled as account-to-account movement. Asset principal,
market value, absolute gain, and simple return are distinct. A contribution can
optionally create an asset-purchase cash transaction, and that choice is shown
before submission.

Dates are formatted with the authenticated user's stored IANA timezone.
`datetime-local` values are interpreted in that timezone before an ISO instant
is sent to the API. Transaction date filters convert the inclusive displayed
end date to the backend's exclusive boundary. The browser timezone is only an
informational suggestion; it never overwrites the profile. PostgreSQL remains
authoritative for dashboard day/week/month/year boundaries and DST behavior.

## PWA, iOS, offline, and updates

`vite-plugin-pwa` generates the manifest and Workbox service worker. The
manifest uses standalone display, supplied 192/512/maskable icons, theme and
background colors, and a root start URL. `index.html` supplies `viewport-fit`,
Apple standalone/status-bar metadata, and a 180px Apple touch icon. Layouts use
all four CSS safe-area insets so sheets and bottom navigation clear notches,
Dynamic Island regions, and the home indicator.

Workbox precaches fingerprinted static assets, but deliberately excludes
`index.html` and the manifest. Navigations use `NetworkFirst`: while online the
latest HTML shell wins, while the last successful shell remains an offline
fallback. Every `/api/*` GET uses `NetworkOnly`; authenticated financial
responses are never written to the service-worker cache. Mutations are not
queued: while offline the UI displays a banner, disables submission, and
returns a clear error.

The worker uses `skipWaiting`, `clientsClaim`, and automatic updates. At startup
the client registers with `updateViaCache: 'none'` and requests one update
check. An updated worker activates immediately and an already-controlled page
reloads at most once, so Safari and installed iOS PWAs transition to the newest
shell without an update button. The activation migration removes only legacy
Spendime Workbox precaches; it does not access cookies, Web Storage, IndexedDB,
or authentication state.

## Responsive and accessibility behavior

The minimum supported width is 320px. Cards stack at phone sizes, filters move
to two/three-column desktop layouts, charts are responsive, and transaction
rows avoid horizontal scrolling. Controls have at least 44px touch height.
Dialogs trap focus, close with Escape, restore focus, lock background scroll,
and expose dialog semantics. Financial status combines words/icons/symbols with
color, focus rings are visible, reduced-motion preferences are honored, and
loading/error/empty states are explicit.

## Tests and production checks

```bash
npm run test:client
npm test
npm run typecheck
npm run build
docker compose config
docker compose build
```

The frontend tests cover login, registration, protected routing, logout,
session expiration, Quick Add modes/validation/loading, cache invalidation,
exact decimal formatting, transfer/gain semantics, empty states, and PWA cache
policy/assets. Existing PostgreSQL-backed auth and financial tests remain part
of `npm test`.

## Current limitations

- Recurring rules are templates only; there is no scheduler or offline write
  synchronization.
- Profile timezone editing awaits a backend profile endpoint.
- Simple asset return is not IRR, XIRR, TWR, or MWR.
- There is no FX conversion, so the dashboard displays currency-grouped server
  results and defaults summary emphasis to the user's base currency.
- iOS splash screens use the manifest/background and Apple touch icon; there is
  no brittle device-specific startup-image matrix.
