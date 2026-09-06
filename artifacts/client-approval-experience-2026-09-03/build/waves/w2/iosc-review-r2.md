# iOS-C lane — adversarial review, round 2

Reviewer: separate context, did not write this code.
Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-iosc`
(`git rev-parse --show-toplevel` → exactly that), branch `approvals/w2-iosc`,
base `107549568`.

```
$ git log --oneline main..HEAD
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

34 files, +3919 / −301. Commits are pathspec-clean — no `.claude/`, `.agents/`,
`.env`, hooks or settings in any of the eleven. Conventional Commits, no
`merge(...)` subjects, no trailers. `origin/approvals/w2-iosc` does not exist:
nothing was pushed. Program docs under `build/` are force-added as ruled.
No file under `supabase/` is in the diff and `ls supabase/migrations | tail`
still ends `00568_decision_first_notice_dispatch.sql`.

**Verdict: fix.** No blocker. Every r1 blocker and major is genuinely fixed —
I traced each one to the code and to a test that would fail without it. Two new majors, six new minors, four new nits,
twelve r1 findings still open, plus two items for the steward that belong to
the wave rather than to this lane.

---

## Gates — rerun by me, unsandboxed, on this lane's simulator

```
$ IOS_GATE_UDID=B6AD6271-E9E1-4BC6-B94A-F115E270CCAE .../ios-gate.sh build
** BUILD SUCCEEDED **                                              EXIT=0

$ IOS_GATE_UDID=B6AD6271-E9E1-4BC6-B94A-F115E270CCAE .../ios-gate.sh unit
✘ Test run with 2525 tests in 275 suites failed after 9.391 seconds
  with 3 issues (including 2 known issues).                        EXIT=65
    known issue 1: BrandVoiceLintTests "curated_mix"          (pre-existing, on main)
    known issue 2: RoomLifecycleTests.theTodayRailFollowsALocalDelete (pre-existing)
    third issue:   CompanionCoachingModelTests
                   .introGate_freshUser_pollsUntilTourResolves — the load flake
                   the brief names.

$ xcodebuild test … -only-testing:PatinaTests/CompanionCoachingModelTests
✔ Test run with 22 tests in 2 suites passed after 0.108 seconds.
** TEST SUCCEEDED **                                               EXIT=0

$ .../ios-gate.sh lint-delta main
✓ lint-delta: no new warnings in touched files                     EXIT=0
```

The flake reproduces the lane's own account exactly: it fails inside the full
run and passes in isolation on the same clone, and nothing in this branch
touches it. All four new suites pass in the full run (`PatinaStampTests`,
`HoldToActTests`, `ProjectApprovalDoorsTests`, `SealMomentTests`), and 2525 is
the count the lane reports.

---

## Round 1's findings, verified one by one

