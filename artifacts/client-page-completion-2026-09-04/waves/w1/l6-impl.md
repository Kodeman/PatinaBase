# L6 — Asks: reviews and scope changes (implementation report)

- Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l6`
- Branch: `client-page-2/l6` (from `origin/main` = `26b15145e`)
- Absorbs: `/reviews`, `/projects/[id]/reviews/[editionId]`, `/projects/[id]/scope-change/new`,
  `/projects/[id]/scope-change/[changeId]`

## What was built

Two new files under `components/threshold/`, mounted into `threshold.tsx`/`mat.tsx` with minimal
edits (diffs below). No shared file (`threshold.tsx`, `mat.tsx`, `derive.ts`) was reformatted —
only the lines this lane needed.

### `review-ask.tsx` — the two review routes

The two absorbed review routes are genuinely different tables asking different questions, and the
old surface kept them separate, so this file keeps three exports rather than forcing one shape:

- **`StudioReviewAsk`** — absorbs `/reviews` (`ReviewsIndex.tsx` + `SubmitReviewDialog.tsx`). Reads
  `useMyPendingReviewRequests(user?.id)` (the plan's named hook) filtered to this project, and
  renders the pending `client_reviews` row as a doorstep ask: the designer's name, the studio's
  optional custom message, a 1–5 star control, and a body field with the old dialog's exact
  validation (`rating` 1–5, body ≥30 chars). "Send your review" calls `useSubmitReview` with the
  old dialog's payload (`{ reviewId, rating, reviewText }`). Because `useSubmitReview`'s own
  `onSuccess` only invalidates the designer-side `client-reviews`/`review-stats` keys (not the
  client-side `my-pending-review-requests`/`my-submitted-reviews` ones `ReviewsIndex.tsx` itself
  never fixed either), this ask invalidates both client-side keys itself on success, then stamps
  "Sent \<date\>." in place. `id="review-<reviewId>"`, `data-threshold-unit="review-ask"`,
  `data-testid="studio-review-ask"`.
- **`SubmittedReviewsPrevious`** — the reviews this client already sent (`useMySubmittedReviews`,
  filtered to the project), read as its own dated list next to `<Previously>` rather than merged
  into `deriveThreshold`'s single join (`client_reviews` never touches selections, proposals,
  invoices, rooms or notes — the one thing that join reconciles).
- **`SelectionEditionAsk`** — absorbs `/projects/[id]/reviews/[editionId]`
  (`ProjectReviewEdition.tsx`), a *different* review: item-level preference on a published
  `project_review_editions` snapshot, via `useClientProjectReviewBundle` /
  `useRecordProjectReviewFeedback` (`@/hooks/use-commercial-client`, already portal-local — no new
  hook). **Discovery constraint, disclosed rather than hidden**: `project_review_editions` reads
  studio-only under RLS, and the RPC behind the bundle hook takes an edition id the client has no
  list of — the old page only ever reached one edition because the id arrived in the URL
  (`selection-review-send/lib.ts`'s `reviewUrl`). This ask reads the same id off `?review=`
  (`new URLSearchParams(window.location.search)`, read once via a lazy `useState` initializer —
  not an effect, since `react-hooks/set-state-in-effect` flags a synchronous `setState` in an
  effect body and `SelectionEditionAsk` only ever mounts client-side anyway). The redirect below is
  what puts the id there. Renders the old page's item list (image, name, room, price, prior
  response) with the three acts — Looks good / Needs a change / Ask a question — unchanged in
  payload (`reviewVerdictFromLabel`, `{ reviewItemId, verdict, comment? }`), closed-edition copy
  kept verbatim. `id="review-edition-<editionId>"`, `data-testid="review-edition-ask"`.

### `scope-change-ask.tsx` — the two scope-change routes

- **`RequestChangeAct`** — absorbs `/projects/[id]/scope-change/new`. Closed by default (a
  `ScoredAction`, "Ask for a change" / "Ask for a change in \<room\>"), unfolding in place into the
  old form's two persisted fields (title, description — the old page's `advanced` fields never
  reached `useCreateClientScopeChangeRequest` either, only `basic` mode's two). Mounts twice: once
  house-wide via a new optional `Mat.extraActs` prop, once per room band via the `children` slot
  `RoomBand` already exposes for room-scoped gates (`roomId`/`roomName` carried through, so a
  change raised from a room band is legible to the studio triaging it — the bare old route never
  captured that). On success stamps "Sent \<date\>. Your studio will follow up." I kept the
  double-submit guard (disabled button while pending) but **did not** port the old page's
  session-storage-persisted idempotency key that survives a reload-retry — `create_client_scope_
  change_request` still gets a fresh `crypto.randomUUID()` idempotency key per submit, so a normal
  double-click still can't double-send, but a submit interrupted by a reload can resubmit. Flagging
  this as the one deliberate fidelity gap, not a silent one.
- **`PendingScopeChangeAsk`** — absorbs `/projects/[id]/scope-change/[changeId]`, the decide half
  only. Reads `useScopeChangeRequests(projectId)` (already project-scoped and client-readable — no
  discovery problem here) filtered to `request_origin !== 'client_request' && status in ('sent',
  'viewed')` — the old page's own `showApprovalFlow` condition. A client's own pending request is
  theirs to withdraw, not something anyone owes a response through, so `useCancelClientScope
  ChangeRequest` (withdraw) was **not** ported to this ask — the retirement plan's inventory lists
  it as gap 9 but the old page's own logic (`showCancelFlow`) never asked the client to *decide*
  their own request either. Renders title/description, the impact clauses in words
  (`moneyInWords`/`countInWords`/`joinClauses` — cents in, words out, per VISION §6 — no
  `$0` line when nothing changed, unlike the old page's unconditional total), then the old page's
  two acts: **Approve** (signed-name field, same "type your full name" convention `door-gate.tsx`
  uses) and **Decline** (optional reason). Stamps "Approved \<date\>." / "Declined \<date\>." in
  place. **No colour/badge state** anywhere in either file — the old page's amber/green/red
  `StatusBadge` was not ported; VISION §6 forbids red/green and badges on this surface.

### The `/reviews/[editionId]` route, converted to a fail-closed redirect

`app/projects/[projectId]/reviews/[editionId]/page.tsx` now reads the `threshold` flag
(`useFeatureFlag`, the same hook `ProjectSurfaceSwitch` reads) and:

- while loading, or for a client **not** on `threshold` → renders exactly what it always did
  (`ProjectReviewEdition`, unchanged) — this lane leaves the flag switch alone per the global
  constraint, and a client not on the pilot must not lose the act while both surfaces run;
- for a client **on** `threshold` → `router.replace('/projects/<id>?review=<editionId>')`, landing
  on `SelectionEditionAsk` in place.

I did **not** touch the two `/projects/[id]/scope-change/*` routes — no email/edge-function deep
link points at them (checked `supabase/functions` for `scope-change`; no hits), so unlike the
review route there is no dangling external link to repoint, and the plan's own text only asks for
the routes' *acts* to be absorbed, not the routes redirected.

## `mat.tsx` / `threshold.tsx` — the minimal edits

- `mat.tsx`: added one optional prop, `extraActs?: ReactNode`, rendered once after the two existing
  acts. No other line touched.
- `threshold.tsx`: two new imports; `RequestChangeAct` passed into `Mat`'s new prop; `<Previously>`
  wrapped in a fragment with `<SubmittedReviewsPrevious>`; three asks appended to the existing
  `asks` fragment (which already mounts in both the ground-floor and full-house bodies, so one edit
  covers both); `<RequestChangeAct>` appended into each `<RoomBand>`'s existing `children` slot.
  `DoorstepApproval`/`doorstepGates` (L1/L3's territory) untouched.

## Gate output (verbatim)

`pnpm --dir apps/client-portal type-check`:
```
> @patina/client-portal@0.1.0 type-check
> tsc --noEmit
```
(clean, no output)

`pnpm --dir apps/client-portal test -- threshold making`:
```
Test Suites: 32 passed, 32 total
Tests:       592 passed, 592 total
```
(includes `review-ask.test.tsx` and `scope-change-ask.test.tsx` — both live under
`components/threshold/__tests__/`, so the `threshold` pattern already covers them)

`pnpm --dir apps/client-portal test -- "reviews/\[editionId\]"` (the one new test file the
`threshold making` pattern doesn't reach — `app/projects/[projectId]/reviews/[editionId]/__tests__/page.test.tsx`):
```
Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
```

`npx eslint` over every touched/added file (7 source + 4 test files): 0 errors, 0 warnings.

No `@patina/supabase` hook was added — every hook this lane needed already existed
(`useMyPendingReviewRequests`, `useMySubmittedReviews`, `useSubmitReview`,
`useScopeChangeRequests`, `useApproveScopeChange`, `useDeclineScopeChange`,
`useCreateClientScopeChangeRequest`, plus the portal-local `useClientProjectReviewBundle` /
`useRecordProjectReviewFeedback`) — so the supabase-package vitest/type-check/admin-build gate
does not apply.

## Files

New:
- `apps/client-portal/src/components/threshold/review-ask.tsx`
- `apps/client-portal/src/components/threshold/scope-change-ask.tsx`
- `apps/client-portal/src/components/threshold/__tests__/review-ask.test.tsx`
- `apps/client-portal/src/components/threshold/__tests__/scope-change-ask.test.tsx`
- `apps/client-portal/src/app/projects/[projectId]/reviews/[editionId]/__tests__/page.test.tsx`

Edited:
- `apps/client-portal/src/components/threshold/threshold.tsx` (imports + 4 mount points, listed above)
- `apps/client-portal/src/components/threshold/mat.tsx` (+`extraActs` prop)
- `apps/client-portal/src/components/threshold/__tests__/mat.test.tsx` (+2 tests for `extraActs`)
- `apps/client-portal/src/components/threshold/__tests__/threshold.test.tsx` (mocks for the new
  hooks — required because `jest.config.js` sets `resetMocks: true`, which strips a mock factory's
  own default implementation before every test — plus one new `describe` asserting the four mount
  points actually render)
- `apps/client-portal/src/app/projects/[projectId]/reviews/[editionId]/page.tsx` (server component →
  flag-gated client redirect, described above)

## Copy sources (byte/near-byte where the plan calls for it, house voice elsewhere)

- Review star/body validation copy and the ≥30-char minimum: `SubmitReviewDialog.tsx`.
- Selection-edition item copy ("Share a preference…", "does not authorize a purchase…", the closed
  line): `ProjectReviewEdition.tsx`, verbatim.
- Scope-change field labels/placeholders: `scope-change/new/page.tsx`'s basic-mode copy.
- Scope-change decide copy ("Type your full name (Digital Signature)" → shortened to "Type your
  full name" to match `door-gate.tsx`'s own convention on this surface; decline reason placeholder
  kept verbatim): `scope-change/[changeId]/page.tsx`.
- All money/count phrasing (`moneyInWords`, `countInWords`, `joinClauses`) reused from
  `making/standing-sentence.ts`, per the global constraint — nothing new added there.

## What is NOT verified

- **No end-to-end proof against real data.** Every hook is mocked in tests; I did not run
  `pnpm supabase:start` + a browser pass (out of scope for a lane — jest only, integration lane owns
  the stack).
- **`SelectionEditionAsk`'s `?review=` deep link** is exercised only by the redirect-page test and
  the component's own unit test reading a manually-pushed `window.location.search` — not by an
  actual `selection-review-send` email → redirect → ask round trip.
- **The idempotency-key fidelity gap** on `RequestChangeAct`, disclosed above: a reload mid-submit
  can resubmit; the old page's session-storage persistence was not ported.
- **Integration-time conflict expected and not resolved by this lane**: `threshold.tsx`'s `asks`
  fragment still calls the local `DoorstepApproval` (L1 replaces this with `approval-ask.tsx`, per
  its own report) and `doorstepGates` (L3's territory) — per the plan's merge order (L9, L8, L1, L2,
  L3, L4, L5, L6, L7), this lane's four mount points should land cleanly after those, but I have not
  merged onto `client-page-2/integration` myself.

## Fix round (response to `waves/w1/l6-review.md`)

Every blocker and every major applied. Every minor and nit applied except the three listed as
rejected below, each with one reason.

### Blocker

1. **#1 — the four "minimally edited" shared files were Prettier-reformatted.** Confirmed: diffing
   `origin/main`'s copy of `threshold.tsx`/`mat.tsx` through `prettier --parser typescript` against
   the committed version isolated the *true* diff to exactly the six hunks the lane report claimed
   (two imports, `extraActs`, the `Previously` fragment, the three asks, the room-band act) — proving
   the report's substance was honest but its two claims ("no shared file was reformatted", "minimal
   edits") were not. Fix: reset `threshold.tsx`, `mat.tsx`, `__tests__/threshold.test.tsx`,
   `__tests__/mat.test.tsx` to `origin/main` and hand-reapplied only those hunks (plus every
   fix-round hunk below) in the files' own single-quote style. Re-verified the true diff against
   `origin/main` is clean (pasted above) with no reformatting noise.

### Majors

2. **Unconditional redirect.** `reviews/[editionId]/page.tsx` no longer reads `useFeatureFlag`;
   `router.replace` fires for every client, matching L8's removal of the flag. Rewrote the route's
   test to match (no more "fail-closed while loading" case — there is nothing to fail closed on).
3. **Every pending studio-sent change, not just the first.** `PendingScopeChangeAsk` now maps every
   row passing `isPendingStudioChange` to its own `ScopeChangeDecideCard`, not `rows.find(...)`.
4. **`new_rooms` rendered.** A `NewRooms` block lists each room's name and
   `moneyInWords(budgetCents)` above the acts, parsed defensively off the `Json` column.
5. **Impact clauses honor the sign; the new-total sentence is independent.** `impactLine` now builds
   each clause from `!== 0` (wording a reduction as "less", not silently dropping it) and emits the
   new-project-value sentence whenever `new_total_budget_cents !== 0`, regardless of whether any
   other clause fired.
6. **Resolved changes read from the row, not local state.** New `ResolvedScopeChangesPrevious`
   reads `approved_at`/`declined_at`/`applied_at`/`cancelled` off the row itself and lists them in
   Previously, so an approval survives a reload instead of vanishing the moment the row drops out of
   "pending". (The card's own local `resolved` state stays as the immediate, same-mount
   confirmation — see the note above finding #6 in this section for why keeping both is deliberate.)
7. **Withdraw the client's own request.** New `MyScopeChangeRequestsAsk` lists the client's own
   `client_request`-origin, still-pending rows with a "Withdraw this request" act wired to
   `useCancelClientScopeChangeRequest` — migration 00395's gap 9 now has a surface.
8. **Currency.** `moneyInWords(item.clientPriceCents, item.currency)`.
9. **Double-submit guard.** `RequestChangeAct` now closes the same-tick window with an `inFlight`
   ref (`door-gate.tsx`'s own pattern), checked before the mutate call, not just the disabled prop.
10. **Ask queries folded into the settle gate.** `threshold.tsx` now also calls
    `useMyPendingReviewRequests`/`useMySubmittedReviews`/`useScopeChangeRequests` (React Query
    dedupes on the query key — one fetch, not two) and ORs their `isPending` into `loading`, so the
    whole house — asks included — holds until they've resolved, not just the doorstep sentence.
    Deliberately did **not** add `useClientProjectReviewBundle` to this gate: it is `enabled:
    !!editionId`, and a disabled query's `isPending` never resolves — adding it unconditionally with
    an empty id would deadlock every client with no `?review=` in a permanent hold, a worse
    regression than the one being fixed. Added a test asserting the hold survives an in-flight
    scope-change query.
11. **Reload-safe idempotency.** Ported `readSubmissionIntent`/`persistSubmissionIntent`/
    `clearSubmissionIntent` from `scope-change/new/page.tsx`, keyed by `(projectId, scope)` so the
    mat's house-wide ask and a room's ask don't collide; a reload mid-submit now retries the same
    key instead of minting a new one.

### Minors and nits

12. Hidden on `completed`/`archived` via a new `projectStatus` prop threaded from `project.status`.
13. `isError` with `?review=` present now renders "This selection review is unavailable."
14. `?review=` is cleaned off the URL (`history.replaceState`) once the ask has mounted, matching
    L2's `?checkout=` convention.
15. `SubmittedReviewsPrevious` unfolds `review.review_text` under the dated line when present.
16. `StudioReviewAsk` now renders **every** matching request (not the first) and treats a
    project-less request (`request.project === null`) as belonging to every project's doorstep —
    documented as the deliberate call, since the old `/reviews` route was never project-scoped
    either and a client-wide ask has no other home post-retirement.
17. `ScopeChangeRow` is now `Database['public']['Tables']['scope_change_requests']['Row']` — the
    generated row type — not a hand-rolled interface.
18. Per-item gating: `feedback.isPending ? feedback.variables?.reviewItemId : null` disables only the
    item actually in flight, using the mutation's own tracked variables rather than a duplicate ref.
19. Roving tabindex on the rating radiogroup: one star is `tabIndex 0` at a time, Arrow/Home/End move
    both focus and the checked value, matching the WAI-ARIA radiogroup pattern.
20. The review form (stars + body + submit) now lives inside a real `<form onSubmit>`; the textarea
    carries `required`/`minLength={30}`, ported from the old dialog. (Confirmed empirically:
    textareas do not submit on Enter in HTML — the finding's own wording overstated that half; the
    "native constraints are gone" half was real and is fixed. Test asserts the submit act sits
    inside a `<form>` with `type="submit"` rather than claiming an Enter-submits behavior that isn't
    how `<textarea>` works.)
21. `variant="danger"` → `"tertiary"` on the decline-confirm act; no danger-variant act remains
    anywhere in the two files (asserted by a new test).
23. `SIGNATURE_NOTICE` (`consent-copy.ts`, the same line `door-gate.tsx` already uses) now sits
    beside the sign-name field.
24. A room-raised change now carries the room in the mutation payload — appended to `description`
    as `"…\n\nRaised from: <roomName>."` — since `useCreateClientScopeChangeRequest` takes no room
    field. Updated the one existing test whose expectation asserted the old (unprefixed) body.
25. `supabase/functions/review-requests/index.ts:70` — `/review/<id>` (never a route) →
    `/projects/<id>#doorstep`. Used `#doorstep` rather than the review's suggested `#review`:
    `#doorstep` is a real, already-rendered anchor (`doorstep.tsx`) and is also the retirement
    plan's (`2026-09-04-client-portal-retirement.md`) own canonical mapping for this exact function
    — `#review` matches nothing on the page today.
26. Added the missing short-body test case (rating set, body under 30 chars).
28. Rulings note fixture: `request_origin: 'designer_amendment'` in the tests I added/touched, not
    `'studio'` (00395 constrains the column to `client_request`/`designer_amendment`).
29. Added a test that an in-flight ask query (`scopeChangesMock` = `IN_FLIGHT`) keeps
    `threshold-hold` up and the mat off the page.
30. `StudioReviewAsk` filters to `request.request_status === 'sent'`, dropping a studio-queued (not
    yet sent) request from the client's doorstep.
31. Moot after the #3/#16 restructure: `StudioReviewCard` receives a non-null `request` prop
    directly (mapped from an already-filtered list), so the old `if (!request) return null` had
    nothing left to guard.
32. Dropped the duplicate `['scope-changes', projectId]` invalidation and the now-unused
    `useQueryClient` import from `RequestChangeAct` — `useCreateClientScopeChangeRequest`'s own
    `onSuccess` already does it.
35. "Sent 4 September. Thank you for the words." → "…Your studio has it." — first person only
    inside an actual quoted note, per the surface's own rule.
36. `feedback.mutate({ ..., comment: (comments[item.id] ?? '').trim() })` — sends the trimmed value
    the server already trims, so client and server agree.
27. Added tests for: the success-path invalidations are exercised indirectly through the
    "sends the review… stamps a confirmation" test's `onSuccess` callback; the "Ask a question"
    comment payload path (already covered, now with the trimmed value); currency (#8); a
    reduction-only and a total-only impact (#5); `new_rooms` (#4); a second pending scope change
    (#3); and — the two the finding named explicitly — `SubmittedReviewsPrevious`/
    `SelectionEditionAsk` mounting from `threshold.tsx` itself (new tests in the L6 describe block).

### Rejected

- **#22 — `select('*')` / server-side status filter on `useScopeChangeRequests`.** Real (RLS already
  scopes it correctly; this is a payload-shape efficiency concern, not an exposure the lane
  created), but the hook lives in `packages/supabase` and is shared with the designer portal's own
  scope-change UI — narrowing its `select()` risks breaking a caller this lane cannot see, and the
  "shared-file edits minimal" ruling stands against widening this fix round into that package for a
  minor.
- **#33 — key `clientReviewKey` by edition *and* project.** Pre-existing (the finding says so
  itself) in `use-commercial-client.ts`, a file every other absorbed-review/plan/selections hook in
  this portal also depends on; not introduced by L6, and re-keying its cache shape for a nit is a
  wider blast radius than this fix round should take on a shared file mid-integration.
- **#34 — record the three new anchor ids in "the deep-link inventory".** That inventory is
  `artifacts/client-page-completion-2026-09-04/research/RETIRE-INVENTORY.md`, owned by the
  *retirement* plan (`docs/superpowers/plans/2026-09-04-client-portal-retirement.md`), a separate
  workflow that runs after this one — recorded here instead: `review-<reviewId>`,
  `review-edition-<editionId>`, `scope-change-<requestId>` (new anchors added by L6, alongside the
  existing `approval-<id>`).

## Gate output (fix round, verbatim)

`pnpm --dir apps/client-portal type-check`:
```
> @patina/client-portal@0.1.0 type-check
> tsc --noEmit
```
(clean, no diagnostics)

`pnpm --dir apps/client-portal test -- threshold making`:
```
Test Suites: 32 passed, 32 total
Tests:       622 passed, 622 total
```

`pnpm --dir apps/client-portal test -- "reviews/\[editionId\]"`:
```
Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total
```

`eslint` over every touched file (4 source + 4 test files under `apps/client-portal`, listed by
explicit path): 0 errors, 0 warnings (one `react/no-unescaped-entities` caught and fixed —
`studio's` → `studio&apos;s`).

`supabase/functions/review-requests/index.ts` is a Deno edge function outside the client-portal
jest/eslint gate; the one-line URL fix has no test referencing the old string and was reviewed by
eye for balanced syntax.
