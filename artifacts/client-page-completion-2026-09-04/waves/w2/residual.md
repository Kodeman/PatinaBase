# W2 — Residual fixes on `client-page-2/integration`

One pass over the integrated tree at `8cd0f29c4`, against all nine W1 re-reviews
(`waves/w1/l1-rereview.md` … `l9-rereview.md`) and the four binding rulings.

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-int`
Branch: `client-page-2/integration`

---

## The four rulings, and where they landed

**SETTLE GATE.** `threshold.tsx:503-522` — a `holds(enabled, isPending)` helper now stands over
every query in the gate, because a disabled TanStack v5 query reports `status: 'pending'` for as
long as it is mounted: it never runs, so it never resolves, and reading `isPending` off one puts
the whole house behind a query that will not answer. Audited, one by one, against each hook's own
`enabled`:

| Query | `enabled` | Contributes |
|---|---|---|
| `useClientProposals` | none | `isPending` |
| `useClientSelections` | `!!projectId` | `holds(hasProject, …)` |
| `useProjectInvoices` | `!!projectId` | `holds(hasProject, …)` |
| `useProjectNotes` | `!!projectId` | `holds(hasProject, …)` |
| `useProjectRooms` | `!!projectId` | `holds(hasProject, …)` |
| `useClientPlan` | `!!projectId` | `holds(hasProject, …)` |
| `useScopeChangeRequests` | `!!projectId` | `holds(hasProject, …)` |
| `useMyPendingReviewRequests` | `!!clientUserId` | `holds(hasUser, …)` — **L6 N1** |
| `useMySubmittedReviews` | `!!clientUserId` | `holds(hasUser, …)` — **L6 N1** |
| `useClientProjectReviewBundle` | `!!editionId` | `useSelectionEditionPending()` — **L6 N2**, newly IN the gate |
| held trade bundles (`useQueries`) | `!!proposalId` | `holds(!!tradeInstrumentIds[i], …)` |
| `useProjectCorrespondence` | composed | threads (always on) · messages (guarded on `threadId`) · notices (always on) · **session loading** (L4 N3) |
| `projectApprovalsLoading` | prop | as given |

Held tests: `threshold.test.tsx` › *the settle gate — a query that cannot answer may not hold the
house* — three cases: a disabled query reporting pending forever does **not** hold; the edition
bundle does not hold with no `?review=` link; and the control, an enabled query genuinely in flight,
still does.

**MONEY COPY.** No surface prints `Paid <date>` any more — grep-clean across
`src/components/threshold` and `src/lib/threshold`. The confirmed sentence on each surface is now
its retired route's own, byte for byte, prefixed with the thing it is about:

- letterbox → `<Invoice No. N> · Payment confirmed — thank you. Your invoice has been updated.`
  (`app/invoices/[invoiceId]/page.tsx:393`) — closes **L2 N3** (unlabelled receipt over a different
  letter) and **L2 N4**'s wrong-date half at the root: there is no date to be wrong.
- road → `<piece> · Payment received — thank you! A receipt is on its way to your inbox.`
  (`app/orders/page.tsx:113`).
- Both still resolve from the row (`status === 'paid'` / balance ≤ 0), poll on the 3s/30s numbers,
  and print `Confirming payment… This usually takes a few seconds.` until it says so.
- Every open invoice keeps its own settle act, and the hold now reaches it (**L2 N2**).
- The road never prints `Nothing on the road.` above a refunded/cancelled list (**L2 N1**).

**APPROVALS.** The budget-version detail table was already carried (`approval-ask.tsx:191-224`:
Target/Low/High plus a room · category line with Low/Target/High, behind the fail-closed
id + version + `checkpoint.evidenceFingerprint === artifactChecksum` match) — it now prints to the
cent (`moneyExact`, the old page's `formatMoney`) rather than in the house's whole-dollar prose
(**L1 N8**). Closed editions — answered, withdrawn **or superseded** — stand read-only in Previously
under `ApprovalRecords`, newest first, with no revision links (**L1 N1/N3**, F5's residue). Outcome
telemetry moved onto the act that writes (**L1 N4**).

**COPY / ACTS.** No reversing copy added; every carried sentence checked against its source route;
no act leaves the page (the two `href` changes are 404/auth-error chrome, not acts).

---

## Fixed, by lane and number

### L1 — approvals (`approval-ask.tsx`, `threshold.tsx`)
- **N1** superseded/withdrawn read as their disposition: the stamp is
  `projectApprovalAttentionLabel(approval)`, which puts `Withdrawn`/`Superseded` ahead of any
  outcome. Test: *says the disposition ahead of the outcome on a superseded edition*.
- **N2** the discussion survives the visit: `ApprovalReceipt` carries a *Read the discussion* unfold
  rendering `<Discussion readOnly />` (thread readable, write field withheld). Test: *keeps the
  discussion readable, and unwritable, after the gate closed*.
- **N3** records are headed, counted, newest-first and folded past three (`ApprovalRecords`,
  `Gates closed · N`, *Read the earlier gates · N*). Two tests.
- **N4** telemetry: `OUTCOME_ACTS` splits `selectKey` (`consider_*`, on choosing) from `writeKey`
  (`approve_/question_/decline_project_approval`, on the submit that records).
- **N5** `data-never-dim` also dropped when `awaitingStudioIssue`.
- **N6** the record has an `<h3>` and `aria-labelledby`.
- **N7** the latent double-anchor shape is excluded: `records` filters out anything already in
  `asks`.
- **N8** artifact figures to the cent (above).
- **F5 residue** an edition neither actionable nor answered now stands: `records` selects on
  `outcome !== null || disposition !== 'active'`.

### L2 — money (`letterbox.tsx`, `earlier-invoices.tsx`, `road-orders.*`, `the-road.tsx`, `use-direct-orders.ts`, `threshold.tsx`)
- **N1** `TheRoad` no longer says `Nothing on the road.` when the only thing standing is a closed
  list; the mount stays, so a refunded piece keeps its home. Test in `the-road.test.tsx`.
- **N2** `EarlierInvoices` takes `heldInvoiceId` and raises `Settlement`'s `hold` on the matching
  line. Test in `earlier-invoices.test.tsx`.
- **N3** the letterbox receipt names its invoice (above).
- **N4** (date half) the return no longer prints a date at all (above).
- **N5** `houseless` carried onto `ClosedOrderModel` and appended to the closed line. Two tests.
- **N6** `useDirectOrders` gains `staleTime: 30_000`, so the road does not re-hold on every
  navigation after the first (the review's own second option; the road stays gated so the in-motion
  count never rewrites itself).

### L3 — door acts (`door-acts.tsx`, `door-gate.tsx`, `instrument-reading.tsx`, new `lib/threshold/expiry.ts`)
- **N1** `panelIdFor` is `${panelId}-panel-${key}` — the ask panel no longer shares an id with the
  textarea inside it. Test: *does not give the ask panel the same id as the field inside it*.
- **N2** the decline path restores focus to the acts row (`tabIndex={-1}`, `confirmRestoreFocusRef`)
  rather than to the button the act removes. Test asserts focus is inside `door-acts`, not `<body>`.
- **N3** the signature block disarms past `valid_until` (`ready`, both inputs, and a hint), so the
  door no longer offers a signature `/api/proposals/[id]/sign` refuses on the same date. `hasPassed`
  moved to `lib/threshold/expiry.ts` so the acts and the block can both hold to it. Test in
  `door-gate.test.tsx`.
- **N4** `Your question was sent` matches the byte-copied note receipt (the old copy is the one that
  may not move).
- **N5/N6** a resolved-empty read gets its own quiet line
  (`This paper is not on file for you. Ask your studio for a copy of it.`) instead of error ink and
  a reload it cannot honour; `isError` keeps the refusal.

### L4 — correspondence (`lib/threshold/correspondence.ts`, `correspondence.tsx`, `use-project-correspondence.ts`, `threshold.tsx`)
- **N1** notices that name no project are claimed by the thing they ARE about: `toNotices` takes the
  house's own ids (proposals of this project + invoice ids + approval decision ids, threaded from
  `threshold.tsx`) and matches `proposal_id`/`proposalId`/`invoice_id`/`decision_id`/`decisionId`/
  `order_id`/`entity_id` or a deep-link segment. `proposal-nudge` and `decision-notify` rows stand
  again, and are markable-read. A row naming another project is still refused outright. Four tests.
- **N2** with a thread but no record, the reply stands on its own line (`standing-reply`) instead of
  opening an empty Previously. Test in `threshold.test.tsx`.
- **N3** the session's loading state joined the correspondence settle gate, so no letter is filed
  under the wrong hand (it resolves either way — never a disabled query).
- **N4** `ANCHOR_BY_SEGMENT` guarded with `hasOwnProperty`. Test for `/constructor`, `/hasOwnProperty`.
- **N5** the notice body `<div id>` renders only when the receipt is foldable.

### L5 — papers and rooms (`papers-sheet.tsx`, `room-capture.tsx`, `mat.tsx`)
- **N1** the three registers gate independently (`planSettled` / `filedSettled` /
  `instrumentsSettled`); `settled` survives only to decide whether `Nothing has been filed here yet.`
  may be asserted. The hold now waits on all three still loading.
- **N2** one failure notice per failed register, in the absorbed page's own words
  (`We couldn’t load your drawings / documents right now. Try refreshing the page.`, plus the same
  shape for the instruments leg). The two tests that locked the old all-or-nothing behaviour were
  rewritten to assert the registers that answered still stand.
- **N3** a `failed` capture says so rather than promising it is still processing.
- **N4** `StrayCaptures` excludes the capture each band actually SHOWS (shared `shownCapture`), so
  the shadowed second walk of a room has a home. Test.
- **N5** a failed `room_scans` read says `Couldn’t load your rooms. Please refresh.` Test.
- **N6** `aria-controls` on the mat's papers act only while the sheet exists. Test.

### L6 — reviews and scope changes (`review-ask.tsx`, `scope-change-ask.tsx`, `threshold.tsx`)
- **N1/N2** in the settle-gate table above.
- **N3** in-flight refs on approve, decline and withdraw (`ScoredAction`'s `unavailable` only lands
  on the next render). Test: *sends one approval however fast the two clicks land*.
- **N4** `loading` on the withdraw act is scoped by `cancel.variables?.requestId`. Test.
- **N5** `?review=` is stripped once the bundle has actually ARRIVED, not on mount.
- **N6** a request filed against no house stands in exactly one of them (`standsUnfiled`, decided by
  sorting this project's id against the other houses' — the same house every visit); applied to the
  ask and to the Previously list. Test.
- **N7** `isResolved` requires `sent_at` for a designer amendment, so studio churn drafted and
  cancelled before it was ever sent stays out of the client's Previously; her own requests are hers
  regardless. Two tests.
- **#26** the component's own 30-character floor is now exercised (the attribute assertion was not
  the branch the finding named).
- **#28** the `request_origin: "studio"` fixture — a shape 00395's CHECK forbids — is now
  `designer_amendment`.

### L7 — your details (`details-sheet.tsx`, new `use-scroll-lock.ts`, `AvatarUploadField.tsx`)
- **N1** the Escape/Tab guard admits `<body>`/`<html>` targets, and a Tab from `<body>` wraps back
  into the sheet rather than walking the page behind the scrim. Two tests.
- **N3** (partial) the avatar field's hard-coded `#C45B4A` / `#7A736C` are now
  `var(--color-error, …)` / `var(--text-muted, …)` — the red ink finding 20 removed is gone again.
  Restyling its two design-system `Button`s as `ScoredAction`s is left to the design pass.
