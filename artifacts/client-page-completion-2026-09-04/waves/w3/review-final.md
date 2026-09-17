# W3 — Final adversarial review before the no-flag client-portal cutover

Reviewer: fresh context, read-only. No file in the worktree was modified; no git command was run in the
main checkout.

Subject: `client-page-2/integration` @ `99c02e67f488b2df479a6770ec57213861ffeeef`
(`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-int`), 346 files, +22,752 / −34,792 vs
`origin/main`.

Contract read as binding: `docs/superpowers/plans/2026-09-04-client-portal-retirement.md` **End state**,
plus Kody's 2026-09-04 rulings (no flag; ink, never red/green; acts never leave the page; legacy
decisions/papers read-only; per-line feedback and the Today feed retired, not absorbed).

---

## 1 · END STATE, item by item

| End-state item | Verdict | Evidence |
|---|---|---|
| `/` → active project page | **HOLDS** | `apps/client-portal/src/app/page.tsx:20-83` renders `<Threshold>`; `src/lib/data/active-project.ts:20-68` picks the house by three clocks |
| `/projects/[projectId]` → that project's page | **HOLDS** | `src/app/projects/[projectId]/page.tsx:11-41`, `notFound()` when the id is not the client's |
| Everything else authenticated redirects | **HOLDS** | `src/lib/retired-routes.ts:46-177` + `src/middleware.ts:283-304` |
| No header / nav / drawer / switcher | **HOLDS** | `src/components/layout/app-chrome.tsx:46-56` is a `display:contents` marker only; `client-header`, `mobile-nav-drawer`, `nav-config`, `project-switcher`, `threshold-chrome-gate` all deleted; all three captures show `[data-testid^="header-"]` count 0 |
| Multi-project switch on the mat | **HOLDS** | `src/components/threshold/other-houses.tsx`; `local-dev-multi.png` shows `YOUR OTHER HOUSES` |
| Old routes → anchors (308) | **HOLDS, 2 deviations** | map complete for `/today /decisions /decisions/[id] /reviews /proposals /proposals/[id][/sign] /invoices /invoices/[id] /budget /documents /orders /messages/* /inbox /account /preferences /settings/* /projects /projects/[id]/reviews/* /projects/[id]/scope-change/*`; `#room-<roomId>` for `/scans/[id]` NOT implemented (finding 10); `?decision=` not carried (finding 11) |
| `/preferences/unsubscribe` public | **HOLDS** (with a new exposure — finding 7) | `src/middleware.ts:141-143,167` |
| Redirects carry the project id when the old URL had one | **HOLDS** | `retired-routes.ts:146-172` (`reviews`, `scope-change`) |
| Edge fns / email / cron repointed | **HOLDS, 2 residuals** | `_shared/client-portal-links.ts` + 6 functions repointed; residuals at findings 8 and 1 |
| iOS / extension literals | **HOLDS (no change needed)** | iOS claims `/piece /invoices /proposals /decisions` via AASA and intercepts them; all four still fold correctly on the web. No Swift or extension file is touched by this branch — correct |
| Deletions (route trees, dead API, components, hooks, tests) | **HOLDS** | `today decisions proposals invoices(list+detail) budget documents orders messages inbox reviews scans account preferences settings demo` + `projects/page.tsx` + `projects/[id]/{reviews,scope-change}` gone; `feed/[roomId]`, `rooms/*` ×6, `timeline/*` ×8, `user/data-{export,erase}` gone; `use-{progress-analytics,immersive-timeline,notifications,touch-gestures,qr-auth}` + the bell chain gone. `/invoices/[id]/print` correctly SURVIVES and is correctly NOT mapped (`retired-routes.ts:80-81`, `letterbox.tsx:263`) |
| Moves, not deletes (6 instruments) | **HOLDS** | `components/threshold/instruments/{scored-action,spine-gate,spine-toll,tracking-row,standing-sentence,making-spine}`; `standing-sentence.test` is a pure rename (0 line change); `commercial/journey-stepper` stays |
| No flag reads | **HOLDS** | zero `useFeatureFlag('threshold'\|'single-pane')` in `src`; `hooks/use-feature-flag.ts` retained for future flags; two stale prose mentions only (`use-commercial-client.ts:115`, `lib/analytics/events.ts:92`) |
| `NEXT_PUBLIC_FLAG_OVERRIDES` out of wrangler | **HOLDS** | `apps/client-portal/wrangler.jsonc` — absent from prod and staging `vars` |
| `manifest.json` shortcuts → `/` | **HOLDS** | `public/manifest.json` — one shortcut, `"url": "/"` |
| Playwright reduced to ONE server | **HOLDS** | `playwright.config.ts:36-68`, one project, one `webServer`; `NEXT_DIST_DIR` removed from `next.config.js`; `/.next-threshold/` out of `.gitignore` |
| `next.config.js` no redirects, `ignoreBuildErrors` unchanged | **HOLDS** | only the `distDir` line removed |
| Coverage floor 70/60/70/70 | **HOLDS** | `jest.config.js:71-78` unchanged; `src/app/page.tsx` newly *added* to the collected set (`jest.config.js` `-'!src/app/page.tsx'`); gates report 71.23 / 65.82 / 71.51 / 73.34 |

