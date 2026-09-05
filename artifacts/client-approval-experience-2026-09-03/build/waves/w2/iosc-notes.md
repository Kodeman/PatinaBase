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
