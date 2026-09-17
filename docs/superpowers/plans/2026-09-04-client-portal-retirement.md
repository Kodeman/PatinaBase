# Client Portal Retirement — Plan

> **For agentic workers:** executed through Workflow scripts (one per wave) orchestrated by Fable; each lane
> runs in its own worktree with a separate reviewer. Companion plan (runs FIRST):
> `docs/superpowers/plans/2026-09-04-client-page-completion.md`. Inventory of record:
> `artifacts/client-page-completion-2026-09-04/research/RETIRE-INVENTORY.md`.

**Ruling (Kody, 2026-09-04):** everyone gets the new portal; no feature flag; retire the existing client
portal; clean up the codebase.

**Goal:** the client portal's authenticated surface is one page per project — the Threshold — with every act
performed in place; the old route tree, header/nav, The Making v1, dead API routes, dead components, dead
hooks and both flags are gone; every deep link from email, SMS, cron, iOS and the extension lands on the
page at the right anchor.

## End state

- Routes (authenticated): `/` → the client's **active project page** (the project with the most recent
  activity where `projects.client_id = auth.uid()`); `/projects/[projectId]` → that project's page.
  Everything else authenticated redirects (middleware map below). Public/token/auth/system routes are
  untouched (27 KEEP rows in the inventory).
- No header, nav, drawer or project switcher anywhere authenticated. A multi-project client switches
  houses from the mat ("Your other houses"); the doorplate names the house.
- Old routes → anchors (middleware, 308): `/today` `/decisions` `/reviews`
  `/projects/[id]/reviews/*` → `#doorstep`; `/decisions/[id]` → `#approval-<decisionId>`;
  `/proposals` `/proposals/[id]` `/proposals/[id]/sign` → `#door`;
  `/invoices` `/invoices/[id]` → `#letterbox`; `/budget` → `#ledger`; `/documents` → `#mat-papers`;
  `/orders` → `#road`; `/messages` `/messages/*` `/inbox` → `#note`; `/scans` `/scans/[id]` →
  `#doorstep`; `/account` `/preferences` `/settings/*` → `#mat`;
  `/projects` → `/`. `/preferences/unsubscribe` becomes PUBLIC (bug: signed-out recipients bounce today).
  Redirects carry the project id when the old URL had one; otherwise target `/`. The 308 is
  `Cache-Control: private, max-age=3600` — it carries the homeowner's refreshed auth cookies, so
  `private` is not decoration.

  **AMENDED 2026-09-04 (pre-cutover review).** Two of the anchors above changed after the End state was
  first written:
  - `/decisions/[id]` was specified as a bare `#doorstep`. It now folds onto `#approval-<decisionId>`,
    which is the element id `ApprovalAsk`/`ApprovalRecords` already draw — a client with several standing
    asks is otherwise never told which one the mail was about. An answered decision is no longer drawn,
    the fragment does not resolve, and she lands at the top of the page, which is the doorstep.
    `notification-digest` emits the same anchor.
  - `/scans/[id]` was specified as `#room-<roomId>` when resolvable. **It is `#doorstep`, always.** A scan
    id is not a room id; resolving one to the other means a `room_scans → room_id` database read inside
    edge middleware on every scan link. Ruled not worth the round trip. The doorstep carries every capture
    a room band did not claim (`StrayCaptures`), so nothing is unreachable.
- Edge functions / email / cron links updated to the canonical anchors: `stripe-webhook` (`/orders` →
  `/projects/<id>#road`, invoices → `#letterbox`), `create-checkout-session` (return URLs →
  `/projects/<id>#letterbox?checkout=…`), `review-requests` (`/review/<id>` bug → `#doorstep`),
  `comms-mute` (`/messages/<thread>` bug → `#note`), notification templates in `packages/email` and
  `supabase/functions/_shared` that link `client.patina.cloud/*`. iOS (`apps/mobile/Patina`) and the
  extension: any `client.patina.cloud/<old route>` literal updated (inventory §1 lists them).
