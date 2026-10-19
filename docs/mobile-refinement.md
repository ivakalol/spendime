# Public website mobile refinement

Implemented 19 October 2026. This builds on the existing public website; it
does not redesign the authenticated application or change financial logic,
authentication, routes, APIs, banking behavior, or PWA configuration.

## Layout changes

- Phone overrides live at the end of `src/client/public/public.css`, at 700px
  and below. The original desktop stylesheet remains an unchanged prefix.
- Banking now uses a full-width vertical grid on phones, and a two-column
  icon/text grid with its CTA below at 701–1023px. Previously, at nominal 390px,
  its text column collapsed to about 68px. It now has about 340px there and
  279px at nominal 320px. Text no longer breaks mid-word to fit a flex row.
- Hero buttons use bounded equal columns, stacking at the smallest sizes.
  The original display typography, color palette and identity remain.
- Feature spotlights show readable real phone captures. Secondary features
  stack their artwork, headings, copy and links instead of competing for width.
- Tutorial artwork is shorter, metadata and copy are larger, and cards stack
  through the phone breakpoint. The directory introduction also stacks its CTA
  below its text. Search inputs use 16px text, and filters have touch targets.
- Articles have readable steps, full phone screenshot proportions, larger
  contents links and no mobile sticky sidebar. FAQ, onboarding, navigation,
  final CTA and footer have intentional phone spacing and touch targets.
- Legal pages receive only `.sp-legal-page` mobile reading styles in the main
  stylesheet. Their substantive Privacy Policy and Terms text is unchanged.
- Existing reduced-motion rules apply to the new menu animation too. No new
  dependency was added.

## Actual interface captures

All eleven JPEGs were captured using the supported browser from the real app
with the isolated read-only fixture server. All four prior captures were
refreshed with **Ivo Demo**. The React product illustration also says **Hello,
Ivo**. No real profile, financial record, database or bank connection was used.

The hero uses `<picture>` to select a mobile Dashboard through 700px and the
original desktop capture above it. Feature panels mount one device-appropriate
preview. The gallery defaults to the visitor's layout, retains the three desktop
views, and adds five mobile views: Dashboard, Transactions, Accounts, Analytics
and Categories. Tutorials select appropriate phone captures, including asset
details, debts and recurring templates. Natural image proportions are retained;
full-image links remain available. Noncritical captures load lazily.

The gallery has previous/next buttons, a live position label, arrow-key controls
and horizontal touch swipe handling. Vertical gestures remain page scrolling.
Only the selected gallery image is rendered. A version query invalidates the
old demo images. See `public/showcase/README.md` for dimensions, fixture sums
and refresh instructions.

## Verification

- `npm run typecheck`: passed, server and client.
- `npm run build`: passed, including server, client and generated PWA assets.
- 32 database-independent test files: **248 tests passed**. This includes
  public routing/auth redirects, legal, PWA, authenticated UI and finance unit
  tests. Focused public client/server/content checks: **61 passed**.
- New regressions exercise phone/desktop gallery defaults, next/previous
  wrapping, horizontal/vertical touch handling, suppression of enlargement after
  a swipe, keyboard controls, responsive hero sources and feature capture changes.
- Real browser homepage captures at requested widths **320, 360, 375, 390,
  414, 430, 768, 1024, 1280 and 1440px**. Windows/browser scaling rounded nominal
  320, 375, 414 and 1280 widths up by one CSS pixel. Full-page captures and
  readable section close-ups were used; overflow checks alone were insufficient.
- Reviewed every homepage section, with extra close-ups of the hero, banking,
  tutorials, features, gallery, FAQ, onboarding and footer. No document overflow,
  collapsed visible paragraph columns or broken final loaded captures found.
- Menu open/Escape and anchor-close, all four feature tabs, gallery buttons and
  keyboard controls, image enlargement, FAQ expansion, tutorial search and topic
  filters exercised in the browser. A Features anchor settled below the sticky
  header (about 90px section top versus 73px header bottom).
- Tutorial directory rendered at 320, 390, 430, 768, 1024 and 1440px. All 13
  article routes rendered with valid mobile sources and no overflow at 390px;
  reading layouts were visually reviewed on representative beginner, planning
  and banking articles, including a 320px banking guide.
- Privacy and Terms rendered at 320, 390, 768 and 1440px; legal mobile body copy
  is 15px and long contact links wrap safely.
- Desktop regression: every homepage section's x/y position, width and height
  matched the saved pre-refinement baseline at **1280 and 1440px**, within 0.1px.
  Before/after captures retain the same composition. Differences inside the
  refreshed screenshots and illustration are the requested fictional name/data.

## Verification limits

Browser QA used the desktop app's rendered browser with viewport overrides,
not physical iOS/Android hardware. Horizontal and vertical touch handlers are
covered by automated component tests; native finger swipes, mobile Safari,
physical-device scrolling performance and installed PWA behavior still need
device testing. Reduced motion is implemented through CSS but was not toggled
through an OS setting during this pass. The four PostgreSQL integration suites
were not rerun; they require a dedicated test database. No production deployment
or live bank authorization was performed.