## 2 · KEEP list re-grepped — nothing with an external caller was deleted

Every surviving API route has a live caller: `auth/invite/accept` (AcceptInviteForm), `inbox/mark-read`
(designer portal + `hooks/use-project-correspondence.ts:187`), `interactions/batch` and `stories/today`
(**iOS** `DailyRoomAPI.swift:8,34`), `budget-checkpoints/.../acknowledge`, `proposals/[id]/{sign,decline,
notifications/replay}`, `trade-scopes/[id]/accept` (all Threshold acts), `unsubscribe`, `version`.

Two API routes deleted beyond the plan's list were checked individually:
`api/user/preferences` — the mat now writes through `useUpdateNotificationPreferences`
(`details-sheet.tsx:11,409`), and the designer portal keeps its own copy; safe.
`api/preferences/apply-token` — the designer portal calls its OWN copy (`apps/designer-portal/src/app/
preferences/page.tsx:149`), so no cross-portal caller broke — but the *client* token path did (finding 1).

Edge functions, cron and email were grepped for surviving old-route literals: the only ones left are the
three deliberate iOS-claimed families (`/invoices/<id>`, `/proposals/<id>`) in `invoice-send`,
`invoice-reminders`, `proposal-nudge`, `proposal-sign-confirmation`, `stripe-webhook` — all of which fold
correctly — plus `selection-review-send` (`/projects/<id>/reviews/<edition>`, folds with `?review=`), and
one that does not fold well (finding 8).

---

## 3 · FINDINGS

### 1 — BLOCKER · confidence HIGH · one-click unsubscribe on client digest mail becomes a no-op

`supabase/functions/notification-digest/index.ts:225` passes `unsubscribeBaseUrl: CLIENT_PORTAL_URL`.
`supabase/functions/_shared/send-email.ts:258-263` turns that into
`${CLIENT_PORTAL_URL}/preferences?token=…` and stamps it into `List-Unsubscribe` +
`List-Unsubscribe-Post: List-Unsubscribe=One-Click` (`send-email.ts:145-152`). After this branch
`/preferences` is retired (`retired-routes.ts:59`) and 308s — method-preserving, so the one-click POST
lands on `/` — while the branch also deleted the only two things that ever consumed that token
(`src/app/preferences/page.tsx:102-137` and `src/app/api/preferences/apply-token/route.ts`). The branch's
OWN doc comment names this exact hazard (`packages/notifications/src/tokens.ts:100-108`) and the single
caller that violates it was not fixed.
**Fix:** `unsubscribeBaseUrl: 'https://admin.patina.cloud'` (or `${CLIENT_PORTAL_URL}/api/unsubscribe`) at
`notification-digest/index.ts:225`, plus a deno test asserting the header never names client `/preferences`.

### 2 — MAJOR · confidence HIGH · the plan's ship order violates the checkout function's own deploy gate

`supabase/functions/create-checkout-session/index.ts:284-291` carries an explicit gate: "⚠ DEPLOY ORDER —
this function must NOT ship before the flagless client portal", because `/projects/[projectId]` on the
currently-deployed worker is still flag-gated and reads no `?checkout=`. The retirement plan's R4 chain is
the opposite order: `supabase functions deploy <each touched fn>` → `./infra/deploy-portal.sh client`
(`2026-09-04-client-portal-retirement.md`, R4). Between those two steps every Stripe return shows no
receipt and no cancellation notice.
**Fix:** ship the portal first, probe it, then the functions — and correct R4's chain in the plan.

### 3 — MAJOR · confidence HIGH · signature mail lands at the door but not on the paper it was sent about

`src/lib/retired-routes.ts:102-112` attaches `?proposal=<id>` for `/proposals/<id>` and
`/proposals/<id>/sign`, and the module header (`retired-routes.ts:18-20`) claims the Threshold reads it.
Nothing on the page does: grep across `src/components/threshold` finds readers for `review`
(`review-ask.tsx:404`) and `invoice`/`order` (`lib/threshold/checkout-return.ts:41-49,94-111`) only. The
param is used server-side to choose the *house* (`lib/data/active-project.ts:114-117`) and then dropped.
It is also absent from `TILL_PARAMS` (`checkout-return.ts:26-33`), so it never leaves the address bar. A
homeowner with two papers pending gets a `#door` section listing both and no indication which one the mail
was about — the signature half of item 5 of the brief.
**Fix:** have `DoorGate` consume `?proposal=` to open/scroll that paper and strike the param, or delete the
false claim at `retired-routes.ts:18-20`.

### 4 — MAJOR · confidence HIGH · `var(--color-error)` shipped on the authenticated page, against the ruling

