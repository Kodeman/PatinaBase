# iOS-C lane notes — Wave 2 (P-17, P-16 iOS half, P-18 iOS half, P-19)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-iosc`
(`git rev-parse --show-toplevel` returns exactly that), branch `approvals/w2-iosc`,
base `107549568c23b321fe413284de75164bde5852c9`.

Commits, in the order the brief sequenced the items:

| sha | item |
|---|---|
| `fdbcc0111` | P-17 — eleven states, one stamp |
| `bca153616` | P-16 + P-18 — three doors, held and signed |
| `e2b41b262` | P-19 — the seal and the act, full screen |

---

## What I found before writing anything

**The rotation is −1.1°, not the ceremony doc's −2°.** `ux/02` §5 specifies
`-rotate-[2deg]`, which is `GateStamp`'s value — and `GateStamp` no longer
exists. The 2026-09-04 Threshold cutover took the stamp with it, and what a
homeowner actually compares the phone against today is
`approval-ask.tsx:111` / `wall-gate.tsx:211`, both `-rotate-[1.1deg]`. The
brief specifies −1.1° and the brief is right; the doc predates the cutover.

**The `-ink` tokens the ruling names do not exist in the client portal.**
`--color-golden-hour-ink` (#79651E), `--color-terracotta-ink` (#9C5340) and
`--color-clay-ink` (#7C5E30) live in `apps/designer-portal/src/app/globals.css`
only; `apps/client-portal`'s `globals.css` has `--color-gold: #E8C547` and no
ink companions. I took the designer portal's measured values as canonical for
the two iOS needed (`goldenHourInk`, `terracottaInk`) and reused the app's own
`clayInk` (#82612F) rather than minting a competing one — **the two clay inks
differ by 6/6/1 in RGB, and that is a real, if small, cross-surface
divergence** (see "For the web lane" below).

**`respond_project_approval` did NOT accept a signature.** The brief says
"respond_project_approval accepts them; read the RPC in 00464→latest". It does
not, and neither does the web:

- `_respond_project_approval_checked` (00464:496) takes
  `p_client_consent_method` / `p_client_signature`, validates them
  (`:549-566`), writes the three 00117 consent columns (`:736-740`) and hashes
  the pair into the action receipt under the keys `clientConsentMethod` /
  `clientSignature` (`:630-636`);
- the PUBLIC wrapper (00464:811) does `p_payload - ARRAY['outcome','optionId']`
  and raises `invalid_parameter_value` on anything else, then passes
  `NULL, NULL` down;
- `_respond_project_approval_checked` is `REVOKE`d from `authenticated`
  (00464:807-809), so there is no second door;
- `useRespondProjectApproval` (`packages/supabase/src/hooks/use-project-approvals.ts:647`)
  sends `{ outcome }` and nothing else, for exactly this reason.

So a UI that collects a legal name had two honest options: throw it away, or
open the door. See the ruling below.

**`sign_proposal` takes no consent argument.** `signProposal(proposalId:signedName:)`
→ `sign_proposal(p_proposal_id, p_signed_name)`. The P-19 consent checkbox is
therefore a client-side gate at parity with the web's checkbox, not a new
server field, and it is documented as such in `SignActView`.

**`get_client_proposal_bundle` DOES return the edition.** 00407:366 emits
`version` and `sent_at`, and `RemoteProposal` already decodes both. The brief's
fallback ("if no version field exists, use the issued date and say so") was not
needed; the line uses both, and degrades to the issue date alone, then to
nothing.

**A `proposals` row has no `CommercialDocumentKind`.** So the consent line is
`consentLineFor`'s own `else` branch verbatim — "I agree to the scope and
investment in this proposal." The three named branches assert a countersignature
requirement and deposit terms this paper has not got.

**`HoldableModifier` was dead code.** No call site anywhere in either app. That
is why it could take a reduced-motion path without a blast radius.

---

## What I decided

### One scope deviation, taken deliberately: migration 00569

`supabase/migrations/00569_stage2_outcome_signature_payload.sql` opens exactly
two payload keys on `respond_project_approval` and passes them through. It adds
no validation of its own and relaxes none — every rule already lives in the
checked function, and a second copy is how two copies come to disagree. A
payload without the keys behaves byte-for-byte as before (`->>` on an absent
key is NULL, and NULL/NULL is what the wrapper passed already), so the web hook,
every existing test and every replay are untouched.

I judged this implied by the brief rather than added to it: R1 rules a typed
legal name on every surface, P-18's iOS half is explicitly "sends the typed
legal name (client_signature) and client_consent_method", and there is no way
to satisfy that sentence without the wrapper change. The alternative — a name
field whose value is discarded — is worse than either shipping this or shipping
nothing.

**⚠ For the steward, two things:**

1. **The number may collide.** `env.md` tells every lane to mint from 00569 and
   `ls supabase/migrations | tail` still ended at 00568 when I minted. If the
   backend or web lane also minted 00569, renumber mine — it depends on nothing
   and nothing depends on its number.
2. **The web lane may have written the same widening.** If it did, keep one and
   drop the other; they should be textually near-identical because there is only
   one shape this change can take.

**Deploy order.** 00569 must be applied before any build that sends a
signature. If iOS ships first the submit fails with `invalid_parameter_value` —
loudly, with the existing honest failure sentence, not silently — but it fails.
I deliberately did NOT add a fallback that retries with the bare payload: a
silent fallback would drop a legal signature on the floor and tell her it
landed.

### P-17

- **Eleven states, four dials, in `PatinaDesignKit`.** `PatinaStamp.State`
  exposes `word`, `borderPigment`, `wordPigment`, `weight`, `rotationDegrees`,
  `ages` and `innerLine` as values, so the table is testable rather than
  visual. `Pigment` carries `lightInkHex` / `lightRuleHex`, which
  `PatinaStampTests` proves against the actual resolved sRGB in the light
  appearance via `PatinaContrast` — the pigment names cannot drift from what
  they paint.
- **REVIEWED is stamped (−1.1°) and ages.** The state comes from `R-C9`, which
  the §5 table does not cover. It is a completed act she took on this surface,
  so it is pressed here and it settles; it is not "still asking something", so
  it is not one of the three that never age. Flagged as my ruling, not the
  doc's.
- **Every pigment is dynamic (light/dark).** The ruling's contrast numbers are
  measured on paper, and iOS has a dark canvas: a static `mocha` hairline on
  warm graphite is ~1.6:1 and is not a mark at all. Each pigment pairs the
  portal's measured light value with the house's existing dark companion
  (`Text.secondary`'s, `Text.error`'s, `clay`, `goldenHour`). Pinned by
  `everyPigmentAdapts`.
- **`resolvedBanner` stamps APPROVED for every responded legacy decision.**
  Every client act on that rail says yes to something — a named option, or
  `approve_client_signoff` — and the Record's own verb for it is "approved"
  (`HouseRecordBuilder`). There is no client-reachable path that records any
  other outcome on a non-Stage-2 decision.
- **An accepted-but-unsigned proposal gets NO stamp.** This is the one place I
  refused to draw a mark. SP-04 exists because the app once printed "SIGNED"
  over a signature nobody could produce; `SIGNED` and `SIGNED / ON PAPER` are
  the only marks that shape could take, and neither is true for a designer-side
  accept. `stampState` returns nil and the word "Accepted" stands alone.
- **The two filled `PatinaStatusBadge`s went too** (warning-tinted "Expired",
  error-tinted "Declined"). A tinted fill standing in for a state is the same
  mistake as a glyph standing in for one, and P-17's brief names the proposal
  banner. These two stamps stand with no sentence beside them, so `PatinaStamp`
  gained an `accessibilityLabel:` parameter — nil (the default, and right
  nearly everywhere) hides the mark, since it is decoration over a sentence.
- **`PatinaEmptyState.icon` became optional**, defaulted, so no call site moved.
  Only the empty decision list passes nil.

### P-16

- **All three doors take `.secondary`.** Equal weight is the ruling and the
  button style is where it lives.
- **Order is Approve / Return / Hold**, the brief's, which reorders the array
  the Wave-1 test pinned.
- **The change note travels as a project-conversation message.** That is where
  the web's own note lives (`approval-ask.tsx`: "Add questions or notes in
  Discussion below; comments do not submit an outcome") and
  `respond_project_approval` carries no note field.
- **Note AFTER outcome, never before.** A note sent first describes a return
  that has not happened. A note failure is `noteFailure`, kept apart from
  `submitFailure`: the answer is recorded, and drawing it as a failed submit
  invites her to answer twice.
- **Clearing the outcome clears the note.** A note written for a return must
  not ride along on a reconsidered approval.

### P-18

- **The affordance lives on the control, not in the copy.** "Hold to submit" /
  "Hold to sign" per-site labels were my first pass and they fight the acts'
  own words; instead every `HoldToActButton` prints a mono `PRESS AND HOLD`
  under the title, so `Submit response`, `Review exact edition` and
  `Sign proposal` keep theirs and one line explains the gesture everywhere.
- **Reduced motion gates the ink and the scale, never the duration.** Pinned
  both ways (`!gesture.contains("reduceMotion ? 0")`, and the `.holdable(`
  call site may not mention `reduceMotion` at all).
- **The submit gates on the name, not on the note.** `canSignApproval` is the
  server's own two-character floor. The note is encouraged (R10); the signature
  is required (R1). Both pinned.

### P-19

- **`ProposalSignSheet.swift` is deleted, not deprecated.** Four test suites
  pinned its path (`MoneyAndStudioCopyTests`, `WalkFixTwoTests`,
  `TopBandFoldTests`, `DynamicTypeLayoutTests`); all four now read
  `SignActView.swift`, which keeps `.patinaTopBand()` — a cover's scroll
  container reaches the status bar exactly as the `.large` detent did and
  carries no coordinator chrome to reserve it.
- **The settle is `.easeOut(duration: 0.42)`, not `Animation.patinaHero`.**
  `patinaHero` is `spring(response: 0.5, dampingFraction: 0.82)` and cannot be
  420 ms; the brief allows "the nearest existing curve", and a spring that
  overshoots is the wrong physics for a mark that settles once and stops. The
  literal 420 ms was the specified number, so it is the number.
- **The rotation settles ONTO the stamp's own resting tilt**, from −3.4° to 0°
  of additional rotation. `PatinaStamp` applies its own −1.1°, so a settle that
  animated to a second rotation value would fight it.
- **The studio is resolved from the project the app already holds**, matched on
  `proposal.project_id` — the bundle carries no designer embed. This is
  `W1R2-M2`'s rule applied again: the name is taken, never invented, and
  "Your designer" is the honest fallback.

---

## What I could not verify

- **No local Supabase round trip.** The backend lane owns the stack this wave.
  00569 is argued entirely from the migration text it replaces (00464:811 for
  the body, `:496-566` for the validation it defers to, `:807-809` for the
  revoke) and has **not been applied or executed anywhere**. It needs a real
  apply and, ideally, a SQL test that a signed payload lands
  `client_signature` / `client_consent_method` / `client_consented_at` and that
  an unsigned one still behaves as before.
- **No simulator walk.** Build, unit and lint-delta are the evidence. The hold
  gesture, the ink fill, the full-screen covers and the settle are all pinned
  by value and by source, never by a screenshot — the timing math inside
  `HoldableModifier.startHold` is a view-bound private and I did not extract it
  into a model to make it directly testable, because that would be inventing
  structure the brief did not ask for. **A walker should confirm by hand: a
  released press does not submit; a 900 ms press does; VoiceOver's Activate
  action still fires; and the seal settles once and not again on revisit.**
- **Whether "countersigns" is true for a plain `proposals` row.** `sign_proposal`
  flips the row to `accepted` and `proposal-sign-confirmation` sends an email;
  there is no countersignature step in that path (the countersign RPCs belong to
  design-services agreements, 00477/00425). The sentence is the brief's,
  verbatim and ruled, so I shipped it — but it is the one line in P-19 I cannot
  substantiate from the schema, and R9 would prefer silence to an invented
  consequence. **Flagged for a copy ruling.**

---

## Two constraints the repo's own gate imposed

- **`DecisionsViewModel.swift` is at exactly 497 of SwiftLint's 500-line
  `file_length`.** Three stored properties and one seam were the most it could
  take; `canSignApproval` had to move to
  `DecisionDetailViewModel+ProjectApproval.swift` (a computed property can live
  in an extension; a stored one cannot). The next lane to touch this file gets
  three lines. It should probably be split for real.
- **`ProjectApprovalActTests.swift` is at 497 too**, and its two suites are at
  `type_body_length`. Every new P-16/P-18 test went into new files
  (`ProjectApprovalDoorsTests`, `HoldToActTests`, `SealMomentTests`,
  `PatinaStampTests`) for that reason, not by preference.

---

## One instruction I did not follow as written

**The brief says "commit per item"; P-16 and P-18 are one commit.** They touch
the same six files, and the P-18 hunks sit inside the P-16 ones (the signature
line and the hold are drawn in the outcome leg the three doors live in). A
split would have needed hunk surgery on a working tree that was already green,
and a commit of the P-16 half alone would not compile — `ProjectApprovalBlock`
references `HoldToActButton`. P-17 and P-19 are their own commits as asked.

---

## For the web lane

- **The clay ink differs by surface.** iOS `PatinaColors.clayInk` is `#82612F`;
  the designer portal's `--color-clay-ink` is `#7C5E30`. Both are measured
  ≥5.5:1 on paper and either is defensible, but the RETURNED stamp will be
  drawn in two slightly different browns on two surfaces until somebody picks
  one. I did not move the iOS token, because it has other call sites.
- **`--color-golden-hour-ink` and `--color-terracotta-ink` do not exist in the
  client portal yet.** If the web half of P-17 needs them there, they are
  `#79651E` and `#9C5340` in the designer portal's `globals.css`.
- **`ProposalDetailStatusIconTests` now pins that an accepted-but-unsigned
  proposal takes NO stamp.** If the web's own eleven-state work stamps
  something there, the two surfaces disagree and one of us is wrong — I think
  the nil is right (SP-04), but it is worth one look.

---

## One thing the final gate caught

`lint-delta` failed on the committed tree: `ProjectApprovalActTests.swift`
went 497 → 506, over `file_length`, because P-18's signature assertions and
the `typedSignature` lines landed in it after the earlier clean run.
`theResponseRPCParametersMatchTheWeb` moved into `HoldToActTests` — which is
where what the outcome sends now belongs anyway — taking the file to 489.
That is `bea62be0e`; the code it pins did not change.

## Gates (final tree)

```
IOS_GATE_UDID=B6AD6271-E9E1-4BC6-B94A-F115E270CCAE .../ios-gate.sh build
  ** BUILD SUCCEEDED **

IOS_GATE_UDID=B6AD6271-E9E1-4BC6-B94A-F115E270CCAE .../ios-gate.sh unit
  ━ Test run with 2515 tests in 275 suites passed after 8.718 seconds
    with 2 known issues.
  ** TEST SUCCEEDED **

.../ios-gate.sh lint-delta main
  ✓ lint-delta: no new warnings in touched files          EXIT=0
```

On the run before this one the suite reported a third issue — the load flake
the brief names —
`CompanionCoachingModelTests.introGate_freshUser_pollsUntilTourResolves`. Rerun
in isolation on the same simulator it **passes**:

```
xcodebuild test … -only-testing:PatinaTests/CompanionCoachingModelTests
  ✔ Test run with 21 tests in 1 suite passed after 0.108 seconds.
  ** TEST SUCCEEDED **                                     EXIT=0
```

The two known issues are the pre-existing pair this branch inherited from Wave
1: a `BrandVoiceLint` expectation on "curated_mix" and
`RoomLifecycleTests.theTodayRailFollowsALocalDelete`.

The wave adds **48 tests across 4 new suites** (2467 → 2515, 271 → 275):
`PatinaStampTests` (12), `ProjectApprovalDoorsTests` (9), `HoldToActTests`
(11), `SealMomentTests` (8), plus the rewrites in
`ProposalDetailStatusIconTests` and the six existing suites the seam and path
changes moved.

The first `build` of the wave failed on a cold cache with
`error: permissionDenied` while resolving the package graph — the sandbox, not
the code. Rerunning the identical command unsandboxed succeeded, exactly as
`env.md` warns.

---

# Fix round 1 — 2026-09-05

Branch `approvals/w2-iosc`, from review head `c1d7bf924`. Answering
`iosc-review-r1.md` (verdict: fix) plus the rulings made mid-Wave 2.

## The interrupted attempt

The worktree carried uncommitted work from the fix attempt the usage limit cut
off: a staged `git rm` of the migration, six modified files, and one untracked
new file (`ApprovalNoteWriter.swift`). Read as a diff, decided per file:

| File | Verdict |
|---|---|
| `supabase/migrations/00569_…` (staged delete) | **kept** — IOSC-01's remedy |
| `ApprovalNoteWriter.swift` (new) | **kept**, two edits: `CodingKeys` for the snake_case columns and the row moved to file scope (SwiftLint `identifier_name` **error** ×2 and `nesting` on a new file, which lint-delta counts as gained) |
| `DecisionsAPIClient+ProjectApprovals.swift` | **kept**, corrected — it named the web lane's 00570, which the ruling deletes |
| `DecisionDetailViewModel+ProjectApproval.swift` | **kept** (note routing), extended (signature ruling) |
| `DecisionsViewModel.swift` | **kept** — the `sendApprovalNote` seam widened to `(decisionId, route, body)` |
| `ProjectApprovalBlock.swift` | **kept** (IOSC-03 resolution), extended (signature gate) |
| `HoldToActTests.swift`, `ProjectApprovalDoorsTests.swift` | **kept**, extended and repaired |

Nothing was discarded. The partial work was sound; it was unfinished, not wrong
— it had done IOSC-01/02/03 and none of IOSC-04, IOSC-05 or the two rulings.

## What changed

**IOSC-01 · the migration.** `00569_stage2_outcome_signature_payload.sql`
deleted (`git rm`). Wave 2 ships ONE migration and it is the backend lane's
00569, which redefines `respond_project_approval` anyway and now carries
`clientConsentMethod` / `clientSignature`. iOS ships no SQL for this. The doc
comment on `respondToProjectApproval` and the comment that replaced
`theMigrationOpensExactlyTwoKeys` both name 00569, not 00570 — the interrupted
attempt had pointed them at the web lane's file, which the same ruling deletes.
**Deploy order still binds:** 00569 must be applied before an iOS build that
sends a signature, or Approve fails `invalid_parameter_value`.

**RULED · a signature only on Approve.** `approvalNeedsSignature`
(`chosenOutcome == .approved`) and `canSubmitApproval` (`!needsSignature ||
canSignApproval`). The submit gates on the latter; `submitApprovalResponse`
sends the trimmed name for Approve and `""` for the other two, and the RPC
client already drops the consent pair over an empty name — so Return and Hold
leave `client_consent_method` at its clickthrough default rather than claiming
an electronic signature nobody gave. The ruled line moved: it was drawn above
the three doors, before one had been chosen; it is now inside the chosen branch
and behind the gate, so Return shows the composer and Hold shows neither. Both
are still press-and-hold — the deliberation stays, the ceremony does not.

**IOSC-02 · the note lands on the approval.** `ApprovalNoteWriter` inserts into
`decision_comments` keyed on the decision the outcome was recorded against —
the row `useCreateDecisionComment` writes (`use-decisions.ts:991`), admitted for
the person being asked by 00467:256. The project conversation is the FALLBACK,
taken only when that write cannot happen, and only a note that actually took it
moves "Discuss this" to a thread. `noteHelp` no longer sends her to the
conversation to look for a note that is on the paper: *"Optional. Your note goes
to your designer with this returned edition."*

**IOSC-03 · the placeholder names a designer that exists.** `designerGivenName`
is now a pure `(embedded, projectId, projects) -> String?` resolving from the
projection's own `projectId` against `BadgeCountService.shared.projects` — the
same resolution `countersigningStudio` makes — with the embed still winning
where it arrived and "your designer" as the honest fallback. Tested twice: the
function, and the view's binding, which was the half the old test could not see.

**IOSC-04 · the muted rule.** `Stamp.mutedRule` was `Border.strong`, a
field-outline hairline: **1.54:1** at the component's own 0.88 border opacity on
paper. It is now the portals' `--text-subtle` (#5A4E43), added as
`PatinaColors.subtleInk`, with `DarkPalette.textMuted` as its dark companion.
`Pigment.lightRuleHex` follows. Measured with the repo's own instrument:

```
                       light/primary  light/secondary  dark/primary  dark/secondary
muted rule @0.88            5.53            5.34           6.95          6.15
muted rule @0.74 (aged)     3.94            3.84           5.32          4.81
```

`ContrastTests` now measures all five stamp rules at BOTH aging opacities on
both grounds in both appearances against the 3:1 bar a non-text mark takes (the
weakest of the twenty is clay aged on the card, 3.08:1), plus the counterfactual
that `Border.strong` still cannot carry a rule.

**IOSC-05 · the two covers.** `sign()` dismissed one `fullScreenCover` and
presented another in one mutation. It now calls `armSeal(name:)`, which sets
`sealPending` and dismisses; `ProposalDetailView` fires
`viewModel.signCoverDismissed()` from the sign cover's `onDismiss`, one runloop
later, with nothing in flight. `signCoverDismissed()` is idempotent and one-way,
so "Not yet" ends in no seal and a shown seal cannot re-open. Proved with a
UI-less test of the state machine (armed → dismissed → presented; the unarmed
case; the second dismissal) plus a pin that the host wires `onDismiss`.

**⚠ THE WALKER MUST SEE IT.** No test can prove a `fullScreenCover` actually
presented. Sign a proposal on the simulator and confirm: (a) the seal appears
after the sign cover dismisses, (b) it settles once with one haptic, (c) Done
returns to a detail screen showing the SIGNED stamp. IOSC-08's 900 ms press
still wants the same treatment.

**RULED · P-19's sentence.** "countersigns" is gone — a `proposals` row records
no counter-signature and nothing waits on one. `whatHappensNext` reads
*"{Studio} has your signature. You'll have a copy."*, with "Your designer" as
the un-invented fallback, and the test now refuses the word.

**Item 5 · `ProjectApprovalCopy.acts`.** Already `"Return"` for
`changes_requested` on this branch, unchanged by this round. A conflict with the
iosd lane on this file at integration is expected; **take "Return"**.

## Tests moved by the change

Five existing pins moved with the behaviour rather than being deleted:

- `ProjectApprovalActTests` "each outcome is submitted with the row's own
  updatedAt" — signature is `"Margaret Whitfield"` for Approve, `""` for the
  other two.
- `ProjectApprovalDoorsTests` "the note is encouraged…" — the submit gates on
  `canSubmitApproval`.
- `HoldToActTests` ruled-line pin — renamed to "…under a chosen Approve" and
  now asserts the rule is NOT above the doors and IS behind
  `approvalNeedsSignature`.
- `SealMomentTests` "the seal opens only on a signature given in this session" —
  pins `armSeal(name: name)` and that `armSeal`'s body does not touch
  `showSealMoment`.
- `SealMomentTests` the sign-cover pin — the cover is multi-line now.

New: 2 in `HoldToActTests` (the signature ruling), 3 in `SealMomentTests`
(IOSC-05), 2 in `ContrastTests` (IOSC-04), 3 in `ProjectApprovalDoorsTests`
(IOSC-02/03) — 2515 → 2525.

## Findings NOT addressed (out of the fix brief's scope)

IOSC-06 (double success haptic), IOSC-07 (dark DECLINED on `textError`),
IOSC-08 (hold timing pinned by grep), IOSC-09 (VoiceOver hint names the hold),
IOSC-10, IOSC-11, IOSC-12, IOSC-13 (note/outcome order vs web — needs a
cross-surface ruling), IOSC-14, and nits IOSC-15..18. The fix brief named
IOSC-01..05 and the four rulings; these stand for the steward.

## Gates — fix round 1, on this lane's simulator, unsandboxed

```
$ IOS_GATE_UDID=B6AD6271-E9E1-4BC6-B94A-F115E270CCAE .../ios-gate.sh build
** BUILD SUCCEEDED **                                              EXIT=0

$ IOS_GATE_UDID=B6AD6271-E9E1-4BC6-B94A-F115E270CCAE .../ios-gate.sh unit
━ Test run with 2525 tests in 275 suites passed after 8.949 seconds
  with 2 known issues.                                             EXIT=0
```

The two known issues are the pre-existing pair inherited from Wave 1
(`BrandVoiceLintTests` "curated_mix", `RoomLifecycleTests
.theTodayRailFollowsALocalDelete`). One intermediate run also reported
`CompanionCoachingModelTests.introGate_freshUser_pollsUntilTourResolves` — the
load flake this lane's notes already record; it passes on reruns and no code in
this round touches it.

`lint-delta main` was RED on the first attempt and is green now:

```
✗ lint-delta: NEW SwiftLint warnings in touched files:
    Patina/Features/Proposals/Views/ProposalDetailView.swift: 0 → 1
    PatinaTests/HoldToActTests.swift: 0 → 1
```

`multiple_closures_with_trailing_closure` (the sign cover now takes `onDismiss`
as well as its content — rewritten as an explicit `content:` argument) and
`empty_string` (`sent == ""` → `sent?.isEmpty == true`). Fixed in
`a29dee43c`. **Lesson for the steward:** a NEW Swift file starts at a base count
of zero, so the house's tolerated snake_case `Codable` fields are `identifier_name`
ERRORS lint-delta will count as gained — a new wire-shape struct needs
`CodingKeys`, and its `CodingKeys` needs file scope, not nesting.

### Confirmation run on the final tree (`a29dee43c`)

```
$ IOS_GATE_UDID=B6AD6271-E9E1-4BC6-B94A-F115E270CCAE .../ios-gate.sh all
** BUILD SUCCEEDED **
━ Test run with 2525 tests in 275 suites passed after 10.068 seconds
  with 2 known issues.
✓ lint-delta: no new warnings in touched files
ALL_EXIT=0
```

All three tiers on the tree that is committed, after the lint fix. The
diagnostics teardown between the unit tier and lint-delta took ten minutes of
silence — expected, and not a hang.

## Commits

```
c5b6537c7 fix(ios): a closed stamp draws a rule that is actually on the paper (IOSC-04)
8a11f6f31 fix(ios): the seal waits for the sign cover to leave (IOSC-05, P-19 copy)
92ee2068f fix(ios): one migration for the wave, and the note lands on the approval (IOSC-01, IOSC-02, IOSC-03, R1)
a29dee43c style(ios): the two SwiftLint warnings the fix round introduced
```

The first two commits of this round were made, then `git reset --mixed` and
remade with explicit `--` pathspecs: `git commit` without a pathspec had swept
the already-staged migration deletion into the stamp-pigment commit. The tree is
identical; the record is not, and the record is the point.

---

# Fix round 2 — 2026-09-05

Branch `approvals/w2-iosc`, from review head `359c24072`. Answering
`iosc-review-r2.md`'s two new majors: **IOSC2-R2-01** (the change note is
write-only on iOS) and **IOSC-R2-02** (the muted stamps' word is drawn in a
4.2:1 ink).

`git status --short` at the start of the round listed only eight `.env*`
paths as `Operation not permitted` — the harness sandbox refusing to READ
them, not a modification; `git diff --stat HEAD` reported them as deletions
for the same reason. No leftover work from the usage-limit stop: the tree was
clean at `359c24072` and nothing was discarded.

## IOSC2-R2-01 · the note lands on the approval AND is read back there

The destination was right and stayed. What was missing was the read: `grep -rn
"decision_comments" apps/mobile/Patina/Patina` returned one statement, the
INSERT, and no SELECT anywhere in the app.

**`ApprovalDiscussion`** (new, `Features/Decisions/Services/`) is that read —
`decision_comments` filtered on `decision_id`, ordered `created_at` ascending,
which is `useDecisionComments`' own query (`use-decisions.ts:963-967`) with
the same filter and the same order. RLS admits her: 00467:248's
`decision_comments_participant_select` grants SELECT to any `authenticated`
caller `app_private.is_decision_comment_client` accepts, which for a
`project_artifact_v1` row resolves the authority snapshot's
`decision_lead_id`. The model carries the rows, whether the read was refused,
and who "You" is (`AuthService.shared.currentUserId`, read at load time so an
account switch cannot leave a previous reader attributing the rows). It is a
READ and nothing else — a second composer here would be a second rail into the
table `IOSC-02` narrowed to one, and the change-note composer above the doors
stays the only place a note is written on this surface.

**`ApprovalDiscussionBlock`** (new, `Features/Decisions/Views/`) draws it,
mounted by `ProjectApprovalBlock` beneath the three doors. Deliberately quiet:
an approval with no notes draws no heading and no empty state. A read that
FAILED is named — "These notes couldn't be read just now." — because silence
over a thread she can see on her laptop is the same defect one layer down.
Attribution is `approval-ask.tsx`'s `studioHand` ported unchanged: "You" for
her own hand, otherwise `{Designer} · {Studio}` and "The studio" where either
half is missing (`P-11` reduced).

**The reread is keyed on `isSubmitting`, not on the outcome.** This is the
whole of why the fix works. `submitApprovalResponse` records the outcome, THEN
writes the note, and only then clears `isSubmitting` (the `defer`), so
`approvalDiscussionKey` — `"{decisionId}#{!isSubmitting && hasAnswered}"` —
moves exactly once, after the note is on the server. Keyed on
`answeredOutcome` the `.task(id:)` would refire between `record(outcome)` and
`sendChangeNoteIfWritten()` and reread a thread the note had not reached.
`theRereadWaitsForTheNote` pins both edges by capturing the key from inside
the note seam.

**`noteHelp` is unchanged and is now simply true**: the note goes to the
designer with the returned edition, and she can see it sitting there.

### One structural consequence, taken deliberately

`ProjectApprovalBlock` hit SwiftLint's 300-line `type_body_length` at 324
(lint-delta caught it, RED, before the commit). The discussion moved to its
own file rather than being squeezed — and **`ProjectApprovalActTests
.theStage2BranchHasNoStatusColour` grew a third argument** so the branch-wide
refusal still covers every view the branch draws. That test's own doc said
"These two files ARE the branch"; it now says three, and says that a fourth
file is a fourth argument rather than an exception. Widening the refusal was
not optional: a new view on the Stage-2 branch outside it is exactly how a
status colour gets back in.

## IOSC-R2-02 · the muted stamps' word

`Stamp.mutedInk` was `Text.muted` — `agedOak` #8B7355, the metadata value at a
hundred sites, measured at 4.20:1 on paper and 4.02:1 on a card against the
4.5:1 bar `ContrastTests.bodyTextClearsAA` applies to text in that same file.
It is now `PatinaColors.oakInk` #4E4339 — the portals' `--text-muted`
(`designer-portal/src/app/globals.css:80`), byte-identical, which is what the
ceremony table named all along — with `DarkPalette.textMuted` as its dark
companion. `Pigment.lightInkHex` for `.muted` follows (`8B7355` → `4E4339`),
so `PatinaStampTests`' resolved-sRGB pin moves with it.

`agedOak` itself is untouched. Every one of its other call sites is
de-emphasised metadata taking the 3:1 bar; darkening the token would have
moved all of them, and `ContrastTests.metaTextClearsTheMetaBar` is what keeps
it honest there.

**The gap that let it through is closed too.** The previous round extended
`ContrastTests` to measure `pigment.rule` for every pigment and `pigment.ink`
for none. `everyStampWordStaysReadable` now measures all SIX word inks on both
grounds in both appearances at the 4.5:1 text bar — at full ink, because
`PatinaStamp.words` applies no opacity and the word never ages — and
`theMetadataInkStillCannotCarryTheWord` is the counterfactual, so "the
metadata token was fine" is met with the number rather than an opinion.
All twenty-four measurements pass on this lane's simulator; each failure
message carries the real resolved ratio, so the next drift arrives as a
number.

## Findings NOT addressed (out of this fix brief's scope)

The r2 minors and nits stand for the steward: IOSC-R2-03 (three states with no
mount, `.reviewed` among them), IOSC-R2-04 (the signer's name in mono caps),
IOSC-R2-05 (the two sublabels the table specifies), IOSC-R2-06 (the retry's
second idempotency key), IOSC-R2-07 (`canRespond` wants `&& viewerAnswers`
after the iosc/iosd merge), IOSC-R2-08 (lint-delta's window excludes
PatinaDesignKit), IOSC-R2-09 (an unreachable rowLabel under the mark),
IOSC-R2-N1..N3, and every r1 minor still open (IOSC-06..18). Two of the
steward's five items are untouched by this round and still owed: **the `why`
renders nowhere on iOS** (00569 freezes it; neither iOS lane claimed P-13),
and **the walker** on the three things no test can reach.

`IOSC-R2-08` is worth one line of evidence rather than a promise: I ran
SwiftLint directly over the two design-kit files this round touches
(`PatinaStamp.swift`, `PatinaColors.swift`) with the project config. Four
warnings, all `identifier_name` on the `Color(hex:)` parser's `r`/`g`/`b`/`a`
at `PatinaColors.swift:350`, all pre-existing and untouched. No lint debt is
owed; the gate simply cannot see it.

## Gates — fix round 2, on this lane's simulator, unsandboxed

```
$ IOS_GATE_UDID=B6AD6271-E9E1-4BC6-B94A-F115E270CCAE .../ios-gate.sh all
** BUILD SUCCEEDED **
━ Test run with 2537 tests in 276 suites passed after 7.873 seconds
  with 2 known issues.
** TEST SUCCEEDED **
✓ lint-delta: no new warnings in touched files
```

The two known issues are the pre-existing pair inherited from Wave 1
(`BrandVoiceLintTests` "curated_mix", `RoomLifecycleTests
.theTodayRailFollowsALocalDelete`).

The FIRST `unit` run of this round reported the load flake a third time —
`CompanionCoachingModelTests.introGate_freshUser_pollsUntilTourResolves`, at
2537 tests. Rerun with the four touched suites beside it on the same
simulator, it passes:

```
$ xcodebuild test … -only-testing:PatinaTests/ApprovalDiscussionTests \
    -only-testing:PatinaTests/ContrastTests -only-testing:PatinaTests/PatinaStampTests \
    -only-testing:PatinaTests/ProjectApprovalDoorsTests \
    -only-testing:PatinaTests/CompanionCoachingModelTests
✔ Test introGate_freshUser_pollsUntilTourResolves() passed after 0.091 seconds.
✔ Test run with 74 tests in 5 suites passed after 0.095 seconds.
** TEST SUCCEEDED **
```

It also passed inside the full `all` run above, which is the tree that is
committed. Nothing in this branch touches it.

`lint-delta main` was RED once, before the split, and is green now:

```
✗ lint-delta: NEW SwiftLint warnings in touched files:
    Patina/Features/Decisions/Views/ProjectApprovalBlock.swift: 0 → 1
      → Type Body Length Violation: currently spans 324 lines (limit 300)
```

**Lesson for the steward, alongside round 1's `identifier_name` one:** on this
rail the file-length walls are load-bearing design constraints, not
housekeeping. `DecisionsViewModel.swift` is at 495 of 500 — which is why the
discussion's state is a screen-local `@Observable` rather than three more
stored properties on the view model — and `ProjectApprovalBlock` is now at 270
of a 300-line type body. The next lane to add a leg to this ceremony gets a
file split, not a hunk.

The wave adds **12 tests in 1 new suite** this round (2525 → 2537, 275 → 276):
`ApprovalDiscussionTests` (10) plus 2 in `ContrastTests`.

## Commits — round 2

```
fix(ios): the muted stamps write in an ink that can be read (IOSC-R2-02)
fix(ios): the note she writes is on the approval she is reading (IOSC-R2-01)
docs(approvals): W2 iOS-C fix round 2 — the two majors
```
