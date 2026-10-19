# Spendime product captures

These eleven JPEGs were captured from the real React application on 19 October
2026, using `scripts/preview-fixtures.mjs` on a loopback-only server. No live
database, banking integration, session credentials or personal financial
records were used. Ivo Demo and demo@example.test are fictional placeholders;
all names, entries and amounts in these captures are fabricated demo fixtures.

- `dashboard-desktop.jpg`: desktop Dashboard, full-page capture, 1430 × 1814.
- `transactions-desktop.jpg`: desktop transaction list and filters, 1430 × 1583.
- `accounts-desktop.jpg`: desktop accounts, 1440 × 1100.
- `dashboard-mobile.jpg`: mobile Dashboard, 380 × 844.
- `transactions-mobile.jpg`: mobile ledger, 380 × 844.
- `accounts-mobile.jpg`: mobile accounts, 390 × 844.
- `analytics-mobile.jpg`: Dashboard category chart and exact legend, 380 × 844.
- `categories-mobile.jpg`: category management, 390 × 844.
- `assets-mobile.jpg`: asset detail sheet, return and valuation history, 390 × 844.
- `debts-mobile.jpg`: debt overview, 390 × 844.
- `recurring-mobile.jpg`: regular-payment templates, 390 × 844.

Mobile captures use a nominal 390 × 844 viewport; scrollbar presence accounts
for the 380px image widths on some screens. Images retain their natural ratios.
All previously supplied captures were refreshed from the Ivo fixtures; no name
overlays or production-profile changes were used. Public URLs use `?v=ivo-2`
to invalidate previously cached fictional demo captures.

The fixture ledger has €1,284.50 spending, €3,200 income and €1,915.50 net cash
flow. Opening balances plus the ledger and €400 internal transfer produce
€3,460.50 checking and €5,000 savings. The server checks these sums before
starting. The pre-existing fictional asset has €6,000 principal and €6,800 value;
it has no cash-account purchase. The €2,400 outstanding debt is an initial
record, and the €29 recurring schedule is a reminder, not a ledger entry.

The homepage labels screenshot captures separately from interactive React/CSS
illustrations. The latter also use only fictional data and make no financial
API requests. Screenshot enlargement links open the full local image.

To refresh, run `node scripts/preview-fixtures.mjs` and capture the appropriate
`http://127.0.0.1:5175/app` pages using the supported browser tool. The fixture
server rejects all writes and is excluded from the production Docker image.
Inspect every replacement for accidental personal information before adding it.