- **N4** one counted scroll lock shared by both sheets (`useScrollLock`), so closing them in the
  other order cannot strand the page locked. Own test file, 3 cases.
- **N5** the two `role="status"` regions carry `data-testid` + `aria-label`.

### L8 — routing (`app/page.tsx`, `use-auth.ts`, `not-found.tsx`, `auth/error/page.tsx`, new `lib/client-auth-destination.ts`, `middleware.ts`, `auth-redirect.ts`)
- **N1** the front door tries the next candidate house before giving up, so a client whose list says
  she has houses is not handed the empty state with the header dropped. Test.
- **N2** `useAuth().signIn` defaults to `CLIENT_AUTH_DESTINATION`.
- **N3** `not-found.tsx` and `auth/error/page.tsx` no longer link to `/projects` (the duplicate
  second link on the 404 is gone; the auth-error link is a `Link`, which also keeps
  `no-html-link-for-pages` clean).
- **N5** `CLIENT_AUTH_DESTINATION` moved to its own module, so the edge bundle no longer imports
  `auth-redirect.ts` and its browser-only helpers; `auth-redirect.ts` re-exports it.

### L9 — spine and ledger (`standing.ts`, `house-ledger.tsx`, `room-band.tsx`, `door-gate.tsx`, `threshold.tsx`)
- **N1** `owedDueLine` prints `soonest due <day>` for anything but one dated invoice with nothing
  else open; `owedInvoiceCount` is threaded so a partly-dated set can be told apart. Copy comment
  rewritten; four tests updated/added.
