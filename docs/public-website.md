# Public Spendime website

The capability audit and intentionally excluded claims are documented in
[public-site-audit.md](public-site-audit.md).

## Routes and compatibility

| Destination | Behavior |
| --- | --- |
| `/` | Public product homepage in ordinary browsers, even when signed in |
| `/app` | Existing protected Dashboard and original application shell |
| `/app/transactions`, `/app/accounts`, `/app/categories` | Existing protected everyday-money pages |
| `/app/assets`, `/app/liabilities`, `/app/recurring`, `/app/settings` | Existing protected ownership, planning and preference pages |
| `/app/banking`, `/app/banking/reconciliation` | Existing protected owner-only banking pages |
| `/tutorials` | Searchable, topic-filtered public guide directory; search is stored in `?q=` |
| `/tutorials/:slug` | Public guide with steps, example image, tips, contents, related guides and app CTA |
| `/privacy`, `/terms` | Existing legal pages with their original substantive content |
| `/login`, `/register` | Existing authentication forms; success defaults to `/app` |
| Unknown pages | Public 404; production sends HTTP 404 and noindex |

Exact former module paths (`/transactions`, `/accounts`, `/categories`,
`/assets`, `/liabilities`, `/recurring`, `/settings`, `/banking` and
`/banking/reconciliation`) redirect to the corresponding `/app` path. Express
uses HTTP 308 for direct production visits; React Router handles in-app and dev
navigation. Search parameters and fragments survive browser navigation. The
provider callback still uses the original API and redirect destination; its
`/banking?result=…` destination reaches the new page through compatibility.
No `/api/*` URL was renamed, redirected to the SPA or made public.

The old `/` bookmark intentionally becomes the public homepage. A visible Open
Dashboard CTA is available to signed-in visitors. The root-scoped HttpOnly
session cookie continues to work without migration. Protected routes retain
their intended path, query and fragment through login and registration. Public
previews never load accounts or finance records; session status only selects CTA
text, without showing user identity or balances.

## PWA and deployment

The web manifest now launches `/app`; explicit `id: "/"` retains the old
effective install identity and `scope: "/"` retains worker coverage. Existing
iOS standalone installs that retain `/` also enter the protected application.
Ordinary browser visits to `/` stay on the product website. The network-only API
policy, update migration, cookies and offline-write behavior are unchanged.

The existing `npm run build` and Docker/Compose pipeline builds everything.
There are no new dependencies, database migrations or hosting services. Express
serves route-specific titles, descriptions, canonical URLs, Open Graph metadata
and robots directives in the initial HTML, including for non-JavaScript social
crawlers. SPA navigation updates page metadata. `/sitemap.xml` includes only
known public pages. `/robots.txt` excludes private page paths while allowing
fingerprinted `/assets/*` JS/CSS to load for public-page rendering. App and auth
HTML carries noindex; financial APIs keep their authentication and no-store
headers. Unknown APIs are never replaced by HTML. HTML still revalidates.

## Content and components

- `src/shared/publicSite.ts`: 13 implementation-verified guides, app module
  inventory and public metadata. Also drives server metadata and sitemap.
- `src/client/public`: public layout, homepage, directory, article, 404,
  interactive fictional previews, screenshot gallery and scoped stylesheet.
- `src/server/publicSite.ts`: pure public HTML metadata/route helpers.
- `public/showcase`: eleven actual application captures, with fictional fixtures
  and provenance in its README. Interactive illustrations are labeled too.
- `scripts/preview-fixtures.mjs`: development-only read-only fixture server,
  with no database/provider/proxy access and no production-image inclusion.

The guides cover getting started, accounts, transactions, categories, Dashboard
analytics and dates, transfers, recurring templates, assets, debts, spread cost,
preferences, conditional bank connections and import reconciliation. Banking
and automation limits are explicit. The application stylesheet and Dashboard
layout are unchanged; existing application edits update navigation destinations.

## Verification

For the subsequent mobile refinement, responsive media strategy and current
verification results, see [mobile-refinement.md](mobile-refinement.md). The
results below document the original public-site implementation.

Validation on 19 October 2026:

- Typechecking passed for server and client.
- Full build passed, including PWA generation; the client was rebuilt after final
  typography and contrast refinements.
- Full test run: 243 passed, 45 skipped; four PostgreSQL integration suites
  could not initialize because `DATABASE_URL` / `TEST_DATABASE_URL` was absent.
  No personal database or `.env` credentials were used for this test run.
- After adding the standalone launch and manifest/robots compatibility checks,
  focused public/client/server/PWA tests passed: 63 tests across four files.
- Browser layout checks at nominal widths 320, 375, 390, 430, 768, 1024, 1440 and
  1920 found no horizontal document overflow or broken loaded images. Some
  Windows scale factors round the smallest requested width up by one pixel.
- Browser interaction checks covered mobile menu open/Escape, feature selection,
  guide search, article navigation and fictional fixture page rendering.
- Real application screenshots were captured at desktop and mobile sizes.
- Checked text color pairs: muted copy is at least 4.84:1 across the cream,
  sage and peach surfaces; the orange text accent on cream is 4.68:1.

Before production rollout, run the PostgreSQL integration suites against a
dedicated test database, verify the deployed reverse proxy honors HTML cache
headers and the SPA fallback, and smoke-test login, bank callback return routing
and installed PWA launch on actual target devices. No deployment, live bank
authorization, production database change or physical iOS install was performed.
The existing legal-publication review remains applicable; legal text was not
rewritten or represented as newly reviewed legal advice.
