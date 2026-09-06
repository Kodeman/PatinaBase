# Wave 2 · WEB lane, stage A — adversarial review, round 1

Reviewer context: separate session, did not write this code.
Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-web`
(`git rev-parse --show-toplevel` → that exact path), branch `approvals/w2-web`,
five commits `814359f2e · d848a169c · ca561dbcd · a546231e6 · 9b204f01e` on `main`.

**Verdict: FIX.** No blocker. Two majors, six minors, seven nits. Every item in the brief
(P-14 · P-15 · P-16 · P-17) is present; both majors are inside P-14/P-16 rather than beside them.

## Gates — run by me, from the worktree

| Command | Result |
|---|---|
| `pnpm --dir <wt> --filter @patina/client-portal type-check` | clean (`tsc --noEmit`, no diagnostics, exit 0) |
| `pnpm --dir <wt> --filter @patina/client-portal test` | **117 suites / 1617 tests, all passing**, 11.7 s |
| `pnpm --dir <wt> --filter @patina/client-portal test:coverage` | `All files 72.02 % stmts · 67.07 % branch · 71.89 % func · 74.08 % lines` against the floor `70/60/70/70` — **passes**. Touched files: `approval-ask.tsx` 96.27, `stamp.tsx` 96.96, `standing-sentence.ts` 97.41, `previously.tsx` 100, `wall-gate.tsx` 98.11, `client-attention.ts` 100, `commercial-document-shell.tsx` 74.74 |

⚠ **Gate-invocation trap for the orchestrator.** The brief's literal recipe — bare
`cd <worktree>` in one Bash call, then `pnpm --filter @patina/client-portal type-check` in the
next — does **not** work in an agent thread: cwd resets between calls, and the run lands on the
**main checkout**. My first attempt printed
`> @patina/client-portal@0.1.0 type-check /Users/kody/Code/patina-merged/apps/client-portal` and
failed on a stale `.next/types/app/page.ts(37,29): error TS2344` that has nothing to do with this
branch. `pnpm --dir <worktree> --filter …` is the form that gates the branch. (This lane's own
counts — 117/1617, including suites that exist only on this branch — prove it gated the right
tree; other lanes may not have.)

## Refusal sweep — clean

Grepped every added line of `git diff main...HEAD` for `gate|task|overdue|dashboard|AI|Declined|
sage|green|red|checkmark|CheckCircle|badge|emoji|shadow|confetti`. Every hit is a comment, a test
name, a lane-note line, or an assertion of an absence. No homeowner-visible string carries a
refused word. Specifically:

- `CheckCircle2` is gone from `commercial-document-shell.tsx`; `border-patina-sage bg-patina-sage/5`
  is gone from both `:110` and `:474`. Repo grep for `patina-sage|color-sage|text-green|text-red|
  CheckCircle` over `apps/client-portal/src` now returns only `--color-sage` in `globals.css`,
  `share/[token]/board-reactions.tsx` (a selection state, not an outcome) and two dead helpers in
  `lib/utils/format.ts` (`statusAccentClass` / `statusDotClass` — **zero callers**, advisory only).
- `changes_requested` is RETURNED on the stamp and `Returned` in `client-attention.ts:61`, with a
  test that asserts it is never `Declined`. `needs_discussion` reads `Held`.
- Ink tokens `--color-clay-ink #7C5E30`, `--color-terracotta-ink #9C5340`,
  `--color-golden-hour-ink #79651E` are byte-identical to `apps/designer-portal/src/app/globals.css:34,35,40`.
  Terracotta is spent on exactly one state and no state carries sage — both asserted.
