# Financial API reference

All endpoints are under `/api`, require the `spendime_session` HttpOnly cookie,
and return JSON. Success responses use `{ "data": ... }`; paged responses also
include `meta`. Errors use `{ "error": { "code", "message" } }`.

Every operation derives ownership from the validated session. Client-provided
`user_id` values are not accepted. Resource IDs belonging to another user are
normally indistinguishable from missing IDs and return `404`.

## Exact decimal contract

Request money as a JSON string with at most four decimal places:

```json
{ "amount": "29.99", "currency": "EUR" }
```

PostgreSQL `numeric` values remain strings in responses. No global `pg` numeric
parser, `Number`, or `parseFloat` conversion is used. Stored money normally has
four places (`"29.9900"`), daily amortization and percentage returns have six
places, and aggregate scales follow PostgreSQL's exact result type. Frontend code
must treat these values as decimals, not JavaScript numbers.

Currencies are three-letter uppercase codes. Analytics never combines different
currencies; results are grouped by currency because Step 4 has no FX-rate model.

## Accounts

- `GET /api/accounts?includeArchived=false`
- `GET /api/accounts/:id`
- `POST /api/accounts`
- `PATCH /api/accounts/:id`
- `DELETE /api/accounts/:id` — archives; never removes history

```json
{
  "name": "Revolut",
  "kind": "checking",
  "currency": "EUR",
  "openingBalance": "100.00",
  "institution": "Revolut"
}
```

Kinds are `cash`, `checking`, `savings`, `credit`, `investment`, and `other`.
Responses include exact `currentBalance` from the `account_balances` view.
Currency is immutable, and archived accounts cannot receive new transactions.

## Categories

- `GET /api/categories?includeArchived=false`
- `GET /api/categories/:id`
- `POST /api/categories`
- `PATCH /api/categories/:id`
- `DELETE /api/categories/:id` — archives custom categories

Kinds are `expense`, `income`, and `both`. Seeded system categories are exposed
with `isSystem: true` and cannot be edited or archived. Historical transactions
retain references to archived custom categories.

## Transactions

- `GET /api/transactions`
- `GET /api/transactions/:id`
- `POST /api/transactions`
- `PATCH /api/transactions/:id`
- `DELETE /api/transactions/:id?reason=mistake` — voids; never hard-deletes

List query parameters:

- `limit` (default 50, maximum 100) and `offset` (maximum 100000)
- `from` inclusive and `to` exclusive, both ISO timestamps with offsets
- `accountId`, `categoryId`, `assetId`, `liabilityId`
- `kind`
- `includeVoided=true|false`
- `sort=occurredAt|amount|createdAt`
- `direction=asc|desc`

Sort fields map through a fixed server whitelist; no user SQL fragment is used.

Kinds are `expense`, `income`, `transfer`, `asset_purchase`, `asset_sale`,
`liability_drawdown`, `liability_payment`, and `adjustment`. Methods are
`standard`, `amortized`, and `recurring`.

Standard expense example:

```json
{
  "kind": "expense",
  "sourceAccountId": "<uuid>",
  "categoryId": "<uuid>",
  "amount": "29.99",
  "currency": "EUR",
  "occurredAt": "2026-01-02T10:30:00.000Z",
  "description": "Groceries"
}
```

Amortized expense example:

```json
{
  "kind": "expense",
  "method": "amortized",
  "sourceAccountId": "<uuid>",
  "amount": "1200.00",
  "currency": "EUR",
  "occurredAt": "2026-01-02T10:30:00.000Z",
  "amortizationStart": "2026-01-02",
  "amortizationEnd": "2027-01-01"
}
```

The inclusive 365-day range produces `dailyImpact: "3.287671"`. The full
`1200.0000` leaves the account on `occurredAt`; utility analytics recognize only
the daily amount on each covered date. It is never counted both ways in the same
metric.

A transfer uses one atomic row with owned source and destination accounts. It
changes both account balances but is excluded from spending and income. Accounts
must use the transaction currency; FX transfers are not yet modeled.

Asset purchases are also distinct from consumption. Creating an
`asset_purchase` creates an asset contribution in the same database transaction.
Voiding or editing that purchase updates its contribution and cost basis.

## Assets, contributions, and valuations

- `GET /api/assets?classification=appreciating&includeArchived=false`
- `GET /api/assets/:id`
- `POST /api/assets`
- `PATCH /api/assets/:id`
- `DELETE /api/assets/:id` — archives
- `GET /api/assets/:id/contributions?limit=50&offset=0`
- `POST /api/assets/:id/contributions`
- `GET /api/assets/:id/valuations?limit=50&offset=0`
- `POST /api/assets/:id/valuations`

