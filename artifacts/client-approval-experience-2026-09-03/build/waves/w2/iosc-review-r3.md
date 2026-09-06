# iOS-C lane — adversarial review, round 3

Reviewer: separate context, did not write this code.
Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-iosc`
(`git rev-parse --show-toplevel` → exactly that), branch `approvals/w2-iosc`,
base `107549568`.

```
$ git log --oneline main..HEAD
0e49f91ca docs(approvals): W2 iOS-C fix round 2 — the two majors
14a6cf857 fix(ios): the note she writes is on the approval she is reading (IOSC-R2-01)
476b0c50b fix(ios): the muted stamps write in an ink that can be read (IOSC-R2-02)
359c24072 docs(approvals): W2 iOS-C lane adversarial review, round 2
165fb8c8f docs(approvals): W2 iOS-C fix round 1 — the five findings and the four rulings
a29dee43c style(ios): the two SwiftLint warnings the fix round introduced
92ee2068f fix(ios): one migration for the wave, and the note lands on the approval (IOSC-01, IOSC-02, IOSC-03, R1)
8a11f6f31 fix(ios): the seal waits for the sign cover to leave (IOSC-05, P-19 copy)
c5b6537c7 fix(ios): a closed stamp draws a rule that is actually on the paper (IOSC-04)
c1d7bf924 docs(approvals): W2 iOS-C lane adversarial review, round 1
a5c85d582 test(ios): move the response-RPC pin off a file at file_length
b171f2268 docs(approvals): iOS-C lane notes for Wave 2 (P-17, P-16, P-18, P-19)
e2b41b262 feat(ios): the seal and the act, full screen (P-19)
bca153616 feat(ios): three doors of equal weight, held and signed (P-16, P-18)
fdbcc0111 feat(ios): eleven states, one stamp — the seal glyphs and the sage retire (P-17)
```

38 files, +5046 / −305. Every one of the fifteen commits is pathspec-clean: I
listed `--name-only` for each and nothing under `.claude/`, `.agents/`, hooks,
settings or any `.env` appears in any of them. Conventional Commits, no
`merge(...)` subject, no trailers. `git for-each-ref refs/remotes | grep
w2-iosc` returns nothing — **not pushed**. Working tree clean (the eight
`Operation not permitted` lines in `git status` are the harness sandbox
refusing to READ `.env*`, not modifications). `ls supabase/migrations | tail`
ends `00568_decision_first_notice_dispatch.sql` — **this branch ships no SQL**;
the 00569 it once carried is added in `bca153616` and removed in `92ee2068f`,
net zero across `main...HEAD`.

**Verdict: ship.** No blocker, no major. Both r2 majors are genuinely fixed and
I traced each to code, to RLS, and to a test that would fail without it. One r2
nit (IOSC-R2-06) is CLOSED with evidence from the backend lane's migration
rather than left open. What remains is a long minor/nit tail — almost all of it
declared, argued and out of the successive fix briefs — plus six new small
findings and two items that belong to the wave rather than to this lane.

---

## Gates — rerun by me, unsandboxed, on this lane's simulator

```
$ IOS_GATE_UDID=B6AD6271-E9E1-4BC6-B94A-F115E270CCAE .../ios-gate.sh build
** BUILD SUCCEEDED **                                              BUILD_EXIT=0

$ IOS_GATE_UDID=B6AD6271-E9E1-4BC6-B94A-F115E270CCAE .../ios-gate.sh unit
━ Test run with 2537 tests in 276 suites passed after 8.854 seconds
  with 2 known issues.                                             UNIT_EXIT=0
    known issue 1: BrandVoiceLintTests "curated_mix"    (pre-existing, on main)
    known issue 2: RoomLifecycleTests.theTodayRailFollowsALocalDelete (pre-existing)

$ .../ios-gate.sh lint-delta main
✓ lint-delta: no new warnings in touched files
```

2537 / 276 is the count the lane reports, and it passed FIRST TIME on my run —
`CompanionCoachingModelTests.introGate_freshUser_pollsUntilTourResolves`, the
load flake, did not reproduce, so no isolation rerun was needed. All five new
suites pass inside the full run (`PatinaStampTests`, `HoldToActTests`,
`ProjectApprovalDoorsTests`, `SealMomentTests`, `ApprovalDiscussionTests`),
including the twenty-four contrast measurements `everyStampWordStaysReadable`
now makes — which is the machine check on IOSC-R2-02's fix.

I also ran SwiftLint directly over the three `PatinaDesignKit` files the gate's
window cannot see (IOSC-R2-08):

```
$ swiftlint lint --quiet --config apps/mobile/Patina/.swiftlint.yml \
    PatinaStamp.swift PatinaColors.swift PatinaEmptyState.swift
