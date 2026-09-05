# iOS-C lane — adversarial review, round 1

Reviewer: separate context, did not write this code.
Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-iosc`
(`git rev-parse --show-toplevel` → exactly that), branch `approvals/w2-iosc`,
base `107549568`.

```
$ git log --oneline main..HEAD
a5c85d582 test(ios): move the response-RPC pin off a file at file_length
b171f2268 docs(approvals): iOS-C lane notes for Wave 2 (P-17, P-16, P-18, P-19)
e2b41b262 feat(ios): the seal and the act, full screen (P-19)
bca153616 feat(ios): three doors of equal weight, held and signed (P-16, P-18)
fdbcc0111 feat(ios): eleven states, one stamp — the seal glyphs and the sage retire (P-17)
```

32 files, +2815 / −288. Commits are pathspec-clean: no `.claude/`, no `.env`,
no `.agents/`, no hooks, no settings. Conventional Commits, no `merge(...)`
subjects, no trailers, nothing pushed. Lane notes force-added as ruled.

**Verdict: fix.** One blocker (a migration that does not belong to this lane and
collides on number with the backend lane's), four majors, eight minors, four
nits. Every finding has a bounded local remedy; nothing needs rewriting.

---

## Gates — rerun by me, unsandboxed, on this lane's simulator

```
$ IOS_GATE_UDID=B6AD6271-E9E1-4BC6-B94A-F115E270CCAE .../ios-gate.sh build
** BUILD SUCCEEDED **                                            EXIT=0

$ IOS_GATE_UDID=B6AD6271-E9E1-4BC6-B94A-F115E270CCAE .../ios-gate.sh unit
━ Test run with 2515 tests in 275 suites passed after 9.542 seconds
  with 2 known issues.                                           EXIT=0
  known issue 1: BrandVoiceLintTests "curated_mix"     (pre-existing, on main)
  known issue 2: RoomLifecycleTests.theTodayRailFollowsALocalDelete (pre-existing)

$ .../ios-gate.sh lint-delta main
✓ lint-delta: no new warnings in touched files                   EXIT=0
```

The `CompanionCoachingModelTests` load flake the brief names did not appear on
my run. The lane's own gate numbers reproduce exactly.

---

## Items delivered

| Item | Verdict |
|---|---|
| P-17 stamp, eleven states, four dials, −1.1°, no fill/shadow, thirty-day step | delivered; see IOSC-04 (pigment) |
| P-17 `resolvedBanner` / `statusIcon` / `emptyView` glyphs retired | delivered; see IOSC-12 |
| P-17 `ProposalDetailStatusIconTests` updated not deleted | delivered |
| P-16 three doors, equal weight, verb-then-consequence | delivered, copy byte-exact |
| P-16 RETURNED replaces every Decline for `changes_requested` | delivered (grep clean) |
| P-16 note composer pre-opens on Return, encouraged not enforced | delivered; see IOSC-02, IOSC-03 |
| P-18 hold on three acts, 900 ms, haptic, VoiceOver, reduced motion | delivered; see IOSC-06, IOSC-08, IOSC-09 |
| P-18 signature + consent method on the outcome | delivered, at parity with web; see IOSC-01 |
| P-19 full-screen SignActView, edition line, consent, ruled name, hold | delivered; see IOSC-05 |
| P-19 SealMomentView, 420 ms settle, one haptic, reduced motion, Done | delivered; see IOSC-05, IOSC-06 |

Copy verified byte-for-byte against the brief and against the portals:

- `"Accept this exact edition and its stated impacts."` ✓
- `"Send this edition back for revision and a new approval request."` ✓
- `"Keep this open while you and your designer talk it through."` ✓
- `"Tell {Designer} what to change."` — string correct, unreachable (IOSC-03)
- `"Your typed name acts as your electronic signature."` == `consent-copy.ts:63` ✓
- `"I agree to the scope and investment in this proposal."` == `consent-copy.ts:36` ✓
- `"{Studio} countersigns. You'll have a copy."` ✓

Refusal grep over the whole diff (`gate`, `task`, `overdue`, `dashboard`, `AI`,
`Declined`-for-changes_requested, `sage`, `green`, `red`, `checkmark`, `badge`,
emoji, `shadow`, `confetti`): **no violation in any homeowner-visible string.**
"Declined" survives only as a commercial document a client refused, which is
the ruling. `PatinaColors.sage` is gone from both touched views and is pinned
gone. The two filled `PatinaStatusBadge`s are gone and pinned gone.

---

## Findings

### IOSC-01 — BLOCKER · migration 00569 is out of lane and collides on number

`supabase/migrations/00569_stage2_outcome_signature_payload.sql` (114 lines) is
an iOS lane writing a production RPC. Two lanes already own this number and this
change:

```
$ ls .codex/worktrees/agent-cae-w2-backend/supabase/migrations | tail -2
00568_decision_first_notice_dispatch.sql
00569_approval_why_viewer_role_and_receipt.sql      ← backend lane's 00569

