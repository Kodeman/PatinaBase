# Wave 3 simulator walk — round 1 ("The Decision, Delivered": the habit)

- **Worktree** `git -C … rev-parse --show-toplevel` →
  `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w3-integration`,
  branch `approvals/w3-integration`, HEAD **`275f86ba6`**
  ("docs(approvals): the Wave 3 carry-fix lane log and its wave-report section", docs only;
  the two commits under it are `3066f8c6e` — the R3-M1 snooze carry fix — and `98ead8ebe`).
- **App** `…/apps/mobile/Patina/.build/DerivedDataWalk/Build/Products/Debug-iphonesimulator/Patina.app`,
  `Patina.debug.dylib` stamped `2026-09-05 22:58`, i.e. AFTER the last code commit
  (`3066f8c6e`, 22:57:39). The carry fix is in the bundle: `strings Patina.debug.dylib`
  finds **2** hits for `Choose again here whenever you want them back` and **0** for the
  retired `until you come back`. Also present: `RECORD OF DECISION`, `Keep a copy`,
  `Tomorrow morning`, `Once a week, on Sunday`, `Still yours to answer`, `I choose`.
- **Simulator** `29E64516-9C2F-4D77-95D8-55D7B61E017B` (`cae-w1-walk`), booted with
  Simulator.app in front, `defaults write cloud.patina.app DeploymentTarget local`,
  `simctl install`, launched `-DeploymentTarget local`.
- **HID preflight** — tapped "Have a password? Sign in" on the Welcome screen and asserted the
  sign-in sheet mounted (`00-launch.png` → `01-hid-preflight.png`, AX shows
  `auth.form.emailField`). The first tap was swallowed, as every prior walk recorded; the
  second landed. Every assertion below was re-taken after its effect was visible.
- **Stack** local (`127.0.0.1:54322`). The ledger already carried this branch —
  `select version … desc limit 6` → `00573, 00572, 00571, 00569, 00568, 00567`,
  `to_regclass('public.decision_snoozes')` and `to_regproc('public.set_decision_snooze')` both
  resolve, and the cadence CHECK is
  `reminder_cadence = ANY (ARRAY['right_away','daily','weekly_sunday'])`. **Nothing was reset.**
- **Shots** `walk-shots-r1/` (39 files). The integration branch advanced to `141055ffc`
  ("docs(approvals): the Wave 3 web walk …", docs only) while this walk was running; no code
  moved under the build.

## ⚠ A second walker was on this stack throughout

Rows I did not create appeared under me while I walked and rows I did not touch changed:

| what the peer did | evidence |
|---|---|
| minted `Walk W3 - Library elevations, Edition 903 / 904` | `client_decisions`, created before my sign-in |
| answered Edition 903 `approved / electronic_signature` at **04:03:08Z** | one minute before I signed in (04:04) |
| answered Fixture **G2** `approved / electronic_signature` at **04:14:44Z** | at that instant my app was on the **Pieces** tab (`23-approval-g2-open.png` is the Browse-pieces screen a mistap produced) |
| wrote `notification_preferences.reminder_cadence = 'weekly_sunday'` at 04:13:57Z | which is why Settings first read "Once a week, on Sunday" |
| wrote a `decision_snoozes` row `kind = 'sunday'` on `aee67ead-…` at 04:14:06Z | not my decision id |

**Every finding below therefore rests on a row I minted myself** (idempotency prefix
`walk-w3-r1:`, titles `Walk R1 - …`) **or on a fixture row I read and did not share**, or on
source. Two walker-owned Stage-2 approvals were created through the real lifecycle RPCs
(`create_project_approval_decision` → `confirm_project_decision_review` →
`publish_client_decision`) rather than hand-inserted:

| what | id | note |
|---|---|---|
| open, **with a why** | `51c48d1c-518c-44ea-929b-5fcc32358609` | "Walk R1 - Stair rail profile", due Sep 16, why + author |
| open, no why | `1ee658bb-5def-4019-82d4-acb6c7becccc` | "Walk R1 - Pantry shelving depth", due Sep 17 |
| **three-option** choice | `b0000000-…-0000000d3c01` | "Entry sconce - three finishes", published, 3 options |
| two-option choice | `b0000000-…-0000000d2c02` | seed "Dining chairs", published, 2 options |
| past due Stage-2 | `f5e6c6ad-…` (G6) | due Aug 31; `created_at`/`sent_at` backdated to Aug 24 in replica mode so the asked-on clause is earned |
| settled Stage-2 | `104e94dc-…` (G3), plus my own `51c48d1c` after I answered it | |
| signed proposal | `b0000000-…-0000000cd003` | "Aspen Loft — Paintwork and plaster", `accepted`, `signed_by_name = Client User` |