PatinaColors.swift:350:13/16/19/22: identifier_name — 'a' / 'r' / 'g' / 'b'
```

Four warnings, all on the pre-existing `Color(hex:)` parser, untouched by this
branch. **No lint debt is owed.**

---

## Round 2's two majors, verified

### IOSC-R2-01 — the change note was write-only on iOS · **FIXED**

`ApprovalDiscussion` (new service) is the SELECT the INSERT was missing:
`from("decision_comments").eq("decision_id", …).order("created_at",
ascending: true)` — byte-for-byte the query `useDecisionComments` makes
(`use-decisions.ts:963-967`), same filter, same order. I checked the RLS rather
than taking the comment's word: `00467:248` creates
`decision_comments_participant_select … TO authenticated USING
(app_private.is_decision_comment_client(decision_id))`, and that resolver
(`00467:200-228`) accepts, for a `project_artifact_v1` row, the authority
snapshot's `decision_lead_id` — the homeowner being asked. `EXECUTE` on the
resolver is granted to `authenticated` at `00467:233`. She can read it.

`ApprovalDiscussionBlock` draws it beneath the three doors, read-only, quiet on
an empty thread and explicit on a refused one. The block matches the web's
`Discussion` where it matters: same heading ("The discussion"), same
attribution shape ("You" / `studioHand`), same date-only stamp.

The part that makes it actually work is the reread key, and it is right:
`approvalDiscussionKey` is `"{decisionId}#{!isSubmitting && hasAnsweredApproval}"`,
and `submitApprovalResponse` records the outcome → writes the note →
`defer { isSubmitting = false }`, so the key moves exactly once, AFTER the note
is on the server. Keyed on `answeredOutcome` it would have fired between the
two. `theRereadWaitsForTheNote` pins both edges by capturing the key from
inside the note seam — a behavioural test, not a grep.

Ten more tests behind it: the load, the refused read (named, not drawn as
empty), a later failure keeping what is on screen, the nil/empty guard, the
case-insensitive `isMine`, the four attribution branches. And
`ProjectApprovalActTests.theStage2BranchHasNoStatusColour` grew a third
argument, so the branch-wide colour refusal still covers every view the branch
draws — the fix strengthened that pin rather than stepping around it.

### IOSC-R2-02 — the muted stamps' word at 4.20:1 · **FIXED**

`PatinaColors.Stamp.mutedInk` is now `oakInk` **#4E4339** — the designer
portal's `--text-muted` (`globals.css:80`) byte-identical, which is the ink the
ceremony table named — with `DarkPalette.textMuted` as its dark companion.
`Pigment.muted.lightInkHex` follows (`8B7355` → `4E4339`), so
`PatinaStampTests`' resolved-sRGB pin moves with the token. `agedOak` itself is
untouched, and its other hundred call sites with it.

The measurement gap is closed too: the previous round measured `pigment.rule`
for every pigment and `pigment.ink` for none. `everyStampWordStaysReadable` now
measures **all six word inks × two grounds × two appearances at the 4.5:1 text
bar** at full ink (the word never ages —`PatinaStamp.words` applies no
opacity), and `theMetadataInkStillCannotCarryTheWord` is the counterfactual, so
"the metadata token was fine" is met with a number. Twenty-four measurements,
all green in my own run.

---

## IOSC-R2-06 — CLOSED, with the backend answer r2 asked for

r2 left this open pending "one look from the backend lane": the CAS retry mints
a second idempotency key while the payload now carries a legal signature, so
could one signature produce two consent records? **No.** I read the merged
function on `approvals/w2-backend`:

- the receipt lookup IS keyed on `idempotency_key`
  (`00569:1403-1407`), so a fresh key does bypass the idempotent short-circuit;
- but the very next guards are `v_decision.updated_at IS DISTINCT FROM
  p_expected_updated_at → serialization_failure` (`:1418`) and
  `v_decision.status <> 'pending' → check_violation` (`:1422`). A response that
  landed leaves the row `responded`, so a second one is refused outright;
- and iOS only retries after a re-read that still says `fresh.canRespond`
  (status `pending`, `outcome IS NULL`) — i.e. only when the first call
  provably did NOT land.

Two keys for one act is untidy; it cannot write two consent records. Nothing is
owed here.

---

## New findings

### IOSC-R3-01 — MINOR · the red "Expired" line survives two lines from the badge P-17 just retired

`ProposalDetailView.investmentSummary:225` and `ProposalListView:150` both draw
the expiry sentence in `PatinaColors.Text.error`:

```swift
Text(expiry.text)                                   // "Expired Sep 8"
  .foregroundStyle(expiry.isPastDue ? PatinaColors.Text.error : …)