`src/components/account/AvatarUploadField.tsx:130` renders the upload refusal as
`text-[var(--color-error,#C45B4A)]`. `--color-error` is `#C77B6E` — red (`src/app/globals.css:39`). The
component is rendered inside the mat's details sheet (`src/components/threshold/details-sheet.tsx:20,322`),
i.e. on the one authenticated page. Worse, **this branch introduced it**: `origin/main` had the literal
`#C45B4A` and the diff changed it *to* the token the 2026-09-04 ruling forbids by name. (`open-chapter.test.
tsx:220` asserts `--color-error` is absent — from a different component.)
**Fix:** replace with the house's own refusal style, exactly as `details-sheet.tsx:392-394`:
`className="border-t border-[var(--border-subtle)] pt-2 text-[13px] text-[var(--text-body)]"`.

### 5 — MAJOR · confidence HIGH · developer error strings printed to the homeowner as content

`src/lib/threshold/refusal.ts:1-8` states the rule — a PostgREST/edge string "is never printed to the
homeowner as content" — and eight call sites obey it (`wall-gate.tsx:169`, `settlement.tsx:146`,
`road-orders.tsx:91`, `approval-ask.tsx:580,602`, `payment-method-chooser.tsx:107`). These do not:

- `src/components/threshold/details-sheet.tsx:396-397` — `updateProfile.error.message`
- `src/components/threshold/details-sheet.tsx:449-450` — `updatePrefs.error.message`
- `src/components/threshold/door-acts.tsx:152,173,198` → rendered at `:423`
- `src/components/threshold/scope-change-ask.tsx:331,498,524,715` → rendered at `:378,657,781`

A Supabase failure therefore prints e.g. `new row violates row-level security policy for table "profiles"`
on the mat. The *styling* is correct (body ink + hairline, ruling honoured); the *content* is not, and it
is the "no error string as content" check in item 4 of the brief.
**Fix:** wrap every one in `refusalSentence(err, '<the house's sentence>')`.

### 6 — MAJOR · confidence MEDIUM · the 308 fold is shared-cacheable and carries `Set-Cookie`

`src/middleware.ts:296-302`: `redirectWithCookies(target, 308)` copies the refreshed Supabase auth cookies
onto the redirect (`middleware.ts:184-202`), then `folded.headers.set('Cache-Control', 'max-age=3600')` —
no `private`. A response carrying one homeowner's session cookie is thereby marked cacheable by any
intermediary that honours `max-age` alone. Cloudflare and most proxies refuse to cache a `Set-Cookie`
response, which is why this is MEDIUM and not HIGH; a corporate/ISP proxy that does not is the exposure.
**Fix:** `folded.headers.set('Cache-Control', 'private, max-age=3600')`.

### 7 — MAJOR · confidence HIGH (mechanism) / MEDIUM (hit rate) · the newly-public unsubscribe page mutates on GET

`src/middleware.ts:141-143,167` makes `/preferences/unsubscribe` public — correct, and the fix the plan
asked for. But the page applies the token server-side on a plain GET
(`src/app/preferences/unsubscribe/page.tsx:29`, `export const dynamic = "force-dynamic"`). Until this branch
the sign-in wall incidentally shielded that mutation from link scanners; now Outlook SafeLinks, the Gmail
image/link proxy, any security appliance or browser prefetch that fetches the URL silently unsubscribes the
recipient. (`?status=applied` is also attacker-settable and renders "You've been unsubscribed" — pre-existing,
cosmetic.)
**Fix:** on GET with a token, render a one-button confirm that POSTs (or 302s through `/api/unsubscribe`);
keep the token-less `?status=` render as the only GET-safe path.

### 8 — MODERATE · confidence HIGH · direct-order checkout returns to a route this branch deleted

`supabase/functions/create-checkout-session/index.ts:534-536` returns
`${CLIENT_PORTAL_URL}/orders?order=<id>` for an order raised outside a project, and its own comment
(`:530-536`) says it "keeps the orders list" — the orders list is deleted in this same branch. It works only
because the middleware folds `/orders` and merges the query (`middleware.ts:286-288`), which costs the
returning buyer an extra hop, or a full sign-in round trip whenever the session cookie is not sent on the
Stripe return.
**Fix:** `clientProjectLink(CLIENT_PORTAL_URL, order.project_id, 'road', { order: order.id })` — the same
helper `stripe-webhook/index.ts:1291-1294` already uses — and correct the comment.

### 9 — MODERATE · confidence HIGH · Stripe return URL drops the `#letterbox` anchor the End state specifies

`create-checkout-session/index.ts:291-292` returns to `/projects/<id>?invoice=…&checkout=success` with no
fragment (deliberately — the attempt params are appended after this string). The End state says
`#letterbox`. It recovers only after hydration, when `consumeCheckoutReturn()` rewrites the hash
(`lib/threshold/checkout-return.ts:71-76`) and `revealReturnAnchor` scrolls (`:208-215`). First paint is
therefore the top of the house with the receipt off-screen, and a JS-blocked return never reaches it.
**Fix:** append the fragment last in `invoice-checkout-core.ts`, or record the deviation in the plan.

