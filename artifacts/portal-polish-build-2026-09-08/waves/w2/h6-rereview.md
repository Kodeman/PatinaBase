# Lane H6 — The money block and one date (PP-2) — RE-REVIEW

**Re-reviewer** — separate context; did not implement H6; did not write the first review or the fix.
**Branch reviewed** `origin/portal-polish/h6` @ `bd5b573a785cab0e7629f963bf1fc79c75ed3953` (fix commit),
base `b287bac26` (the commit the first review read), cut from `origin/main` @ `1059f5275`.
**Worktree inspected (read-only)** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h6`
(HEAD confirmed to match `origin/portal-polish/h6` exactly).

**Method.** Read the plan's Lane H6 section, the Review protocol, `h6-impl.md`, `h6-review.md`,
`h6-fix.md`. Fetched `origin` fresh (first attempt failed with an SSH error inside the sandbox; retried
with the sandbox disabled and it succeeded). Pulled the real diff
(`git diff origin/main...origin/portal-polish/h6`, 33 files / +636 / −245) and read every changed hunk
in full, not the reports' summaries. Re-ran every gate command myself from the worktree. Independently
ran a mutation check against the fix round's new test coverage. Cross-checked against
`docs/design/house-sheet/SPEC.md` (the `agent-pp-h6` worktree's copy) §A3/A5/A6 and the money-block
region of `artifacts/portal-polish-review-2026-09-08/specimens/client-house.html`.

## Gate commands — re-run myself, real output

```
$ pnpm --dir .../agent-pp-h6/apps/client-portal type-check
> tsc --noEmit
(exit 0, no output)

$ npx jest src/components/threshold src/lib/threshold      (from apps/client-portal)
Test Suites: 54 passed, 54 total
Tests:       1310 passed, 1310 total
Snapshots:   0 total
Time:        8.89 s

$ npx eslint src/components/threshold src/lib/threshold    (from apps/client-portal)
approval-ask.tsx:1079:7  error    react-hooks/set-state-in-effect
instruments/tracking-row.tsx:104:9  warning  Unused eslint-disable directive
✖ 2 problems (1 error, 1 warning)

$ grep -rn "en-US" apps/client-portal/src/components/threshold apps/client-portal/src/lib/threshold
components/threshold/approval-ask.tsx:154            Intl.NumberFormat('en-US', currency)
components/threshold/instruments/tracking-row.tsx:81 Intl.NumberFormat('en-US', currency)
components/threshold/instruments/standing-sentence.ts:210 Intl.NumberFormat('en-US', currency)

$ grep -rn "Intl.DateTimeFormat" apps/client-portal/src/components/threshold apps/client-portal/src/lib/threshold
details-sheet.tsx:421   Intl.DateTimeFormat().resolvedOptions().timeZone   (not a date print)
approval-ask.tsx:54     LETTER_DATE, en-GB, day+month+hour+minute — not one of the two idioms
lib/threshold/dates.ts  every remaining construction (LEGAL_DATE, DAY_MONTH_FORMAT, MONTH_NAME_FORMAT)
```

Every number matches both `h6-review.md` and `h6-fix.md` exactly. Test count is 1310, up from the
review's 1307 (the fix round's three new `derive.test.ts` cases). Eslint's two problems are unchanged
in count and location.

**Independently confirmed pre-existing, not lane-introduced:**
- `approval-ask.tsx:1079` — the enclosing `useEffect` (lines ~1070–1085) is byte-identical between
  `origin/main` and this branch; the lane's diff on this file touches only lines 33, 51-53, 272-275,
  314-317, 407-410 (import + date-format-call swaps).
- `tracking-row.tsx` — `git diff origin/main...origin/portal-polish/h6 -- .../tracking-row.tsx` is
  **empty**.

## Independent verification of the fix round's H6-2 (the test-coverage gap)

The review's real finding was that `derive.ts`'s new `paidCents`/`owedInvoiceNumber` computation inside
`deriveThreshold()` had no assertion against a real invoice-row input — only a hand-built
`HouseLedgerModel` was tested via the component. The fix added two extended tests and three new tests
to `derive.test.ts`'s `deriveThreshold` describe block.

I mutated `derive.ts` myself to check the new tests actually catch a wrong computation (then reverted):

```
$ sed -i '' "s/paidCents: openRollup ? openRollup.paidCents : null,/paidCents: openRollup ? openRollup.outstandingCents : null,/" src/lib/threshold/derive.ts
$ npx jest src/lib/threshold/__tests__/derive.test.ts
  ✕ names no letter when the one open letter carries no number
    Expected: 100000
    Received: 400000