```

The Wave-1-close ruling is explicit — *"`DateDisplay.due` reads 'Past due ·
{date}' in body ink, never red — same refusal, every surface"* — and the
invoice rail obeys it (`InvoiceListView:184`, `InvoiceDetailView:193` both use
`Text.primary`). The two PROPOSAL surfaces were never moved. The colour is
pre-existing and outside the literal brief, but it now lands badly: this branch
deliberately retired the warning-tinted "Expired" badge from `statusRow`
("a fill standing in for a mark") and put a muted EXPIRED stamp in its place,
so on an expired proposal detail a homeowner gets the quiet stamp near the
header and a red status word in the investment card on the same screen. One
line each, and it is the same one-line change the invoice rail already took.

### IOSC-R3-02 — MINOR · the discussion is the one thing pull-to-refresh does not refresh

`DecisionDetailView:64` is `.refreshable { await viewModel.load(decisionId:) }`,
which refetches the row and the projection. The discussion is read by
`.task(id: readKey)` and `readKey` is `"{decisionId}#{settled}"` — neither term
moves on a reload, so `.task` does not re-run and the thread on screen is
whatever was read when the key last changed. The web keeps this live with
`useDecisionRealtime(decisionId)` (`approval-ask.tsx:305`). So a designer who
answers her note while she is still on the screen does not appear, and the one
gesture a homeowner uses to ask "is there anything new" reaches everything on
the page except the notes. Cheapest fix: fold a refresh counter into `readKey`,
or call `discussion.load` from the same `refreshable`.

### IOSC-R3-03 — NIT · a slow read and an empty thread look identical

`ApprovalDiscussionBlock.content` draws the list when there are comments, the
failure line when the read was refused, and **nothing at all otherwise** —
which covers both "no notes" (deliberate, and right) and "still loading". The
web separates them (`approval-ask.tsx:392`, "Loading comments..." with
`role="status"`). On a slow connection a homeowner who has just returned an
edition with a note sees empty space where her sentence is about to be. Not
wrong, but it is the one moment the fix exists for.

### IOSC-R3-04 — NIT · the discussion heading is not a heading, and the failure is not announced

`MonoLabel(text: ProjectApprovalCopy.discussionLabel)` carries no
`.accessibilityAddTraits(.isHeader)`, so a VoiceOver user browsing by heading
does not find the notes; the web gives it an `<h3>` with `aria-labelledby`
(`approval-ask.tsx:333`). `discussionUnreadable` is a plain `Text` with no
`role="alert"` equivalent, so the one sentence that says "what is here was not
read" is silent until she swipes onto it. Two modifiers.

### IOSC-R3-05 — NIT · the web's standing line about what a comment does has no iOS counterpart

`approval-ask.tsx:335-338` prints, under the heading: *"Comments help you and
your designer discuss the work. They never submit or change an approval
outcome."* That is P-11-reduced's *"one standing line naming who answers"*, and
iOS prints nothing. Weaker here than on the web, since iOS has no composer in
the block — but the two surfaces now say different amounts about the same
thread.

### IOSC-R3-06 — NIT · a stale header comment

`ProjectApprovalScreen.swift:14-16` still reads *"`ProjectApprovalActTests`
reads THESE two files and no others, because these two files are the entire
Stage-2 branch."* The test reads three as of `14a6cf857`. The test's own doc was
updated; the screen's was not.

### IOSC-R3-07 — NIT · a studio reader is attributed as the studio, and the homeowner as the studio too

`ApprovalDiscussion.isMine` compares `author_id` to the signed-in id, and
everything else is `studioHand(designer:studio:)`. For the studio co-member the
wave already knows reads the client app (the case `viewerRole` was minted for),
the homeowner's own note renders as "{Designer} · {Studio}". The web has the
same shape, so this is parity rather than a regression — but it is the second
place after IOSC-R2-07 where the client app assumes its reader is the
household.

---

## r2 findings still open, each re-verified against the current tree

| id | state | evidence |
|---|---|---|
| **IOSC-R2-03** MINOR | OPEN | `grep "PatinaStamp(" apps/mobile \| grep -v Tests` still returns six sites; `.awaiting`, `.reviewed`, `.signedOnPaper` unreachable. `ProjectApprovalBlock.reviewLeg:126` still closes the confirmed leg with a bare `Text(reviewConfirmed)` and no mark, three lines from `closureLine`. |
| **IOSC-R2-04** MINOR | OPEN | `PatinaStamp.body:279-283` draws `sublabel` in `monoLabel`, `.tracking(1.1)`, `.textCase(.uppercase)`. `SealMomentView:66` is the only caller. `ux/02` §5 wants Playfair. |
| **IOSC-R2-05** MINOR | OPEN | `closureLine:198-213` and `ProposalDetailView:200` still pass no `sublabel`; Superseded ships without its tie-line and Expired without its date. |
| **IOSC-R2-07** MINOR | OPEN (integration) | `grep -rn "viewerRole\|viewerAnswers" apps/mobile` in this worktree returns **nothing**; `outcomeLeg:219` and `reviewLeg` still gate on `review.canRespond` alone. Backend 00569 emits `viewerRole` (`:1140-1144`). Steward: after the iosc/iosd merge both act legs want `&& viewerAnswers`. |
| **IOSC-R2-08** MINOR | OPEN | `ios-gate.sh:120-121` still filters to `^apps/mobile/Patina/`. Confirmed by running SwiftLint on the three excluded files myself (above): four pre-existing warnings, no debt — the gate simply cannot see them. |
| **IOSC-R2-09** MINOR | OPEN | `ProposalDetailView:202` still passes `rowLabel(proposal)` as the label over a `stampState` that may have taken its `!isSignable` arm. |
| **IOSC-06** MINOR | OPEN | `HoldGesture.swift:71` and `:93` both fire `notification(.success)`; `SealMomentView:101` fires it again. Two on the sign path. |
| **IOSC-07** MINOR | OPEN | `PatinaColors.swift:290-292` — `Stamp.terracotta` dark is still `DarkPalette.textError`, the app's validation red. `PatinaColors.terracotta` exists. |
| **IOSC-08** MINOR | OPEN | `HoldToActTests.aReleasedPressCancelsAndNeverCompletes` still reads `prefix(360)` / `prefix(700)` source windows. Nothing proves 900 ms completes and 800 ms does not. |
| **IOSC-09** MINOR | OPEN | `HoldToActButton:54` applies `PatinaHold.voiceOverHint` ("Press and hold to confirm.") unconditionally, over the gesture `VoiceOverTapModifier` exists to replace. |
| **IOSC-10** NIT | OPEN, mitigated | `HoldToActButton(title: submitAction, isEnabled: canSubmitApproval)` renders inert at 0.5 with nothing naming the reason; the ruled line above it is the mitigation. |
| **IOSC-12** MINOR | OPEN, argued | `DecisionDetailView.resolvedStamp = .approved`, asserted not read. The lane's argument (no client-reachable path records another outcome on a legacy decision) still holds — `DecisionsAPIClient` exposes only `approve_client_signoff` and the option choice. |
| **IOSC-13** MINOR | OPEN | iOS records the outcome then the note (`+ProjectApproval.swift:144-145`); web posts the note first and aborts (`approval-ask.tsx:794-804`). Still needs one cross-surface ruling. |
| **IOSC-15** NIT | OPEN | `ApprovalNoteWriter.send:62-68` still re-implements `DecisionsViewModel.openThread`'s `.project`/`.direct` switch. |
| **IOSC-16** NIT | OPEN | `SealMomentView.swift:20` still `import UIKit`; the only platform call is `HapticManager`, which wraps UIKit itself. |
| **IOSC-17** NIT | OPEN | `settleFromRotation` (−3.4) still has no `#expect`. |
| **IOSC-18** NIT | OPEN | `DateDisplay.long(Date())` still evaluated inside `ProjectApprovalBlock.signatureLine:298` and `SignActView.signatureLine:180`. |
| **IOSC-R2-N1** NIT | OPEN | `ProjectApprovalDoorsTests.swift:166` — `#expect(body.contains("viewModel.canSubmitApproval"), "the submit gates on the note")`. The message still says the opposite of what the assertion proves. |
| **IOSC-R2-N2** NIT | OPEN | `DecisionsViewModel.swift:452-453` — still no blank line between `sendApprovalNote`'s closing brace and the doc comment heading `answeredOutcome`. |
| **IOSC-R2-N3** NIT | OPEN | `ApprovalNoteWriter.post` still sends an unbounded body against `CHECK (length(body) BETWEEN 1 AND 4000)`. Composer is `lineLimit(3...6)`; theoretical. |
| **IOSC-14** NIT | OPEN, declared | P-16 and P-18 remain one commit, with a stated reason. |

