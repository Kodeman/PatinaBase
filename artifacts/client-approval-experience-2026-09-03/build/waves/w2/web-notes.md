# Wave 2 · WEB lane, stage A — notes

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-web`, branch
`approvals/w2-web`, base `107549568`. Items P-14, P-15, P-16, P-17. Nothing pushed, no
production mutation, no stack reset.

## What landed

| Commit | Item | What |
|---|---|---|
| `814359f2e` | P-17 | `instruments/stamp.tsx` (+ 31 tests), the four call sites, the ink tokens |
| `d848a169c` | P-16 | three doors of equal weight, verb labels, the required change note |
| `ca561dbcd` | P-15 | `approvalWeighing()` in `standing-sentence.ts` (+ 11 tests), the ask's impact block |
| `a546231e6` | P-14 | the plate, the maker's mark, the pull-quote, the why-line, the folded breakdown |

Gates, run from the worktree after each item and again at the end:
`pnpm --filter @patina/client-portal type-check` → clean; `pnpm --filter @patina/client-portal
test` → **117 suites / 1617 tests, all passing** (1577 before this lane; +40 new).

## P-17 — eleven states, one stamp

`src/components/threshold/instruments/stamp.tsx`. One component, four dials, no fill, no shadow,
no checkmark. `STAMP_DIALS` is the whole table and is exported, so a caller can read a pigment
without rendering a mark.

- **The eleven**: awaiting · approved · returned · held · signed · signed_on_paper · reviewed ·
  withdrawn · superseded · expired · declined.
- **Pigments** (R13): SIGNED and APPROVED in `--color-mocha`; RETURNED bordered
  `--color-clay-ink`; HELD bordered `--color-golden-hour-ink` (not `--color-gold`); DECLINED
  bordered `--color-terracotta-ink`, the one warm exception, with no sage counterpart anywhere;
  the four neutral states in `--text-muted`. A test asserts terracotta is spent exactly once and
  that no state renders sage.
- **Rotation**: −1.1° on the marks pressed on this surface (approved, returned, held, signed,
  reviewed, declined); upright at 0° for awaiting, signed-on-paper, withdrawn, superseded,
  expired. The brief's −1.1° is used, not ux/02's −2°, because it matches the two stamps already
  shipped on the Threshold.
- **Aging**: one step at ≥ 30 days from `since` — border 0.88 → 0.74, doubled inner rule
  0.42 → 0.26 — and never a second. Word ink never degrades. Terminal states age; states still
  asking something (awaiting, returned, held, reviewed) never do (ux/02 rule 3). Aging is applied
  as `color-mix(… N%, transparent)` on the border AND parked as `--stamp-border-opacity` /
  `--stamp-inner-opacity` custom properties, because jsdom will not read a `color-mix()` back out
  of `style.borderColor` but does keep a custom property verbatim — that is what the tests assert
  on.
- **AWAITING carries no word**, per the brief. ux/02 says "a `--color-charcoal` word" there; the
  brief's "no word" wins. The empty outline is given `role="img"` + `aria-label="Awaiting you"`
  so it is a mark to the eye and a state to a screen reader, not a blank.
- **New tokens** in `apps/client-portal/src/app/globals.css`: `--color-clay-ink` `#7C5E30`,
  `--color-terracotta-ink` `#9C5340`, `--color-golden-hour-ink` `#79651E` — the designer portal's
  own values, copied so one mark reads identically on both sides of the table. ⚠ This is the one
  file outside my listed set that I edited; stage B's P-18 also names `globals.css` (the I107
  token block, further down the file). The block is small, contiguous, and adjacent to
  `--color-gold`, so a merge conflict is unlikely and trivial if it happens.

Call sites replaced:

- `approval-ask.tsx` — `STAMP_CLASS` / `STAMP_WORD` deleted; both the live stamp and
  `ApprovalReceipt`'s stamp are `<Stamp>` now.
- `wall-gate.tsx` — the trade-acceptance stamp is `state="approved"`. **The word changed from
  "Accepted" to APPROVED.** An acceptance of finished work is an approval and the grammar is one
  family; the released draw ("$1,440 released · Prairie Coat Painting · Entry & stair hall") moved
  into the mark's detail line, so the honest consequence survives. Flagging it because it is a
  visible copy change nobody explicitly asked for — easy to revert by giving `Stamp` a word
  override if Leah's ear says "Accepted".
- `commercial-document-shell.tsx` — the executed banner (`:110-111`) is the SIGNED stamp with the
  executed date beside it, `signed_on_paper` when any signature was recorded from paper; the
  `CheckCircle2` import is gone. The trade-acceptance section (`:474`) loses `border-patina-sage
  bg-patina-sage/5` for the neutral border. `grep` over `components/threshold/` +
  `commercial-document-shell.tsx` for `patina-sage|color-sage|text-green|text-red|CheckCircle`
  now returns nothing but one test asserting an absence.
