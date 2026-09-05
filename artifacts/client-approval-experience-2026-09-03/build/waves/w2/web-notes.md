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