$ ls .codex/worktrees/agent-cae-w2-web/supabase/migrations | tail -2
00568_decision_first_notice_dispatch.sql
00570_approval_response_signature.sql               ← the SAME widening, correctly numbered
```

The web lane's `00570` header reads: *"Lineage: respond_project_approval 00464 →
00569 → (this)"* — it chained off the backend's 00569 and opened the identical
two payload keys. iOS-C's file is a third copy of the same `CREATE OR REPLACE`,
built from 00464's body (it does not carry the backend's 00569 lineage), sharing
the version prefix `00569` with a different slug. `env.md` says *"Re-check `ls
supabase/migrations | tail` at every merge — other lanes may mint in parallel"*;
the collision is exactly what that warns about, and the Supabase ledger keys on
the version prefix.

The SQL itself is correct — I diffed it against 00464:830-855 and the argument
order matches `_respond_project_approval_checked(uuid, text, uuid, timestamptz,
text, text, text)` at 00464:496, grants are restated verbatim, and it adds no
validation of its own. It is simply not this lane's file.

**Fix:** delete `00569_stage2_outcome_signature_payload.sql` from this branch.
The web lane's `00570` already delivers the wrapper iOS needs, with the same two
keys (`clientConsentMethod` / `clientSignature`), so iOS's client code is
unchanged by the deletion. `HoldToActTests.theMigrationOpensExactlyTwoKeys` must
then repoint at `00570` or be dropped (the web lane pins the same thing).

---

### IOSC-02 — MAJOR · the change note lands somewhere the web's does not

iOS sends the return note as a **project-conversation message**
(`DecisionsViewModel.swift:379` — `MessagingAPIClient.createThread(projectId:)`
then `sendMessage`). The web lane sends it as a **decision comment**:

```
apps/client-portal/src/components/threshold/approval-ask.tsx:680
  const changeNoteComment = useCreateDecisionComment();
:799
  await changeNoteComment.mutateAsync({ decisionId: approval.decisionId, body: note });

packages/supabase/src/hooks/use-decisions.ts:991
  .from('decision_comments').insert({ decision_id: decisionId, author_id: user.id, body })
```

So the designer opening the approval in the portal sees a web client's note
attached to that approval, and does not see an iOS client's note there at all —
it is in the project chat, unattached to the paper it is about.

The lane's notes justify the messaging rail by quoting the *old* `approval-ask.tsx`
copy ("Add questions or notes in Discussion below") — that copy is what Wave 2's
web lane replaced. And the rail the web uses **is** client-reachable from a
Stage-2 approval; 00467 wrote the policy for exactly this case:

```
supabase/migrations/00467_stage2_client_access_repair.sql:256
CREATE POLICY decision_comments_insert ON public.decision_comments
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid()
              AND app_private.is_decision_comment_client(decision_id));
