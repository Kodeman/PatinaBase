# R2a — routes, API, hooks, tests

**Worktree** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-r2a`
**Branch** `client-page-2/r2a` (from `origin/client-page-2/integration` @ `98e36a9eb`)
**Commit** `923c0e935 chore(client): retire old portal — routes, api, hooks, tests`
**Pushed** yes — `* [new branch] client-page-2/r2a -> client-page-2/r2a`
**Diff** 124 files changed, 129 insertions(+), 22,678 deletions(-) — 122 deletions, 2 edits

---

## 1. Gate output

### `pnpm --dir <wt>/apps/client-portal type-check`
```
> @patina/client-portal@0.1.0 type-check
> tsc --noEmit
```
**Clean.** (Zero output, exit 0.) Bootstrapped first with `pnpm install` +
`pnpm turbo build --filter=@patina/client-portal^...` — without the workspace dists
`tsc` reports ~60 spurious `TS2307: Cannot find module '@patina/types'` in
`packages/*`, which is a missing-build artefact, not a code error.

### `pnpm --dir <wt>/apps/client-portal test:coverage`
```
All files                    |   68.31 |    61.34 |   68.01 |   70.19 |
Jest: "global" coverage threshold for statements (70%) not met: 68.31%
Jest: "global" coverage threshold for functions  (70%) not met: 68.01%

Test Suites: 1 failed, 131 passed, 132 total
Tests:       1 failed, 1677 passed, 1678 total
```

**Coverage against the 70/60/70/70 floor, honestly:**

| | statements | branches | functions | lines |
|---|---|---|---|---|
| floor | 70 | 60 | 70 | 70 |
| **this branch** | **68.31** ✗ | **61.34** ✓ | **68.01** ✗ | **70.19** ✓ |
| projected after R2b | 72.47 ✓ | 66.80 ✓ | 72.76 ✓ | 74.71 ✓ |

Branches and lines now clear the floor. Statements and functions are ~1.7 points
short, and the whole shortfall is the dead **component** trees R2b owns — they are
still on disk here at or near 0%: `components/today` 0%, `components/decisions` 0%,
`components/messages` 0%, `components/proposals` 0%, `components/scans` 4.4%,
`components/account` 13.2%, `components/reviews` 32.8%, `components/layout` 56.3%.

The projection is not a guess: it is computed from **this same run's**
`coverage/coverage-summary.json` per-file totals, summing every file except the 53
component files the inventory marks dead-at-cutover (the layout chrome five,
`making/{the-making,making-masthead,single-pane-solo-redirect}`, the project-view
leaf components, `project/*`, the three dead `commercial/*`, `decisions/*`,
`messages/*`, `reviews/*`, `proposals/*`, `account/*`, `approvals/*`, `today/*`,
`scans/*` except `ViewerErrorBoundary.tsx`, `notification-bell.tsx`,
`error-fallback.tsx`, `decision-card-client.tsx`,
`commercial-notification-recovery.tsx`). Covered/total counts:
statements 5444/7512, branches 3763/5633, functions 1242/1707, lines 4963/6643.

**The one failing test is pre-existing and untouched by this lane:**
```
FAIL src/lib/__tests__/portal-access.test.ts
  ● foreignPortalFromDomain › returns null for manufacturer ... and unknown values
    expect(received).toBeNull()
    Received: {"label": "the Patina maker workspace", "url": "https://manufacturer.patina.cloud"}
    at src/lib/__tests__/portal-access.test.ts:122:53
```
`src/lib/portal-access.ts:180-181` returns a manufacturer portal; the test still
says there is none. Both files show clean in `git status` for this commit — the
suite imports only `../portal-access`, so nothing here can reach it. **Left for R4
or whichever lane owns `portal-access.ts`** rather than fixed from this lane.

### `npx eslint src`
```
✖ 68 problems (14 errors, 54 warnings)
```
14 errors, **none in a file this commit touches**, and none introduced here:

| file:line | rule |
|---|---|
| `src/app/auth/invite/[token]/page.tsx:111` | react-hooks/purity |
| `src/app/auth/verify-otp/page.tsx:131` ×2 | react-hooks/refs |
| `src/app/field/[token]/site-request-guest.tsx:609` | react-hooks/set-state-in-effect |
| `src/app/quiz/results/results-view.tsx:348` | react-hooks/set-state-in-effect |
| `src/components/auth/ClientPortalLogin.tsx:120` | react-hooks/set-state-in-effect |
| `src/components/proposal-document.tsx:109` | react-hooks/preserve-manual-memoization |
| `src/hooks/use-aesthete-matches.ts:84` | react-hooks/refs |
| `src/hooks/use-feature-flag.ts:144` | react-hooks/set-state-in-effect |
| `src/hooks/use-hydrated.ts:23` | react-hooks/set-state-in-effect |
| `src/components/__tests__/ffe-safe-reader.test.tsx:7` | react/display-name |
| `src/components/notifications/notification-bell.tsx:241` | react-hooks/immutability |
| `src/components/project/__tests__/ProjectReviewEdition.test.tsx:6` | react/display-name |
| `src/components/commercial-notification-recovery.tsx:31` | react-hooks/set-state-in-effect |

The last four go with R2b's component deletions; the other ten live in surviving
code and predate this lane.

---

## 2. KEPT because an external caller exists

Every deletion candidate was grepped across `apps/`, `packages/`,
`supabase/functions`, `services/`, `apps/mobile`, `apps/extension` before removal.
These survived that grep:

| Kept | Caller found |
|---|---|
| `src/app/api/stories/today/route.ts` | **iOS** — `apps/mobile/Patina/Patina/Services/Analytics/DailyRoomAPI.swift:8`. Its only web caller (`components/today/TodayPage.tsx`) dies with `/today`, but the endpoint is an iOS contract. |
| `src/app/api/interactions/batch/route.ts` | **iOS** — `DailyRoomAPI.swift:34`, `DailyRoomBatchQueue.swift:8,25`, `DailyRoomTelemetry.swift:7`, `TelemetryQueueBoundsTests.swift:9` (the Swift comments still say the deploy is owed). |
| `src/app/api/inbox/mark-read/route.ts` | **the absorbed note** — `src/hooks/use-project-correspondence.ts:187` (+ its test at `:287`). Would otherwise have died with `/inbox` and the bell. |
| `src/app/api/unsubscribe/route.ts` | `supabase/functions/campaign-dispatch/index.ts:413`, `supabase/functions/_shared/send-email.ts:160`, `packages/email/src/send.ts:234`. |
| `src/app/api/version/route.ts` | deploy-verification convention; `apps/admin-portal/src/app/api/admin/system/versions/route.ts:44,51` probes it. |
| `src/app/api/proposals/[id]/{sign,decline,notifications/replay}`, `api/trade-scopes/[id]/accept`, `api/projects/[id]/budget-checkpoints/[id]/acknowledge`, `api/auth/invite/accept` | the acts the Threshold performs in place (`door-gate.tsx`, `wall-gate.tsx`, `door-acts.tsx`, `hooks/use-commercial-client.ts`, `AcceptInviteForm.tsx`). |
| `src/app/invoices/[invoiceId]/print/page.tsx` | a document, not a surface. `retired-routes.ts` deliberately does not map it, and it imports nothing from the deleted invoice detail. |
| `src/app/preferences/unsubscribe/page.tsx` | public outcome page for `GET /api/unsubscribe`; R1 made it public in the middleware. |
| `src/app/budget/rollup.ts` (+ its test) | **not dead** — `components/threshold/earlier-invoices.tsx:10` and `lib/threshold/derive.ts:26` import `visibleInvoices` / `computeInvoiceRollup`. Only `budget/page.tsx` went. |
| `src/hooks/use-documents-client.ts` | `components/threshold/papers-sheet.tsx:18`, `lib/threshold/papers.ts:7`. |
| `src/hooks/use-feature-flag.ts` | kept per brief for future flags (no `threshold`/`single-pane` reader remains). |
| `src/hooks/use-aesthete-matches.ts` | `app/quiz/results/results-view.tsx` — the pre-auth funnel. |
| `src/components/projects/ProjectsEmptyState.tsx` | **⚠ inventory says DEAD; it is not.** `src/app/page.tsx:2` renders it when a client opens no house. R2b must keep it. |

### Deleted API routes — the grep that justified each

| Deleted | Grep result |
|---|---|
| `api/feed/[roomId]` | only `components/today/RoomFeedSection.tsx:38` (dying). iOS calls it "the dead `/api/feed/:roomId` portal route" in `DailyRoomFeedMappingTests.swift:6` and has moved to `get_recommendations`. |
| `api/rooms/*` (6) | zero callers anywhere. The only mention is a historical note in `00288_legacy_pending_leads_reconcile.sql:5`. Nothing in `apps/mobile` references `/api/rooms`. |
| `api/projects/[id]/timeline/*` (8 + its `retained-proxies.test.ts`) | only `hooks/use-progress-analytics.ts` (zero importers) and `hooks/use-immersive-timeline.ts` (reached only through the dead `timeline/celebration-overlay` chain). The `retained-proxies` test is a 2026 hardening pass (`54eb6dea3`), not a retirement decision. |
| `api/user/data-export`, `api/user/data-erase` | zero callers; `lib/gdpr.ts` was their only dependency and went with them. The designer and admin portals keep their own GDPR routes. |
| `api/preferences/apply-token` | client caller was `app/preferences/page.tsx:108` only. `packages/notifications/src/tokens.ts:103-108` already documents that a one-click preference token must target a portal that still SERVES `/preferences`; the designer portal keeps its copy at `apps/designer-portal/src/app/api/preferences/apply-token`. |
| `api/user/preferences` | client caller was `app/settings/notifications/page.tsx:57,63` only. Preferences are absorbed by `components/threshold/details-sheet.tsx`, which reads `useNotificationPreferences`/`useUpdateNotificationPreferences` from `@patina/supabase` (RPC), not this route. Designer portal keeps its own. |

---

## 3. Every deleted path (122)

### Pages — `src/app`
```
src/app/account/page.tsx
src/app/budget/page.tsx
src/app/budget/__tests__/page.test.tsx
src/app/decisions/page.tsx
src/app/decisions/page.test.tsx
src/app/decisions/[id]/page.tsx
src/app/decisions/[id]/page.test.tsx
src/app/decisions/[id]/decision-realtime.test.tsx
src/app/demo/approval-flow/page.tsx
src/app/demo/timeline/page.tsx
src/app/demo/timeline-3d/page.tsx
src/app/documents/page.tsx
src/app/documents/group.ts
src/app/documents/__tests__/page.test.tsx
src/app/documents/__tests__/group.test.ts
src/app/inbox/page.tsx
src/app/invoices/page.tsx
src/app/invoices/__tests__/page.test.tsx
src/app/invoices/[invoiceId]/page.tsx
src/app/invoices/[invoiceId]/checkout-return.ts
src/app/invoices/[invoiceId]/payment-method-chooser.tsx
src/app/invoices/[invoiceId]/__tests__/checkout-return.test.ts
src/app/invoices/[invoiceId]/__tests__/payment-method-chooser.test.tsx
src/app/messages/page.tsx
src/app/orders/page.tsx
src/app/preferences/page.tsx
src/app/preferences/__tests__/page.test.tsx
src/app/projects/page.tsx
src/app/projects/error.tsx
src/app/projects/loading.tsx
src/app/projects/[projectId]/actions.ts
src/app/projects/[projectId]/reviews/[editionId]/page.tsx
src/app/projects/[projectId]/reviews/[editionId]/__tests__/page.test.tsx
src/app/projects/[projectId]/scope-change/new/page.tsx
src/app/projects/[projectId]/scope-change/new/__tests__/page.test.tsx
src/app/projects/[projectId]/scope-change/[changeId]/page.tsx
src/app/projects/[projectId]/scope-change/[changeId]/__tests__/page.test.tsx
src/app/proposals/page.tsx
src/app/proposals/error.tsx
src/app/proposals/__tests__/page.test.tsx
src/app/proposals/__tests__/error.test.tsx
src/app/proposals/[id]/page.tsx
src/app/proposals/[id]/__tests__/page.test.tsx
src/app/proposals/[id]/sign/page.tsx
src/app/reviews/page.tsx
src/app/scans/page.tsx
src/app/scans/[scanId]/page.tsx
src/app/settings/notifications/page.tsx
src/app/settings/notifications/__tests__/page.test.tsx
src/app/today/page.tsx
```
Notes: `invoices/[invoiceId]/checkout-return.ts` and `payment-method-chooser.tsx`
were superseded in place by `lib/threshold/checkout-return.ts` and
`components/threshold/payment-method-chooser.tsx`. `projects/{error,loading}.tsx`
belonged to the retired list (their copy reads "Unable to load projects" / a list
skeleton); `projects/[projectId]/` carries its own `error.tsx` and `loading.tsx`.
`projects/[projectId]/actions.ts` (`postMessageAction`, `logEngagementAction`) had
no importer left outside `components/timeline/*`.

### API — `src/app/api`
```
src/app/api/feed/[roomId]/route.ts
src/app/api/rooms/route.ts
src/app/api/rooms/[id]/route.ts
src/app/api/rooms/[id]/items/route.ts
src/app/api/rooms/[id]/items/[itemId]/route.ts
src/app/api/rooms/[id]/scans/route.ts
src/app/api/rooms/[id]/timeline/route.ts
src/app/api/projects/[projectId]/timeline/immersive/route.ts
src/app/api/projects/[projectId]/timeline/celebrations/route.ts
src/app/api/projects/[projectId]/timeline/celebrations/[milestoneId]/route.ts
src/app/api/projects/[projectId]/timeline/segment/[segmentId]/media/route.ts
src/app/api/projects/[projectId]/timeline/segment/[segmentId]/media/opened/route.ts
src/app/api/projects/[projectId]/timeline/analytics/summary/route.ts
src/app/api/projects/[projectId]/timeline/analytics/health/route.ts
src/app/api/projects/[projectId]/timeline/analytics/view/route.ts
src/app/api/projects/[projectId]/timeline/__tests__/retained-proxies.test.ts
src/app/api/user/data-export/route.ts
src/app/api/user/data-erase/route.ts
src/app/api/user/preferences/route.ts
src/app/api/preferences/apply-token/route.ts
```

### Hooks — `src/hooks`
```
src/hooks/use-decisions-client.ts
src/hooks/use-immersive-timeline.ts
src/hooks/use-notifications.ts
src/hooks/use-progress-analytics.ts
src/hooks/use-project-phase-realtime.ts
src/hooks/use-qr-auth.ts
src/hooks/use-touch-gestures.ts
src/hooks/__tests__/use-immersive-timeline.test.tsx
src/hooks/__tests__/use-notifications.test.tsx
src/hooks/__tests__/use-project-phase-realtime.test.tsx
```
Surviving hooks: `use-auth`, `use-hydrated`, `use-commercial-client`,
`use-proposals-client`, `use-documents-client`, `use-feature-flag`,
`use-aesthete-matches`, `use-hold-ceiling`, `use-my-designers`,
`use-project-correspondence`.

### Lib and test scaffolding — `src/lib`, `src/test-utils`
```
src/lib/gdpr.ts
src/lib/websocket/index.ts
src/lib/websocket/websocket-context.tsx
src/lib/websocket/websocket-service.ts
src/lib/data/__tests__/orders.test.ts
src/lib/threshold/__tests__/papers-copy.test.ts
src/test-utils/index.ts
src/test-utils/factories/index.ts
src/test-utils/factories/notification.factory.ts
src/test-utils/factories/timeline.factory.ts
src/test-utils/msw/index.ts
src/test-utils/msw/setup.ts
src/test-utils/msw/handlers/index.ts
src/test-utils/msw/handlers/notification.handlers.ts
src/test-utils/msw/handlers/timeline.handlers.ts
```
- `lib/data/__tests__/orders.test.ts` imported `../orders`, **a module deleted
  upstream in `4b9a0914d chore(client-portal): remove vestigial cart/checkout
  stack`** — the suite could not have run since. Pre-existing rot, removed here.
- `src/test-utils/**` had zero importers anywhere in `src`, and `msw` is not a
  dependency of this workspace — nine files that could never have resolved, all
  counted at 0% against the coverage floor.
- `lib/threshold/__tests__/papers-copy.test.ts` says in its own header: *"The
  retirement plan deletes these sources; it deletes this guard with them."* It read
  `app/documents/page.tsx` and three `components/scans/*` files off disk. Removed —
  and `app/documents/group.ts` with it, since that guard was its only importer.

### e2e — `tests/`, `e2e/`
```
tests/e2e/account.spec.ts
tests/e2e/approvals.spec.ts
tests/e2e/project-timeline.spec.ts
tests/e2e/projects.spec.ts
tests/e2e/timeline-3d.spec.ts
tests/e2e/timeline-3d-centering.spec.ts
tests/gate-ceremony.spec.ts
tests/wp3-screenshots.spec.ts
tests/helpers/workflow-gate-fixture.ts
tests/plan-set.spec.ts
tests/projects-load.spec.ts
tests/wave2-screenshots.spec.ts
e2e/timeline-animations.spec.ts
```
Why each:
- `tests/e2e/{account,approvals,project-timeline,projects}` — all four sign in as
  `client@test.patina.local` (**a login that does not exist**) and drive `/account`,
  `/approvals` (never a route in `src/app` at all), `/projects` and
  `/projects?status=cancelled`. Rot.
- `tests/e2e/timeline-3d*.spec.ts`, `e2e/timeline-animations.spec.ts` — drive
  `/demo/timeline-3d` and `/projects/test-project`.
- `tests/gate-ceremony.spec.ts`, `tests/wp3-screenshots.spec.ts` — both `goto`
  `/decisions/<id>`, which now 308s to `/#doorstep`. Their shared
  `tests/helpers/workflow-gate-fixture.ts` had no other user, so it went too.
- `tests/plan-set.spec.ts` — `goto('/documents')`, retired to `#mat-papers`.
- `tests/projects-load.spec.ts` — four visits to `/projects`, asserting project
  cards and a "Your projects" heading. The list is gone; `threshold.spec.ts`
  already asserts the `/projects` → `/` fold.
- `tests/wave2-screenshots.spec.ts` — **deleted whole, not trimmed.** Half of it
  photographed `/proposals/<id>`'s per-line verdict chips (route retired, per-line
  proposal feedback retired outright by ruling); the surviving half shot
  `/share/<token>`, which `tests/share-link.spec.ts` already walks. It also carried
  a committed Supabase service-role demo JWT, so editing it tripped the
  `scripts/hooks/core.mjs:604` pre-commit secret scan — deleting it was both the
  correct call and the one that clears the hook.

### Components — the dead-importer closure (overlaps R2b, see §5)
```
src/components/auth/QRLoginDisplay.tsx
src/components/notifications/index.ts
src/components/project-overview.tsx
src/components/__tests__/project-overview.test.tsx
src/components/project-view-wrapper.tsx
src/components/__tests__/project-view-wrapper.test.tsx
src/components/timeline/index.ts
src/components/timeline/celebration-overlay.tsx
src/components/timeline/enhanced-timeline.tsx
src/components/timeline/milestone-card.tsx
src/components/timeline/mobile-timeline-wrapper.tsx
src/components/timeline/project-timeline.tsx
src/components/timeline/__tests__/celebration-overlay.test.tsx
src/components/timeline/__tests__/enhanced-timeline.test.tsx
```

---

## 4. Files edited (2)

- **`tests/smoke.spec.ts`** — was a 404-tolerant sweep over twelve paths, nine of
  which (`/dashboard`, `/timeline`, `/notifications`, `/profile`, `/settings`,
  `/projects`, `/project/<id>`, `/project/<id>/milestone/<id>`,
  `/project/<id>/approval/<id>`) either never existed in `src/app` or are now
  retired. Trimmed to the three it can still reach — `/`, `/auth/signin`,
  `/auth/error` — with the twelve copy-pasted bodies folded into one helper.
- **`src/components/threshold/__tests__/consent-copy.test.ts`** — read
  `app/proposals/[id]/sign/page.tsx` off disk to hold `consent-copy.ts` to the
  ceremony's wording. That page is deleted, and the consent line, act label,
  summary and signature notice are now rendered by `door-gate.tsx` **from
  `consent-copy.ts` itself** — there is no second copy left to drift from, and the
  strings do not appear in the sign route. The `SIGN_PAGE` reads are replaced by a
  presence check; the two guards that still have a subject on disk — the sign
  route's refusal tokens and the portal's kind labels — are untouched.

---

## 5. Handoffs — what this lane could not close

1. **R2b must delete the same 14 component files listed above.** They are the
   transitive dead-importer closure of the deleted hooks/lib, all marked DEAD or
   ALREADY DEAD in inventory §3, and this lane's `type-check` cannot pass while they
   stand. Git merges an identical deletion without a conflict; the risk is only if
   R2b *modifies* one, which the plan does not ask it to. **Remaining orphans this
   lane deliberately left to R2b:** `components/notifications/notification-bell.tsx`
   (+ its test) — its barrel is gone, but the file still compiles and is 92% covered.
2. **`components/projects/ProjectsEmptyState.tsx` must NOT be deleted.** Inventory
   §3d lists it as dead-with-`/projects`, but `src/app/page.tsx:2` renders it for a
   client with no openable house.
3. **`components/scans/ViewerErrorBoundary.tsx` must NOT be deleted** — imported by
   `components/threshold/room-capture.tsx`. The rest of `components/scans/*` is dead.
4. **`components/commercial/awaiting-signature-cards.tsx` is still read off disk**
   by `consent-copy.test.ts` (the `KIND_CARDS` drift guard). If R2b deletes it, that
   guard must move to a surviving source or be dropped in the same change.
5. **`src/app/budget/rollup.ts` and `src/app/documents/group.ts`** — `rollup.ts`
   survives under `src/app` purely because two threshold modules import it, which
   leaves a `src/app/budget/` directory that serves no route. `group.ts` was deleted.
   Someone may want `rollup.ts` moved to `lib/threshold/` at integration; that edit
   touches `components/threshold/earlier-invoices.tsx` (R2b) and was not attempted
   from this lane.
6. **`src/app/page.tsx` and `src/app/projects/[projectId]/page.tsx` still render
   `ProjectSurfaceSwitch`.** The plan gives that collapse to R2b, but both callers
   live under `src/app` (this lane's pathspec) while the component lives under
   `src/components` (R2b's). Neither pathspec covers both halves — integration
   should expect R2b to touch those two page files, or do the swap at merge.
   (`ProjectSurfaceSwitch` is already flag-free and renders `<Threshold>` directly;
   it is a one-import inline, not a rewrite.)
7. **`src/lib/__tests__/portal-access.test.ts` fails on the base commit** and still
   fails here. One stale assertion — `foreignPortalFromDomain('manufacturer')` now
   returns the maker workspace. Not fixed from this lane.
8. **`public/manifest.json` needed no edit** — its `shortcuts` array already carries
   a single `"Your project" → "/"` entry on the integration branch; the `/approvals`
   404 shortcut the inventory flagged is already gone.
9. **`src/middleware.ts` needed no edit** — R1's `retired-routes.ts` map and the
   `/preferences/unsubscribe` public-list entry already cover every route deleted
   here. Verified path by path against the deletion list.