### 10 — MODERATE · confidence HIGH · `/scans/[id]` never resolves `#room-<roomId>`

`src/lib/retired-routes.ts:130-133` folds every `/scans/*` to `#doorstep`. The End state says
`#room-<roomId>` when resolvable, else `#doorstep`. The code comment explains the choice (a scan id is not
a room id) but the plan was never amended, and the page does key room anchors
(`threshold.spec.ts:177` asserts `a[href^="#room-"]`).
**Fix:** one `room_scans → room_id` lookup in the fold, or amend the End state to say doorstep always.

### 11 — MODERATE · confidence HIGH · `/decisions/<id>` carries no `?decision=`

`retired-routes.ts:96-97` folds `/decisions/<id>` to a bare `#doorstep`, and
`notification-digest/index.ts:148` now emits the same anchor with no decision id. The map carries an id for
invoice, proposal and review; a decision is the one instrument that loses its name in the fold, so a
homeowner with several standing asks is not told which one the mail was about.
**Fix:** add `params: { decision: second }` and read it on the doorstep, or note it as accepted.

### 12 — MODERATE · confidence HIGH · the root layout still fetches every project on every request, for nobody

`src/app/layout.tsx:79` passes `projects` into `AppChrome`, whose own doc says nothing above the page reads
it (`src/components/layout/app-chrome.tsx:26-31`). `fetchClientProjects` (`src/lib/data/projects.ts:645-690`)
runs `auth.getUser()`, a `projects` select and `computeProjectCounts` — on *every* route, including the
token/guest pages (`/share`, `/field`, `/rfq`, `/plans`, `/piece`) where the answer is always `[]`. The
plan's "`AppChrome` reduced to the shell with no header" left the fetch behind.
**Fix:** delete the prop and the layout-level `fetchClientProjects()` call.

### 13 — MODERATE · confidence HIGH · e2e asserts 3 of the 10 retired paths the gates report as probed

`apps/client-portal/tests/threshold.spec.ts:371-375` loops only `/projects`, `/invoices`, `/today`. The
ten-path 308 table in `waves/w3/gates.md` §6b came from a hand-run curl pass that lives in no suite, so a
future edit to `retired-routes.ts` that breaks `/decisions`, `/proposals`, `/budget`, `/documents`,
`/orders`, `/messages`, `/inbox` is caught only by the (good) unit tests at
`src/__tests__/middleware.test.ts:323-551`, never at the served-response level. `/preferences/unsubscribe`,
`/account` and `/settings/*` have no e2e coverage at all.
**Fix:** lift the ten-path table into the spec's loop and add the signed-out unsubscribe 200.

### 14 — MINOR · confidence HIGH · dead help-system module still describes the retired route tree

`src/lib/help-system/pathname-to-surface-key.ts` has **zero importers** and its doc (`:6-8`, `:12-13`,
`:20-25`) still says the `?` trigger lives in `client-header` (deleted), that "`/` is a redirect to
`/projects`" (false), and maps `/today`, `/scans`, `/messages`.
**Fix:** delete it with the rest of the dead-at-cutover set.

### 15 — MINOR · confidence HIGH · `SpineToll`'s outbound branch is dead and its comment is stale

`src/components/threshold/instruments/spine-toll.tsx:56-59,124-131` keeps an `href={/invoices/<id>}`
fallback "which is what The Making still passes" — The Making is deleted in this same branch, and
`settlement.tsx:152-160` is the only caller and always passes `settle`. Reaching it would leave the page,
against the ruling.
**Fix:** drop the `href` branch and the comment.

### 16 — MINOR · confidence HIGH · middleware and chrome still special-case routes that no longer exist

`src/middleware.ts:70-77` stamps `x-client-ip` for `/proposals`, which now always folds;
`src/middleware.ts:158,208-210` and `src/components/layout/app-chrome.tsx:20` still treat `/demo` as public
after the `src/app/demo` tree was deleted; `PUBLIC_PREFIXES` omits `/evidence` and `/preferences/unsubscribe`.
**Fix:** prune the three, add `/evidence`.

### 17 — MINOR · confidence HIGH · the inventory of record now contradicts the shipped state

`artifacts/client-page-completion-2026-09-04/research/RETIRE-INVENTORY.md:81` marks `/account` **KEEP**
("Threshold's own outbound", "Mat links `accountHref="/account"`"). The branch correctly deletes it per the
End state and absorbs profile editing into `details-sheet.tsx`; the mat no longer emits an `accountHref`.
The row will mislead the next reader.
**Fix:** strike or annotate the row.

### 18 — MINOR · confidence HIGH · two gate deviations were argued, not executed

`waves/w3/gates.md` §3d (10 eslint errors) and §6a (2 e2e failures) are both declared pre-existing from
file-identity reasoning rather than a run against an `origin/main` checkout, and the gate itself says so
under "Not verified". I independently confirmed `src/lib/portal-access.ts` and its test are byte-identical
to `origin/main` (`git diff --stat origin/main...HEAD` → empty), which supports the eslint claim for that
file; I did not re-run either suite.
**Fix:** none required to ship — record the two as accepted, standing deviations rather than as green.