---

## For the steward

1. **The `why` still renders nowhere on iOS.** 00569 freezes
   `project_approval_artifacts.why` / `why_author_name` and emits both on the
   projection (`:1121`, `:1128-1130`); the mid-Wave-2 ruling says *"every
   surface renders '— {whyAuthorName}' only when present."*
   `grep -rn "whyAuthorName\|artifact.why" apps/mobile` returns nothing, and
   `RemoteProjectApprovalReview` carries no such field. Neither iOS lane's
   brief claims P-13 — iosd took `viewerRole` from the same migration, so the
   why looks **unassigned**, not dropped. Assign its iOS half (the line under
   the question on the Stage-2 screen, and the Record row) before the wave
   closes, or record the deferral.
2. **IOSC-R2-07 at integration:** `ProjectApprovalBlock`'s two act legs want
   `&& viewerAnswers` beside `canRespond` once iosd's `viewerRole` lands.
3. **Merge collisions:** both iOS lanes edit
   `DecisionsAPIClient+ProjectApprovals.swift` (iosc widened
   `respondToProjectApproval`; iosd added the viewer fields) and
   `ProjectApprovalCopy.swift`. Take **"Return"** on the copy file, and keep
   the new payload keys inside `respondToProjectApproval` —
   `HoldToActTests.theResponsePayloadCarriesTheSignature` reads a prefix window
   of that function.
