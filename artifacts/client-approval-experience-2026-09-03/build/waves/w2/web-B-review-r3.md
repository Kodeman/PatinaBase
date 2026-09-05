# Wave 2 · WEB lane, stage B — adversarial review, round 3

Reviewer context: fresh, did not write this code. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-web`
(`git rev-parse --show-toplevel` confirms), branch `approvals/w2-web`.
Round-3 boundary = `2530ca4e3` (stage B's round-2 review commit); the pass under
review is `07ff972a5`, `f15894922`, `c60d78b7c`, `a386921a4`.

**Verdict: FIX** — no blocker, no major. Six findings, all minor or nit; four of the
nineteen round-2 items are closed and proved, fifteen stand as recorded.

## Gates, run by me from the worktree

```
pnpm --dir <wt> --filter @patina/client-portal type-check     exit 0   (tsc --noEmit, no output)
pnpm --dir <wt> --filter @patina/client-portal test           exit 0
  Test Suites: 119 passed, 119 total
  Tests:       1669 passed, 1669 total
pnpm --dir <wt> --filter @patina/supabase test                exit 0
  Test Files  84 passed (84)    Tests  998 passed | 12 skipped (1010)
pnpm --dir <wt> --filter @patina/designer-portal type-check   exit 0   (consumes the widened type)
```

Working tree clean (only the sandbox's `.env*` read denials). All render probes below were
run in throwaway suites appended to `approval-ask.test.tsx` and deleted afterwards.

## Round-2 findings — what actually closed

| id | state | proof |
|---|---|---|
| W2B-R2-01 duplicate `why` | **CLOSED** | `git merge-tree --write-tree approvals/w2-web approvals/w2-designer` → `f687d95d8` (clean, exit 0); `git show f687d95d8:packages/supabase/src/hooks/use-project-approvals.ts \| grep -n why` → **one** `why?:` at :66, one `whyAuthorName?:` at :76, one `why:` parse entry at :344. Same against backend (`dc02b9017`), iosc (`5640ed53a`), iosd (`9aedc96dc`) — all clean. The tree hashes have moved since the lane's note (siblings advanced), so I re-ran them rather than taking the note's word. |
| W2B-R2-02 inverted AT guard | **CLOSED** | `scored-action.tsx:589-592` is now `preventDefault → unavailable/running → pointer-tail → take()`; `isTrusted` is gone and the comment records why. New test *takes an activation that arrives long after a pointer gesture* pins it on fake timers. Residual walk still owed (below). |
| W2B-R2-03 why attributed to its author | **CLOSED** | backend `00569:954` emits `whyAuthorName`; the type carries it; `approval-ask.tsx:940-947` draws `— {whyAuthor}` from `whyAuthorOf()`. Probe: with `whyAuthorName='Leah Quist'` and `designerGivenName='Leah'` the quote reads `— Leah Quist`; with a why and `designerGivenName='Nora'` and no author, **no** attribution element. |
| W2B-R2-04 `viewerRole` unread | **PARTLY CLOSED** — the ask is gated, the attention model is not. See W2B-R3-03. |
| W2B-R2-05 … 19 (fifteen) | **STAND**, each re-verified by reading — see the carry table. |

## New findings, round 3

### W2B-R3-01 (minor, 0.95) — a reader with no doors is still told SHE is approving the edition

`approval-ask.tsx:952-957` renders the immutability sentence unconditionally.
The W2B-R2-04 fix rewrote six second-person places into the third person and left the most
assertive one behind.

Probe (`viewerRole: 'studio'`), rendered:

```
PROBE immutability: You are approving edition 3, exactly as shown.
PROBE section text: This approval · yours to read … You are approving edition 3, exactly as
  shown. … This one is answered by the person it was sent to.The review is confirmed.