Asset creation records the opening principal as the first contribution:

```json
{
  "name": "VWCE",
  "classification": "appreciating",
  "currency": "EUR",
  "acquisitionDate": "2025-01-01",
  "initialContribution": "2000.00",
  "currentValue": "2000.00"
}
```

Incremental contribution:

```json
{
  "amount": "100.00",
  "currency": "EUR",
  "contributedAt": "2026-01-02T10:00:00.000Z",
  "sourceAccountId": "<optional-account-uuid>",
  "currentValue": "2340.00",
  "note": "Monthly DCA"
}
```

Providing an account creates a linked `asset_purchase` cash movement. Omitting
it records contributed principal for an opening/imported position without
inventing cash history.

`cumulativePrincipal` is the sum of non-voided contributions. `absoluteReturn`
is current value minus cumulative principal. `percentageReturn` is the simple
unrealized return:

```text
(current market value - cumulative principal) / cumulative principal * 100
```

For contributions of 2000 + 100 + 100 and current value 2340, the API returns
principal `2200.0000`, gain `140.0000`, and simple return `6.363636`. This is not
IRR, XIRR, time-weighted return, or money-weighted return.

Changing `currentValue` uses the existing database valuation trigger exactly
once. Posting the same value still records a dated observation. Historical-only
valuations use `setAsCurrent: false` and require `valuedAt`.

Straight-line depreciation fields are stored and exposed, but Step 4 does not
invent an automatic depreciation scheduler. The supplied/current market value
remains authoritative.

## Liabilities

- `GET /api/liabilities?includeClosed=false`
- `GET /api/liabilities/:id`
- `POST /api/liabilities`
- `PATCH /api/liabilities/:id`
- `DELETE /api/liabilities/:id` — changes status to `cancelled`

The API exposes original principal, outstanding balance, annual interest rate,
dates, and status. Related `liability_drawdown` and `liability_payment`
transactions affect accounts but are reported separately from ordinary income
and spending. No repayment schedule, interest accrual, or loan amortization
engine is implemented.

## Recurring rules

- `GET /api/recurring-rules?includeInactive=false`
- `GET /api/recurring-rules/:id`
- `POST /api/recurring-rules`
- `PATCH /api/recurring-rules/:id`
- `DELETE /api/recurring-rules/:id` — pauses by setting `isActive=false`

Intervals support `day`, `week`, `month`, and `year`, with positive
`intervalCount`, start/next/end dates, and the same owned reference checks as
transactions. Rules are templates only: Step 4 adds no cron job, worker, queue,
or automatic transaction generation.

## Dashboard analytics

`GET /api/dashboard?timeframe=monthly&anchor=2026-01-15`

Timeframes are `daily`, `weekly`, `monthly`, `6-month`, and `annual`. `anchor`
defaults to today's date in the user's configured IANA timezone.

Calendar semantics:

- starts are inclusive and ends are exclusive;
- daily is one local calendar day;
- weekly starts Monday according to PostgreSQL ISO week behavior;
- monthly starts on the first local day of the month;
- 6-month includes the anchor month and the five preceding months;
- annual is the local calendar year;
- local boundaries are converted independently with `AT TIME ZONE`, so daylight
  saving changes are respected rather than approximated with a fixed offset.

Response groups include:

- `cashFlow`: ordinary actual spending/income/net, asset purchase/sale cash,
  and liability drawdown/payment cash as separate fields;
- `utilityImpact`: standard expense on its local day plus the daily slice of
  amortized expenses;
- `assetSummary`: principal, market value, gain/loss, and simple return;
- `liabilitySummary`;
- `spendingByCategory`;
- `accountBalances`;
- bounded trend series for actual cash, utility cost, and changes in unrealized
  asset gain after subtracting contributed principal at each valuation.

Transfers are excluded from income and spending. Asset appreciation is never
cash income. Asset purchases are not consumption. All aggregation is performed
in PostgreSQL; the frontend receives compact series rather than full history.

## RLS and data integrity

Every handler runs through `withUserTransaction`, which parameterizes the
authenticated session user in transaction-local `app.current_user_id`. RLS and
same-user composite foreign keys form independent ownership boundaries. The app
refuses to start with an RLS-bypassing, superuser, owner, or incompletely
protected runtime role.

Multi-step transfers, asset purchases/contributions, valuation changes, and
voids share one transaction. Financial history uses archive/status/void fields
instead of destructive deletion.

## Tests

```bash
docker compose --profile test run --rm --build auth-test
npm run typecheck
npm run build
```

The integration tests use PostgreSQL, exercise cross-user RLS, and remove only
their uniquely identified test records.