- **N2** `WALL_L_OUTER = 28` (the mock's own 28→42 thickness) and the comment now says the opening
  is this surface's departure, not the mock's. Test updated.
- **N3** `door_notice_replay` and `gate_sign` carry `surfaceKey="the_threshold"` — three acts on one
  door, one surface key.
- **N4** the word cut falls back to the raw cut when it would keep less than a quarter of the
  budget, so a first word followed by one long run is no longer quoted alone.
- **N5** `firstWallId` takes the same guard as `firstDoorId` — no `#wall` anchor on a gate that
  never renders.

---

## Rejected, one reason each

| Finding | Reason |
|---|---|
| L1 F9 — legacy-decision ruling | Needs a plan-level ruling on whether legacy decisions are dead on cutover; the prior verdict placed it before deleting `/decisions/[id]`, not before merge. Not a code change. |
| L2 #3 — deploy-order gate | Process, not code: the ship lane owns the L8 → portal → function order. Recorded, not mechanisable from here. |
| L2 #10 residue — `hasProcessingStripe` / `hasReconciliationRequired` | The evidence is `invoice.payments`, which `useProjectInvoices` does not select; widening a shared `packages/supabase` select for two prose clauses is blast-radius over benefit. |
| L2 N4 — bind the receipt to the checkout ATTEMPT | Same missing evidence: no attempt id reaches the client without widening that select. The wrong-date half is fixed by printing no date; a re-pasted address can still re-fire `client_payment_completed`, which is an analytics artefact, not a money claim. |
| L2 #14 — `stripe-webhook` mail links | Owned by the retirement plan as redirects; an edge-function change outside this pass. |
| L3 #5, #15 — legacy papers, archived papers | Recorded rulings awaiting plan-level acceptance; a lane cannot close them. |
| L4 N6 — an `invoices` deep link lands on a letterbox that may not hold that invoice | The anchor is honest about the region, not the instrument; the reviewer's own disposition was one line in the retirement plan rather than code. |
| L5 N7 — `ScanStillFallback`'s dark plate | Inherited from `ViewerErrorBoundary`, which the /scans viewer also uses; a paper-ground variant is a design-pass decision, not a residual fix. |
| L5 N8, N9 — new `plan_sheet` event value; two `room_scans` reads | Recorded as notes by the reviewer, not findings. |
| L6 #22, #33 — narrow a shared `select()`; re-key `use-commercial-client` | Correctly scoped out by the lane; both edit shared files with designer-portal reach. |
| L7 #2 — the `?token=` preference shim | The retirement lane must keep `/preferences` applying the token; nothing to change here. |
| L7 #21 — `tests/e2e/account.spec.ts` still drives `/account` | The spec passes because the route still exists; rewriting it belongs with the route's deletion in the retirement lane. |
| L7 N2 — revert the whole-file reformat of `threshold.tsx`/`mat.tsx`/`unsubscribe/page.tsx` | The cost it named was merge conflicts across nine lanes; the merge is done. Re-quoting 364 lines now would churn the file for no remaining benefit and bury this pass's diff. |
| L7 finding 3 residue — optimistic preference toggles | The review did not require it; an optimistic update on a preferences write is a feature decision, not a residual. |
| L8 #3 — the inert `NEXT_PUBLIC_FLAG_OVERRIDES` wrangler var | Ship-lane carry, truthfully commented already. |
| L8 #16, #17, N4 — delete `single-pane-solo-redirect.tsx`, the e2e override, the `error.tsx` copy | Retirement lane and wave-2 copy pass, per the reviewer's own scoping. |
| L9 #12, #15, #17, #19 | Record-only or explicitly "not L9's file" in the finding text. |

---

## Gate output

`pnpm --dir …/apps/client-portal type-check`

```
> @patina/client-portal@0.1.0 type-check
> tsc --noEmit
```
(no diagnostics, exit 0)

`pnpm --dir …/apps/client-portal test -- threshold making`

```
Test Suites: 54 passed, 54 total
Tests:       1016 passed, 1016 total
```
(1008 → 1016 in this pass; every lane's suites included)

`pnpm --dir …/apps/client-portal test` (full client-portal jest)

```
Test Suites: 2 failed, 159 passed, 161 total
Tests:       1 failed, 1911 passed, 1912 total
```

The two failures are the two named as pre-existing on main, and no other:

- `src/lib/data/__tests__/orders.test.ts` — *Cannot find module '../orders'*
- `src/lib/__tests__/portal-access.test.ts` — *returns null for manufacturer (no manufacturer portal)…*

`pnpm --dir …/packages/supabase test -- src/hooks/__tests__/use-direct-orders.test.ts`
(the one shared-package file this pass touched)

```
Test Files  1 passed (1)
     Tests  18 passed (18)
```

`npx eslint src/components/threshold src/lib/threshold src/app`

```
✖ 24 problems (12 errors, 12 warnings)
```

**0 errors in every file this pass changed** — verified by linting the four changed `src/app` files
plus `src/components/threshold` and `src/lib/threshold` directly: `TOTAL ERRORS 0`.

The 12 remaining errors are all in `src/app` files that are **byte-identical to `origin/main`**
(`git diff --quiet origin/main -- <file>` clean for every one), under an `eslint.config.mjs` also
identical to main — i.e. pre-existing on main, not introduced by this wave:
`auth/invite/[token]/page.tsx` (1) · `auth/verify-otp/page.tsx` (2) ·
`field/[token]/site-request-guest.tsx` (1) · `inbox/page.tsx` (1) · `messages/page.tsx` (1) ·
`orders/page.tsx` (3) · `proposals/[id]/page.tsx` (1) · `proposals/[id]/sign/page.tsx` (1) ·
`quiz/results/results-view.tsx` (1). All are `react-hooks/*` compiler-rule errors in routes the
retirement plan removes; fixing them here would be scope this pass was not given.

---

## Not verified

- Nothing was driven in a browser: no runtime pass over the Threshold, the papers sheet, the details
  sheet, or a real checkout return. Every claim above rests on the unit suites and on reading the
  retired routes' source for copy fidelity.
- The counted scroll lock was exercised in jsdom only; the two-sheets-in-the-other-order case has
  not been walked by hand.
- `packages/supabase`'s `useDirectOrders` `staleTime` was type-checked and unit-tested but not
  exercised against a live query cache, and the admin-portal build (which enforces types on shared
  packages) was not run.
- The 12 pre-existing `src/app` lint errors were confirmed pre-existing by file identity against
  `origin/main`, not by re-running eslint on a clean checkout.