- `previously.tsx` — **judgment call, please review.** Only one of Previously's four state words
  (Answered / Standing / Sent / Signed) is a stamp state; the other three are a note's lifecycle
  and forcing them into the eleven would distort both surfaces. So the leader line draws its
  `signed` word and ink from `STAMP_DIALS.signed` (SIGNED, mocha) and reads the three note words
  in `--text-muted` — mocha on that page now means "sealed" and nothing else. If the intent was
  literally to render a bordered `<Stamp>` on the leader line, that is a different change and I
  did not make it.

`stampStateForApproval(approval)` lives in `stamp.tsx` (structurally typed, no `@patina/supabase`
import) and keeps `projectApprovalAttentionLabel`'s precedence: withdrawn/superseded ahead of any
outcome. `lib/client-attention.ts:61` now reads **Returned** (and `needs_discussion` reads
**Held**, for the same one-vocabulary reason); the function has tests now, and it is no longer
called from `approval-ask.tsx` — the receipt stamp takes its word from the stamp table. It is left
exported as the lib-level prose vocabulary.

## P-16 — three doors, three stamps

- One `OUTCOME_VARIANT = 'secondary'` for all three acts; `primary` / `secondary` / `tertiary`
  retired for these three. The confirm button stays `primary` — it is one act, not a ranking.
- Labels and consequences verbatim from the brief: Approve / "Accept this exact edition and its
  stated impacts."; Return / "Send this edition back for revision and a new approval request.";
  Hold / "Keep this open while you and your designer talk it through." Order follows the brief
  (Approve, Return, Hold), which reorders `needs_discussion` and `changes_requested` on the page.
- **Telemetry keys are unchanged** — `decline_project_approval` still writes the return,
  `question_project_approval` still writes the hold. They are the retired detail page's own
  events; renaming them breaks the series without changing a word the client reads.
