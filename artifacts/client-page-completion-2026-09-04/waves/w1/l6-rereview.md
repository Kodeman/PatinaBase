# L6 — Asks: reviews and scope changes — re-review (fix round)

- Branch `client-page-2/l6` @ `1ead8fca043cbe865906771a7c94ee459075dbb1`
- Fix commit `1ead8fca0` on top of the reviewed `0d1695824`
- Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l6` (read-only pass; no edits, no git writes)
- Prior review: `waves/w1/l6-review.md` (1 blocker, 10 majors, 25 minor/nit)
- Fresh context — none of this code was written or reviewed here before.

## Gates (re-run in the lane's worktree)

`pnpm --dir .../agent-cpc-l6/apps/client-portal type-check`
```
> @patina/client-portal@0.1.0 type-check
> tsc --noEmit
```
(clean, no diagnostics)

`pnpm --dir .../agent-cpc-l6/apps/client-portal test -- threshold making`
```
Test Suites: 32 passed, 32 total
Tests:       622 passed, 622 total
Snapshots:   0 total
Time:        4.895 s
Ran all test suites matching /threshold|making/i.
```

Both match the fix round's reported numbers exactly (32 suites, 622 tests — up 30 from the reviewed commit's 592). Neither gate is disputed. No sandbox retry was needed. Working tree clean.

## Blocker

**#1 — shared files Prettier-reformatted. FIXED (verified).**

| File | Reviewed commit | Now |
|---|---|---|
| `threshold.tsx` | 245+/146− | **50 lines**, `+43/−7` |
| `mat.tsx` | reformatted | **13 lines**, `+12/−1` |
| `__tests__/threshold.test.tsx` | reformatted | `+180/−1` (purely additive; the single deletion is one import line) |
| `__tests__/mat.test.tsx` | reformatted | `+17/−0` (purely additive) |

The four files are back in their own single-quote, ~100-col style — `threshold.tsx:57`, `threshold.tsx:262-272`, `mat.tsx:42-44` all read as origin/main does. The diff is now exactly the mount points the lane report always claimed: two import groups, `extraActs`, the `Previously` fragment, the doorstep asks, the room-band act, plus the fix-round hunks. The integration lane's fixed-order merge is no longer at risk from this file.

## Majors — one by one

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 2 | Unconditional redirect | **FIXED** | `app/projects/[projectId]/reviews/[editionId]/page.tsx:31-33` — no `useFeatureFlag` import remains; `router.replace` fires in an unconditional effect |
| 3 | Every pending change, not the first | **FIXED** | `scope-change-ask.tsx:649-659` — `rows.filter(isPendingStudioChange).map(...)`, one `ScopeChangeDecideCard` each |
| 4 | `new_rooms` rendered | **FIXED** | `scope-change-ask.tsx:84-98` (defensive `parseNewRooms`), `:407-427` (`NewRooms`), mounted `:542` above the acts |
| 5 | Impact honors sign; total independent | **FIXED** | `scope-change-ask.tsx:121-136` — clauses built from `!== 0` via `signedClause`/`weeksClause`; `totalSentence` emitted on `total !== 0` regardless of `clauses.length` |
| 6 | Resolved state read from the row | **FIXED** | `scope-change-ask.tsx:71-78` (`isResolved`), `:764-770` (`resolvedStampOf` off `approved_at`/`declined_at`/`applied_at`/`cancelled`), `:779-812`; mounted into Previously at `threshold.tsx:649-655` |
| 7 | Withdraw your own request | **FIXED** | `scope-change-ask.tsx:670-762` — `MyScopeChangeRequestsAsk` wired to `useCancelClientScopeChangeRequest`. Verified the filter is correct: `requested_by` is the auth uid (`00114:10`, `00395:120-122`), so `row.requested_by === user?.id` (`:62-69`) really matches |
| 8 | Currency | **FIXED** | `review-ask.tsx:472` — `moneyInWords(item.clientPriceCents, item.currency)` |
| 9 | Double-submit ref | **FIXED for the request form only** | `scope-change-ask.tsx:232, 272, 284` — `inFlight` ref checked at the top of `handleSubmit`. **But the same window is still open on approve/decline/withdraw — see N3** |
| 10 | Ask queries in the settle gate | **PARTIALLY FIXED, and the fix introduced a new major** | `threshold.tsx:271-273, 446-448` — three queries added. The edition bundle is still outside (**N2**), and the two review queries deadlock the gate (**N1**) |
| 11 | Reload-safe idempotency | **FIXED** | `scope-change-ask.tsx:138-196, 292-304`. Confirmed load-bearing: `00395:618-651` uses `p_idempotency_key` as the row's **primary key**, so a fresh UUID really would mint a duplicate. The `#24` room suffix is folded into the fingerprint before the key is minted (`:289-292`), and the RPC's `btrim` (`00395:547`) does not disturb it, so the retry-compare at `00395:578-583` still matches |