| r1 | Was | Now |
|---|---|---|
| **IOSC-01** BLOCKER · out-of-lane migration 00569 | a third copy of the wrapper widening, colliding on number | **FIXED.** `00569_stage2_outcome_signature_payload.sql` is deleted (`92ee2068f`); nothing under `supabase/` is in the diff. `respondToProjectApproval` sends `clientSignature` / `clientConsentMethod`, which is exactly the pair the backend lane's `00569` allowlists (`v_unknown := p_payload - ARRAY['outcome','optionId','clientConsentMethod','clientSignature']`) and passes to `_respond_project_approval_checked` in the declared argument order. Doc comment and the surviving test both name 00569, not the web lane's deleted 00570. |
| **IOSC-02** MAJOR · note landed in a chat thread, not on the approval | `MessagingAPIClient.createThread` first | **FIXED.** `ApprovalNoteWriter.send` posts `decision_comments{decision_id, author_id, body}` first and falls through to the conversation only on refusal; `decisionId` is `approvalReview.decisionId`. Admitted by 00467:256 for the frozen `decision_lead_id`, which is the homeowner. Pinned behaviourally (`theNoteFollowsTheOutcome` asserts order, id, trimmed body and that `discussThreadId` stays nil) and structurally. See **IOSC2-R2-01** for what the fix left behind. |
| **IOSC-03** MAJOR · placeholder could never name the designer | read `viewModel.decision`, nil for the person being asked | **FIXED.** `designerGivenName(embedded:projectId:projects:)` resolves from `approvalReview.projectId` against `BadgeCountService.shared.projects`, embed still winning, `nil` (→ "your designer") rather than an invented name. Both halves tested — the pure function AND the view's binding, which was the half r1 said the old test could not see. |
| **IOSC-04** MAJOR · four stamps drew a 1.54:1 rule | `Stamp.mutedRule = Border.strong` | **FIXED for the rule.** `PatinaColors.subtleInk` (#5A4E43, the portals' `--text-subtle`) with `DarkPalette.textMuted` as its dark companion. Measured on this lane's simulator with the repo's own instrument: **5.55:1** fresh and **3.93:1** aged on paper (my arithmetic reproduces r1's probe to ±0.02: mocha rule 5.72 vs its 5.74, old muted rule 1.54 vs 1.54). `ContrastTests` now measures five rules × two grounds × two appearances × two aging opacities, plus the counterfactual. **NOT fixed for the word** — see **IOSC-R2-02**. |
| **IOSC-05** MAJOR · two covers swapped in one mutation | `showSignSheet = false; showSealMoment = true` | **FIXED structurally.** `armSeal(name:)` sets `sealPending` and dismisses; `ProposalDetailView` fires `viewModel.signCoverDismissed()` from the sign cover's `onDismiss`, and that method is idempotent and one-way. Three UI-less state-machine tests plus a pin that the host wires `onDismiss`. The two covers are chained modifiers (each wraps the previous), which is the supported shape. **Still needs a walker** — no test can prove a `fullScreenCover` presented. |

Also still true and re-checked: the response payload carries no `optionId`; the
review leg still sends `reviewMethod: "portal_clickthrough"` and no signature;
`P-19`'s "countersigns" is gone and the test refuses the word; `ProjectApprovalCopy
.acts` is `"Return"` for `changes_requested`.

**Refusal grep over every added line of the diff** (`gate`, `task`, `overdue`,
`dashboard`, `AI`, `Declined`-for-`changes_requested`, `sage`, `green`, `red`,
`checkmark`, `badge`, `shadow`, `confetti`, emoji): every hit is a comment, a
test name or a pre-existing identifier (`BadgeCountService`). **No violation in
any homeowner-visible string.** "Declined" survives only as a commercial
document a client refused. The full inventory of new user-facing strings was
read one by one against the outcome vocabulary and the refusals; all clean.

---

## New findings

### IOSC2-R2-01 — MAJOR · the change note is now write-only on iOS

IOSC-02's fix moved the note to the right rail for the designer and, in the
same move, made it invisible to the person who wrote it.

```
$ grep -rn "decision_comments" apps/mobile/Patina/Patina
… ApprovalNoteWriter.swift:75   .from("decision_comments")     ← the only WRITE
                                                              ← no read anywhere
```

The client app renders `decision_comments` on no screen. The web does:
`approval-ask.tsx:391-486` mounts a `Discussion` block over
`useDecisionComments(decisionId)`, with an empty state and a composer. So after
a homeowner returns an edition on her phone with a note:

- the note is not on the approval screen she is looking at;
- "Discuss this with your designer" (`ProjectApprovalScreen.swift:106`) opens
  the project thread, which is **not** where the note went — `discussThreadId`
  is deliberately left nil when the approval write succeeds;
- so her own sentence disappears the instant she sends it.

Before this round the note went to that thread and she could see it there. The
destination is right and should stay; what is missing is the read. Cheapest
honest fixes, in order: render the approval's comments on the Stage-2 screen
(the web's own `Discussion`, ported), or — if that is Wave 3 — echo the note
she just sent beneath the closure line so it is at least visible once.

`noteHelp` ("Your note goes to your designer with this returned edition.") is
not a lie, so this is a gap rather than a false statement — but it is the kind
of gap a first walker finds in ninety seconds.

### IOSC-R2-02 — MAJOR · the muted stamps' WORD is drawn in a 4.2:1 ink, and it is not the token the table names

IOSC-04 fixed the rule and left the word. `PatinaStamp.Pigment.muted.ink` is
`PatinaColors.Text.muted` — `agedOak`, **#8B7355**. The ceremony table
(`ux/02` §5) specifies `--text-muted` for the word ink of Withdrawn /
Superseded / Expired, and the portals' `--text-muted` is **#4E4339**
(`apps/designer-portal/src/app/globals.css:80`). The names match; the values do
not, and the iOS one is far lighter.

Measured on this lane's simulator with `PatinaContrast`, in a throwaway test I
ran and then deleted:

```
PROBE word muted on Background.primary  light = 4.2      ← REVIEWED/WITHDRAWN/SUPERSEDED/EXPIRED
PROBE word muted on Background.secondary light = 4.02
PROBE word muted on Background.primary  dark  = 8.58
PROBE word mocha on Background.primary  light = 7.86
PROBE word goldenHour                   light = 5.32
PROBE word clay                         light = 5.31
PROBE word terracotta                   light = 5.28
PROBE word word (charcoal)              light = 13.53
PROBE muted lightInkHex=8B7355 · portal --text-muted=4E4339
```

4.20:1 on paper and 4.02:1 on a card, against the 4.5:1 bar `ContrastTests
.bodyTextClearsAA` applies to text in this very file. Three things make it
count rather than being a defensible reuse of a meta token:

1. `PatinaStamp`'s own doc says the word ink "never degrades" and `PatinaStampTests
   .theWordInkIsNeverTheRuleWhereTheRuleIsColoured` enforces exactly that
   principle — for the four coloured pigments and not for this one.
2. `ProposalDetailView.statusRow`'s `else if let stamp` branch draws EXPIRED
   **with no sentence beside it** (the badge it replaced carried its own word),
   so there the mark's word is the only content on the row.
3. `ContrastTests`' new coverage measures `pigment.rule` for every pigment and
   `pigment.ink` for none, so the number cannot be caught by the suite that was
   extended precisely to stop it drifting.

Fix: point `Stamp.mutedInk` at a `--text-muted`-equivalent (#4E4339 light, with
the house's dark companion), and add the six word inks to `ContrastTests`
alongside the five rules.

### IOSC-R2-03 — MINOR · three of the eleven states still have no mount, and one of them is the state this program invented

```
$ grep -rn "PatinaStamp(" apps/mobile | grep -v Tests
  PatinaStamp.swift:348          (#Preview)
  DecisionDetailView.swift:246   .approved
  ProjectApprovalBlock.swift:196 approved | returned | held | withdrawn | superseded
  SealMomentView.swift:64        .signed
  ProposalDetailView.swift:183   .signed
  ProposalDetailView.swift:200   .declined | .expired
```

`.awaiting`, `.reviewed` and `.signedOnPaper` are unreachable. r1 raised this;
it stands unchanged. `.reviewed` is the one that matters — it is the state
`P-10` / `R-C9` created, the lane wrote a ruling to justify stamping it, and
`ProjectApprovalBlock.reviewLeg`'s confirmed branch still closes with a bare
sentence and no mark, three lines from a `closureLine` helper that would draw
it. Either mount it there or drop the case, so it does not ship as dead code
the next lane has to reason about.

### IOSC-R2-04 — MINOR · the signer's name is stamped in mono caps

`PatinaStamp.body` draws `sublabel` with `PatinaTypography.monoLabel`,
`.tracking(1.1)` and `.textCase(.uppercase)`. The only caller that passes one is
the seal (`SealMomentView`, `sublabel: signedName`). `ux/02` §5 specifies
"signer's name in Playfair 15px beneath the stamp", and the Record-of-Decision
sketch draws it as Playfair 24 over a rule. So a homeowner who types "Margaret
Whitfield" is shown `MARGARET WHITFIELD` letter-spaced as a mono label — a legal
name rendered as a caption style. The component is right to have one sublabel
slot; the seal's should be the serif.

### IOSC-R2-05 — MINOR · the two sublabels the table specifies are never passed

`ux/02` §5 gives Superseded a mono tie-line (`→ EDITION 4`) and Expired the
expiry date beneath the mark. `PatinaStamp` supports both through `sublabel`.
Neither call site passes one: `ProjectApprovalBlock.closureLine` never sets it,
and `ProposalDetailView`'s expired branch does not either. Not a missing item —
P-17's ask is the component — but the two states ship without the qualifier the
table says they carry.

### IOSC-R2-06 — NIT · the response retry re-sends the signature under a fresh idempotency key

`submitApprovalResponse` mints `UUID().uuidString` for the first call and a
**second, different** key for the CAS retry (`DecisionDetailViewModel
+ProjectApproval.swift:120,143`). That is pre-existing shape from Wave 1 and the
re-read in between makes a double-record unlikely, but the payload now carries a
legal signature, so the same act can reach `_respond_project_approval_checked`
twice under two idempotency keys. Worth one look from the backend lane at
integration: if the checked function's receipt is keyed on the idempotency key
rather than on `(decision, actor)`, the retry writes a second consent record for
one signature.

### IOSC-R2-07 — MINOR · the doors do not read `viewerRole`, and after the merge they can

The Wave-1-close ruling minted `viewerRole` for exactly this: "A studio person
signed into the CLIENT app therefore saw studio-wide approvals drawn as
'waiting on you'." The backend lane's 00569 emits it
(`'viewerRole', CASE …` in `get_project_decision_reviews`) and the **iosd** lane
decodes it and applies `viewerAnswers` to the feed and the Record
(`HouseRecord.swift:882`, `awaitsClientInFeed`). It does not reach the detail:
this lane's `outcomeLeg` and `reviewLeg` gate on `review.canRespond` alone, and
`canRespond` is derived client-side from `lifecycleStatus`/`disposition`/
`isReviewComplete`/`outcome` with no viewer term
(`DecisionsAPIClient+ProjectApprovals.swift:148-153`). This branch has no
`viewerRole` to gate on, so it is not a defect here — but at integration the two
lanes together will offer a studio co-member the three doors and the
review-confirmation hold on an approval the server will refuse. **Steward:
after the merge, `canRespond`'s call sites in `ProjectApprovalBlock` want
`&& viewerAnswers`.**

### IOSC-R2-08 — MINOR · the design kit is outside lint-delta's window

`cmd_lint_delta` filters touched Swift files to `^apps/mobile/Patina/`
(`ios-gate.sh:120-121`). Three of this branch's files are not under it:

```
apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaStamp.swift      (+353)
apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Tokens/PatinaColors.swift         (+61)
apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaEmptyState.swift (+17)
```

So the wave's largest new component was never linted by the gate that says
"no new warnings in touched files". I ran SwiftLint over the three directly with
the project config: the only hits are four pre-existing `identifier_name`
warnings on `PatinaColors.swift:329` (the `Color(hex:)` parser's `r`/`g`/`b`/`a`),
untouched by this branch. **No lint debt is actually owed** — but the lane's
green lint-delta is not evidence about these three files, and the gate should
probably widen.

### IOSC-R2-09 — MINOR · an unreachable rowLabel word under the mark

`ProposalDetailView.statusRow`'s stamp branch passes
`ProposalStatusDisplay.rowLabel(proposal)` as the VoiceOver label while
`stampState` may have returned `.expired` from its `!proposal.isSignable` arm.
For a status the switch does not name (`default: proposal.status?.capitalized`)
VoiceOver reads e.g. "Draft" over a mark that says EXPIRED. The visible half of
this predates the change (the old badge said "Expired" too); the audible half is
new. Narrow blast radius — a client bundle probably never carries such a row —
but the mark and its label are now allowed to disagree.

---

## r1 findings still open (out of the fix brief's scope, unchanged)

- **IOSC-06** MINOR — the success haptic is still spent twice.
  `HoldableModifier.startHold()` and `accessibleComplete()` both fire
  `HapticManager.shared.notification(.success)`, and `SealMomentView.settle()`
  fires it again. `ux/02` §5 step 6: *"the single strongest haptic in the whole
  ceremony, spent exactly once, at the seal. Nowhere else"*; §4 specifies
  `thresholdCrossed()` for the hold's completion. On the sign path a homeowner
  gets two, a round trip apart. `HoldToActTests` currently pins the `.success`
  at completion, so the pin moves with the fix.
- **IOSC-07** MINOR — `Stamp.terracotta`'s dark companion is still
  `DarkPalette.textError` (#DE8A7B), the app's error red and the ink behind
  every validation line. `PatinaColors.terracotta` already exists as the light
  companion.
- **IOSC-08** MINOR — the hold's timing and cancel are still pinned by a
  `prefix(360)` window over source. No test proves a 900 ms press completes and
  an 800 ms one does not, and no walker has felt it.
- **IOSC-09** MINOR — `PatinaHold.voiceOverHint` is still "Press and hold to
  confirm.", applied unconditionally, telling a VoiceOver user to perform the
  gesture `VoiceOverTapModifier` exists to replace.
- **IOSC-10** NIT — the disabled submit still names no reason. Mitigated: the
  ruled line and its notice now sit directly above it under a chosen Approve.
- **IOSC-12** MINOR — `DecisionDetailView.resolvedStamp` still asserts
  `.approved` for every responded legacy decision.
- **IOSC-13** MINOR — iOS records the outcome then the note; web posts the note
  first and aborts the outcome if it fails. Both are argued in comments; they
  cannot both be the house rule. Needs a cross-surface ruling at integration.
- **IOSC-14** NIT — P-16 and P-18 remain one commit, declared with a reason.
- **IOSC-15** NIT — the `openThread` switch is still duplicated; it moved from
  `DecisionsViewModel`'s default closure into `ApprovalNoteWriter.send`.
- **IOSC-16** NIT — `SealMomentView.swift:20` still imports UIKit and uses no
  UIKit symbol.
- **IOSC-17** NIT — `settleFromRotation` (−3.4) is still the one settle value
  with no test behind it; `SealMomentTests` pins the duration and the scale.
- **IOSC-18** NIT — `DateDisplay.long(Date())` is still evaluated inside two
  view bodies.

## New nits

- **IOSC-R2-N1** — `ProjectApprovalDoorsTests.theNoteIsEncouragedAndNeverRequired`'s
  last assertion carries the wrong message: `#expect(body.contains("viewModel
  .canSubmitApproval"), "the submit gates on the note")` says the opposite of
  what it proves.
- **IOSC-R2-N2** — `DecisionsViewModel.swift:450-453`: no blank line between
  `sendApprovalNote` and the doc comment that follows it, so the comment reads
  as trailing the seam rather than heading the next property.
- **IOSC-R2-N3** — `ApprovalNoteWriter` posts a body with no length ceiling;
  `decision_comments.body` is `CHECK (length(body) BETWEEN 1 AND 4000)`
  (00091:9), so a 4001-character note fails as a `check_violation` and lands on
  `noteUnsent` after the outcome is already recorded. Composer is 3–6 lines, so
  this is theoretical.

---

## For the steward

1. **The `why` renders nowhere on iOS.** 00569 freezes
   `project_approval_artifacts.why` / `why_author_name` and emits both on the
   projection (`'why', artifact.why` / `'whyAuthorName', …`), and the mid-Wave-2
   ruling says *"every surface renders '— {whyAuthorName}' only when present."*
   `grep -rn "whyAuthorName\|artifact.why" apps/mobile` returns nothing in
   either iOS worktree, and neither lane's brief claims P-13. iosd took
   `viewerRole` from the same migration; the why appears to be unassigned.
2. **IOSC-R2-07:** after the iosc/iosd merge, `ProjectApprovalBlock`'s two act
   legs want `&& viewerAnswers` beside `canRespond`.
3. **Both lanes edit `DecisionsAPIClient+ProjectApprovals.swift` and
   `ProjectApprovalCopy.swift`.** The regions differ (iosc widened
   `respondToProjectApproval`; iosd added `viewerRole`/`viewerAnswers` to the
   projection), so the merge should be mechanical — but `HoldToActTests
   .theResponsePayloadCarriesTheSignature` reads a 1200-character prefix of that
   function, so keep the new keys inside it. Take `"Return"` on the copy file,
   as the lane asks.
4. **Deploy order still binds.** 00569 must be applied before an iOS build that
   sends a signature, or Approve fails `invalid_parameter_value` — loudly, with
   the honest failure sentence, but it fails. The lane deliberately ships no
   silent fallback, which is right.
5. **The clay-ink divergence is accepted for this wave** (iOS #82612F vs the
   portal's #7C5E30) per the mid-Wave-2 ruling. Recorded, not disputed.
6. **A walker is still owed on three things** no test can reach: the seal
   actually presents after the sign cover dismisses and settles once (IOSC-05);
   a released press does not submit and a 900 ms one does (IOSC-08); and
   VoiceOver's Activate still fires the act.

## Things I checked that are correct

- Payload keys match the backend lane's 00569 exactly, in its allowlist and in
  the order `_respond_project_approval_checked(uuid, text, uuid, timestamptz,
  text, text, text)` declares.
- The consent pair travels together or not at all — the client drops both over
  an empty name, so Return and Hold leave `client_consent_method` at its
  clickthrough default rather than claiming an electronic signature.
- `decision_comments` INSERT is genuinely open to the homeowner: 00467:256's
  `WITH CHECK` resolves `project_artifact_v1` through the authority snapshot's
  `decision_lead_id`, and the table's blanket grants are in the legacy-grants
  seed. `author_id` is bound to the JWT actor.
- `ApprovalNoteRow`'s `CodingKeys` are the three real columns and file-scoped
  for SwiftLint's `nesting`.
- `ProposalStatusDisplay.stampState`'s branch order reproduces the old
  `statusRow`'s three-way for every status, including the `declined`-before-
  `expired` reordering.
- Accepted-but-unsigned still takes **no** stamp (SP-04), pinned.
- `PatinaEmptyState.icon` becoming `String? = nil` is source-compatible for
  every existing call site, Capture's included.
- Aging: 30 days, 0.88→0.74 outer, 0.42→0.26 inner, open states never age,
  unrecorded states cannot. All pinned; rotation −1.1° matches the Threshold.
- The `#Preview`-truncated source pins (`theStampIsInkOnPaper`,
  `theTermsAreUnchanged`) exclude preview scaffolding rather than measuring it.
- Four suites that pinned `ProposalSignSheet.swift`'s path were repointed at
  `SignActView.swift`, and `.patinaTopBand()` survives.
- No `project.pbxproj` change was needed or made.