- No new route, no header, refusal copy goes through `lib/threshold/refusal.ts`, `consent-copy.ts`
  untouched. `scored-action.tsx`, `door-gate.tsx`, `door-acts.tsx`, `scope-change-ask.tsx`
  untouched (stage B's files).
- Commits are pathspec-clean: 17 files, no `.env`, no `.claude/`, no stray artefacts;
  Conventional Commits subjects, no trailers, nothing pushed, no production mutation.

## Findings

### W2A-01 · MAJOR · the change note is posted again on every retried Return
`approval-ask.tsx:800-808`. The comment write is unconditional inside `submitResponse`; if
`respond.mutateAsync` then throws (concurrency refusal, network), the note is already in the
thread, the refusal invites her to press Submit again, and the second press posts the **same note
a second time**. Proven with a throwaway probe suite in this worktree (deleted afterwards):

```
REVIEW PROBE — the note on a retried return
  ✓ posts the change note a second time when the outcome write failed (96 ms)
Test Suites: 1 passed  Tests: 1 passed
```
— `respondMutate` rejected once; `commentMutateAsync` ended on **2** calls for one return.

Fix: latch the landed note (a ref holding the text that was accepted) and skip the comment write
when the pending note is identical, or move the note behind the outcome and re-drive it on retry.
Either way the lane's own reason for ordering the note first ("an edition sent back saying
nothing") survives.

### W2A-02 · MAJOR · P-14's cover-image leg reads a key the frozen snapshot cannot contain
`approval-ask.tsx:219-228` looks for `sourceSnapshot.coverImageUrl` / `.cover_image_url`.

1. `sourceSnapshot` is not on `ProjectApprovalReview` and not on the projection — repo grep for
   `sourceSnapshot|source_snapshot` across `packages/supabase/src` returns only three
   `database.types.ts` rows. The lane notes flag this.
2. The lane notes do **not** flag the deeper problem: the snapshot's shape is fixed by
   `_resolve_project_approval_artifact` (`supabase/migrations/00463:250-263` and `:338-349`), which
   builds `plan_issue` as exactly `kind,id,version,checksum,title,issuedAt,sheetCount` and
   `budget_version` as `…checkpointCode,publishedAt,low/target/highTotalCents`. There is **no
   cover-image key on either kind**, and the immutability guard at `00463:764-772` rejects any
   artifact row whose `source_snapshot` differs from that function's output — so the key cannot
   appear without a migration.

Net: for `plan_issue` editions the plate is *always* the titled fallback, and four tests
(`approval-ask.test.tsx:517-546`) pin a shape that does not exist. The budget leg of the sub-item
is genuinely delivered; the preview leg is inert. Orchestrator call: either accept the titled
plate as the shipped behaviour for Wave 2 and delete the invented keys (`sheetCount` is a real
snapshot field and would make an honest "N sheets" line), or hand the snapshot-widening to the
backend lane and keep the branch.

### W2A-03 · MINOR · duplicate DOM id when two budget editions stand on the doorstep
`approval-ask.tsx:350` hard-codes `id="approval-budget-breakdown"` and `:378` an
`aria-controls` to it, while `threshold.tsx:953-961` maps `doorstepAsks` and renders one
`ApprovalAsk` per open approval. Every other id in the file is namespaced
(`approval-gate-${decisionId}`, `approval-change-note-${decisionId}`). Two budget asks → two
identical ids and an ambiguous `aria-controls`. Namespace it the same way.

### W2A-04 · MINOR · `previously.tsx` was not given the stamp, and its other three words changed pigment
P-17 reads "Replace the two ad-hoc stamps … **and previously.tsx's state words** with it."
The lane borrowed `STAMP_DIALS.signed.word` / `.ink` for one of four words and left the leader
line a plain span (`previously.tsx:127-135`). Defensible — Answered / Standing / Sent are not
stamp states — and the lane flagged it as a judgment call. But it also moved those three words
from `--color-mocha` to `--text-muted`, which is a visual change beyond "state words only" and
was not asked for. Needs a ruling: accept the reading, or restore the mocha and take only the word.

### W2A-05 · MINOR · the wall's receipt now says APPROVED under a button that says "Accept"
`wall-gate.tsx:210-229`. The trade-acceptance act is still **"Accept the finished work"**
(`:255-265`) and the stamp beside it now reads **APPROVED**, where it read "Accepted {date}". One
act, two words, on the same card. The lane flagged this itself and offered a word override on
`Stamp`. Either give `Stamp` an override and print ACCEPTED, or change the act's verb — but not
neither.

### W2A-06 · MINOR · the ledger prints zeros as figures
`standing-sentence.ts:453-462` renders `Cost $0` / `Schedule 0 days` / `Lead time 0 days`.
`ux/02 §Step 4` is explicit: *"nothing reported as zero — a delta of zero becomes 'does not move',
never '$0'"*, with the ledger shape `COST +$4,200 · SCHEDULE +3 DAYS · LEAD TIME UNCHANGED`. The
spoken sentence obeys the rule; the ledger does not, and the vision line ("words instead of
numbers where words will do") points the same way. Print `UNCHANGED` for a zero leg.

### W2A-07 · MINOR · a baseline with no movement reads as a stutter
`approvalWeighing({cost:0, schedule:0, leadTime:0, costBaselineCents:4_688_000})` returns
`"$46,880 becomes $46,880, the schedule does not change, and the lead time does not change."`
plus a three-zero ledger, instead of the shipped `"No cost, schedule or lead-time change."`
Deliberate and tested (`standing-sentence.test.ts`, "states a baseline that did not move"), so
this is a copy ruling rather than a bug — but "becomes the same figure" is not a fact a person
says. Suggest: the all-zero early return should win over the presence of a baseline.

### W2A-08 · MINOR · the change-note instruction is set as a field label, not an instruction
`approval-ask.tsx:1052-1057`. "Tell Leah what to change." — a sentence, with a period — is
rendered in `font-mono text-[11px] uppercase tracking-[0.13em]`, the file's eyebrow register. P-16
asks for *instructional copy*, and an all-caps 11px mono sentence reads as a required-field label,
which is the exact register the item is trying to avoid. The helper beneath it ("It goes into the
discussion below with your answer.") is correctly body-sized; the instruction should be too.

### W2A-09 · MINOR · a cover that fails to load leaves a broken frame with no fallback
`approval-ask.tsx:250-268`. Once `cover` is non-null the titled-plate/budget branches are skipped
for good; there is no `onError` to fall back. `next.config.js:110` allows `img-src … https:` so
CSP will not block it, but a 404 or an expired signed URL leaves an empty frame with alt text and
no edition name inside it. Latent today only because of W2A-02.

### W2A-10 · NIT · the maker's mark sits inside the frame, over the caption
`approval-ask.tsx:286-291` positions it `absolute bottom-1.5 right-2` inside the `p-3` figure, on
top of the caption's "Edition 3 · Issued August 2" line at narrow widths. `ux/02 §Step 2` puts it
on the frame's **bottom-left outside** edge. No browser walk was run by the lane or by me, so this
is unverified either way — it belongs on the pre-ship visual pass.

### W2A-11 · NIT · `projectApprovalAttentionLabel` is now dead
Repo grep: the only non-test reference is its own definition and a comment in `stamp.tsx:221`.
The "Returned everywhere" reconciliation the brief asked for is real inside the function, but the
on-screen word now comes from `STAMP_DIALS`. Keep it as the prose vocabulary (that is what the
lane says it is) and say so in the file, or retire it.

### W2A-12 · NIT · `previously.tsx` now emits literal uppercase in the DOM
`STATE_WORD.signed` became the stamp's `SIGNED` while Answered / Standing / Sent stay title-case;
the span already had CSS `uppercase`, so nothing changed visually, but the accessible name did.
Some screen readers spell all-caps tokens letter by letter.

### W2A-13 · NIT · every stamped state is read aloud twice
`stamp.tsx:262` gives `role="img"` + `aria-label` only to `awaiting`. `ux/02 §6` says the stamp
should stay `aria-hidden` with the meaning on the adjacent sentence — "the stamp is decoration
over a sentence, and duplicating it would read the state twice." Pre-existing behaviour, now
centralised in one component and therefore cheap to correct.

### W2A-14 · NIT · a code change rides in the docs commit
`9b204f01e` drops a dead `moneyInWords` import alongside `web-notes.md`. The message says so; it
is still a mixed commit.

### W2A-15 · NIT · a cover would hide the budget
`approval-ask.tsx:260-271`: `cover` is checked before `artifactKind === 'budget_version'`, so a
budget snapshot that ever carried an image would hide the exact-to-the-cent table behind a
picture. Order the budget first.

## What I verified positively

- **P-17.** Eleven states, exactly and in order (`stamp.test.tsx:28-41`); four dials; no fill, no
  shadow, no checkmark (asserted per state); `−1.1deg` on the six pressed here and `0deg` on
  awaiting / signed-on-paper / withdrawn / superseded / expired; aging flips at exactly 30 days
  (28 d 23 h → false, 30 d → true) and never touches the word ink; open states never age; a mark
  with no date is drawn fresh. `stampStateForApproval` keeps withdrawn/superseded ahead of any
  outcome.
- **P-16.** One `OUTCOME_VARIANT = 'secondary'` for all three acts, asserted by collecting the
  three buttons' `da-*` classes into a Set of size 1. Labels and consequences are verbatim from
  the brief. The note is required for Return only; submit is `disabled` (`disabled:opacity-50`, no
  red, no `role="alert"`, no "required"), whitespace-only is rejected, the other two outcomes are
  unaffected, and the note is posted before the outcome with `invocationCallOrder` asserted.
  Telemetry keys deliberately unchanged.
- **P-15.** `approvalWeighing` is pure and covers every case the brief names (all-zero, one
  non-zero, all non-zero, with and without baseline) plus cardinality, NaN/Infinity, and a
  "no pigment" assertion. Deltas are never summed. The zero-delta-in-words rule holds in the
  sentence.
- **P-14.** The fail-closed budget guard (`approval-ask.tsx:305-309`) is byte-for-byte the base
  version — comment and all three conditions. The maker's mark is exactly twelve characters and
  the plate carries none of `checksum|sha|fingerprint|verify`. The question is a `<blockquote>` on
  `border-l-2 border-[var(--accent-primary)]` — and `--accent-primary` resolves to
  `var(--color-clay)` (`globals.css:42`), so the clay rule the item asks for is the rule that
  renders. The attribution is withheld when the house has no name. The why-line is read
  defensively (absent / blank / non-string all draw nothing). The breakdown folds `hidden sm:block`
  behind an `sm:hidden` scored disclosure. Artifact-before-question matches `ux/02`'s Step 2 →
  Step 3 order.

## Advisories (do not block)

- `globals.css` is outside the lane's named file set; the three ink tokens had to live somewhere
  and the lane flagged the overlap with stage B's I107 block. The two blocks are far apart.
- `prettier --check` fails on files this lane touched **and** on files it did not
  (`doorstep.tsx`, `letterbox.tsx`, `refusal.ts` fail on the base commit) — pre-existing,
  repo-wide for this app.
- No browser walk exists for any of this. The plate frame, the pull-quote rule, the maker's-mark
  placement, the `sm:` fold and the aged `color-mix()` border are jsdom-and-classname evidence
  only. One 375 px pass and one reading-width pass are owed before the wave ships.
