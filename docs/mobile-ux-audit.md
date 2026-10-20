# Spendime mobile UX polish — 20 October 2026

The pass preserves Spendime's existing palette, cards, typography, desktop navigation, and financial behavior. No dependencies, backend routes, calculations, synchronization behavior, or database models changed.

## Findings and implemented fixes

| Area | Findings and improvements |
| --- | --- |
| Quick Add | Replaced the static fade with a reusable, measured horizontal rail. Separate 44px arrows indicate available directions, disable at the ends, and disappear when everything fits. Fades appear only at overflowing edges. Partial cards preview additional choices without showing word fragments; explicit accessible names remain available. Touch scrolling remains native. Arrow keys, Home/End, roving focus, selection visibility, and resize handling work within the rail without scrolling the sheet. |
| Transaction entry | An expense category could remain in form state after switching to income, despite disappearing from the menu. Incompatible selections now clear. Loading accounts no longer temporarily reports that no accounts exist. Data-loading failures provide retry controls. Offline/online changes update Save immediately, and pending saves prevent dismissal and duplicate submission. |
| Dashboard | At 320px, the account link squeezed even an ordinary balance into broken digit lines. The phone balance layout now gives the amount its own space. All five period controls fit on phones. Recent activity titles can wrap instead of truncating. |
| Transactions | Date filters share a row where space permits. Existing account/category/type filters, reset behavior, transaction editing, signs, badges, and destructive confirmations remain intact. Shared field and sheet improvements apply to the editor. |
| Charts and reports | Chart value tables size to their actual columns instead of forcing a 448px minimum. Dates and amounts stay intact; genuine overflow gets accessible arrow controls and edge fades. Keyboard table scrolling works. Trend and asset chart entry animations are disabled. Existing exact values, series toggles, category selection, and legends remain. |
| Accounts | Checked balances, account cards, creation and management forms. A large-balance fixture exposed digit splitting in compact cards. Long formatted amounts now receive a full mobile row, also covering asset/debt/recurring cards and dashboard account/activity/KPI rows. Shared field labels, error descriptions, focus containment, and mobile action bars improve the forms; the desktop account overview is unchanged. |
| Categories | Reorder arrows now meet 44px target width. The edit/archive/restore action area uses the same mobile action bar as other sheets. |
| Assets | Detail views expose their active state, have larger phone targets, and retain readable labels. Contribution history wraps safely. Create, contribution, and valuation forms use consistent mobile actions and numeric keyboards where appropriate. |
| Debts | Shorter, clearer amount labels avoid misaligned paired inputs. Management actions stay reachable in the phone sheet. |
| Recurring payments | Due dates use readable calendar dates and wrap as a unit, rather than splitting an ISO date across lines. Numeric interval input and sheet actions match other forms. |
| Banking and reconciliation | Available banks form a labeled, keyboard-scrollable region. Financial amounts use tabular digits. The Back to Banking link has a comfortable target. Reviewed search, country selection, connection status, balances, and reconciliation candidates using fictional data. Provider actions and sync logic remain untouched. |
| Settings | Checked currency/timezone controls, custom budget-cycle preview, profile, language, and security links. Shared accessible field descriptions improve these controls without changing preferences logic. |
| Authentication | Email inputs disable capitalization/spellcheck; currency search requests capitalization. Phone authentication links have 44px targets and a compact legal navigation row. |
| Shared dialogs/navigation | Phone action bars stay visible while content scrolls. Focus traps skip hidden, disabled, and non-tabbable controls, include keyboard-scrollable regions, and restore the opener without jumping the page. Background application content becomes inert. Field errors/hints have explicit associations. Failed-save messages scroll into view. Existing visual-viewport and safe-area handling remain. Sign out keeps readable contrast during hover. |
| Public screens | Mobile screenshot choices wrap into visible rows rather than hiding in a horizontal strip. Existing gallery swiping and pagination remain available. Desktop gallery styling is unchanged. |

## Verification

- TypeScript: `npm run typecheck` passed for server and client.
- Client regressions: `npm run test:client` passed, **130 tests across 24 files**. Coverage includes exact expense/income submission payloads, date/time conversion, category switching, offline feedback, scrolling boundaries, partially visible label accessibility, keyboard navigation, field associations, and modal focus handling.
- Production: `npm run build` passed, including server TypeScript, Vite, and PWA generation. The final public CSS adjustment was also checked with a fresh client production build.
- Browser: requested 320, 360, 375, 390, 430, 768, and 1440px widths. Native browser sizing rounds some widths: 320px was reached using the adjacent viewport setting; the 375px setting renders at 376px and its adjacent setting at 374px. Both sides were checked. Geometry records include actual measured widths, rather than assuming every request was exact.
- Inspected every main authenticated screen, login/registration, navigation, Quick Add, transaction/account/category/debt/recurring editors, asset creation/detail/contribution/valuation, chart value tables, and banking review. Checked the public site, tutorials, and legal pages separately.
- Interacted with transaction type arrows and keyboard selection, account/category menus, amounts, native date segments, expense/income save attempts, filters, navigation, chart series/category selection, table scrolling, bank search/country selection, and settings controls. A 390×400 viewport also checked reduced sheet height.
- Stress-tested a consistent fictional account balance of **€9,999,999,999.99** at 320px: the complete amount fits on one line after the compact-card fix. `--large-balances` enables this read-only fixture scenario.
- Desktop: captured committed-HEAD and updated screenshots at 1440px for all ten main screens. Accounts, assets, categories, debts, settings, and transactions produced identical JPEGs. Other differences were reviewed: calendar-date formatting, bank number/target refinements, and chart rendering. No desktop redesign or page overflow was found.

QA uses `node scripts/preview-fixtures.mjs --banking` at port 5175. The optional `--baseline` serves committed client sources at port 5176 for comparison. Both are local fictional-data previews, and all writes fail closed. Screenshots and measured geometry JSON accompany the chat in the `spendime-qa` artifact directory.

## Limits

The preview deliberately rejects writes: browser save attempts verified visible failure handling and input preservation; successful submissions were verified with mocked API responses in client tests. PostgreSQL persistence, real bank authorization/synchronization, and production credentials were not exercised. Browser resizing approximated constrained height; physical iOS/Android software keyboards, notches, native pickers, VoiceOver/TalkBack, and real-device swipe behavior still need device QA. No claim of pixel-perfect cross-browser or exhaustive data/state coverage is made.
