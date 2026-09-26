# Product overhaul

## Implementation plan

1. Home-first navigation, progressive setup, plain-language guidance and shared controls.
2. Persist reporting currency/timezone preferences; searchable currency controls; immutable historical currencies.
3. Calendar periods and custom ranges, equal-duration comparisons, exact currency-separated balances, spending trend and category donut.
4. Banking readiness diagnostics without bypassing owner/environment gates; connection progress and refund categorization correction.
5. Additive migration, financial/security regressions, builds and desktop/mobile verification.

## Financial contract

- No FX infrastructure exists. Reporting currency selects a view, never converts amounts. All account totals and analytics remain currency-separated.
- Spending is expenses minus refunds on their recorded dates. Income excludes refunds. Transfers, adjustments, opening balances, asset purchases/sales and borrowing/repayment are excluded from ordinary cash flow and identified separately.
- The donut shows positive net category spending. Net-negative categories (refunds exceeding spending) remain in a separate textual list; its denominator is explicitly positive category spending, not net spending.
- Current month/year stop at today in the profile timezone. Comparisons use the immediately preceding equal number of calendar days, including across DST. Custom dates are inclusive; API upper bounds are exclusive.
- Voided entries and staged pending bank items are excluded. Recurring schedules remain templates; no automatic posting is implied. There is no tags model; categories are explained without inventing tag support.
- Account currencies remain immutable. Changing reporting currency never modifies any historical amount or account currency.

## Verification (26 September 2026)

- `npm run typecheck`: passed for server and client.
- `npm test` with an isolated PostgreSQL 16 database and a non-superuser, non-BYPASSRLS application role: 19 files, 101 tests passed. Covers preferences/isolation, currency validation, transfers/refunds/voids, multi-currency totals, category grouping, date boundaries/DST, banking gates, duplicate connections and concurrent OAuth replay.
- `npm run build`: server, frontend and PWA builds passed. No lint command is configured in this repository.
- Migrations 001, 003, 004, 005 and 006 applied successfully to the isolated database; 006 also successfully reapplied. No production database was changed.
- Browser: sign-in, first-run USD preference, first account, expense creation, updated dashboard, existing synthetic ledger, separate EUR/USD views, custom dates, empty period, donut legend interaction and mobile navigation verified. Mobile 390×844 and tablet 768×1024 had no horizontal overflow; desktop layout was visually inspected. No console errors were captured in the final QA tab.
- Fixture check: USD balances total 2,759.25, spending 240.75, income 2,000 and cash flow 1,759.25 despite a 100 internal transfer. EUR balance 80 and spending 20 remain separate.

## Banking findings and limits

The original messages came from independent owner-allowlist and environment activation gates. The normal local `.env` does not supply banking configuration, and production activation defaults off. The separate `.env.sandbox.local` is fully configured: the diagnostic checks pass, and real sandbox application/institution discovery succeeded. Browser connection reached Enable Banking's consent/terms screen. Acceptance was not performed without the requested user confirmation; live callback/import after that screen and real production banking remain unverified. The integration suite verifies the mocked callback, synchronization and connection lifecycle.

Banking now distinguishes restricted, disabled, unconfigured and ready states without weakening access checks. Callback states are atomically consumed, duplicate provider accounts and currency changes on reconnect are rejected, failed persistence revokes the new remote session, and disconnected connections can reconnect. Synchronization progress is exposed. Unsafe automatic opening-balance calibration is rejected because a current available balance cannot establish a historical ledger opening balance.

Imported own-account transfers still require pairing in the review workflow when the provider does not identify them. Once paired, transfer legs are excluded from ordinary analytics. Imported pending rows do not enter the posted ledger. Manual accounts are not automatically merged with bank accounts by name; link/review explicitly to avoid duplicate representations.

## Deployment

Existing installations must apply `database/init/006_product_preferences.sql` using the schema owner before deploying the server. It adds only onboarding completion metadata and backfills existing account holders. Existing reporting currency/timezone fields are reused. The compose initialization mount applies it automatically only for a new database volume; do not reset an existing volume.

Use `.env.sandbox.example` for a new sandbox setup and `node --env-file=.env.sandbox.local --import tsx scripts/banking-doctor.ts` to check configuration without printing secrets. Production requires its own provider application/signing key, persistent 32-byte encryption key, registered callback, owner allowlist and explicit production activation. Enable the production worker separately only when scheduled synchronization is intended. See `docs/banking-integration.md` for the existing operational configuration.