4. **Deploy order still binds.** 00569 must be applied before an iOS build that
   sends a signature; before it, Approve fails `invalid_parameter_value` —
   loudly, with the honest failure sentence, but it fails. The lane ships no
   silent fallback, which is right.
5. **A walker is still owed** on the three things no test reaches: the seal
   presents after the sign cover dismisses and settles once (IOSC-05); a
   released press does not submit and a 900 ms one does (IOSC-08); VoiceOver's
   Activate still fires the act. Add a fourth now: a Return with a note shows
   that note in "The discussion" without leaving the screen (IOSC-R2-01).
6. **IOSC-R3-01** is a one-line change on two files and closes the last red
   status word on the client proposal rail — worth taking with this wave rather
   than filing it.

## Things I checked that are correct

- Payload keys match 00569's allowlist exactly (`p_payload - ARRAY['outcome',
  'optionId','clientConsentMethod','clientSignature']`, `:1682-1684`), and the
  consent pair travels together or not at all — the client drops both over an
  empty name, so Return and Hold leave `client_consent_method` at its
  clickthrough default.
- Signature only on Approve, per the mid-Wave-2 ruling:
  `approvalNeedsSignature == (chosenOutcome == .approved)`, the ruled line and
  its notice drawn only inside that branch, all three doors still held.
- Refusal grep over every added product string: `acts` labels/consequences,
  `noteLabel`, `notePlaceholder`, `noteHelp`, `noteUnsent`, `discussionLabel`,
  `discussionUnreadable`, `noteAttribution`, `signatureLabel/Notice/Placeholder`,
  `consentLine`, `signAction`, `cancel`, `sealHeading`, `done`,
  `whatHappensNext`, `edition`, and all eleven stamp words. **No badge, count,
  red/green, checkmark-as-status, shadow, fill, tab, emoji, "AI", "gate",
  "task", "dashboard" or "overdue" in any homeowner-visible string.**
  "Declined" appears only as a commercial document a client refused;
  `changes_requested` is RETURNED / "Returned" everywhere.
- P-19's ruled sentence is exact: *"{Studio} has your signature. You'll have a
  copy."*, "countersigns" gone, "Your designer" as the un-invented fallback.
- The comment date parse degrades safely: `DateDisplay.fromTimestamp` falls
  back to `prefix(10)` day parsing, so a six-digit Postgres fractional second
  cannot print a raw timestamp on screen.
- `PatinaEmptyState.icon` becoming `String? = nil` is source-compatible for
  every existing call site, Capture's included.
- `theStage2BranchHasNoStatusColour` was widened, not narrowed, when the third
  view landed.
- No `project.pbxproj` change was needed or made; no file under `supabase/` is
  in the diff.