Homeowner **`client@patina.dev` / `password123`**, uid `a0000000-…-005`; project **Aspen Loft
Refresh** `b0000000-…-00d1`; designer **Leah Hartwell** `…-004`.

---

## 1 · The spread (P-30)

### Two plates, side by side — PASS on the mechanism, with one defect on the plate

`11-spread-two-plates.png`, `12-leaning-shaker-oak.png`, `13-released-tap-no-submit.png`,
`14-after-hold-chosen.png`.

- **Equal weight is real.** Both plates measure `171 × 154.67` in the AX tree — identical
  frames, so the one-line option does not sit in a short card beside the three-line one.
- **The tap is a leaning, not an answer.** Tapping Shaker Oak drew a **filled clay dot** in the
  plate and a clay rule around it, and the act appeared beneath the spread reading
  **"I choose Shaker Oak · PRESS AND HOLD"**. Never "Choose this". The line above the plates
  reads "Tap one to sit with it. Nothing is sent until you hold the act."
  Immediately after the tap:

  ```
  select status, responded_at, answered_at, (…selected) from client_decisions where id='…d2c02'
   pending | (null) | (null) | 0
  ```

- **A released press does not submit.** A 0.1 s tap on the act left the row `pending`, `sel = 0`.
- **The hold does, first time.** A 1.8 s press:

  ```
  status | responded_at                  | client_consent_method | client_signature
  responded | 2026-09-06 04:08:48.16103+00 | click_through        | (null)
  Shaker Oak | t     Windsor Elm | f
  ```

  `click_through` with no name is exactly the token the mid-Wave-2 ruling reserves for an act
  with no name on it.
- **The deferral pair is not the lesser offer.** `decisionDetail.defer.notYet` and
  `decisionDetail.defer.neitherOfThese` are both 44 pt tall, body face, sitting side by side
  below the act at the same size as the act's own label.