```

**Fix:** post to `decision_comments` from iOS with `decision_id = review.decisionId`,
keeping the existing `noteFailure` separation. The messaging fallback can stay
for the no-decision case if wanted, but the primary rail should be the one the
web writes to.

---

### IOSC-03 — MAJOR · the note placeholder can never name the designer

```
ProjectApprovalBlock.swift:346
    private var designerGivenName: String? {
        viewModel.decision?.project?.designer?.askedByName
    }
```

On the Stage-2 approval screen `viewModel.decision` is nil for the person being
asked. The code says so itself, in the file the lane edited:

```
DecisionsViewModel.swift:71-78
/// The PROJECTION comes first, and has to: 00467:18-38 cut
/// `approval_contract = 'project_artifact_v1'` out of every raw
/// `client_decisions` SELECT policy a homeowner can reach, so for the very
/// person being asked `decision` is nil on exactly the rows this branch
/// exists for.
```

`RemoteProjectApprovalReview` (the projection that *is* present) carries no
designer field. So the composer's placeholder always resolves to the fallback
`"Tell your designer what to change."`, and the brief's specified string —
`"Tell {Designer} what to change."` — never renders for the homeowner it was
written for. `ProjectApprovalDoorsTests.thePlaceholderNamesTheDesignerOrNobody`
passes because it calls the pure function directly, never the view's binding.

The lane solved the identical problem correctly 200 lines away, for the seal:

```
ProposalsViewModel.swift:806-812
    var countersigningStudio: String? {
        guard let projectId = proposal?.project_id else { return nil }
        let project = BadgeCountService.shared.projects.first { $0.id == projectId }
        return project?.designerStudioName ?? project?.designer?.displayName
    }
```

**Fix:** resolve the designer for the composer the same way, from
`approvalReview.projectId` against `BadgeCountService.shared.projects`, keeping
"your designer" as the honest fallback.

---

### IOSC-04 — MAJOR · four of the eleven stamps draw a border that is not there

`PatinaColors.Stamp.mutedRule = PatinaColors.Border.strong` — a hairline
*separator* token (#C8C3BB light) standing in for the stamp table's border
pigment, which `ux/02` §5 specifies as `--text-subtle` (`#5A4E43` in the
designer portal's `globals.css:81`). REVIEWED, WITHDRAWN, SUPERSEDED and
EXPIRED all take it.

Measured with the repo's own helper, in a throwaway test I ran on this lane's
simulator and then deleted (`PatinaContrast.ratio(_:opacity:on:_:)`, the same
call `ContrastTests` uses), at the component's own `borderOpacity` 0.88 over
`PatinaColors.Background.primary`:

```
PROBE rule mocha:       light=5.74  dark=8.91  darkAged=6.70
PROBE rule goldenHour:  light=4.16  dark=7.94  darkAged=6.01
PROBE rule clay:        light=4.15  dark=5.82  darkAged=4.53
PROBE rule terracotta:  light=4.17  dark=5.22  darkAged=4.09
PROBE rule muted:       light=1.54  dark=1.79  darkAged=1.62   ← the mark is not a mark
PROBE rule word:        light=9.38  dark=11.27 darkAged=8.34
** TEST SUCCEEDED **
```

1.54:1 on paper, against a 3:1 bar for a non-text mark. Note this is worse in
**light** than in dark, which inverts the lane's own stated reasoning ("the
ruling's contrast numbers are measured on paper, and iOS has a dark canvas") —
the argument it applied to `mocha` was never applied to `muted`. The word ink
is fine everywhere (`muted` ink = 8.58:1 dark), so what a homeowner sees on an
expired approval is a floating word with no rule around it.

`PatinaStampTests.everyPigmentAdapts` only asserts each pigment is not a flat
literal; it never measures. `ContrastTests` — the suite that already covers this
exact concern — was not extended, which the brief's "tests in the suite that
already covers the neighbouring code" asks for.