### 19 — MINOR · confidence HIGH · first-viewport deltas (screenshots read directly)

I looked at all three captures. **No header** in any of them (confirmed visually and by the gate's
`[data-testid^="header-"]` = 0). **No red or green ink** anywhere — the only non-ink colour is the ochre
`#8A5F19` accent (`threshold.tsx:118`). **No error string as content.** Ledger, story pole and mat all
present on `local-dev-desktop.png`. Two honest deltas: the ledger draws **one** row where the mock reads
three (`house-ledger.tsx` drops falsy-cent rows — fixture-shaped, and the three-row case is unit-covered);
and the empty `Hall` / `Stair` room bands draw an **empty framed box with a faint centred label**, which
sits against `threshold.tsx`'s own "ABSENCE IS SILENCE — a region with nothing to say renders nothing".
The `N` badge bottom-left is the Next dev-tools indicator, not chrome.
**Fix:** rule on the empty room band; the ledger delta needs no code change.

### 20 — MINOR · confidence HIGH · whole-file requote noise in a cutover diff

`src/app/preferences/unsubscribe/page.tsx` was reformatted single→double quotes across all 112 lines for a
two-line href change, which makes the one file a reviewer most needs to read on this branch the hardest to
diff.
**Fix:** none required; noted.

---

## 4 · SECURITY OF THE CUTOVER (item 3), answered directly

- **Signed-out access to authenticated data:** none found. `/` and `/projects/*` are both gated before
  anything renders (`middleware.ts:243-247`), and the retirement fold is deliberately placed *after* the
  gate (`:274-283`) so a signed-out visitor is sent to sign-in carrying the OLD path and folded on return —
  verified by `middleware.test.ts:528-539` and by the gate's signed-out curl pass. The public allowlist
  (`middleware.ts:157-167`) grew by exactly one exact-match entry, `/preferences/unsubscribe` (+ its
  trailing-slash form) — no prefix wildcard, so `/preferences/unsubscribe-anything` stays gated. Its one new
  exposure is finding 7.
- **Cross-project reads:** clean. `resolveHouseForInstrument` scopes the invoice lookup by
  `.in('project_id', projectIds)` AND re-checks ownership (`lib/data/active-project.ts:99-117`);
  `resolveActiveHouse` scopes by `.eq('client_id', user.id)` (`:40`); `fetchClientProjectView` scopes by
  `.eq('client_id', user.id)` (`lib/data/projects.ts:705-708`); `/projects/[id]` additionally requires the
  id to be in the client's own list before rendering (`page.tsx:18-22`). Feeding another client's
  `?invoice=` simply falls through to the active house. `clientProjectLink`/`retiredRouteTarget` both refuse
  a non-`[A-Za-z0-9_-]` id rather than interpolating it into a `Location`
  (`client-portal-links.ts:34`, `retired-routes.ts:67`).
- **Middleware allowlists:** unchanged apart from the above; `/.well-known/apple-app-site-association`
  still short-circuits before auth (`middleware.ts:86`), `/plans` still gets `no-store` + `noindex`
  (`:148-151`), the RSC-header bypass and spoofed-forwarded-host cases are still covered by tests
  (`middleware.test.ts:278,297`).
- **New cross-cutting exposure:** finding 6 (cacheable 308 with `Set-Cookie`).

## 5 · MONEY + SIGNATURE, END TO END

**Money — works, with two rough edges.**
`create-checkout-session:291` → `/projects/<id>?invoice=<id>&checkout=success&session_id=…` → the page is
not folded (it is a live route) → `useCheckoutReturn()` consumes and cleans the address exactly once at
module scope (`checkout-return.ts:58-78`), sets `#letterbox`/`#road`, and `revealReturnAnchor` scrolls it
into view. Critically the receipt is **row-confirmed, not URL-confirmed**:
`useCheckoutConfirmation` (`checkout-return.ts:176-200`) polls the surface's own read for 30 s and says
"confirmed" only when the row says the money landed — `confirmed` is one-way. `invoices.project_id` is
`NOT NULL` (`00178_invoices_v1.sql:31`), so the success URL can never be `/projects/null`. Rough edges:
findings 9 (no anchor at first paint) and 8 (direct-order fallback).
E2E covers the whole leg (`threshold.spec.ts:262-313`, asserting `letterbox-receipt`).

**Signature — the act works; the addressing does not.**
`/proposals/<id>/sign` → 308 → `/?proposal=<id>#door` → `DoorGate` renders a door per pending paper with
the same typed-name consent and the same `POST /api/proposals/[id]/sign` the retired route used
(`door-gate.tsx:34-40`), and the paper is drawn on the leaf before Sign arms. But nothing reads
`?proposal=` (finding 3), so the mail does not open the paper it was sent about.