- Deleted: `src/app/{today,decisions,proposals,invoices,budget,documents,orders,messages,inbox,reviews,
  scans,account,preferences,settings,demo}` trees and `src/app/projects/page.tsx` (the list) and
  `projects/[projectId]/{reviews,scope-change}`; API routes with zero callers (`feed/[roomId]`, `rooms/*` ×6,
  `timeline/*` ×8 proxies, `user/data-export`, `user/data-erase`) — the four API routes serving absorbed
  acts stay; components: `layout/{client-header,mobile-nav-drawer,nav-config,project-switcher,
  threshold-chrome-gate}`, `making/{the-making,making-masthead,project-surface-switch,
  single-pane-solo-redirect}`, the `ProjectViewWrapper` tree, `today/`, `timeline/`, `approvals/` pages'
  components, `demo/`, and every component the inventory marks dead-at-cutover once its absorb landed;
  hooks: `use-progress-analytics`, `use-immersive-timeline`, `use-notifications`, `use-touch-gestures`,
  `use-qr-auth`, the bell chain, `use-feature-flag` consumers of `single-pane`/`threshold` (the hook file
  stays for future flags); tests of everything deleted; `public/manifest.json` shortcuts (`/approvals`
  404s today) → `/`.
- Moved, not deleted: `making/{scored-action,spine-gate,spine-toll,tracking-row,standing-sentence,
  making-spine}` → `components/threshold/instruments/` (imports updated; `standing-sentence.test`
  strings preserved); `commercial/journey-stepper` stays.
- Flags: all `useFeatureFlag('threshold')` and `('single-pane')` reads removed; `NEXT_PUBLIC_FLAG_OVERRIDES`
  removed from `apps/client-portal/wrangler.jsonc`; PostHog flags `threshold` (866364) and `single-pane`
  (803059) archived by Kody (no API access from this machine).
- `next.config.js`: no redirects needed (middleware owns them); `typescript.ignoreBuildErrors` unchanged —
  the gate remains `pnpm --filter @patina/client-portal type-check`.
- Coverage floor (70/60/70/70) holds: delete untested dead API chains and `demo/` in the SAME pass as the
  suites that covered old pages.

## Waves (after the completion plan's W1 has merged)

### R1 — Deep links and middleware (one lane, Opus)
Files: `apps/client-portal/src/middleware.ts` (redirect map + `/preferences/unsubscribe` public + the
`'/projects'` sign-in destination → `/`), the edge functions and email templates listed above, iOS/extension
literals. Tests: middleware unit tests for every mapped path (with and without ids); `deno test` for touched
functions; grep proof that no `client.patina.cloud/(today|decisions|proposals|invoices|budget|documents|
orders|messages|inbox|reviews|scans|account|preferences|settings)` literal remains outside the redirect map.
Deploy at ship: `supabase functions deploy` for each touched function (a `_shared/*` edit → redeploy every
importer).

### R2 — Delete and move (two lanes, Opus; disjoint pathspecs)
- R2a routes + API + hooks + tests: delete the trees above; keep the four act-serving API routes; fix every
  import that breaks; `type-check` is the gate; jest coverage report must stay ≥ floor.
- R2b components: move the six instruments to `threshold/instruments/`; delete dead component dirs; update
  imports; delete `ProjectSurfaceSwitch` (page.tsx renders `<Threshold>` directly, server-fetching what it
  fetches today); delete `ThresholdRouteCollapse` and `ThresholdChromeGate` (no chrome remains to gate; the
  redirect map replaces the collapse); `AppChrome` reduced to the public/authenticated shell with no header.
Gate for both: `pnpm --filter @patina/client-portal type-check`, full jest with coverage, `npx eslint src`
for the touched trees, `playwright.config.ts` reduced to ONE server (the flag project and `.next-threshold`
go away), specs updated (`smoke.spec` visits only surviving routes; `threshold.spec` becomes the portal
spec).

