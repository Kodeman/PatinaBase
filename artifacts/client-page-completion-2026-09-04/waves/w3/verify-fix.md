# W3 — Fix-round verification: `client-page-2/integration`

Fresh context, read-only. No edits, no DB touched, nothing committed.

- Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-int`
- Branch `client-page-2/integration` @ `98e36a9eb`; verified diff `feb3ec078...98e36a9eb`
  (70 files / +2 454 / −979), of which `98e36a9eb` *"fix(client): cross-lane review fixes before
  cutover"* is the fix round under review.
- Read: `waves/w2/review-integration.md` (findings + its appended **Fix round** section), the
  changed source, the RPCs behind the approvals read (00463/00465/00467), and the tests added.
- Line references are `file:line` at `98e36a9eb`, paths relative to the worktree root.

---

## Gates

| Gate | Result |
| --- | --- |
| `pnpm --dir apps/client-portal type-check` | **PASS** — `tsc --noEmit`, exit 0, no output |
| `pnpm --dir apps/client-portal test -- threshold making middleware` | **PASS** — 1055/1055 across the matching suites, exit 0 |

Not run here (out of the brief, and not driveable in this sandbox): the full jest run, the
Playwright suite, `deno check`, and any live render against a seed.

---

## Verdict per prior finding

### BLOCKER 1 — approvals absorb 403s for every homeowner → **FIXED**

`project-surface-switch.tsx:45` now reads `useMyProjectApprovalReviews()` and filters to this
house at `:49` (`review.projectId === projectId`). `useProjectApprovals` /
`get_project_decision_reviews` no longer appears anywhere in the client portal's live path — the
only remaining references are the hook's own definition
(`packages/supabase/src/hooks/use-project-approvals.ts:374-390`) and its package test. The other
caller of the safe read on the same page load (`components/layout/app-chrome.tsx:4`) shares the
query key `projectApprovalKeys.mine()`, so the two dedupe into one request.

I verified the RPC is genuinely client-safe rather than taking the fix round's word for it:

- `list_my_project_decision_reviews` (`supabase/migrations/00467_stage2_client_access_repair.sql:135-176`)
  admits `snapshot.decision_lead_id = auth.uid()` as well as a studio co-member, and returns `[]`
  — never an exception — for a caller who is neither.
- The decision lead **is** the homeowner: `00463_project_approval_authority_evidence.sql:1016-1019`
  refuses any assignment where `p_decision_lead_id IS DISTINCT FROM v_project.client_id`
  (*"decision lead must be the exact project client"*).
- The inner `get_project_decision_reviews` it calls per project also admits the lead
  (`00465_project_approval_notification_traceability.sql:398-408`) and filters row-by-row on
  `(v_is_studio OR snapshot.decision_lead_id = v_actor)` (`00465:510`), so no other client's
  decision can ride in on the caller-global list.
- The original 403 was real and common: a house with **no** Stage-2 authority snapshot at all
  raised `insufficient_privilege`, which is every house before its first project approval.

The error branch was kept rather than deleted (a deliberate deviation the fix round states), but
restyled to `--text-body` and reworded — `threshold.tsx:894-903`. No red there. Acts still
invalidate the list: `useConfirmProjectApprovalReview`/`useRespondProjectApproval`
(`approval-ask.tsx:512-513`) go through `approvalMutation` →
`invalidateProjectApprovalQueries`, whose key set includes `projectApprovalKeys.mine()`
(`use-project-approvals.ts:~146`).

Covered by two new tests (`making/__tests__/project-surface-switch.test.tsx`): *"owns one
canonical project approval query — the caller-global read"* and *"hands the house only the
approvals filed against it"*.

### BLOCKER 2 — `/projects/<id>/reviews/<editionId>` loses the edition id → **FIXED**

`retired-routes.ts:163-171` returns `params: { review: editionId }` when the fourth segment is a
plain id, and `middleware.ts:283-303` merges `retired.params` onto the target before the hash. The
consumer is live: `SelectionEditionAsk` is mounted at `threshold.tsx:912` and reads the param once
per mount at `review-ask.tsx:404,409-412`, striking it only after the bundle actually arrives
(`review-ask.tsx:441-450`). `/projects/<id>/reviews` (no edition) correctly carries no param.

Asserted in `src/__tests__/middleware.test.ts:453-462` — both the present and the absent case.

The old route file `app/projects/[projectId]/reviews/[editionId]/page.tsx` still exists but can no
longer execute (the 308 fires first); it is R2's deletion.

### MAJOR 3 — a failed read shown as an empty fact → **FIXED (with a residual, see N4)**

- Rooms: `threshold.tsx:397` `roomsUnread = roomsQuery.isError`; the ground floor is gated on
  `model.groundFloor && !roomsUnread` (`:966`), and the plan-key slot prints *"Couldn't load your
  rooms. Please refresh."* instead (`:1008-1016`). A failed `project_rooms` read can no longer
  render as "this house has no rooms".
- Orders: `:783-784` `ordersSettled = !isPending && !isError`; the road renders on
  `ordersUnread` (`:788`) and `the-road.tsx:153-168` prints the failure line and suppresses
  *"Nothing on the road."*.

Two new tests in `threshold/__tests__/threshold.test.tsx` cover exactly these two sentences.

### MAJOR 4 — house-less client stranded under a dead header → **FIXED**

`threshold-chrome-gate.tsx:33` drops the header on `/` and `/projects/<id>` unconditionally;
`hasHouse` is gone from the props and from `app-chrome.tsx:82`. `ProjectsEmptyState` carries the
mat's two acts on **both** branches (`ProjectsEmptyState.tsx:95` CMS branch, `:116` fallback) —
*Your details* opening `DetailsSheet` and *Leave the house* calling `signOut`
(`:37-66`) — and the dead `/messages` link is gone. `DetailsSheet` takes only `{open, onClose}`
(`details-sheet.tsx:41-44`) and every hook it uses is caller-scoped (profile, notification
preferences, thread overrides), so it works with no project. The gate test was inverted to assert
the new behaviour (`layout/__tests__/threshold-chrome-gate.test.tsx:68-76`).

### MAJOR 5 — instrument mail landing in the wrong house → **FIXED**

`retired-routes.ts:110` sets `?proposal=<id>` on `/proposals/<id>[/sign]` and `:121` keeps
`?invoice=<id>`; `app/page.tsx:35-40` resolves the instrument's own house **before** the
active-house clocks. `resolveHouseForInstrument` (`lib/data/active-project.ts:81-124`) is sound:

- returns `null` for a single-house client (the active house is already the right one) and for
  fixtures;
- the invoice read is double-scoped — `.eq('id', invoiceId).in('project_id', projectIds)` — so
  another client's row cannot resolve;
- the proposal leg uses `list_client_proposals()`, whose projection emits `project_id` in
  snake_case (`00422_authorized_schedule_phase1.sql:2305-2306`), which is the field the code reads;
- anything that resolves to nothing, or outside her own list, returns `null` and the active house
  stands.

Covered by `app/__tests__/page.test.tsx:145-176` (instrument house wins; active house is not even
consulted).

Residual, inside the finding's own scope: the **house** is now right, but `/proposals/<id>` still
does not name **which** proposal at the door — see N5.

---

## New defects introduced or left standing by the fix round

### N1 · The fold's 308 is marked shared-cacheable while carrying session cookies. (MAJOR · confidence: high)

`middleware.ts:302` sets `Cache-Control: max-age=3600` on the folded redirect. That response was
just built by `redirectWithCookies` (`:184-202`), which copies **every** cookie the Supabase
middleware client wrote onto `res` — including a refreshed `sb-*-auth-token` (`:87-88`,
`createMiddlewareClient(req, res)`). `max-age` with no `private` licenses a shared cache to store
a `Set-Cookie`-bearing response; a proxy that keys only on the URL could hand one client's
refreshed session cookie to the next visitor of `/invoices/<id>`.

This portal's own convention says so at `middleware.ts:149`, which uses
`private, no-store, max-age=0` for exactly this reason on the plans surface.

Secondary, benign: a signed-out visitor served a cached fold lands on `/` and is bounced to
sign-in with a bare callback, losing the anchor the mail was sent for.

**Fix:** `folded.headers.set('Cache-Control', 'private, max-age=3600')`, and assert `private` in
`middleware.test.ts:450`.

### N2 · Sixteen `--color-error` sites remain on the surface being cut over — against the ruling. (MAJOR · confidence: certain)

Finding 9 was **rejected** by the fix round and carried to the ship lane as an open design
question. Kody's 2026-09-04 rulings close it: *failure/refusal notices are set in body ink with a
hairline — never `var(--color-error)` or any red/green (VISION §6)*. It is now a requirement, not
a question, and these are live on the client page:

`instrument-reading.tsx:46` · `correspondence.tsx:29` · `scope-change-ask.tsx:376,655,779` ·
`wall-gate.tsx:286` · `door-acts.tsx:422` · `door-gate.tsx:553` ·
`approval-ask.tsx:318,377,729,815` · `details-sheet.tsx:393,447,827` · `review-ask.tsx:237`
(plus `making/the-making.tsx:500`, which `ProjectSurfaceSwitch` no longer renders — R2's).

Only the one site finding 1 named was converted (`threshold.tsx:900`). The change is mechanical —
`--color-error` → `--text-body` on a hairline, the pattern `threshold.tsx:894-903` and
`papers-sheet.tsx:285-315` already use.

### N3 · The named letter bypasses the rollup that decides which invoices a client may see. (MEDIUM · confidence: high)

`letterbox.tsx:128-130` resolves `?invoice=` against the **raw** row list handed down at
`threshold.tsx:770` (`invoicesQuery.data ?? []`), not against `visibleInvoices` — the Budget
rollup that owns "drafts are pre-issue, voids are cancelled" and that the model itself goes
through (`derive.ts:26,472-475`). A `?invoice=<draftId|voidId>` therefore stands a document the
studio has not issued, or has cancelled, in the slot as the client's letter.

The act is safe (`settlement.tsx:164` disables settle at `balanceCents <= 0`), and a paid receipt
link from `stripe-webhook` merely displaces the owed letter until reload — but the draft/void case
is the rollup's whole reason for existing.

**Fix:** look the named id up in `visibleInvoices(invoices)` rather than `invoices`.

### N4 · A failed rooms read still silently deletes two ledger rows. (MEDIUM · confidence: high)

Finding 3's fix stops the *ground floor*, but the ledger is one level down and unguarded:
`derive.ts:496-497` computes `plannedCents: planTotal ?? roomTargetTotal` and
`agreedCents: liveAuthorized ?? (bandsAgreed > 0 ? bandsAgreed : null)` — both fed by
`input.rooms`, which is `[]` on a failed read. So *"of $X planned"* and the agreed row vanish
because a read failed, in the same house that has just been told its rooms could not be read.
Same class as finding 3, one level down; a house that says it could not see should not also
quietly restate its money.

### N5 · `?proposal=` names nothing at the door and is never struck. (LOW · confidence: certain)

The fold sets it (`retired-routes.ts:110`) and only the server house-resolution reads it
(`page.tsx:35-39`). Unlike `?invoice=` (`checkout-return.ts:71-75`) it is never removed from the
address, so `/` keeps it for the rest of the session and in any bookmarked or shared copy of the
URL — pinning that client's front door to that house. And the door still shows whatever that
house has pending rather than the proposal the mail was about, which is the half of finding 5 the
fix explicitly did not take.

### N6 · The (d) fix has no test. (LOW · confidence: certain)

There is no suite for `ProjectsEmptyState`; nothing asserts that `EmptyStateActs` renders, that
*Your details* opens the sheet, or that *Leave the house* signs out. The gate test only asserts
the header is now absent. This is the only route to her own details for a house-less client.

### N7 · Stale comment: the flag is gone. (LOW · confidence: certain)

`review-ask.tsx:397-399` still explains itself with *"Threshold itself renders only once
`ProjectSurfaceSwitch`'s flag read resolves"*. No flag is read anywhere in the portal any more
(the fix round deleted the last caller).

### N8 · Two dead route files still mounted. (LOW · confidence: certain)

`app/projects/page.tsx:38` (renders `ProjectsEmptyState`) and
`app/projects/[projectId]/reviews/[editionId]/page.tsx` can no longer execute — the middleware
folds both paths first. Harmless, R2's to delete; noting them because the fix round deleted the
other dead map and these were not swept with it.

---

## Also checked, clean

- **No studio-scoped RPC left in the page's path.** Every `@patina/supabase` hook reachable from
  `Threshold` and `ProjectSurfaceSwitch` was enumerated; the approvals read is the only one the
  fix round changed, and `get_project_decision_reviews` has no live caller in
  `apps/client-portal/src`.
- **Unfiled asks, orders and captures now stand in exactly one house.** `standsUnfiledAsks`
  (`threshold.tsx:763`) is computed once, above the road block, and fed to `toRoadOrders`/
  `toClosedOrders` (`:785-786`), `StudioReviewAsk` (`:911`), `SubmittedReviewsPrevious` (`:849`)
  and `StrayCaptures` (`:1042`). The filter shape is the same in all three modules
  (`road-orders.ts:76-78,109-111`, `room-capture.tsx:151-156`).
- **Raw error strings.** `refusalSentence` (`lib/threshold/refusal.ts`) is applied at
  `settlement.tsx:146`, `road-orders.tsx:91`, `payment-method-chooser.tsx:107` and
  `wall-gate.tsx:169`; the two enumerated `InvoiceCheckoutError` codes keep their own copy. No
  `err.message` reaches the page as content.
- **Papers-sheet voice.** Three sentences now third-person (`papers-sheet.tsx:294,304,313`).
- **Hold ceiling.** `useHoldCeiling` (`hooks/use-hold-ceiling.ts`) arms only while holding, clears
  and resets on the way out, and its sentence sits outside the `aria-hidden` spacer
  (`threshold.tsx:950-958`). It states no fact about the house, so nothing is taken back.
- **`?invoice=` is struck with `history.replaceState`** (`checkout-return.ts:71`), not
  `router.replace` — so consuming it cannot trigger an RSC re-render that would re-resolve the
  house without the param.
- **Fold ordering.** `/api/*` returns at `middleware.ts:179`, well before the fold at `:283`; the
  fold sits after the sign-in gate, so an unauthenticated visitor keeps her anchor through
  sign-in; `/projects/<id>` maps to `null` (no loop); ids are still `^[A-Za-z0-9_-]+$`-validated
  before reaching a `Location` header (`retired-routes.ts:65`).
- **Deleted dead code.** `route-collapse.ts`, `threshold-route-collapse.tsx`,
  `single-pane-solo-redirect.tsx` and their three suites are gone, and the mount is out of
  `app/layout.tsx`. Type-check passes, so nothing still imports them.

---

## Verdict

**SHIP WITH FIXES.** All five reviewed defects — both blockers and all three majors — are
genuinely fixed in the diff, verified at the source and, for the approvals blocker, down to the
migration that authorizes the read; both named gates pass (type-check exit 0; 1055/1055 on the
threshold/making/middleware suites). Nothing the fix round introduced is a blocker. Two things
should land before the cutover, and both are small: the fold's `Cache-Control` needs `private`
(N1 — it currently marks a session-cookie-bearing 308 as shared-cacheable), and the sixteen
`--color-error` sites (N2) are no longer a deferred design question but a violation of the
2026-09-04 ruling, on the surface every client is about to be moved onto. N3 (the named letter
bypassing `visibleInvoices`) and N4 (the ledger's rows vanishing on a failed rooms read) belong in
the same pass; N5–N8 are follow-ups.