## 6 · ROLLBACK STORY — concrete exposure of `wrangler rollback` to `2571a241`

1. **Cached folds (bounded, ~1 h).** Every retired path was answered `308` + `Cache-Control: max-age=3600`
   (`middleware.ts:296-302`). After a rollback, a browser that already followed one keeps folding
   `/invoices` → `/#letterbox` without asking the origin, for up to an hour. On the rolled-back worker `/`
   is the old bare redirect to `/projects`, so those clients land on the project list instead of the invoice
   they asked for — degraded, self-clearing. The explicit `max-age` is what bounds it; a bare 308 would not
   have. Residual risk: intermediaries that treat 308 as indefinitely cacheable regardless of `max-age`.
2. **Edge functions do NOT roll back with the portal — this is the sharp edge.** Once
   `create-checkout-session`, `stripe-webhook`, `notification-digest`, `comms-notification-dispatch`,
   `review-requests`, `comms-mute` and `commercial-document-notify` are deployed they emit
   `/projects/<id>?invoice=…&checkout=success`, `…#road`, `…#doorstep`, `/#mat`. On the rolled-back worker
   `/projects/<id>` renders the OLD flag-gated dashboard, which reads no `?checkout=`, no `?invoice=` and no
   anchor. **Every Stripe return after a portal-only rollback shows no receipt and no cancellation notice**,
   and Checkout sessions already created carry those URLs and cannot be rewritten. The plan's Risks section
   says "rollback = `wrangler rollback <prev id>`" and does not carry this. Rolling the portal back REQUIRES
   redeploying the prior versions of those seven functions in the same minute.
3. **Flag archiving is one-way in practice.** If Kody archives PostHog `threshold`/`single-pane` at ship (R4
   step 5) and then rolls back, the old worker fails closed to the pre-flag dashboard — so the rollback
   target is not the surface anyone was on. Archive the flags only after a clean walk.
4. **Reversible on rollback:** the unsubscribe break (finding 1 — `/preferences` and `apply-token` come
   back), the deleted API routes, the deleted route trees. **Not reversible:** digest mail already sent with
   the dead one-click header, and Checkout sessions already minted.
5. **Recommended change to the chain:** portal first → probe (`/today` → 308 `/#doorstep`, served chunk
   carries no `threshold:false`, `/api/version` 200) → functions → probe a real Checkout return. This also
   resolves finding 2.

## 7 · TESTS

- Middleware unit coverage is genuinely strong: `src/__tests__/middleware.test.ts:323-551` covers the map
  with and without ids, the `?invoice=` / `?review=` params, the till query survival, the cache ceiling, the
  signed-out round trip, the wrong-role case and both unsubscribe cases. This is the best-tested part of the
  branch.
- E2E under-asserts relative to what the gates claim (finding 13).
- Coverage floor holds and got *stricter* (`src/app/page.tsx` newly collected).
- Two standing e2e failures (`plans-link`, `share-link`) are seed-vs-spec conflicts on untouched routes;
  I agree with the gate that they are not route rot — both specs and both routes are byte-identical to
  `origin/main` — but they remain owed by whoever owns those guest-link fixtures.

## 8 · VISION §6 + VOICE

The docs lane is the strongest part of the diff. `docs/vision/VISION-DECISIONS.md` V8 is careful where it
would have been easy to overreach: it rules the client page as surface #1's client-facing face, explicitly
scopes S4's "never optimize for engagement" to the *studio's* surfaces, and closes with "Nothing here
licenses tabs, badges, shadows, or engagement chrome in The Document itself — those refusals in VISION §6
are unchanged." `docs/design/the-document/DECISIONS.md` R135 correctly retires the 5 Aug "every existing
route keeps working" clause by name and records why no flag is possible (zero clients live).
`.agents/skills/patina-portal-features/SKILL.md` gains one accurate line that will stop the next agent
adding `src/app/<name>/page.tsx` to this portal.

Voice across the code is consistent and in the house's register — "absence is silence", "a refused act, in
the house's words", "the fragment goes on last". Two lapses, both already filed: the `--color-error`
regression (finding 4) and the raw PostgREST strings (finding 5), which are the two places the surface
speaks in a developer's voice instead of its own. The `comms-mute` and `review-requests` copy rewrites are
good — both also fixed genuine pre-existing 404s.

---

## VERDICT

**SHIP_WITH_FIXES** — 20 findings: 1 blocker, 6 major, 6 moderate, 7 minor. The End state holds item by
item with two documented deviations (`#room-<roomId>`, `?decision=`); nothing with an external caller was
deleted; the security posture of the fold is sound apart from findings 6 and 7; money is row-confirmed end
to end. Fix findings 1–5 before the cutover, reverse the ship order per finding 2, and record the rollback
exposure in §6 against the plan's Risks section.

---