**Fix:** point `Stamp.mutedRule` at a `--text-subtle`-equivalent (#5A4E43 light,
with the house's usual dark companion), and add the five stamp rules to
`ContrastTests` at 0.88 and 0.74 so the number cannot drift again.

---

### IOSC-05 — MAJOR · two full-screen covers swapped in one state mutation

```
ProposalsViewModel.swift:224-226
    self.didSign = true
    self.signedName = name
    self.showSignSheet = false
    self.showSealMoment = true
```

against two sibling presentations on the same view:

```
ProposalDetailView.swift:52  .fullScreenCover(isPresented: $viewModel.showSignSheet) { SignActView(...) }
ProposalDetailView.swift:67  .fullScreenCover(isPresented: $viewModel.showSealMoment) { SealMomentView(...) }
```

Dismissing one cover and presenting another in the same transaction is the
classic SwiftUI race: UIKit is asked to present while a dismissal is in flight,
and the second presentation is dropped. The seal moment is P-19's entire
payoff, and the lane records no simulator walk — "Build, unit and lint-delta are
the evidence", and every seal assertion is a source-string pin, so nothing in
the suite would notice the cover never appearing.

**Fix:** either present the seal from the sign cover's `onDismiss` closure, or
drive both from one `enum`-typed `fullScreenCover(item:)`. Either way a walker
must confirm on device that signing lands on the seal, and that "Done" returns
to a detail screen showing the SIGNED stamp.

---

### IOSC-06 — MINOR · the success haptic is spent twice, not once

`HoldableModifier.startHold()` (and `accessibleComplete()`) fire
`HapticManager.shared.notification(.success)` at hold completion — verified as
`UINotificationFeedbackGenerator.notificationOccurred(.success)`
(`HapticManager.swift:68-70`). `SealMomentView.settle()` fires the same haptic
again on appear. On the sign path a homeowner gets two success notifications a
network round-trip apart, and on the outcome/review paths she gets a success
notification for an act that has not yet reached the server.

`ux/02` §5 (Step 6): *"`HapticManager.shared.notification(.success)` — the
single strongest haptic in the whole ceremony, spent exactly once, at the seal.
Nowhere else."* §4 specifies `thresholdCrossed()` (impact medium, 0.7) for the
hold's completion instead. `HoldToActTests` currently *pins* the `.success` at
hold completion, so the pin would move with the fix.

**Fix:** `thresholdCrossed()` in `HoldableModifier`'s completion, `.success`
only in `SealMomentView`. The brief's "haptic on completion (HapticManager)" is
satisfied either way.

---

### IOSC-07 — MINOR · dark-mode DECLINED is drawn in the app's error ink

```
PatinaColors.swift:269-271
        public static let terracotta = Color.patinaDynamic(
            light: terracottaInk, dark: DarkPalette.textError
        )
```

`DarkPalette.textError` (#DE8A7B) is the token behind "Overdue" and every
validation line — the app's error red. The ruling is *"DECLINED in terracotta
ink, the one warm exception"*, and `PatinaColors.terracotta` (#D4A090) already
exists as the light-terracotta companion. Binding the stamp to `textError`
means any future retune of error red silently retunes DECLINED, and it is the
one place the grammar edges back toward a red status.

**Fix:** `dark: PatinaColors.terracotta`.

---

### IOSC-08 — MINOR · hold timing and cancel are pinned by grep, not tested

The brief asks for "Tests: hold timing, cancel, the RPC parameters include the
signature." The third is a real behavioural test. The first two are string
searches over source:

```
HoldToActTests.aReleasedPressCancelsAndNeverCompletes
    let cancelBody = String(source[cancel.lowerBound...].prefix(360))
    #expect(cancelBody.contains("holdTask?.cancel()"))
    ...
    #expect(!cancelBody.contains("onComplete()"), "a release completed the act")
```

A `prefix(360)` window over a source file does not prove a 900 ms press
completes, that an 800 ms press does not, or that `onCancel` fires once. The
lane names this itself under "What I could not verify". Given the brief also
forbids inventing structure, this is a judgement call rather than a defect —
but the coverage claimed is not the coverage delivered, and no walker has
confirmed it by hand either.

**Fix:** either extract the timing loop into a testable model, or hand the
walker an explicit script step (released press does not submit; 900 ms press
does; VoiceOver Activate fires) and record the result.

---

### IOSC-09 — MINOR · the VoiceOver hint names the one gesture VoiceOver must not use

```
HoldToActButton.swift:31
    static let voiceOverHint = "Press and hold to confirm."
```

applied as `.accessibilityHint(...)`. Under VoiceOver the hold is not the path:
`VoiceOverTapModifier` wires a single tap and `HoldableModifier` exposes an
`Activate` custom action, both precisely because *"a sustained drag is
impractical under VoiceOver"* (the file's own comment). The hint therefore tells
a VoiceOver user to perform the gesture the code goes out of its way to replace.

**Fix:** branch the hint on `\.accessibilityVoiceOverEnabled`, or word it as the
outcome ("Confirms your answer") and leave the gesture to the visual affordance.

---

### IOSC-10 — MINOR · a disabled act with no sentence saying why

With an empty name, `HoldToActButton(title: submitAction, isEnabled: canSignApproval)`
renders at `.opacity(0.5)` and is inert. Nothing on the screen says the name is
what unlocks it. The signature field is visible above with its placeholder, so
it is discoverable — but the product's own discipline elsewhere ("an act that
cannot succeed is not offered", `canDefer`) is either to hide the act or to name
the reason, and this does neither.

**Fix:** one line under the disabled act, in the instructional register, or hide
the submit until `canSignApproval`.

---

### IOSC-11 — MINOR · three of the eleven states have no call site

`grep -rn "PatinaStamp(" apps/mobile --include="*.swift"` returns five mount
points; `.awaiting`, `.reviewed` and `.signedOnPaper` are not among them. P-17
asks for the eleven-state grammar in the component and that is delivered, so
this is not a missing item — but `.reviewed` is the state P-10 / R-C9 invented,
and the review-confirmed leg in `ProjectApprovalBlock` still closes with a
sentence and no mark. Worth one look before the wave closes, so the state does
not ship as dead code.

---

### IOSC-12 — MINOR · the legacy resolved banner asserts APPROVED without evidence

```
DecisionDetailView.swift:264
    static let resolvedStamp: PatinaStamp.State = .approved
```

Every responded legacy decision is stamped APPROVED. The lane's argument (no
client-reachable path records another outcome on a non-Stage-2 decision) holds
for client acts, and `RemoteClientDecision` genuinely carries no outcome column
to read (`DecisionsAPIClient.swift:113-151` — `status`, `responded_at`,
`client_consent_method`, no `answer`). So the word is asserted rather than read,
on a mark that is a record of a legal act. Low blast radius today; worth naming
because the projection could carry `answer` if this ever needs to be honest.

---

### IOSC-13 — MINOR · the note/outcome order diverges from the web

Web posts the note **first** and aborts the outcome if it fails
(`approval-ask.tsx:794-804` — *"An outcome recorded against a note that never
arrived would send the edition back saying nothing"*). iOS posts the outcome
first and treats a note failure as a separate flat line. Both arguments are
written down and both are defensible; they cannot both be the house rule. One of
the two should be re-ruled at integration so a designer's inbox reads the same
way whichever surface answered.

---

### IOSC-14 — MINOR · P-16 and P-18 shipped as one commit

The brief says "Commit per item". `bca153616` carries both. The lane declares
this and gives a real reason (the P-18 hunks sit inside the P-16 ones; the P-16
half alone would not compile without `HoldToActButton`). Recorded, not disputed.

---

### Nits

- **IOSC-15** `DecisionsViewModel.sendApprovalNote`'s default closure re-implements
  `openThread`'s switch verbatim ten lines above it, because `openThread` is
  private. Make it `fileprivate`/internal and call it.
- **IOSC-16** `SealMomentView.swift` imports `UIKit` and uses no UIKit symbol —
  `HapticManager` wraps `UINotificationFeedbackGenerator` itself.
- **IOSC-17** `SealMomentTests` pins `settleDuration` and `settleFromScale` but not
  `settleFromRotation` (−3.4), the one settle value with no test behind it.
- **IOSC-18** `DateDisplay.long(Date())` is evaluated inside two view bodies, so the
  date on the ruled line is recomputed on every render and is untestable at the
  call site.

---

## Things I checked that are correct

- The 00569 SQL body is a faithful `CREATE OR REPLACE` of 00464:830-855 with the
  allow-list grown by two keys; argument order matches
  `_respond_project_approval_checked`'s declared signature at 00464:496; grants
  restated verbatim; no re-validation, no relaxation. (The file still has to go —
  IOSC-01 — but not because the SQL is wrong.)
- Consent-method parity: iOS sends `clientConsentMethod: "electronic_signature"`
  with `clientSignature`; `approval-ask.tsx:815-816` sends exactly the same pair.
- Name gating parity: web refuses the act under a complete signature for **all
  three** outcomes (`approval-ask.tsx:789`), so iOS's `canSignApproval` gate on
  Hold and Return is at parity, not stricter — the ceremony doc's "theatre" line
  is superseded by R1 and by the web's own behaviour.
- `messageRoute` falls back to `approvalReview?.projectId`, so the note has a
  destination on the Stage-2 screen where `decision` is nil (this is why IOSC-03
  is a copy defect and not a broken note).
- `createThread` is get-or-create ("Open (or fetch) a direct thread"), so a note
  does not spawn duplicate threads.
- `ProposalStatusDisplay.stampState`'s branch order reproduces the old
  `statusRow`'s three-way exactly (declined checked before the expired/`!isSignable`
  arm, which the old code handled with `&& status != "declined"`).
- Accepted-but-unsigned takes **no** stamp — SP-04 preserved, and pinned.
- `ProposalSignTerms` is untouched; its "Nothing here is invented" contract is
  pinned by string, and `SignActView` re-uses the composer rather than copying it.
- The edition line uses `version` + `sent_at`, both of which
  `get_client_proposal_bundle` returns (00407:366), and degrades to the issue
  date, then to nothing.
- Four suites that pinned `ProposalSignSheet.swift`'s path were repointed at
  `SignActView.swift` rather than deleted, and `.patinaTopBand()` survives.
- No `project.pbxproj` change was needed or made — the target uses file-system
  synchronized groups, and the build compiled all six new files.
- `PatinaEmptyState.icon` becoming `String? = nil` is source-compatible for every
  existing call site, including the Capture app's, which shares the design kit.
- Aging: 30 days, 0.88→0.74 outer, 0.42→0.26 inner, open states never age,
  unrecorded states cannot age. All pinned.
- Rotation −1.1° matches the Threshold (`approval-ask.tsx:111`,
  `wall-gate.tsx:211`), not the pre-cutover doc's −2°; the brief specifies −1.1°.

---

## For the steward

1. Drop `supabase/migrations/00569_stage2_outcome_signature_payload.sql` and keep
   the web lane's `00570`. Repoint or drop
   `HoldToActTests.theMigrationOpensExactlyTwoKeys`.
2. Deploy order still binds: `00570` must be applied before an iOS build that
   sends a signature, or the submit fails `invalid_parameter_value`.
3. The clay-ink divergence the lane flagged is real and unresolved: iOS
   `clayInk` #82612F vs the portal's `--color-clay-ink` #7C5E30. RETURNED will be
   two browns until someone picks one.
4. IOSC-05 and IOSC-08 both want a walker, not a test: the seal must be seen to
   present, and the 900 ms press must be felt to complete.