### R3 — Docs and decisions (one lane, Sonnet)
`docs/design/the-document/DECISIONS.md` (append: the client page is The Document's homeowner face; the
5 Aug "every existing route keeps working" clause retired; header removed for all clients; multi-project
switching lives in the mat), `docs/design/the-client-page/README.md` (status: shipped, no flag),
`docs/vision/VISION-DECISIONS.md` (V8: the web client page is surface #1's client face, not a fourth
surface), `apps/client-portal/README.md` route map, `.claude/skills/patina-portal-features/SKILL.md` one
line on the client portal's single-page shape. Never quote `.claude/settings.json`.

### R4 — Integration, verification, ship (Fable + one ship lane)
Merge R1 → R2a → R2b → R3 onto the completion integration branch; full gates (DB suite, package tests,
client type-check + jest + e2e, designer type-check + jest, admin build); cross-lane adversarial review;
merge to main; ship chain (**ORDER CORRECTED 2026-09-04 — portal FIRST**): `./infra/deploy-portal.sh
client` (override removed, all `NEXT_PUBLIC_*` exported) → probes (served chunk carries no
`threshold:false`, `/today` → 308 to `/#doorstep`, `/api/version` 200, tail clean) → `supabase functions
deploy <each touched fn>` → probe a real Checkout return → designer if touched → Kody's walks as
+testwalker (solo), +thekodys (two houses) and kody@kochaver.com (composer) → Kody archives both PostHog
flags **only after a clean walk** → retire worktrees.

**Why the order flipped.** `create-checkout-session` carries its own deploy gate in a comment:
`/projects/[projectId]` on the currently-deployed worker reads no `?checkout=` at all, so every Stripe
return between "functions deployed" and "portal deployed" would show no receipt and no cancellation
notice — and Checkout sessions already minted with those URLs cannot be rewritten. The portal is
backward-compatible with the *old* function output (the anchors and params are additive); the functions
are not backward-compatible with the old portal. So the portal ships first.

## Risks
- Deleting routes that email/cron still link → R1 lands before R2, with the grep proof.
- Stripe return URLs: `create-checkout-session` return/cancel URLs must resolve to a page that reads
  `?checkout=` and shows the receipt in the letterbox (completion L2 owns the reader; R1 owns the URL).
- iOS: `get_client_project_selections` untouched (already true); any `client.patina.cloud` route literal in
  Swift updated and the app re-checked by Kody (TestFlight R1 in flight).
- Coverage floor: delete untested dead chains with the suites; verify with `test:coverage` before merge.
- No flag = big-bang cutover for real homeowners: ship at a quiet hour with the rollback ids recorded;
  Kody walks within minutes; rollback = `wrangler rollback <prev id>` for the client portal (functions:
  redeploy prior versions).
- **Rollback is NOT portal-only — this is the sharp edge (2026-09-04 review §6).** Edge functions do not
  roll back with the worker. Once `create-checkout-session`, `stripe-webhook`, `notification-digest`,
  `comms-notification-dispatch`, `review-requests`, `comms-mute` and `commercial-document-notify` are
  deployed they emit `/projects/<id>?invoice=…&checkout=success#letterbox`, `…#road`,
  `…#approval-<id>`, `/#mat`. On a rolled-back worker `/projects/<id>` renders the old flag-gated
  dashboard, which reads none of it: **every Stripe return after a portal-only rollback shows no receipt
  and no cancellation notice.** Rolling the portal back REQUIRES redeploying the prior versions of those
  seven functions in the same minute.
- **Cached folds outlive a rollback by up to an hour.** Every retired path is answered 308 +
  `private, max-age=3600`, so a browser that already followed one keeps folding without asking the origin.
  On the rolled-back worker `/` is the old bare redirect to `/projects`, so those clients land on the
  project list instead of what they asked for — degraded, self-clearing, bounded by the explicit ceiling.
- **Archiving the PostHog flags is one-way in practice.** Archive `threshold`/`single-pane` and the old
  worker fails closed to the pre-flag dashboard, so the rollback target is no longer the surface anyone
  was on. Archive only after a clean walk.
- **Not reversible at all:** digest mail already sent, and Checkout sessions already minted with the new
  return URLs.