# Fix round — 2026-09-04

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-int`, branch
`client-page-2/integration`. Head at start `99c02e67f`, head after `4495f3f5b`
(`fix(client): final review fixes before cutover`), pushed.

**16 of 20 findings applied. 4 rejected, each with one reason.** The blocker is one of the
rejections — the mechanism it describes is not the code that runs — so nothing blocking was
left standing.

## Rejections

**1 — REJECTED (not a defect).** The digest does not mint a `/preferences` link. `notification-digest`
imports the **Deno** `_shared/send-email.ts`, whose `generateUnsubscribeUrl` returns
`${baseUrl}/api/unsubscribe?token=…` (`send-email.ts:154-161`, identical on `origin/main`) — an API
route this branch KEEPS, and one middleware answers before both the sign-in gate and the retirement
fold (`middleware.ts`, `if (isApiRoute) return res;`). The `/preferences?token=` builder the finding
quotes is `packages/notifications/src/tokens.ts:111-118`, a **node** module with zero production
callers (its own test and `packages/email/USAGE.md` prose are the only references; `packages/email`
has its own `/api/unsubscribe` builder at `send.ts:218-234`). The one-click POST works.
*Applied anyway:* the regression test the finding asked for —
`supabase/functions/_shared/send-email.test.ts`, "one-click unsubscribe always names
/api/unsubscribe, never /preferences", asserting both the URL and the `List-Unsubscribe` header.

**10 — REJECTED (cost).** `#room-<roomId>` for `/scans/[id]` means a `room_scans → room_id` database
read inside edge middleware on **every** scan link, to save a scroll. Not worth the round trip, and
nothing is unreachable without it: `StrayCaptures` stands every capture no room band claimed, on the
doorstep. The End state is amended instead — `/scans/*` → `#doorstep`, always — in the plan, in
`apps/client-portal/README.md`, in `docs/design/the-client-page/README.md`, and in DECISIONS R135.

**19 (empty room band) — REJECTED as a violation; ruled and recorded.** "Absence is silence" governs
a region with nothing to *say* — an empty-state card, a zero, an error string. A room in the client's
own house, named by her studio's scope and drawn as a section with nothing on its floor yet, is
stating a fact about her house, not filling a hole. The band keeps its drawing. (The ledger delta in
the same finding needed no code change, as the finding itself says.)

**20 — REJECTED (nothing to fix).** Requote noise, noted by the reviewer as requiring no action.

## Applied