- **The change note.** Required for Return only, on web only (R10 — no DB constraint, iOS
  encourages instead). Label: "Tell {Designer} what to change." ("Tell your designer what to
  change." when the house has no name). Helper: "It goes into the discussion below with your
  answer." Submit is `disabled` until the note is non-blank — no red, no `role="alert"`, no
  "required", nothing reporting a field as empty; a test asserts the acts block contains none of
  `required|invalid|must|error`.
- **Where the note goes**: `useCreateDecisionComment().mutateAsync` into the decision thread the
  studio already reads, **before** `respond_project_approval`. If the note is refused, the outcome
  is not recorded and the refusal reads "The note could not be sent, so the edition was not
  returned. Your note is still here; try again." An edition sent back saying nothing is a dead
  end for the designer, so the note is treated as part of the act. ⚠ The RPC takes no note
  parameter, so this is two writes, not one — if the designer lane or backend adds a note field to
  `respond_project_approval`, this should collapse into it.

## P-15 — the weighing becomes a sentence

`approvalWeighing()` in `instruments/standing-sentence.ts`, pure, 11 unit tests (all-zero, one
non-zero, all non-zero, with/without baseline, one-day/past-twelve cardinality, no pigment,
NaN/Infinity input).

- Returns `{ sentence, ledger }`. Example: "$46,880 becomes $48,120, the schedule does not change,
  and the lead time shortens by four days." / "Cost +$1,240 · Schedule 0 days · Lead time
  −4 days".
- Deltas are independent and never summed (R11). A zero delta is stated in words whenever
  anything moved. When nothing moved at all the sentence is the shipped one — "No cost, schedule
  or lead-time change." — and the ledger is empty, so the same negation is not printed twice in
  two typefaces.
- **Baseline**: the composer takes `costBaselineCents` and the surface reads it defensively off
  the projection. ⚠ `ProjectApprovalReview` has **no** baseline column today, so on real data the
  fallback ("The cost rises by $1,200") is what renders. If a baseline is wanted in production,
  the projection needs the column — a backend/designer-lane item, not this one. I did not derive
  it from the working budget: `targetTotal − delta` is a guess dressed as a fact.
- The three-column `<dl>` is gone; `approval-impact` is now a block carrying
  `approval-impact-sentence` and (when anything moved) `approval-impact-ledger`. The old
  `approval-no-impact` testid is retired — anything downstream reading it should read
  `approval-impact-sentence`.

## P-14 — the artifact shown, and the ask in her hand

- **The plate** (`ArtifactPlate`, `data-testid="approval-plate"`): a framed `<figure>`. A cover
  image when the frozen snapshot carries one; the budget table when the artifact is a
  `budget_version`; otherwise the edition named and dated ("Edition 3 · Issued August 2"), and no
  date at all when the row carries neither `sentAt` nor `createdAt`.
- ⚠ **`source_snapshot` is not on the projection.** `ProjectApprovalReview` carries no
  `sourceSnapshot`, so `coverImageOf()` reads it defensively off the row and accepts a string only
  when it starts `http(s)://` or `/`. Everything else — a non-object, a number, `javascript:` —
  draws no picture at all. Four tests pin that. On today's data the titled-plate fallback is what
  renders; if the plan-issue cover is wanted, the projection needs the field.
- **The maker's mark**: the first twelve characters of `artifactChecksum`, mono, `opacity-60`,
  bottom-right of the frame, `aria-hidden`. A test asserts it is exactly twelve characters and
  that the plate carries none of `checksum|sha|fingerprint|verify`.
- **The question** is a `<blockquote>` on a `border-l-2 border-[var(--accent-primary)]` clay rule,
  holding the `<h2>` the section is still `aria-labelledby`'d to, then the why-line, then the
  attribution "— Leah". No attribution is drawn when `designerGivenName` is absent: the house
  never signs in a name it does not have.
- **The why-line** (`data-testid="approval-why"`) is read defensively off the row (`why`, a
  non-blank string) — the backend lane is adding the column; absence draws nothing. Four cases
  tested (absent, blank, non-string, present).
- The title/edition/due line was split: title and edition are in the plate, "Due August 20" stands
  under the ask. **`approval-plate`'s and the ask's text both changed shape**, so
  `threshold.test.tsx:870`'s old single-string assertion was rewritten rather than deleted.
- **The budget breakdown**: three totals always; the room-by-room list is
  `hidden sm:block` until a `ScoredAction` disclosure ("Read the breakdown" / "Close the
  breakdown", itself `sm:hidden`) opens it, so it folds on a phone and stands open at reading
  width with no control at all. The fail-closed guard (`budget.id` + `version` +
  `checkpoint.evidenceFingerprint` all matching) is byte-for-byte untouched.

## What I could not verify

- **No browser walk.** No dev server was run (the brief forbids one), so the plate's frame, the
  pull-quote rule, the maker's mark placement and the `sm:` fold are asserted by class name and
  jsdom only. Someone should look at the doorstep at 375px and at reading width before this ships.
- **The aging step is untested against real pigment.** `color-mix(in srgb, … 74%, transparent)` is
  not evaluated by jsdom; the custom properties are what the tests read. Worth one visual check
  that a thirty-day-old APPROVED still reads as ink and not as a smudge.
- **Baseline, cover image and why-line all render their fallbacks on today's data** — see the ⚠
  notes above. The defensive reads are the deliverable; the columns are not mine.
- **Prettier reports formatting drift on every file I touched** — and on files I did not
  (`doorstep.tsx`, `letterbox.tsx`, `refusal.ts` all fail `prettier --check` on the base commit
  too). Pre-existing, repo-wide for this app, advisory in the hook. I did not run
  `prettier --write`, because reformatting files stage B is editing would guarantee conflicts.
- **`pnpm lint`** was not run: only designer-portal has a working ESLint config
  (CLAUDE.md/patina-verification), and the brief names type-check and test as the gates.

---

## Round 1 fixes — 2026-09-05

Both round-1 findings closed in the worktree. Tree was clean at the start of the pass
(`git status --short` → empty), so nothing was left over from an interrupted attempt.

### W2A-01 — a retried Return said the note twice

Confirmed as reported: `submitResponse()` wrote the change note unconditionally before every
`respond` attempt, so a refused outcome left the note posted, `RESPOND_REFUSED` invited her to
press Submit again, and the second press put the identical sentence in the designer's thread a
second time.

Fixed with a latch rather than by reordering the two writes — the lane's original reason for
sending the note first still holds (an edition returned saying nothing is a dead end for the
designer, and the outcome must not be recorded against a note that never arrived).
`notePosted = useRef<string | null>(null)` holds the text that actually reached the thread; the
comment write is skipped when the pending note is byte-identical to it, and the latch is set only
after `mutateAsync` resolves. A refused note therefore still blocks the outcome and still retries.

Editing the note before retrying makes it a different thing to say, so it is sent — that is
deliberate, and has its own test.

Two tests in `approval-ask.test.tsx`, in the doors-and-note block that already covers this code:

- *says the note once when a refused outcome is submitted again* — `respondMutate` rejects once;
  after the retry `respondMutate` has two calls and `commentMutateAsync` still has one.
- *sends the note again when she changes what she wants to say* — the second call carries the
  edited body.

### W2A-02 — the cover-image plate could never fire

Confirmed, and worse than reported: the key is unreachable at two layers, not one.

1. The snapshot shape is fixed. `_resolve_project_approval_artifact` (00463) builds a `plan_issue`
   snapshot as exactly kind/id/version/checksum/title/issuedAt/sheetCount and a `budget_version`
   snapshot as kind/id/version/checksum/title/checkpointCode/publishedAt/low-target-high totals.
   The immutability guard rejects any artifact row whose `source_snapshot` differs from that
   function's output, so no cover key can appear without a migration.
2. Even a widened snapshot would not arrive. `parseProjectApprovalReview`
   (`packages/supabase/src/hooks/use-project-approvals.ts:299-333`) returns an object **literal**,
   field by field — `sourceSnapshot` is not among the fields, so it is dropped before the surface
   ever sees the row.

Taken the first branch of the reviewer's fix: the titled plate is Wave 2's shipped behaviour, and
the invented keys are gone. Deleted `coverImageOf()`, the `<img>` leg of `ArtifactPlate`, and the
five tests that pinned a shape that does not exist. The plate now draws the budget table for a
`budget_version` and the edition named and dated for everything else. The reason is recorded in
the component's own doc comment so the next reader does not re-invent the branch.

**Did not** add a sheet-count line from `sheetCount`. It is a real snapshot field, but it is
unreachable through the same mapper, and a bare count is the sort of number the vision asks us to
spend words on. A plan-issue preview is a two-part change — widen the snapshot in a migration and
widen the projection + mapper — and belongs to a lane that owns those files, not to this one.

`whyOf()` and the `costBaselineCents` read are left in place: they are the same defensive shape,
but the backend lane is adding `why` under P-13, and both were briefed as defensive reads. Note
that they are subject to the same mapper truncation — a `why` column will need
`parseProjectApprovalReview` widened too, or the line will never render.

### Gates, re-run from the worktree

`pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-web --filter
@patina/client-portal type-check` → clean, no output past the tsc banner.

`… --filter @patina/client-portal test` → **117 suites / 1615 tests, all passing** (1617 before
this pass: five cover-shape tests removed, three added).

Same run with `--coverage`: statements 71.99%, branches 67.02%, functions 71.88%, lines 74.06% —
all above the configured floor (70/60/70/70).

⚠ `pnpm --filter …` run from anywhere but the worktree resolves to the **main checkout**, because
this agent's cwd resets between commands and a bare `cd` does not persist. `pnpm --dir <worktree>`
is the form that works; the first attempt without it type-checked main and failed on a pre-existing
`.next/types/app/page.ts` error that has nothing to do with this branch.

## Round 3 — the fix pass (W2B-01)

### W2B-01 — the why reached the mapper and stopped there

Confirmed exactly as reported, and it is the same truncation the round-2 note predicted at the end
of W2A-02: `parseProjectApprovalReview` builds its result field by field, so a column the
projection emits but the literal does not name is dropped before any surface sees it. 00569
projects two such fields — `why` (P-13) and `viewerRole` (iosb3-M2, `lead | studio | household`) —
and neither was in the literal.

Fixed at the boundary that owns the shape, `packages/supabase/src/hooks/use-project-approvals.ts`:

- new exported `ProjectApprovalViewerRole = 'lead' | 'studio' | 'household'`, re-exported from
  `hooks/index.ts` so `@patina/supabase` consumers can name the chair;
- `ProjectApprovalReview` gains `why: string | null` and `viewerRole: ProjectApprovalViewerRole | null`;
- the parser gains `why: nullableString(row, 'why')` and
  `viewerRole: isViewerRole(row.viewerRole) ? row.viewerRole : null`.

Both are **null-on-absence, never thrown**: every approval created before 00569 has a null `why`,
and every projection minted before 00569 carries no `viewerRole` at all. A strict read here would
have turned an old row into an error page. An unrecognised role string is read as null rather than
trusted — the client never guesses which chair it is sitting in.

`whyOf()` in `approval-ask.tsx` now reads `approval.why` directly; the cast is gone. The
`data-testid="approval-why"` line renders on a real typed field.

### The cast that stays, deliberately

The reviewer's fix also asked for `costBaselineCents` to lose its cast. It cannot: **nothing emits
it.** `git grep costBaselineCents` across this branch and `approvals/w2-backend` finds only the
single defensive read in `approval-ask.tsx` — no migration, no projection, no other lane. Typing it
on `ProjectApprovalReview` would promise a field the mapper could only ever set to `null`, which is
a worse lie than the cast. The comment at the read now says exactly that, and names what would
retire it: a projection that actually carries a baseline. P-15's baseline leg stays covered by its
own composer unit tests, which do not depend on the projection.

### Fixtures widened (two required fields, so every typed literal had to learn them)

- `apps/client-portal/.../__tests__/approval-ask.test.tsx` — base `APPROVAL` gains `why: null`,
  `viewerRole: 'lead'`; the why-renders test drops its now-needless cast; the "draws no note"
  table gains an explicit `null` case and asserts its two type-forbidden shapes through `unknown`,
  because a pre-00569 row can still hand the surface an absent or non-string why.
- `apps/designer-portal/.../approvals-region-head.test.tsx` and `project-approval-document.test.tsx`
  — both `satisfies ProjectApprovalReview` base fixtures gain the two fields.
- `packages/supabase/.../__tests__/use-project-approvals.test.ts` — `REVIEW` now carries a real why
  and a chair, plus four new cases: both fields carried through; each of the three chairs kept
  verbatim; absence read as null on both; an unrecognised role read as null.

### Gates, this pass

- `pnpm --dir <wt> --filter @patina/client-portal type-check` → clean.
- `pnpm --dir <wt> --filter @patina/client-portal test` → **117 suites / 1616 tests, all passing**
  (1615 before; +1 for the added null-why case).
- same with `--coverage` → statements 71.99 / branches 67.02 / functions 71.88 / lines 74.06, all
  above the 70/60/70/70 floor.
- `pnpm --dir <wt> --filter @patina/supabase test` → **84 files / 995 passing, 12 skipped**;
  `use-project-approvals.test.ts` 21 tests (17 before).
- `pnpm --dir <wt> --filter @patina/designer-portal type-check` → clean (it consumes the widened
  type, so it is gated here even though it is not this lane's surface).
- `pnpm --dir <wt> --filter @patina/designer-portal test -- --testPathPattern "document/approvals"`
  → 3 suites / 45 tests passing.

### For the steward

`packages/supabase/src/hooks/use-project-approvals.ts` is not owned by any Wave-2 lane, and this
pass edits it. If the backend lane also touched it the two changes must be merged by hand — check
before taking either side whole. Nothing here reads `viewerRole` yet on web; it is carried so the
client app and the iOS lanes can, which was the point of the finding.

---

# Wave 2 · WEB lane, stage B — P-18, the act, ranked and held

Same worktree and branch, base for this stage `9e76a3c74` (stage A's last commit). Nothing
pushed, no production mutation, no stack reset.

| Commit | What |
|---|---|
| `2c1eac399` | `HoldAction` on `scored-action.tsx`, new `instruments/signature-line.tsx`, the `.da-hold` block in `globals.css`, 33 new tests |
| `58107758a` | `useRespondProjectApproval` carries the consent pair; **migration 00570** widens the RPC wrapper that was dropping it; 2 tests |
| `824ed9367` | the four acts become holds and sign on the rule: approval-ask, door-gate, wall-gate, scope-change-ask |
| `01d649560` | door-acts clears the docked act at 390px |

Gates, from the worktree:

- `pnpm --dir <wt> --filter @patina/client-portal type-check` → clean.
- `pnpm --dir <wt> --filter @patina/client-portal test` → **119 suites / 1650 tests, all
  passing** (117 / 1616 at the end of stage A: +2 suites, +34 tests).
- `pnpm --dir <wt> --filter @patina/supabase test` → **84 files / 997 passing, 12 skipped**.
- `pnpm --dir <wt> --filter @patina/designer-portal type-check` → clean (it consumes the
  widened hook input).

## 🔴 The finding that changed the shape of this item: the RPC was NOT ready

The brief says "respond_project_approval already writes client_signature + client_consent_method
— send them", and R1 records the same reasoning ("the response RPC already writes … so the field
drops in without a migration"). **Half of that is true, and the half that is false would have
broken every approval on the doorstep.**

- `_respond_project_approval_checked` (00464:496, replaced by 00569:993) does take
  `p_client_consent_method` / `p_client_signature`, validates them (two methods only; an
  electronic signature of at least two characters; a signature without a method refused) and
  writes all three 00117 consent columns.
- The **public wrapper** `respond_project_approval` (00464:811, re-issued verbatim by 00569:1376)
  allowlists exactly two payload keys — `p_payload - ARRAY['outcome','optionId']`, anything else
  raises `unsupported project response payload keys` — and then calls the checked function with
  `NULL, NULL` hard-coded in the last two argument positions.
- The one public path that ever carried a signature into a Stage-2 response is
  `apply_client_decision` (00464:1506 → `_apply_client_decision_authorized` → the checked
  function at :1675), and it requires an **option id**, which `get_project_decision_reviews` does
  not project and `parseProjectApprovalReview` therefore cannot return. No client surface can
  reach it.

So sending the pair without a migration would have made every outcome submit fail with an
`invalid_parameter_value`, and NOT sending it would have left P-18's own test ("approval submit
sends client_signature") unsatisfiable. I minted **`00570_approval_response_signature.sql`**: the
allowlist grows by `clientConsentMethod` and `clientSignature`, and the two nulls become the
values read out of the payload. Every rule stays in the checked function; the wrapper adds none
and relaxes none. A payload of `{"outcome": "approved"}` produces exactly the call 00569
produced, so every existing caller keeps its behaviour byte for byte.

⚠ **For the steward.** 00570 is a web-lane migration in a wave where the backend lane owns
`supabase/migrations` (it minted 00569). It must be applied **after** 00569 — both `CREATE OR
REPLACE` the same wrapper and the numbers already order them correctly. If the backend lane
also widens the wrapper, take one of the two, not both bodies. **The deploy set for this wave
now includes a migration from this lane.**

⚠ **No SQL test.** `supabase/tests/rls/` has no existing test over `respond_project_approval` —
there is no neighbouring suite to add to — and only the backend lane resets the shared local
stack, so I could not have run one. The migration is four lines of pass-through over validation
that already has a home; a test belongs with whoever next owns that RPC's suite.

⚠ **The hook sends the pair only when a consent method is given.** `clientSignature` alone is
dropped. That is deliberate: a signature with no method is a `check_violation` in the RPC, and
the two extra keys are refused outright by any wrapper minted before 00570. A caller that does
not sign therefore still works against a pre-00570 database. Two tests pin it.

## (1) The hold — `HoldAction` in `scored-action.tsx`

One export beside `ScoredAction`, not a prop on it: a held act takes no `href`, its click is not
its act, and half of `ScoredAction`'s surface would have had to be disabled for it.

- **900 ms** (`HOLD_MS`, exported so tests hold for exactly the shipped length).
- **The ink is the report.** `.da-hold` swaps `.da-pool`'s circular clip for
  `inset(0 calc(100% * (1 - var(--hold-fill,0))) 0 0)` with the hold's own duration, so the same
  ink that already floods on contact fills **along the rule** instead. No bar, no ring, no
  spinner, no percentage; a test asserts no `progress` element and no `role="progressbar"`.
  ⚠ The rules are placed **last** in the I107 block on purpose: `.da-act:hover .da-pool` and
  `.da-act:active .da-pool` are (0,3,0) and would otherwise reclaim the circle exactly while the
  finger is down. Each is answered at equal specificity, later in the cascade. Anyone reordering
  that file breaks the fill silently.
- **Early release, pointer leave, pointer cancel and scroll all cancel**, and nothing is said
  about it — a test asserts the page grows no `cancel|failed|try again` register.
- **Keyboard.** Enter or Space, held for the same 900 ms. `preventDefault` on both keydown and
  keyup because a native button fires click on Enter-down and Space-up, and the click path is
  dead anyway (`onClick` preventDefaults). `repeat` does not restart the clock.
- **The sentence** "Press and hold to {verb}." is an `sr-only` span joined into
  `aria-describedby` (existing `aria-describedby` values are kept, not replaced — the door's and
  the wall's hints still describe their acts).
- **The visible hint** "or press and hold Enter" is drawn only when the focus arrived by key. A
  module-level modality tracker (one shared `keydown`/`pointerdown` pair, ref-counted) decides;
  `:focus-visible` in JS is not reliable under jsdom.
- **Reduced motion stills the fill, not the wait.** The ink arrives at once (`.da-hold-still`
  plus the media query) and the hold keeps its length. ⚠ Judgment call: the brief says
  "prefers-reduced-motion = instant fill", which I read as the *fill*, not the *delay* — a
  shorter path to a terminal act for one group of readers is a worse answer than a still one.
- `presentation="mobile_dock"` makes the act's own box `sticky bottom-0` under 600px.

## (2) The rule — `instruments/signature-line.tsx`

Label, a one-edge ruled input, today's date in mono beside it, and `SIGNATURE_NOTICE` printed
from `consent-copy.ts` — never composed, never reworded. `signatureIsComplete` (≥ 2 characters,
trimmed) is the floor the sign route and the response RPC both keep, exported so an act can ask
before arming itself. No `role="alert"`, no red, no "required": a test asserts the instrument
contains none of `required|invalid|must|error`.

- The date is `en-GB` **with the year** — "5 September 2026". A signature is dated, and a
  dateline without a year is not one. It is fixed at first draw, not recomputed per keystroke.
- ⚠ **Copy notes, both deliberate, both flag-worthy.**
  1. `door-gate`'s hint lost its trailing `SIGNATURE_NOTICE`: the rule prints it now, and one
     paper says it once. The hint's own sentences are unchanged byte for byte, and a test asserts
     the notice appears exactly once on the door.
  2. `wall-gate` **gains** the notice, which it did not carry before. It is the same
     byte-identical sentence, and an acceptance that releases a draw on a typed name is a
     signature; the SignatureLine carries it by definition. Revert by passing `notice={false}`
     if Leah's ear disagrees.

## (3) The wiring

- **approval-ask.tsx** — "Review exact edition" is a hold (verb "confirm this exact edition") and
  **stays `portal_clickthrough`**: no signature, no migration, per R1. The outcome submit is a
  hold that also takes the typed name, on **all three outcomes** — R1 says every surface, and the
  RPC will not take a signature without a method anyway. Stage A's plate, sentence, doors, stamp,
  note latch and refusal copy are untouched.
- **door-gate.tsx** — `signatureIsComplete` replaces the inline `>= 2`; `SignatureLine` replaces
  the label+input; the act is a `HoldAction`. The POST body is unchanged (`signedByName`).
- **wall-gate.tsx** — same substitution; `useAcceptTradeScope` still takes the trimmed name.
- **scope-change-ask.tsx** — same substitution; `approvedByName` unchanged. The empty-name
  refusal sentence stays, because the act arms on `signatureIsComplete` and the guard is the
  same-tick backstop.

## (4) The dock, and why the act moved

⚠ **The Sign act is now a direct child of the door leaf, not of `SpineGate`'s `act` slot.** The
consent line, the ruled name and the hint stay inside the gate; only the act moved, and it sits
immediately below the gate on every viewport.

The reason is mechanical and worth recording, because the obvious two implementations both fail:

- `position: fixed` cannot be used inside the door. The doorway carries `[perspective:1800px]`
  for the swing, and an ancestor with a perspective is the containing block for fixed
  descendants — a "fixed" dock would have pinned itself to the doorway, not the viewport. (It
  would also have stacked one bar per door on a page with several.)
- `position: sticky` inside the gate's act slot had a few pixels of range: sticky travels only
  within its containing block, and that block was the act block itself. On the leaf, the range is
  the whole paper — which is exactly the requirement, and it retires itself when the door scrolls
  past.

`door-acts.tsx` takes `max-[600px]:pb-16`, giving the three answers the dock's height back so a
stuck act never paints over them. Ask a question / Request a change / Decline stay tertiary
whispers under the scored primary; their ranking did not need changing.

## What I could not verify

- **No browser walk.** The fill, the sticky dock at 390px and the keyboard hint's placement are
  asserted by class name and jsdom only. jsdom evaluates no `clip-path`, no `transition` and no
  media query, so `--hold-fill` / `--hold-ms` and the `.da-hold*` classes are what the tests read.
  Someone should hold the Sign act on a 390px viewport, and once with reduced motion on, before
  this ships.
- **The migration is unapplied and untested against a database.** See the ⚠ above.
- **Prettier still reports drift on every file this lane touches**, including files it did not.
  Pre-existing and repo-wide for this app (stage A found the same on the base commit); the hook
  is advisory. Not run, because reformatting these files would conflict with every other lane.
- **`pnpm lint` was not run** — only designer-portal has a working ESLint config, and the brief
  names type-check and test as the gates.

---

# Wave 2 · WEB lane, stage B — fix pass, round 1

Four findings from the stage-B adversarial review (W2B-R1-01 … 04). Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-web`, branch `approvals/w2-web`.
Nothing pushed, no production mutation, no stack reset. Working tree at the start of the pass
was clean except the sandbox's `.env*` "Operation not permitted" lines, which are the sandbox
reading, not repo state.

## W2B-R1-01 (blocker) — the act had no assistive path · FIXED

`HoldAction` reached `onHold` only from `onPointerDown` and `onKeyDown`, and its `onClick` did
nothing but `preventDefault()`. VoiceOver, Voice Control and switch access take a control by
DISPATCHING A CLICK — there is no pointer to hold and no key to keep down — so all four terminal
acts (door sign, wall accept, scope approve, outcome submit) were unreachable to them. That is a
Wave-1 regression: before this stage they were plain `ScoredAction` clicks, and ux/02:325 says
the iOS `HoldableModifier`'s VoiceOver "Activate" fallback "must not be lost".

The act is now taken from a click when BOTH hold:

- `!event.isTrusted` — a real finger or mouse produces a trusted click, and that click is the
  tail of a gesture this control has already answered (by refusing it). Assistive technology's
  click is untrusted.
- no pointer event on this control within `POINTER_TAIL_MS` (700 ms) — jsdom and synthetic
  pointer libraries dispatch untrusted clicks too, so a scripted tap must not slip through the
  first guard. `pointerAt` is stamped on pointerdown/up/leave/cancel.

`unavailable` and a hold already running both refuse it, so a disabled act is not clickable and
an AT click mid-hold cannot double-fire. The act body was lifted into one `take()` callback used
by the timer and by the assistive click, so telemetry (`makingEvents.actionSelected`) and
`restoreFocus` are identical on both paths. The physical-keyboard Enter/Space hold is unchanged
at 900 ms, as briefed.

**Could not verify**: real AT. jsdom marks EVERY dispatched event untrusted, so the
"a trusted click stays inert" half of the guard is provable only by reading. A residual gap
worth a walker's attention: iOS Safari VoiceOver's double-tap synthesises a TRUSTED tap at the
element, which this control refuses like any other short press. There is no way to tell that
apart from a sighted quick tap, and refusing the quick tap is the point of the ceremony; the
desktop screen readers, Voice Control and switch access all take the untrusted-click path.

Tests (`instruments/__tests__/hold-action.test.tsx`): the old "a plain click is not the act"
became "the click that trails a tap is not the act" (pointerdown → pointerup → click), plus
three new ones — an assistive `.click()` takes the act and reports it, an unavailable act is not
taken by one, and an assistive click during a hold does not take the act twice. Three neighbour
suites carried the same bare-click idiom and were given the pointer tail: door-gate ("takes the
signature on a hold, never on a tap"), scope-change-ask (P-18), wall-gate (P-18).

## W2B-R1-02 (major) — a signature demanded for Hold and Return · FIXED, scoped to Approve

Taken as ruled by ux/02:308 rather than escalated: "Asking a homeowner to type her name to say
'needs discussion' would be theatre. The choice is the act; the hold is the commitment."

`approval-ask.tsx` now draws the `SignatureLine` only for `approved`; the submit arms without a
name for `changes_requested` (still gated on its note, R10) and `needs_discussion`; and
`submitResponse` sends `clientSignature` / `clientConsentMethod` only on the approval. The hook's
degradation guard (`use-project-approvals.ts:685-693`) then sends `{ outcome }` alone for those
two — the payload every wrapper before 00570 accepts. R1's "every surface" is met: all three
outcomes are still HELD; only the one that consents to the edition is signed.

Tests: "carries her name on a return as well as on an approval" is replaced by "asks no name of
a return or a hold, and records no consent for them" and "asks no name of a hold either" (both
assert `clientSignature: undefined, clientConsentMethod: undefined` on the recorded call). The
`answer()` helper signs only when a rule is drawn.

## W2B-R1-03 (major) — 00570 minted outside the lane's files · STEWARD CALL, evidence below

Left in place, with the ordering the steward needs — and one hazard the review did not see.

- My branch's migration tail is `00568` then **`00570_approval_response_signature.sql`**: this
  branch does not carry backend's 00569 at all. 00570's body is backend's 00569 wrapper body
  (verified by extracting `CREATE OR REPLACE FUNCTION public.respond_project_approval` from
  `agent-cae-w2-backend/supabase/migrations/00569_approval_why_viewer_role_and_receipt.sql`:1376
  — same DECLARE block, same two-key allowlist, same `NULL, NULL` tail) plus the two payload
  keys. So 00570 must apply AFTER backend's 00569, and both must land before the client-portal
  deploy.
- **The 00569 number is double-minted.** `agent-cae-w2-backend` has
  `00569_approval_why_viewer_role_and_receipt.sql`; `agent-cae-w2-iosc` has
  `00569_stage2_outcome_signature_payload.sql`. Two different files, same number, and the iosc
  one is a SECOND widening of the same wrapper — lineage `00464:811 → (this)`, i.e. built on
  00464's body, not on backend's. That is the "one wrapper body, never both" hazard, and it is
  worse than a duplicate: ordered after backend's 00569 it would restate a body that never saw
  backend's file.
- Recommendation: keep **00570** as the single final wrapper body (highest number, correct
  lineage, supersedes either 00569 whichever way the collision is renumbered), drop or renumber
  iosc's `00569_stage2_outcome_signature_payload.sql`, and resolve the backend/iosc 00569
  collision before any push. Deploy order: backend 00569 → web 00570 → client-portal Worker.
- Unchanged from stage B: no SQL test — no neighbouring suite covers this RPC, and only the
  backend lane may reset the local stack, so 00570 is read-verified, not executed.

## W2B-R1-04 (major) — the wall held 900 ms to be refused · FIXED

`wall-gate.tsx`'s `HoldAction` now takes `disabled={!signatureIsComplete(signedName)}`, matching
door-gate's `ready`, approval-ask and scope-change-ask. The refusal sentence in `onAccept` stays
as the same-tick backstop. Its test became "stays unlit until a name is on the rule, and accepts
nothing": disabled with no name, still disabled on one character, armed on "Harper Vale".

## Gates (from the worktree, after the pass)

- `pnpm --filter @patina/client-portal type-check` → `tsc --noEmit`, no output, exit 0.
- `pnpm --filter @patina/client-portal test` → **Test Suites: 119 passed, 119 total; Tests: 1654
  passed, 1654 total** (1650 before the pass; +4 net — five added, one replaced in place).