```

Fix: `{viewerAnswers ? \`You are approving edition N, exactly as shown.\` : \`This is edition N, exactly as it was sent.\`}` — and a test in the `who this approval waits on` block asserting the section carries no `You are approving`.

### W2B-R3-02 (minor, 0.85) — on a draft, the new standing line contradicts the sentence under it

`approval-answered-by-another` depends on `!viewerAnswers` alone, so it prints on a draft too,
directly above `reviewStanding`. Probe (`viewerRole: 'studio'`, `lifecycleStatus: 'draft'`,
`completedReviewCount: 0`):

```
PROBE answered-by:  This one is answered by the person it was sent to.
PROBE review-count: The review is still needed.
PROBE immutability: You are approving edition 3, exactly as shown.
```

"is answered" reads as past tense beside "still needed". Both strings are pinned by the
lane's own new tests, so the contradiction is now regression-protected rather than caught.

Fix: state the chair, not the outcome — "Someone else answers this one." or "This one is for
the person it was sent to." — or draw the line only when `recordedOutcome || canRespondForLead`.

### W2B-R3-03 (minor, 0.9) — the chair stops at the ask; the shared "in the client's court" predicate still ignores it

`lib/client-attention.ts:18` — *"The single Stage-2 definition of work that is currently in the
client's court"* — takes `Pick<ProjectApprovalReview, 'disposition'|'lifecycleStatus'|
'completedReviewCount'|'requiredReviewCount'|'outcome'>` and never reads `viewerRole`. Its two
callers are unchanged:

- `threshold.tsx:437` / `approval-ask.tsx:188` — a studio co-member's studio-wide approval is
  still anchored on her doorstep as an **ask**, not as a record;
- `lib/data/projects.ts:508-517` `countStage2ReviewsByProject` — it still adds to that project's
  `approvalsByProject` tally, so her project card counts work she cannot do.

The standing sentence is unaffected (`lib/threshold/standing.ts:70` speaks only of doors, walls
and balance; `nothingOwed` is passed but unread), which is why this is minor rather than major.

Fix (steward's call on wave): widen the predicate to take an optional `viewerRole` and return
false for `'studio' | 'household'`, then let both call sites and `approval-ask` share one
definition instead of two.

### W2B-R3-04 (minor, 0.5) — the click guard has a pointer tail and no key tail

`scored-action.tsx:589-592`. Removing `isTrusted` was right, but it was also the only thing
standing between a *keyboard* activation click and `take()`. The keyboard path relies entirely
on `preventDefault()` in `onKeyDown`/`onKeyUp` suppressing the button's activation click; if any
browser fires it anyway, `pointerAt.current` is `0` for a pure-keyboard reader, the tail test
passes, and a brief Enter tap takes a terminal, legally-consequential act with no hold. Not
provable in jsdom (no activation behaviour at all), which is exactly why the guard should not
depend on it.

Fix: stamp the same clock in `onKeyDown`/`onKeyUp` (`pointerAt.current = Date.now()`, or a
second `keyAt` ref tested the same way). One line, closes the class, costs the assistive path
nothing — AT does not send keydown before its click.

### W2B-R3-05 (nit, 0.9) — the code now names a migration the ruling deletes

`use-project-approvals.ts:671-674` ("accepts the pair from **00570** onward; before it the
wrapper refused any payload key but `outcome`") and `approval-ask.tsx:851-855` ("**00570**
carries the pair through the wrapper"). The mid-Wave-2 ruling folds that file into 00569 and
deletes it, and backend's `00569:1509` already allowlists `clientConsentMethod` +
`clientSignature`. After integration both comments point at nothing. One-word edit at the fold.

### W2B-R3-06 (nit, 0.9) — an author with no why signs the bare question

`approval-ask.tsx:933-947`: `{why && …}` and `{whyAuthor && …}` are independent, so a row
carrying `whyAuthorName` with a null `why` renders `— Leah Quist` directly under the question
with nothing between. Probe confirms: quote text `Do the library elevations read right to
you?— Leah Quist`, `approval-why` absent. Unreachable on real data — `00569:954`'s
`CASE WHEN artifact.why IS NOT NULL` plus the column CHECK guarantee it — so this is a
defensive-read asymmetry, not a defect. Fix: `{why && whyAuthor && …}`.

## Round-2 findings that stand, re-verified

| id | sev | still true because |
|---|---|---|
| W2B-R2-05 | minor | Probed: the sr sentence for the third outcome is literally `Press and hold to hold.` (`verb={chosenAct.label.toLowerCase()}`, `approval-ask.tsx:1160`). |
| W2B-R2-06 | minor | `globals.css:524-528` `.da-hold[data-hold-state='idle'] .da-pool` is (0,3,0) and outranks both `.da-hold-still .da-pool` (:533) and the in-media `.da-hold .da-pool` (:539), both (0,2,0). The retreat still animates 180 ms for a stilled reader. |
| W2B-R2-07 | minor | `.da-pool { inset: 8px 2px }` (:223) + `.da-primary .da-pool { background-color: var(--color-charcoal) }` (:284); the word turns off-white only under `.da-primary:active` (:389). A keyboard hold whose keydown is `preventDefault`ed may never get `:active`, so the label can sit charcoal-on-charcoal for 900 ms. |
| W2B-R2-08 | minor | Unchanged: `door-gate.tsx:558` mounts the Sign act `presentation="mobile_dock"`, `door-acts.tsx:231` takes `max-[600px]:pb-16`. `threshold-remap.md` row 18 already calls the ranking half "arguably delivered by construction" — a ruling, not a defect. |
| W2B-R2-09 | minor | `door-gate.tsx:558` still `{!signedAt && (<HoldAction …>)}` while the leaf lives until `doorState === 'open'`. |
| W2B-R2-10 | minor | `grep -n 'pointerCancel\|pointercancel' hold-action.test.tsx` → nothing; the 18 test names carry no cancel case. |
| W2B-R2-11 | minor | `scored-action.tsx:441` `void Promise.resolve(onHold()).finally(…)`, no `.catch`. |
| W2B-R2-12 | minor | `signature-line.test.tsx:86-88` still asserts `'9 January 2026'` through a module-level `Intl.DateTimeFormat` in the runner's zone. |
| W2B-R2-13 | minor | `approval-ask.tsx:857-858` sends `clientConsentMethod: undefined` for Return and Hold, so `client_consent_method` lands NULL. The mid-Wave-2 ruling says the method "stays portal_clickthrough on web"; `00569:1139-1141` accepts `'click_through'` (the response leg's spelling) with no signature, so it is buildable. Steward reading owed: send `'click_through'`, or record the divergence. |
| W2B-R2-14 | minor | `wall-gate.tsx:157` and `scope-change-ask.tsx:490` refusal sentences remain unreachable (both acts `disabled` on `!signatureIsComplete`) and untested. |
| W2B-R2-15 | minor | Accepted and recorded by the lane: any scripted `element.click()` with no pointer history takes the act. Inherent to having an assistive path. |
| W2B-R2-16 | nit | `scope-change-ask.tsx` lines 29–30 are both blank (awk-verified). |
| W2B-R2-17 | nit | `scored-action.tsx:401` `useEffect(() => setStill(stilled()), [])`, no matchMedia listener. |
| W2B-R2-18 | nit | `signature-line.tsx:88` input carries `autoComplete="name"` only. Deliberate and right. |
| W2B-R2-19 | nit | `onPointerDown`, `onKeyDown`, `onKeyUp` are declared after `{...rest}` and do not chain `rest.onX`. No caller passes one. |

## Owed before ship (unchanged, and not buildable in this harness)

- One desktop screen-reader walk (NVDA or VoiceOver) and one macOS Voice Control walk
  ("click Sign") across all four terminal acts — door sign, wall accept, scope approve,
  approval outcome submit. The pointer-tail guard is now the ONLY thing admitting them.
- One browser walk: the hold fill at 390 px, the sticky dock, and the same hold with
  reduced motion on (W2B-R2-06/07 are both invisible to jsdom).
- iOS Safari VoiceOver's double-tap synthesises a trusted tap with pointer history, so it is
  refused like any quick tap. Worth confirming whether double-tap-and-hold reaches the act.

## Scope and hygiene

Round-3 diff touches six files plus the lane notes: `approval-ask.tsx`, its test,
`scored-action.tsx`, `hold-action.test.tsx`, `packages/supabase/src/hooks/use-project-approvals.ts`
and its test. All in the lane's set or in the cross-lane file the round-2 blocker named; the
edit there is byte-matched to the designer lane and merge-proved. No production mutation, no
stack reset, nothing pushed, no `git add -A`. `supabase/migrations/00570_approval_response_signature.sql`
is still present and is byte-identical in body to backend `00569:1490-1537` — deleting it at
integration loses nothing, as ruled.

Homeowner-string sweep over every added line of `main...HEAD` for
`gate|overdue|dashboard|task|badge|confetti|✓|Declined`: the only hits are `DECLINED`/`declined`
on the commercial-document stamp state (ruled: terracotta survives once, there) and internal
identifiers (`gate_sign`, `regionKey="gate"`, `door-gate`). No new refused word reaches a reader.