| # | What changed |
|---|---|
| 2 | Ship order corrected in the plan's R4 — **portal first**, probe, then functions, then probe a real Checkout return. The portal is backward-compatible with the old function output; the functions are not backward-compatible with the old portal. The gate comment in `create-checkout-session/index.ts` was rewritten to say so. |
| 3 | `?proposal=` now chooses the DOOR as well as the house. `page.tsx` passes `namedProposalId` into `Threshold`; `firstDoorId` prefers the named paper when it is one of hers and is drawn, else the first drawn door as before. Decided at render, never in an effect — `#door` is in the URL at first paint. `retired-routes.ts`'s header claim is now true. |
| 4 | `AvatarUploadField` refusal is `border-t border-[var(--border-subtle)] pt-2 text-[13px] text-[var(--text-body)]` — the details sheet's own style. No `--color-error` anywhere on the authenticated page. |
| 5 | Every raw cause wrapped in `refusalSentence`: `door-acts` ×3, `scope-change-ask` ×4, `details-sheet` ×3 (the sign-out site was the same defect and is included), and `review-ask:153`, which the finding's list missed. Three tests that asserted the developer string were rewritten to assert the house's sentence AND that the cause (`row-level security`, `refresh_token_not_found`) does not appear. |
| 6 | `Cache-Control: private, max-age=3600`, with the reason in the code and in `middleware.test.ts`. |
| 7 | `/preferences/unsubscribe` never mutates on GET. A `?token=` renders a one-button confirm posting to `/api/unsubscribe`; that route content-negotiates — `text/html` gets a 303 to the `?status=` page, a mail client's RFC 8058 one-click POST still gets a bare 200. The page no longer imports `applyUnsubscribeToken` at all. |
| 8 | Direct-order return → `clientProjectLink(CLIENT_PORTAL_URL, order.project_id, 'road', { order, checkout })`, the same helper `stripe-webhook` uses. No `/orders`, no fold hop, comment corrected. |
| 9 | `invoiceCheckoutReturnUrl` splits any fragment off, appends the claim, re-appends the fragment last. Invoice returns now carry `#letterbox`, direct orders `#road`. Two new deno assertions cover it. |
| 11 | `/decisions/<id>` → `#approval-<decisionId>`, the element id `ApprovalAsk`/`ApprovalRecords` already draw. `ThresholdAnchor` widened to `\`approval-${string}\`` in both the portal and `_shared/client-portal-links.ts`; `notification-digest` emits the same anchor. An answered decision leaves the fragment unresolved and the client lands at the top of the page, which is the doorstep. |
| 12 | Root layout fetches nothing; `AppChrome` loses the prop and the `ProjectListItem` import. |
| 13 | The e2e loop covers **thirteen** retired paths (the gates' ten plus `/reviews`, `/account`, `/settings/notifications`) and asserts `private` on each; a new signed-out `/preferences/unsubscribe` → 200 test uses the `request` fixture, which has its own cookie jar. |
| 14 | `src/lib/help-system/pathname-to-surface-key.ts` deleted (zero importers; the directory went with it). `@patina/help-system`, the package, is untouched. |
| 15 | `SpineToll.settle` is required; the `href={/invoices/<id>}` branch and its stale comment are gone. Its eight tests updated — the act is a button, and there is no link. |
| 16 | The `/proposals` `x-client-ip` stamp, the `/demo` public classification and the `/demo` production short-circuit are all removed (with the now-unused `@/lib/env` import); `/evidence` and `/preferences/unsubscribe` added to the shell's `PUBLIC_PREFIXES`, with tests. `client-ip.ts`'s doc corrected — `resolveClientIp` never depended on the stamp (`cf-connecting-ip` then `x-forwarded-for` come first), so the signing audit trail is unchanged. |
| 17 | The inventory's `/account` row struck through in place, with why. |
| 18 | Both deviations **proven** rather than argued — see below. |

## Finding 18 — the two deviations, now verified rather than reasoned

- **eslint:** 10 errors, in 9 files. `git diff --stat origin/main` over exactly those nine paths is
  **empty** — every one is byte-identical to `origin/main`, and none is a file this fix round touched.
  Pre-existing, proven by diff.
- **e2e:** the earlier "2 pre-existing failures" claim is confirmed, and the cause of the noise found.
  A first run showed 8 failures; the guest-link routes (`/share`, `/field`, `/plans`) read through
  `createServiceClient()`, and `playwright.config.ts` deliberately does not carry the local
  service-role key — it must be exported from the shell (`SUPABASE_SERVICE_ROLE_KEY`), or the dev
  server boots without it and every guest-token page fails. With the key exported, after a clean
  `supabase db reset` against the local stack (127.0.0.1:54322, confirmed before the reset): **27
  passed, 2 failed** — `plans-link.spec.ts:190` (`studio_id_not_designer_studio`) and
  `share-link.spec.ts:114` (`proposal … is sent, so its authored copy is immutable`). Both specs and
  both route trees are byte-identical to `origin/main`. Seed-vs-spec fixture conflicts, still owed by
  whoever owns those guest-link fixtures, still not route rot.

## Gates

| Gate | Result |
|---|---|
| `pnpm --dir apps/client-portal type-check` | **PASS**, clean |
| `pnpm --dir apps/client-portal test:coverage` | **1514 passed / 1 failed** of 1515, 114/115 suites. The single failure is `portal-access.test.ts` — the recorded pre-existing allowed failure, file and test byte-identical to `origin/main`. |
| global coverage | **71.31 % stmts · 66.08 % branch · 71.42 % funcs · 73.46 % lines** — over the 70/60/70/70 floor, and up on the recorded 71.23 / 65.82 / 71.51 / 73.34 on three of four (funcs 71.51 → 71.42, still clear). No threshold error emitted. |
| `npx eslint src` | 10 errors, 44 warnings — the same 10, all in files byte-identical to `origin/main` (proven, above). Zero in any file this round touched. |
| deno tests (functions touched) | **44 passed / 0 failed** — `invoice-checkout-core.test.ts` (incl. 2 new fragment assertions), `send-email.test.ts` (incl. the new one-click assertion), `client-portal-links.test.ts`, `notification-digest/logic.test.ts`. Plus `commercial-document-notify/core.test.ts` **23/23**. |
| `deno check` | `notification-digest`, `create-checkout-session`, and every other importer of the edited `_shared/client-portal-links.ts` — `stripe-webhook`, `commercial-document-notify`, `comms-notification-dispatch`, `review-requests` — all clean. |
| `pnpm --filter @patina/client-portal test:e2e` | after `supabase db reset` + `SUPABASE_SERVICE_ROLE_KEY` exported, `--workers=1`: **27 passed / 2 failed**, the two above. All of `threshold.spec.ts` green, including the new thirteen-path 308 loop and the signed-out unsubscribe 200. |

No root `deno.lock` was created. `docs/design/the-document/screenshots/schedule-boards-wave2/2-guest-share-desktop.png` was already modified before this round and is deliberately **not** in the commit.

## Still owed after this round

- **`/api/unsubscribe` GET still applies a token.** Out of this finding's scope (it is pre-existing,
  unchanged by this branch, and shared verbatim with the admin and designer portals), but it is the
  same mechanism finding 7 describes: a scanner fetching the `List-Unsubscribe` URL unsubscribes the
  recipient. Worth one ticket across all three portals.
- The two guest-link e2e fixtures (`plans-link`, `share-link`).
- `SUPABASE_SERVICE_ROLE_KEY` must be exported before any client-portal e2e run, or six guest-link
  specs fail for reasons that have nothing to do with the branch under test. Worth a line in the
  suite's own README.