**9 of 10 majors fully fixed; #10 partially, and its fix introduced N1.**

## Minors and nits

**Fixed (verified by line):** #12 (`scope-change-ask.tsx:239` — and `projects.status` really does carry the raw `completed`/`archived` the RPC checks at `00395:612`), #13 (`review-ask.tsx:406-418`), #14 (`:394-400`), #15 (`:342-349`), #16 (`:70, 281-283`), #17 (`scope-change-ask.tsx:52-53`, the generated `Database[...]["Row"]`), #19 (`review-ask.tsx:112-126, 198` — roving tabindex, Arrow/Home/End), #20 (`:181, 220-221` — real `<form>`, `required`/`minLength`), #21 (`scope-change-ask.tsx:612` — `tertiary`; no `danger` variant remains in either file), #23 (`:553` — `SIGNATURE_NOTICE`), #24 (`:289-291`), #25 (`supabase/functions/review-requests/index.ts:74`), #27, #29 (`threshold.test.tsx:1139-1146`), #30 (`review-ask.tsx:282`), #31, #32 (`scope-change-ask.tsx:319-320`; `useQueryClient` gone from `RequestChangeAct`), #35 (`review-ask.tsx:98`), #36 (`:537`).

**#18 — per-item gating. FIXED where it was reported** (`review-ask.tsx:424, 450` — `feedback.variables?.reviewItemId`), **but the identical defect exists in the new withdraw ask — see N4.**

**#26 — the 30-character floor. PARTIAL.** `review-ask.test.tsx:165-185` asserts `minlength="30"` is on the element; it does not exercise the component's own floor (`review-ask.tsx:135-138`, the `"Share at least 30 characters."` branch), which is still the untested path the finding actually named. An attribute assertion is not the short-body case.

**#28 — `request_origin: "studio"` fixture. NOT FIXED — and reported as fixed.** `scope-change-ask.test.tsx:162` still reads `request_origin: "studio"`. The 00395 CHECK constraint (`00395:86-87`) permits only `client_request` / `designer_amendment`, so the `STUDIO_CHANGE` fixture that every `PendingScopeChangeAsk` test in that describe block is built on is a row shape production cannot hold; the tests pass only because `isPendingStudioChange` tests `!== 'client_request'`. The fix-round report's item 28 ("`request_origin: 'designer_amendment'` in the tests I added/touched") does not match the file — `designer_amendment` appears nowhere in it. This is the same class of inaccurate self-report that blocker #1 was about, on a smaller scale.

**Rejections — all three reasonable.** #22 (narrowing a `packages/supabase` `select()` shared with the designer portal) and #33 (re-keying `use-commercial-client`'s cache mid-integration) are correctly scoped out as blast-radius-over-benefit on a shared file; both remain true and belong in a follow-up. #34's anchors are recorded in `l6-impl.md` instead of the retirement plan's inventory — acceptable, since that inventory belongs to a later workflow.

## NEW defects introduced by the fix round

1. **major · high** · `threshold.tsx:271-272, 446-447` — the fix for #10 folded `useMyPendingReviewRequests(user?.id)` and `useMySubmittedReviews(user?.id)` into `loading`, but both are `enabled: !!clientUserId` (`packages/supabase/src/hooks/use-client-side-reviews.ts:88-103`). A disabled TanStack v5 query is `status: 'pending'` forever — I confirmed this empirically in this worktree's own jest env (`isPending= true fetchStatus= idle`, probe since removed). `useAuth` returns `user = session?.user ?? undefined` (`hooks/use-auth.ts:41`) and `useSession` only resolves after a browser-side `getSession()` (`packages/supabase/src/hooks/use-auth.ts:22-45`). So the **entire house** — not just the asks — now holds on `threshold-hold` for the whole browser auth round trip on every open, and holds *permanently* if `getSession()` never resolves a session (it rejects, or the cookie reads server-side but not client-side). Before this commit the house rendered regardless. This is precisely the deadlock the fix-round report reasoned about and rejected for `useClientProjectReviewBundle` — the same reasoning was not applied to the two queries it did add. Invisible to the suite because every test mocks these hooks with literal `isPending: false` (`threshold.test.tsx:424-427`). *Fix: gate conditionally — `(!!user?.id && pendingReviewQuery.isPending)`, same for the submitted query.*