- **The signature is optional and inline** ("Sign it, if you'd like" / "Optional. Type your
  full legal name and your choice is recorded as signed; leave it empty and it is recorded as
  confirmed in Patina."). This is `d2e6eefb7`'s round-1 fix, deliberate — but the iose lane log
  still carries the paragraph headed *"One deliberate removal, flagged for the reviewer"*
  saying an option choice "can no longer be e-signed". That paragraph is stale; see `W3R1-n3`.
- **The defect: the recommended plate cannot say its own name.** See `W3R1-M1`.

### Three or more — PASS on the mechanism, with a layout defect

`15-spread-three-options.png`, `16-three-option-leaning.png`, `17-three-option-page2.png`.

- A **horizontally paged spread** under a **dot rule in clay** (three dots, the resting one
  filled). Never "1 of 3", no numeral anywhere.
- Swiping advances the page and moves the clay dot to the second position.
- The leaning works at three options: the plate takes a clay rule and the act reads
  **"I choose Antique Brass"**; the row stayed `pending` throughout.
- **The defect: the plate overhangs the screen.** See `W3R1-M2`.

### Accessibility-extra-large — PASS

`xcrun simctl ui <udid> content_size accessibility-extra-large`, confirmed by reading it back.

- **Three options** (`18-axxl-three-options.png`) — the paged spread becomes one **stacked**
  full-width plate. The `Recommended` capsule is drawn whole, the title wraps at the word
  ("Antique / Brass", never inside a word — `C-06` stays closed), the leaning dot is visible,
  and the plate no longer overhangs.
- **Two options** (`19-axxl-two-options-stacked.png`, Rug color) — stacked, Natural above Sand,
  each full width, `Recommended` whole, no truncation. `DecisionSpread.layout`'s
  "`.stacked` at every count above `.accessibility1`" is what the screen actually does.

Content size restored to `medium` afterwards.

### Reduce Motion — NOT OBSERVABLE with this harness

`ReduceMotionEnabled` was written on the device and the app relaunched. At `delay: 0` after the
tap the destination's plate already reported its final `x = 24` — consistent with a still
arrival — but the identical reading came back with Reduce Motion **off**, so the harness's own
round-trip (≈700 ms for `simctl io screenshot`, ≈300 ms for a Blitz describe) is longer than the
transition it is trying to catch, and `ffmpeg` is not installed to cut frames out of
`simctl io recordVideo`. **The cross-fade is unverified by the harness's limit**, the same class
of gap as the haptic (the simulator has no Taptic Engine and logs nothing for
`UISelectionFeedbackGenerator`). Neither is reported as a defect; neither is reported as passing.
`DecisionSpreadTests` covers "Reduce Motion takes the still arrival" at the unit level.

---

## 2 · Keep a copy (P-26, iOS half) — **BLOCKER: the act never appears**

`34-approved-settled.png`, `36-settled-approval-no-keepacopy.png`,
`37-settled-g3-no-keepacopy.png`, `38-signed-proposal-detail.png`.

Three separate settled records, three absences:

1. **The approval I answered myself** (`51c48d1c`, APPROVED, `electronic_signature`,
   `client_signature = 'Margaret Whitfield'`). The screen draws the APPROVED stamp and
   "You approved this edition." — and nothing else. `scan_ui` for "Keep a copy" returns the
   Back button and `decisionDetail.approval.discuss`, nothing more.
2. **A settled approval from an earlier session** (G3, `104e94dc`) — same absence, same scan.
3. **The signed proposal** (`…cd003`, SIGNED, "Signed by Client User on Aug 6, 2026") — same
   absence.

Both mount points are unconditional on a settled record and both records exist: the same
`viewModel.approvalRecord(studio:)` / `viewModel.record()` value that would feed
`KeepACopyAct` is what the sentence beside the mark is drawn from, and both sentences drew. So
the failure is inside `KeepACopyAct` itself
(`Patina/Features/Shared/Views/RecordSheet.swift:156-180`):

```swift
var body: some View {
    Group {
        if let sheetImage { ShareLink(…) }      // ← EmptyView until the image exists
    }
    .task {                                     // ← never observed to run
        guard sheetImage == nil else { return }
        sheetImage = RecordKeepsake.image(record).map(Image.init(uiImage:))
    }
}
```

Either `.task` never fires (a `Group` whose only content is `EmptyView` is the classic SwiftUI
case where attached lifecycle modifiers are dropped) or `ImageRenderer.uiImage` returns nil on
`RecordSheet`. `RecordOfDecisionTests` walks `RecordOfDecision.printedLines`, not
`RecordKeepsake.image`, so nothing in the suite would have caught either.

**Consequence for the brief.** The share-sheet preview, the stamp drawn upright, the consent
sentence, the twelve-character checksum and "no IP address" could not be observed on the device
at all, because there is no act to press. Those four are unwalked, not passed. `RecordSheet`
and `RecordOfDecision` read correctly in source and their tests pass — what is broken is the
one line that puts them on screen.

The **third** offered surface, the seal moment (`SealMomentView`), was not reachable: the one
signable legacy proposal (`b0000000-…-000002`) needs `projects.proposal_id` pointing at it and
that column refuses to move — `ERROR: project proposal provenance is immutable after
activation` (`guard_project_completion_authority`). It mounts the identical component, so the
same root applies, but it is unwalked.

---

## 3 · The pace (P-28, iOS half)

### The three cadences, in words — PASS, and all three write

`28-settings-top.png`, `29-cadence-three-words.png`, `30-cadence-once-a-day.png`,
`31-cadence-right-away.png`, `32-settings-reminders-floor.png`.

The Reminders row under PREFERENCES is a menu whose options are exactly
**"Tell me right away" · "Once a day" · "Once a week, on Sunday"** — three words, no enum, no
figure. Beneath it the floor: *"Patina never mails about an approval before 8am, and your phone
only buzzes between 8am and 8pm — your own clock. Anything later waits for the morning."*

```
choose "Once a day"          → reminder_cadence = daily       @ 04:21:11Z
choose "Tell me right away"  → reminder_cadence = right_away  @ 04:21:41Z
```

Both writes landed on `notification_preferences` for `…-005`. `weekly_sunday` was already on the
row when I arrived (the peer walker's write at 04:13:57Z), so the third value is proven present
in the column and in the CHECK, and the two the app wrote are proven by timestamp to be mine.

### The snooze on an open approval — PASS on every clause

`24-approval-open-pace-top.png`, `25-remind-me-four-words.png`,
`26-snoozed-tomorrow-morning.png`.

- The block reads **"Remind me"** over *"Still yours to answer; only the reminders wait."*
- The menu carries exactly the four words:
  **"Tomorrow morning" · "Sunday" · "When it's due" · "Don't remind me — I'll come back"**.
- Choosing "Tomorrow morning" on my own `51c48d1c`:

  ```
  decision_id | kind             | snoozed_until          | at America/Chicago
  51c48d1c-…  | tomorrow_morning | 2026-09-06 13:00:00+00 | 2026-09-06 08:00:00
  now() at America/Chicago = 2026-09-05 23:17
  ```

  **The next 8am local**, to the minute.
- The answer is in Patina's voice and refuses to over-promise:
  *"I'll hold the reminders until tomorrow morning. If the date passes or a new edition arrives,
  I'll still say so."* — R16's two carve-outs said out loud rather than implied.
- The R3-M1 carry fix is in this build: "Don't remind me — I'll come back" resolves to
  *"I'll hold the reminders. Choose again here whenever you want them back."*, and the standing
  sentence survived a re-render of the screen (it was still drawn under the Approve signature
  rule on `33-approve-signature-rule.png`).

### The past-due approval offers no snooze, and says why — PASS

`27-pastdue-no-snooze.png` (G6).

The pace block is **absent from the AX tree** — `scan_ui` for "Remind me" over the bottom half
returns Back, the three outcomes and Discuss, nothing else — and in its place stands
*"This one is past its date. The reminders stay until it's answered."*

The server is the belt to that brace, and it is a different belt than I expected:
`set_decision_snooze` **accepts** a snooze on a past-due approval
(`select public.set_decision_snooze('f5e6c6ad-…','tomorrow_morning')` as the client returned
`snoozedUntil 2026-09-06T13:00:00+00`, rolled back). That is harmless because the suppression is
decided downstream, not at the write: `supabase/functions/_shared/decision-notify.ts:199`
opens the gate with `if (gate.kind === "decision_overdue") return null;` and only reaches the
`"snoozed"` hold when `!gate.isSupersedingEdition`. So a snooze can never silence the overdue
notice or a superseding edition even if one is written. Recorded as `W3R1-n1`, not a defect.

---

## 4 · Regression spot-checks

- **A Stage-2 approve with hold + typed name succeeds first time — PASS.**
  Approve → the signature rule appears **only** under a chosen Approve (`YOUR NAME` /
  `SEPTEMBER 5, 2026` / "Your typed name acts as your electronic signature."), `Submit response`
  unlit until the name is on it, "Choose another outcome" beneath. One 1.8 s hold:

  ```
  status | answer   | client_consent_method | client_signature    | responded_at
  responded | approved | electronic_signature | Margaret Whitfield | 2026-09-06 04:24:13.909992+00

  receipts: created (walk-w3-r1:a-create) · review_confirmed (walk-w3-r1:a-review)
            published (publish-v1:51c48d1c-…) · responded (D6AF5A9D-…)   ← app-minted, exactly one
  ```

- **Stamps mocha, no fill — PASS.** Pixel probe of the APPROVED mark on the settled screen
  (`34`): interior **RGB(250,247,242)** = the page ground (no fill), word **RGB(92,74,60)**
  (#5C4A3C, mocha), rule RGB(111,95,82). On Today (`36`): APPROVED word RGB(92,74,60) on the
  card ground RGB(245,242,237); RETURNED rule RGB(144,114,70) with the word in body ink
  RGB(44,41,38). No sage, no green, no terracotta, no fill, no shadow.
- **No numbers, no badges — PASS.** The Studio hub speaks in words —
  "Awaiting you … nine", "Decisions / **Seven** approvals are waiting on you",
  "Proposals / **Five** shared proposals, **Four** accepted", "Nine things need your eye".
  The bell's AX value is "Unread notifications" (a clay dot, never a figure); no `.badge(` in
  the tab bar's tree on any screen.
- **Bell titles — PASS** (`40-bell-feed-titles.png`). Open rows read "An approval needs you" /
  "A decision needs you" with the row's own title beneath; settled rows read the recorded
  sentence — "You approved this edition.", "You returned this edition for revision.",
  "This approval is closed" — each over "Your answer is on the record." No "sign-off" survives.
- **The why and its author — PASS, carried.** `24`: the why under the question, "— Leah
  Hartwell" beneath it, then "Edition 901 · Due Sep 16, 2026" and "You are approving edition
  901, exactly as shown."
- **The three deltas, stated independently — PASS.** `27`: COST +$975 / SCHEDULE +11 days /
  LEAD TIME +21 days, each on its own label; `39`: COST −$480 / SCHEDULE −2 days, with the
  negative in body ink, not sage.
- **Kind chips — PASS, carried.** "Awaiting your call" draws `Approval` on both Stage-2 rows and
  the legacy sign-off, `Color` / `Product` / `Material` on the choices (`10`).
- **The retired words — PASS.** No "overdue", "gate", "task" or "dashboard" in any string a
  homeowner reads. The past-due row says "Still open, Leah asked on Aug 24." on Today and
  "This response is past due." on the approval, both in body ink RGB(44,41,38).

---

## Findings

### W3R1-M1 · major · the recommended plate cannot say its own name

`11-spread-two-plates.png`, `12-leaning-shaker-oak.png`, `14-after-hold-chosen.png`.

At the default text size, on the exact two-plate case P-30 was built for, the left plate's title
renders **"Shak…"**. The AX label is the full "Shaker Oak, Lighter, more casual., Recommended,
$680" — so it is a rendering truncation, not missing data — and the act beneath correctly reads
"I choose Shaker Oak". A homeowner comparing two plates cannot read the name of the one her
designer recommended, and cannot read it after she has answered either ("Shak… / Your choice").

Cause, in `DecisionDetailView.plate` (`:303-341`): the title `VStack` and the `Recommended`
capsule share an `HStack`, and `C-06`'s own fix gave the capsule
`.fixedSize(horizontal: true, vertical: false)` + `.minimumScaleFactor(0.6)`. The capsule
therefore takes its full intrinsic width first and the 171 pt plate hands the title what is
left. The fix that stopped the capsule wrapping inside its own word at accessibility sizes is
what starves the title at the default one.

Fix: give the title the layout priority (or let the capsule compress / move it to its own line
below the title on the compact plate). Non-recommended plates are unaffected — "Windsor Elm"
draws whole.

### W3R1-M2 · major · the paged plate hangs off the right edge of the screen

`15-spread-three-options.png`, `16-three-option-leaning.png`, `17-three-option-page2.png`.

On the three-option spread the plate's AX frame is `{{24, 244}, {402, 101.67}}` on a **402 pt**
wide screen — the card starts at x = 24 and ends at x = 426, so **24 pt of every plate is off
the screen**. What is cut off is not decoration: the `Recommended` capsule is sliced in half on
page one, and the **filled clay dot that shows which plate is leaning is rendered outside the
viewport** — only its left sliver is visible at the right edge in `16`. The leaning is the whole
of what the tap is for, and on a three-option decision it is the thing you cannot see. Both
pages show it, so it is every plate, not the first.

Cause, in `DecisionDetailView.pagedPlates` (`:514-532`): `.padding(.horizontal, 24)` is applied
to the `LazyHStack` **inside** the `ScrollView`, while each card takes
`.containerRelativeFrame(.horizontal, count: 1, spacing: 12)`, which measures the scroll view's
own width and knows nothing about the inset. Fix: move the inset to the scroll view as
`.safeAreaPadding(.horizontal, 24)` (which `containerRelativeFrame` respects), or size the card
against the inset width.

Not reproduced at accessibility sizes, where `layout(optionCount:isAccessibilitySize:)` returns
`.stacked` and the plate fits (`18`).

### W3R1-B1 · blocker · "Keep a copy" is never offered — P-26's iOS half is unreachable

Full evidence in §2 above. Three settled records on two rails (a Stage-2 approval I answered
with a typed name, a Stage-2 approval settled earlier, and a signed proposal), three absences
of `record.keepACopy` from the accessibility tree. The record value that feeds the act exists in
every case — the sentence drawn beside the mark comes from the same call — so the failure is in
`KeepACopyAct` (`RecordSheet.swift:156-180`), where the act is drawn only after a `.task`
assigns `sheetImage`, and the `Group` it is attached to holds nothing but `EmptyView` until it
does. The unit suite proves `RecordOfDecision.printedLines` and never calls
`RecordKeepsake.image`, so nothing would have caught it.

Everything the brief asks about the paper — the upright stamp, the consent sentence, the
twelve-character checksum, the absence of an IP address — is unwalked in consequence.

### W3R1-m1 · minor · a cold Studio hub asserts "Nothing needs a decision"

`06-awaiting-your-call.png` / `07-studio-hub-awaiting.png` (11:05) against
`08-studio-tab.png` (11:06) and `09-hub-from-today-empty.png` (11:07).

On the first entry into the hub — pushed from Today's "See all that needs you" — the summary
line already read "Nine things need your eye" while the buckets beneath it read
**"Awaiting you, zero things awaiting you" / "Nothing needs a decision."** and
**"In progress, zero categories" / "No active projects yet."**, with nine open approvals and one
active project in the database. It corrected to "nine" / "Seven approvals are waiting on you" on
the next entry and never returned, so this is the pre-fetch frame, not `W2R3-n1` reopening.

It is still a sentence that is false rather than a screen that is quiet: the summary and the
bucket disagree inside one frame, and the empty state a homeowner reads first says her
designer is waiting on nothing. Prefer holding the bucket's line until the projection lands.

### W3R1-n1 · nit · `set_decision_snooze` accepts a snooze on a past-due approval

The screen refuses to offer it and `snoozeApproval` refuses the write, and
`decision-notify.ts:199` makes the overdue notice bypass every hold, so nothing escapes. But the
RPC itself will happily write the row (proved above, rolled back), which means the refusal lives
in two client-side places and one downstream reader rather than at the write. If a future
surface calls the RPC directly, the row exists and reads as a promise the product never made.

### W3R1-n2 · nit · an option choice's settled mark says APPROVED

`14-after-hold-chosen.png`. After the hold, the Dining-chairs screen draws the **APPROVED**
stamp over "You've responded to this decision", with "Your choice" on the chosen plate. The
vocabulary ruling reserves APPROVED / RETURNED / HELD for the outcome of an *approval*;
"Decision" is the word for an option choice between named alternatives, and what she did was
choose Shaker Oak, not approve it. The plate already says "Your choice", so the stamp is the
only place the wrong register shows. Cosmetic, and arguably covered by the Wave-2 ruling that
"an acceptance is an approval" — recorded for the ear that rules the words, not filed as a bug.

### W3R1-n3 · nit · the iose lane log describes a removal the build no longer has

`iose-notes.md` §P-30 carries a paragraph headed "One deliberate removal, flagged for the
reviewer" arguing that an option choice can no longer be e-signed. `d2e6eefb7`
("feat(ios): a choice can be signed again…") restored it, and the shipped build draws
"Sign it, if you'd like" with an optional full-legal-name field on both the two-option and the
three-option spread. The reasoning paragraph should be struck or amended before the wave report
travels, or the next reader will hold a decision the wave already reversed.

## Noted, not filed

- **The haptic could not be observed** — the simulator has no Taptic Engine and emits no log for
  `UISelectionFeedbackGenerator`. Unverified, by the harness's limit.
- **Reduce Motion could not be observed** — see §1. Unverified, by the harness's limit.
- **The seal moment's Keep a copy** was unreachable (the signable proposal cannot be linked to
  the project; `project proposal provenance is immutable after activation`). It mounts the same
  component as the two surfaces that failed.
- **The bell feed lagged one load** after my approve — the settled sentence for `51c48d1c` was
  not yet in the feed at 11:31 while the peer's rows from 15m earlier were. `W1R3-m1`'s known
  shape; not re-measured, because a second walker was writing to the same feed.

## Housekeeping

- Local stack was **not** reset. My mutations, all local: two Stage-2 approvals minted through
  the lifecycle RPCs (`walk-w3-r1:*`), one three-option choice inserted
  (`b0000000-…-0000000d3c01` + three options), G6's `created_at`/`sent_at` backdated to Aug 24
  in replica mode, the two answers the app itself recorded (`…d2c02` and `51c48d1c`), one
  `decision_snoozes` row, and two `notification_preferences.reminder_cadence` writes. One
  attempted `projects.proposal_id` update was refused by the guard and left no change.
- Content size was set to `accessibility-extra-large` and restored to `medium`;
  `ReduceMotionEnabled` was set true and then false.
- Blitz taps on this device stay intermittently swallowed — the Welcome screen and two list rows
  needed a second tap. No assertion rests on an unverified tap. Two mistaps landed on the tab
  bar (the "Awaiting your call" list's last row sits under it until the list is scrolled).
- Simulator shut down at the end; not deleted. No product code was written.