Tests: 1 failed, 87 passed, 88 total
$ git diff --stat src/lib/threshold/derive.ts   # after restoring — empty
```

The mutation is caught (I only ran one of the two mutations the fix report describes; it failed
exactly as claimed). **H6-2 is genuinely fixed**, not just asserted fixed — this is real behavioral
coverage of the derivation, not markup coverage.

## Pathspec discipline

Full 33-file diff cross-checked against the lane's file list and the shared-file table:

- `dates.ts` (new), `dates.test.ts` (new), `house-ledger.tsx`, `letterbox.tsx`, `standing.ts`,
  `derive.ts` — all named directly. ✓
- The thirteen named `.tsx` files (`earlier-invoices`, `road-orders`, `approval-ask`, `ground-floor`,
  `the-note`, `correspondence`, `door-acts`, `previously`, `story-pole`, `door-gate`, `wall-gate`,
  `scope-change-ask`, `review-ask`) — all present, all touched only for the date-import swap. ✓
- `instruments/{spine-toll,making-spine,signature-line}` — touched, in-list. `standing-sentence.ts` and
  `tracking-row.tsx` are in the lane's *permitted* list but **not required**; both confirmed untouched
  (empty diffs) — consistent, not a defect.
- `doorstep.tsx` and `threshold.tsx` — confirmed **empty diffs** against `origin/main`, matching the
  report's "what I did not do" and the shared-file table's H3/H5 ownership.
- `room-band.tsx`, `papers-sheet.tsx`, `room-capture.tsx` — confirmed **empty diffs**; all three still
  successfully import `DAY_MONTH` from `derive.ts` (re-exported as `DAY_MONTH_FORMAT`), so this lane's
  rename inside `derive.ts` did not break any of H5's or the room-band group's files.
- Test files not literally named (`threshold.test.tsx`, `threshold-robustness.test.tsx`,
  `open-chapter.test.tsx`) — I independently read every hunk in the first two: they are narrow
  string/testid corrections that `house-ledger.tsx`'s and `letterbox.tsx`'s own model/DOM changes
  necessitated (e.g. `house-ledger-owed` no longer carries the due-date suffix; the reconciling
  sentence replaces the old owed-row text). No assertion of substance was added or removed. I concur
  with the original review's characterization: informational, not a pathspec violation, correctly
  flagged for the integration lane's awareness. `open-chapter.test.tsx` is confirmed to be the
  (legacy-misnamed) suite for `SpineToll`/`TrackingRow`, both named in H6's file list.
- Fix round added exactly two files: `door-acts.tsx` (in-list) and `derive.test.ts` (test of an
  in-list file). Both appropriate.

**No pathspec violation found.**

## House sheet compliance (SPEC.md §A3, §A5, §A6)

- **No new hex literal**: `git diff | grep -oE '#[0-9A-Fa-f]{3,8}'` on every added line across the full
  diff — **zero hits**.
- **No shadow / pill / badge / dot / ✓ / spinner / `opacity .5` / `disabled=` / ellipsis** — grepped the
  full diff's added lines for all of these — **zero hits** on every one.
- **Type steps (§A3)**: `.t-d2` on the single announced owed figure (matches "the announced money
  figure" row exactly); `.t-meta` on the due line and the letterbox's "Invoice" gloss (matches "values:
  dates, counts, captions, sub-labels"); `.t-body` on the reconciling sentence (matches "prose,
  consequence sentences, state sentences"); `.t-body-sm` on `standsSentence` (matches "dense prose");
  `.t-money` on every other ledger and letterbox figure. **One family per figure, one announced figure
  per block** — verified directly in the JSX, not just asserted.
- **§A6 the consequence sentence**: verbatim text, `.consequence` class, placed directly above the
  terminal act — confirmed by reading the JSX order and by the lane's own
  `compareDocumentPosition`-based test.
- **No anchor id renamed**: `id="ledger"` and `id="letterbox"` both survive untouched; every
  `id="..."` diff hunk in the full `components/threshold` diff is a `data-testid` addition, not an
  `id=` change.
- **No `$0` placeholder**: the `$0 paid` in the reconciling sentence is a true reconciled value (it
  answers "how much of the owed figure has been paid"), matches the plan's own worked example and the
  specimen's literal markup (`<span class="t-money">$0.00</span> paid`). Rows with no truthy figure
  (`held`, `awaiting`) are still `flatMap`-filtered out entirely — never rendered as a zero row.
- Cross-lane classes (`t-d2`, `t-meta`, `t-body`, `t-body-sm`, `t-money`, `.consequence`) are correctly
  unstyled on this branch alone (H2 owns `globals.css`) — expected, disclosed, not a defect.

## PP-2 / R140 ruling — implemented correctly

- Exactly one announced figure per block (the owed one), `.t-d2`, above `standsSentence()` — confirmed
  by DOM order in both the JSX and a passing test.
- One reconciling sentence, three `.t-money` clauses, agreed/paid/owed in that order — confirmed.
- The letterbox's own body line sets all three of its figures at `.t-money` too (VC-10 — no block shows
  one payment in three families).
- Date sweep: independently re-ran `grep -rn "Intl.DateTimeFormat"` across scope myself (above) — the
  only surviving constructions are inside `dates.ts`, plus two correctly-excluded non-idiom cases
  (`details-sheet.tsx`'s timezone probe, `approval-ask.tsx`'s `LETTER_DATE` timestamp). "Due 11
  September" one line above "due September 11" cannot recur anywhere in scope.

## Accessibility

No new interactive control. The Pay act is the pre-existing `ScoredAction`, unchanged except its
`variant` and label text. Focus ring, `aria-disabled`/`aria-describedby`, 44px target and contrast are
all owned by `ScoredAction`/H4's CSS, correctly untouched by this lane. `<figure>`/`<figcaption>` is
static text, not a control. `data-never-dim` on the letterbox root is untouched and now pinned by a
test.

**One real, verified gap, carried forward from the first review (still open, not this lane's to
close):** SPEC §A6 says the consequence sentence is "present in every state including unavailable."
I read the JSX and the lane's own new test (`says nothing about payment when the letter has no address
to open` — asserts `letterbox-consequence` is **absent**, not present-and-disabled, when `invoiceLink`
is falsy) and confirmed: there is no "Pay unavailable" state rendered at all — the consequence sentence
and the terminal act both simply do not exist while the link is loading. The exact same `invoiceLink &&`
gate wrapped the pre-existing `variant="primary"` act before this lane touched the file, so the
*condition* is not new — but the *sentence this lane added* is the one governed by §A6's "every state"
clause, and it does not meet it. Building the unavailable state needs H4's `aria-disabled` terminal
styling, which is a real cross-lane dependency, not something H6 can do alone. I agree with the first
review's disposition (flag, do not block) rather than escalate it further, but note it explicitly here
since the re-review brief asks for a specimen/sheet comparison independent of the first review's
framing.

## New findings not caught by the first review round

1. **`door-gate.tsx` — orphaned doc comment, same defect class the lane fixed elsewhere.** The sweep
   removed `const DAY_MONTH = new Intl.DateTimeFormat(...)` at `door-gate.tsx` but left its doc comment
   standing alone above unrelated code:
   ```
   const SWING_MS = 520;

   /** "5 August" — the deck's own date idiom. */

   function capitalize(text: string): string {
   ```
   This is the identical pattern the first review caught in `door-acts.tsx` (H6-3) and the lane fixed —
   but the same sweep left the same defect in `door-gate.tsx` uncaught, in both the original review and
   the fix round. **P3, confidence high.** One-line deletion (plus the stray blank line it leaves).

2. **`story-pole.tsx` — a double blank line left where two date-format consts were removed.**
   ```
   const ACCENT = 'var(--threshold-accent, #8A5F19)';


   /**
    * The chapter's name, resolved per phase rather than taken off the spine.
   ```
   Purely cosmetic (prettier would collapse it on a full-repo format pass, which nothing in this wave
   runs). **P3, confidence high.**

## Findings carried forward from the first review, re-verified

3. **P2, high, still open — not a code defect, an escalation.** The plan's literal H6 gate line
   (`grep -rn "en-US" ... # expect zero`) does not pass: three `Intl.NumberFormat('en-US', {style:
   'currency'})` money spellers remain (`approval-ask.tsx:154`, `tracking-row.tsx:81`,
   `standing-sentence.ts:210`). I independently confirmed all three are currency formatters, not date
   formatters, and that re-locating them to `en-GB` would print `US$4,060.00` to a US homeowner — a real
   regression, not a cosmetic one. PP-2/R140 as ruled governs the money *family* (DM Mono) and the date
   *style*, not money's locale. The fix round's disposition — no code change, escalate the gate-text
   mismatch with a recommended substitute gate (`grep Intl.DateTimeFormat ... | grep -v dates.ts`) — is
   the correct move for a lane that cannot unilaterally edit a shared cross-lane plan document. This
   remains open **as a plan/ruling item for Kody or the integration lane**, not as unfinished work in
   H6's own diff.
4. **P3, high — confirmed fixed.** `door-acts.tsx`'s orphaned comment — verified removed, no other
   change to the file's surrounding lines.
5. **P3, high — informational, correctly left alone.** `instruments/__tests__/open-chapter.test.tsx`
   not literally named in H6's file list; confirmed to be the legacy-misnamed suite for `SpineToll`/
   `TrackingRow`, both in-scope.
6. **P3, medium — informational, correctly left alone.** `threshold.test.tsx` /
   `threshold-robustness.test.tsx` touched though `threshold.tsx` is H3/H5's; independently re-read both
   diffs in full (above) — narrow, necessary, no scope creep.
7. **P3, medium — confirmed still present, correctly out of scope for this lane.** The specimen unifies
   the owed figure, reconciling sentence, and letterbox drawing/Pay act into one
   `<section class="money" id="letterbox">` with a shared `.money-grid`; the built page keeps
   `house-ledger.tsx` (`#ledger`) and `letterbox.tsx` (`#letterbox`) as two sections. I read the
   specimen's markup directly (lines 673–699) to confirm. Both ids are protected by the plan's anchor
   list; unifying them is a structural change no Wave 2 lane owns.
8. **P3, medium — confirmed still present (see Accessibility above), correctly flagged rather than
   fixed by this lane.** §A6's "present in every state including unavailable" is not met when
   `invoiceLink` has not resolved.

## Specimen comparison (independent read)

Read `artifacts/portal-polish-review-2026-09-08/specimens/client-house.html` lines 673–699 directly.
The built grammar matches the specimen closely for what is inside each block: owed figure at `.t-d2`,
"due DATE" at `.t-meta`, one `.t-body` reconciling sentence with three `.t-money` spans in the same
agreed/paid/owed order, the drawing with a plain `.t-meta` "Invoice" gloss, then `.consequence`, then
the terminal Pay act carrying the amount. The one structural divergence (two sections vs. the
specimen's one `<section class="money">` housing both the figure column and the drawing side by side in
a `.money-grid`) is real and already covered as finding #7.

## What I verified was NOT done (matches both reports)

`doorstep.tsx`, `threshold.tsx`, `room-band.tsx`, `papers-sheet.tsx`, `room-capture.tsx`,
`instruments/standing-sentence.ts`, `instruments/tracking-row.tsx` — all confirmed empty diffs. No dev
server, no DB reset, no deploy, no money-format re-locale, no plan edit, no unavailable-Pay state, no
unification of the two money sections.

## Verdict

**approve.**

Both P2s the first review raised are resolved on their own terms: H6-2 (test-coverage gap) is fixed
with real behavioral assertions that I independently confirmed via mutation testing; H6-1 (the literal
`en-US` gate text) is not a defect in H6's diff — it is a well-reasoned, fully disclosed scope boundary
that needs a ruling from whoever owns the plan document, not a code change from this lane, and the fix
round correctly declined to make an unauthorized edit to a shared file instead of silently absorbing it.
My own independent pass found two small new P3 cosmetic issues (an orphaned comment in `door-gate.tsx`
mirroring the one already fixed in `door-acts.tsx`; a stray double blank line in `story-pole.tsx`) and
re-confirmed every P3 the first review carried — none rise to a level that should block merge, and none
touch the house-sheet-facing behavior, which is correctly built, correctly tested, and independently
verified against the sheet and the specimen.