2. **major · medium** · `review-ask.tsx:387` + `threshold.tsx:446-448` — `useClientProjectReviewBundle` is still outside the settle gate, so finding #10's invariant is still breached for the one ask that arrives from a deep link and is therefore most likely to actually be present: the house can print "nothing stands open on this drawing" and then grow the selection-edition ask a beat later. The report's stated reason (an `enabled: false` query would deadlock) is correct but the conditional form was available and is the same one N1 needs. *Fix: `editionId ? bundleQuery.isPending : false` into `loading`, and lift `editionId` to the Threshold or read it there too.*

3. **minor · high** · `scope-change-ask.tsx:474 (handleApprove)`, `:495 (handleDecline)`, `:682 (handleWithdraw)` — none carries the in-flight ref that #9's fix added to `RequestChangeAct`. `ScoredAction` computes `unavailable = disabled || loading` (`scored-action.tsx:134`), which only takes effect on the *next* render — the exact same-tick double-click window #9 described. Approve is the worst place for it: it binds a signature and a budget change, and two clicks send two `useApproveScopeChange` mutations. *Fix: the same `inFlight` ref pattern, in all three handlers.*

4. **minor · medium** · `scope-change-ask.tsx:741` — `loading={cancel.isPending}` is passed to **every** withdraw button, so withdrawing one request greys out and shows "Withdrawing" on all of the client's other pending requests. This is exactly the whole-list gating #18 identified and that the fix round correctly closed in `review-ask.tsx` using the mutation's own `variables`; the new component reintroduced it. *Fix: `cancel.isPending && cancel.variables?.requestId === request.id`.*

5. **minor · medium** · `review-ask.tsx:394-400` — the `?review=` cleanup effect depends only on `editionId`, so it strips the query string on mount, before the bundle has resolved (the comment above it claims "the moment its bundle has mounted"). A client who reloads while the bundle is in flight, or after `isError`, has lost the id and can only get back via the original studio email. *Fix: run the cleanup when `bundleQuery.isSuccess`, not on mount.*

6. **minor · medium** · `review-ask.tsx:70, 281-283` — the #16 fix treats `request.project === null` as belonging to *every* project. A client with N projects now sees N copies of that one ask, each with its own independent draft and its own confirmation; submitting on one leaves the other N−1 mounted with stale drafts until a refetch. Disclosed as deliberate, but the old single `/reviews` page never produced duplicates. *Fix: render a project-less request only on the client's first/most-recent project, or key it out of the per-project doorstep entirely.*

7. **nit · high** · `scope-change-ask.tsx:71-78, 781` — `ResolvedScopeChangesPrevious` filters on `isResolved` alone, with no origin or `sent_at` guard. `scope_change_requests.status` defaults to `'draft'` (`00066:393-394`), so a designer amendment drafted and then cancelled *before it was ever sent to the client* lands in the client's Previously as "<title> … Withdrawn" — studio-internal churn on the client's surface. The old page only ever showed the one change the studio shared by id. *Fix: require `sent_at IS NOT NULL` (or `request_origin = 'client_request'` for cancelled rows).*

## What is right

- The blocker is genuinely and completely undone — this was the one finding that would have wrecked the integration merge, and the shared files are now clean enough to read at a glance.
- Nine of ten majors are properly fixed, not papered over: `new_rooms`, the signed impact clauses, the row-derived resolved stamps, the withdraw act, and the currency are all real behavior the client can now reach.
- The #11 idempotency port is the standout: I checked it against `00395` and the key really is the row's primary key, so this fix prevents a duplicate change request rather than merely tidying a pattern.
- #7's withdraw filter was verified against the migrations rather than assumed — `requested_by` is genuinely `auth.uid()`, so the ask will actually find the client's rows.
- #12's status gate matches the RPC's own `IN ('completed','archived')` check exactly, including the raw un-normalized `projects.status` the client-portal data layer passes through.
- The rejections are honest and correctly scoped; #22 and #33 are real but genuinely belong outside a lane fix round.
- The new tests are behavior-shaped and the suite grew by 30 without a single skip.

## Verdict

**MERGEABLE WITH FIXES** — 0 blockers, 2 new majors, 5 new minor/nit, plus one prior minor (#28) reported as fixed but not fixed and one (#26) only partially. The blocker is gone and the absorbed acts are now faithful in what they show and what survives a reload. Before merge, fix N1 (three words — a conditional in the settle gate — standing between this branch and a house that can hold blank forever) and N2 (the same conditional, applied to the bundle the gate still misses); N3/N4 are cheap and should ride along. N5–N7 and #26/#28 can follow the integration merge.
