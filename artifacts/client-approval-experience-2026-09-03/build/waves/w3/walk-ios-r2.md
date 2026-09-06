# Wave 3 simulator walk — round 2 ("The Decision, Delivered": the habit)

- **Worktree** `git -C … rev-parse --show-toplevel` →
  `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w3-integration`,
  branch `approvals/w3-integration`, HEAD at walk start **`da8f6811b`**
  ("docs(approvals): the Wave 3 round-1 walk fixes and their gates", docs only). The two code
  commits under it are `e3b4d6a71` (web) and **`ada19ee8f`** — the round-1 iOS fixes for
  `W3R1-B1`, `M1` and `M2`. The web walker landed `3d3602d41` ("the Wave 3 web walk, round 2",
  docs only) on the branch while this walk was running; no Swift file moved, so the build under
  test is unchanged.
- **App** `…/apps/mobile/Patina/.build/DerivedDataWalk/Build/Products/Debug-iphonesimulator/Patina.app`,
  `Patina.debug.dylib` stamped **2026-09-05 23:51**, sources `RecordSheet.swift` 23:41 and
  `DecisionDetailView.swift` 23:43 (the fix commit was written at 23:52, after the build of the
  same working tree). The B1 fix is proven in the bundle:
  `nm -a Patina.debug.dylib | grep -c renderAnchor` → **26**.
- **Simulator** `29E64516-9C2F-4D77-95D8-55D7B61E017B` (`cae-w1-walk`), Simulator.app in front,
  `defaults write cloud.patina.app DeploymentTarget local`, `simctl install`, launched
  `-DeploymentTarget local`.
- **HID preflight** — first tap this round LANDED (unlike every prior walk): "See all that needs
  you" on Today pushed the Studio hub, asserted in the AX tree mid-transition. Every assertion
  below was re-taken after its effect was visible; a swallowed tap is called out where it happened.
- **Stack** local (`127.0.0.1:54322`). Ledger `00573, 00572, 00571, 00569, 00568, 00567, 00566,
  00565`; `to_regclass('public.decision_snoozes')` and `to_regproc('public.set_decision_snooze')`
  both resolve. **Nothing was reset.**
- **Shots** `walk-shots-r2/` (39 files).
- Homeowner **`client@patina.dev`**, uid `a0000000-…-005` (session persisted from round 1 — no
  sign-in was needed); project **Aspen Loft Refresh**; designer **Leah Hartwell**.

## Seed, verified by SELECT before the walk

| what the brief asks for | row | state at walk start |
|---|---|---|
| option choice, two options | `b0000000-…-0d2c03` "Rug color - Natural vs Sand" | pending, 2 options, Natural recommended |
| option choice, two options (long titles) | `b0000000-…-0d2c02` "Dining chairs - Shaker Oak vs Windsor Elm" | answered by round 1 — **restored to `pending`** (see Housekeeping) |
| option choice, three options | `b0000000-…-0d3c01` "Entry sconce - three finishes" | pending, 3 options, Antique Brass recommended |
| published Stage-2 approval, open | `1ee658bb-…` "Walk R1 - Pantry shelving depth" (Edition 901, due Sep 17); `aee67ead-…` Edition 904 (due Sep 18) | pending, `sent_at` set |
| published Stage-2 approval, past due | `f5e6c6ad-…` (G6, Edition 902, due Aug 31) | pending, asked Aug 24 |
| settled approval | `104e94dc-…` (G3); `51c48d1c-…` (round 1's, APPROVED / `electronic_signature` / "Margaret Whitfield") | responded |
| signed proposal | `b0000000-…-0cd003` "Aspen Loft — Paintwork and plaster" | `accepted`, `signed_by_name = Client User`, Aug 6 |

## Round-1 findings, re-verified

| id | severity (r1) | verdict this round |
|---|---|---|
| `W3R1-B1` | blocker | **FIXED** — §2 |
| `W3R1-M1` | major | **FIXED** — §1 |
| `W3R1-M2` | major | **FIXED** — §1 |
| `W3R1-m1` | minor | **REPRODUCES, and worse than r1 described** — §4 |
| `W3R1-n1` | nit | **REPRODUCES** (unfixed by design) — §3 |
| `W3R1-n2` | nit | **REPRODUCES** (a ruling, not a bug) — §1 |
| `W3R1-n3` | nit | **REPRODUCES** — `iose-notes.md:48-58` still carries "One deliberate removal" |

---

## 1 · The spread (P-30)

### `W3R1-M2` — FIXED. The paged plate fits the page.

`05-three-option-spread.png`, `06-three-option-leaning.png`, `07-three-option-page2.png`.

The three-option plate's AX frame is now **`{{24, 239.33}, {354, 121.67}}`** on a 402 pt screen —
left edge 24, right edge 378, entirely inside the viewport. Round 1 measured
`{{24, 244}, {402, 101.67}}`, i.e. 24 pt off the right edge. Consequences all closed:

- The `Recommended` capsule draws whole on page one.
- **The leaning dot is visible.** Tapping Antique Brass drew the filled clay dot at the plate's
  bottom-right, inside the card (`06`) — round 1 could only see its left sliver at the screen edge.
- Page two behaves the same (`07`): "Blackened Steel" whole, the dot rule advanced to its second
  position, the previous plate's clay rule peeking at the left edge as a paged spread should.

The fix is `safeAreaPadding(.horizontal, 24)` on the scroll view
(`DecisionDetailView.swift:563`), which `containerRelativeFrame` respects.

### `W3R1-M1` — FIXED. The plate says its own name.

`09-two-plate-spread.png`, `14-shaker-oak-plate.png`, `15-axxl-two-options.png`.

On the exact round-1 case — **Dining chairs, "Shaker Oak" recommended, two compact plates** —
the title now draws **whole**: "Shaker Oak" / "Lighter, more casual." / `Recommended` on its own
line beneath / "$680" (`14`). Round 1 drew "Shak…". "Windsor Elm" is unchanged and whole. Both
plates measure `171 × …`, identical frames — equal weight survives the fix. The Rug spread shows
the same shape ("Natural" + capsule below, "Sand" plain; both `171 × 133.67`).

At an accessibility size the capsule returns to the title's line, which is where the source says
it reads best and where there is room: `15` draws "Shaker / Oak" wrapped at the word with
`Recommended` beside it, one stacked full-width plate (`{{24, 607.33}, {354, 286.33}}`).

### The tap is a leaning, not an answer — PASS

`06`, `10-two-plate-leaning-natural.png`, `11-released-tap-no-submit.png`,
`12-two-plate-after-hold.png`.

- The line above the plates reads **"Tap one to sit with it. Nothing is sent until you hold the
  act."**
- Tapping a plate draws the clay rule + the filled clay dot and raises the act
  **"I choose Natural · PRESS AND HOLD"**. Immediately after the tap:

  ```
  id …0d2c03 | pending | responded_at (null) | selected = 0
  id …0d3c01 | pending | responded_at (null) | selected = 0
  ```

- **A released press does not submit.** A 0.1 s tap on the act left `…0d2c03` `pending`, `sel = 0`.
- **The hold does, first time.** One 1.8 s press:

  ```
  status    | responded_at                   | client_consent_method | client_signature
  responded | 2026-09-06 05:00:22.429769+00  | click_through         | (null)
  Natural = t   Sand = f
  ```

  `click_through` with no name — the token the mid-Wave-2 ruling reserves for an act with no name
  on it.
- **The deferral pair is not the lesser offer**: `decisionDetail.defer.notYet` (45 × 44) and
  `decisionDetail.defer.neitherOfThese` (100 × 44) sit side by side beneath the act, body face,
  same height as the act's own label.
- **The signature is optional and inline** on both the two- and three-option spread: "Sign it, if
  you'd like / Optional. Type your full legal name and your choice is recorded as signed; leave it
  empty and it is recorded as confirmed in Patina." (`06`, `10`). This is `d2e6eefb7`'s round-1
  restoration — and the reason `W3R1-n3` still stands.

### Accessibility-extra-large — PASS

`xcrun simctl ui <udid> content_size accessibility-extra-large`, read back as
`accessibility-extra-large`; restored to `medium` afterwards.

- Two options (`15`) → one **stacked** full-width plate (354 pt), title wrapped at the word,
  capsule whole.
- Three options (`16-axxl-three-options.png`) → stacked, plate `{{24.17, 434.33}, {354.33, 356.67}}`,
  no overhang. `DecisionSpread.layout`'s ".stacked at every count above .accessibility1" is what
  the screen does.

### Reduce Motion — NOT OBSERVABLE with this harness (unchanged from round 1)

`38-reducemotion-leaning.png`. `ReduceMotionEnabled` written on the device and the app relaunched;
at `delay: 0` after the tap the act was already at its final geometry, exactly as it is with
Reduce Motion off. The harness's own round trip (≈700 ms for `simctl io screenshot`, ≈300 ms for a
Blitz describe) is longer than the transition, and **`ffmpeg` is still not installed** to cut
frames out of `simctl io recordVideo`. Reported as neither a pass nor a defect.
`DecisionSpreadTests` covers "Reduce Motion takes the still arrival" at the unit level.
The **haptic** is unobservable for the same class of reason (no Taptic Engine in the simulator,
no log for `UISelectionFeedbackGenerator`).

### `W3R1-n2` reproduces — a settled option choice is stamped APPROVED

`12-two-plate-after-hold.png`: after the hold the Rug screen draws the **APPROVED** stamp over
"You've responded to this decision", with "Your choice" on the chosen plate. Unchanged; recorded
again for the ear that rules the words, not filed as a bug.

---

## 2 · Keep a copy (P-26, iOS half) — `W3R1-B1` FIXED, and now fully walked

`17-settled-approval-keepacopy.png`, `18-share-sheet-preview.png`, `19-record-preview.png`,
`22-signed-proposal-keepacopy.png`, `23-proposal-share-sheet.png`,
`24-proposal-record-preview.png`, `36-approved-settled.png`, `37-record-witnessed-preview.png`.

`record.keepACopy` is now in the accessibility tree on **every** settled record I could reach —
the two rails the brief names, and a third:

1. **A settled Stage-2 approval from an earlier session** (`51c48d1c`) — `17`, act at
   `{{24, 450}, {77, 44}}`.
2. **The signed proposal** (`…0cd003`) — `22`, act at `{{24, 272}, {77, 44}}`.
3. **The approval I answered in this session** (`aee67ead`, Edition 904) — `36`.

Pressing it opens the share sheet **with the paper already in it** (`18`, `23`): a rendered
thumbnail plus the record's own title. The `.task` now hangs off `renderAnchor` — a zero-height
`Color.clear` that always exists — instead of a `Group` that was an `EmptyView` until the image
arrived.

### The paper itself

Opened at full size through Quick Look (`19`, `24`, `37`). The **witnessing visit** (`37`,
Edition 904, answered 30 seconds earlier) carries every clause the brief asks for:

```
RECORD OF DECISION
Leah Hartwell
──────────────────────────────
Issue 04 – Library elevations, Rev B
Edition 904

[APPROVED]  You approved the plan set.

SIGNED
Margaret Whitfield
──────────────
September 6, 2026
Signed by typing your full legal name.

REFERENCE
c4c4c4c4c4c4
```

- **The stamp is upright** and drawn square to the page, outline only.
- **Pixel probe** of that mark: interior **RGB(250,247,242)** = the page ground → **no fill**;
  ink **RGB(105–117, 89–101, 75–89)** — warm brown, no sage, no terracotta, no shadow.
- **The consent sentence** is there: "Signed by typing your full legal name."
- **Twelve characters, and exactly twelve.** `project_approval_artifacts.artifact_hash` for that
  decision is `c4c4…c4` at **length 64**; the paper prints the first **12**. R6 satisfied at both
  ends.
- **No IP address**, and none is reachable — `client_decisions` has no address column and
  `printedLines` is the whole of what is drawn.

Two shapes that are **deliberate, not defects** (both documented at
`RecordOfDecision.swift:24-27, 78-90` and confirmed on screen):

- **A return visit prints no name and no consent sentence.** `19` (the same rail, `51c48d1c`,
  read back a session later) carries the masthead, the title, edition 901, the upright APPROVED
  mark, "You approved the plan set.", "September 5, 2026" and `REFERENCE b1b1b1b1b1b1` — and
  nothing where the signature block would be. The projection a settled approval is read back
  through carries no signature name, and the source refuses to infer one from the outcome
  ("inferring 'she must have signed' from APPROVED would print a legal claim the app did not
  witness"). So the brief's "consent sentence" clause is only walkable on the answering visit —
  which is where I walked it.
- **A signed proposal carries no reference line.** `24` prints masthead / title / "Edition 1 ·
  Issued Aug 2, 2026" / upright SIGNED / "You signed this proposal." / SIGNED · Client User /
  "August 6, 2026" / "Signed by typing your full legal name." — and no checksum, because a
  proposal has no artifact hash and the source will not invent one.

One cosmetic asymmetry, filed below as `W3R2-n1`: the approval record's masthead names the studio
("Leah Hartwell"); the proposal record's masthead is bare.

The **seal moment** (`SealMomentView`) remains unreachable for the same reason round 1 recorded —
the one signable legacy proposal cannot be linked to the project
(`project proposal provenance is immutable after activation`). It mounts the identical component,
which is now proven working on two other mounts.

---

## 3 · The pace (P-28, iOS half)

### The three cadences, in words — PASS, and they write and persist

`26-settings-reminders.png`, `27-cadence-three-words.png`, `28-cadence-once-a-day.png`,
`29-cadence-right-away.png`, `30-cadence-after-relaunch.png`.

The Reminders row under PREFERENCES is a pop-up whose options are exactly
**"Tell me right away" · "Once a day" · "Once a week, on Sunday"** — three words, no enum, no
figure. Beneath it the floor, verbatim: *"Patina never mails about an approval before 8am, and
your phone only buzzes between 8am and 8pm — your own clock. Anything later waits for the
morning."*

```
screen read on arrival     "Once a week, on Sunday"   (row held weekly_sunday)
choose "Once a day"     → reminder_cadence = daily       @ 2026-09-06 05:12:43.068Z
choose "Tell me right away" → reminder_cadence = right_away @ 2026-09-06 05:13:11.277Z
```

All three values therefore observed in the column. **It survives a cold start**: terminate +
relaunch, reopen Settings → "Tell me right away" (`30`).

### The snooze on an open approval — PASS on every clause

`31-open-approval-detail.png`, `32-remind-me-four-words.png`, `33-snoozed-tomorrow-morning.png`.

- The block reads **"Remind me"** over *"Still yours to answer; only the reminders wait."*
- The menu carries exactly the four words: **"Tomorrow morning" · "Sunday" · "When it's due" ·
  "Don't remind me — I'll come back"**.
- Choosing "Tomorrow morning" on `1ee658bb` (open, due Sep 17):

  ```
  kind             | snoozed_until           | at America/Chicago  | created_at
  tomorrow_morning | 2026-09-07 13:00:00+00  | 2026-09-07 08:00    | 2026-09-06 05:16:37Z
  now() at America/Chicago = 2026-09-06 00:16
  ```

  **8am local, on the calendar day after the choice.** See `W3R2-n2` — at 00:16 that is 32 hours
  out, not the 8am seven hours away; the RPC deliberately uses "tomorrow", not
  `next_local_morning`.
- The answer is in Patina's voice and refuses to over-promise: *"I'll hold the reminders until
  tomorrow morning. If the date passes or a new edition arrives, I'll still say so."* — R16's two
  carve-outs said out loud.

### The past-due approval offers no snooze, and says why — PASS

`34-pastdue-no-snooze.png` (G6, Edition 902, due Aug 31).

`scan_ui` for "Remind me" over the whole screen returns **no match** — only Back, the three
outcomes and Discuss. In its place: *"This one is past its date. The reminders stay until it's
answered."* The three deltas stand above it, stated independently — COST +$975 / SCHEDULE +11 days
/ LEAD TIME +21 days — in body ink, no red.

### `W3R1-n1` reproduces — the RPC still accepts a snooze on a past-due approval

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-…-005","role":"authenticated"}';
select public.set_decision_snooze('f5e6c6ad-…','tomorrow_morning');
-- {"kind":"tomorrow_morning","snoozedUntil":"2026-09-07T13:00:00+00:00", …}
rollback;
```

Source confirms it: `00572_she_sets_the_pace.sql:439-442`, the `tomorrow_morning` branch, has no
`due_date` guard. Nothing escapes today — the screen does not offer the act, the client refuses
the write, and `supabase/functions/_shared/decision-notify.ts:199` returns `null` for
`decision_overdue` before any hold is consulted — so the rule still lives at the read and not at
the write.

---

## 4 · Regression spot-checks

- **A Stage-2 approve with hold + typed name succeeds first time — PASS.**
  `35-approve-signature-rule.png`, `36-approved-settled.png`. Choosing Approve raised the
  signature rule and **only** then: `YOUR NAME` / `SEPTEMBER 6, 2026` / "Your typed name acts as
  your electronic signature.", with `decisionDetail.approval.submit` reporting `enabled: false`
  until the name was on it, and "Choose another outcome" beneath. One 1.9 s hold:

  ```
  status    | answer   | client_consent_method | client_signature   | responded_at
  responded | approved | electronic_signature  | Margaret Whitfield | 2026-09-06 05:20:07.470Z
  ```

- **Stamps mocha, no fill — PASS.** Pixel probe of the APPROVED mark on `36`: interior
  **RGB(250,247,242)** = the card ground (no fill), word **RGB(92,74,60)** (#5C4A3C, mocha), rule
  **RGB(111,95,82)**. The SIGNED mark on the proposal (`22`) is the same outline family. No sage,
  no green, no terracotta, no shadow.
- **No numbers, no badges — PASS.** Every count a homeowner reads is a word: the Studio hub says
  "Eight things need your eye" / "Awaiting you … **eight**" / "Decisions — **Six** approvals are
  waiting on you" / "In progress … **one**" / "Conversation … **two**" / "Money & documents …
  **five**" / "Archive … **zero**", and inside it "**Eight** unread updates", "**Five** shared
  proposals / **Four** accepted", "**Two** shared invoices / **One** paid", "**Three** shared
  files" (`04`, `08`, `13`, `21`). The bell's AX value is "Unread notifications" — a clay dot,
  never a figure. No `.badge(` on any tab in the tab bar's tree on any screen walked.
  P-24's residue ("ACCEPTED (3)"-style eyebrows) is gone from these surfaces.
- **Bell titles — PASS.** Open rows read "An approval needs you" / "A decision needs you" with the
  row's own title beneath; settled rows read the recorded sentence — "You approved this edition.",
  "You returned this edition for revision.", "This approval is closed" — each over "Your answer is
  on the record." No "sign-off" survives.
- **The why and its author — PASS, carried.** `35`: "The bookcase lost a bay, so the run is
  shorter." with "— Leah Hartwell" beneath, then "Edition 904 · Due Sep 18, 2026" and "You are
  approving edition 904, exactly as shown."
- **Kind chips — PASS, carried.** The awaiting list draws `Approval` on the Stage-2 rows and
  `Color` / `Product` / `Material` on the choices.
- **The retired words — PASS.** No "overdue", "gate", "task" or "dashboard" in any string a
  homeowner reads. The past-due row says "Still open, Leah asked on Aug 24." on Today and "This
  response is past due." on the approval, both in body ink.

### `W3R1-m1` reproduces — and it is not the pre-fetch frame round 1 took it for

`01-hub-cold-frame.png` (t+0.26 s), `02-hub-settled.png` (t+2 s), `03-hub-after-6s.png` (t+9 s),
`04-hub-reentered-eight.png`.

On the **first** entry into the Studio hub after a cold launch, pushed from Today's "See all that
needs you", the summary line read **"Studio summary: Eight things need your eye"** while every
bucket beneath it read zero:

```
Awaiting you, zero things awaiting you      /  "Awaiting you. Nothing needs a decision."
In progress, zero categories                /  "No active projects yet."
Conversation, zero categories               /  "No project conversations yet."
Money & documents, zero categories          /  "No shared records yet."
```

with eight open approvals and an active project in the database. Round 1 recorded this correcting
"on the next entry"; **it did not correct on this screen at all** — it still read zero at
**t+9 s** (`03`), and only came right after I left the hub and came back (`04`,
"Awaiting you, **eight** things awaiting you"). So this is not a frame, it is a screen: a
homeowner who lands on the hub and reads it is told, for as long as she stays, that her designer
is waiting on nothing while the line above her says eight things need her eye. Severity raised
from round 1's minor to **major** on that evidence.

---

## Findings

### `W3R2-M1` · major · the cold Studio hub says "Nothing needs a decision" and does not correct

`01-hub-cold-frame.png`, `02-hub-settled.png`, `03-hub-after-6s.png` against
`04-hub-reentered-eight.png`, `08-hub-second-entry.png`.
`apps/mobile/Patina/Patina/Features/Studio/Views/StudioHubView.swift`.

`W3R1-m1` re-observed and re-measured. The summary and the buckets disagree inside one screen —
"Eight things need your eye" over "Awaiting you, zero things awaiting you / Nothing needs a
decision." — and the disagreement **persists** (9 s and counting), clearing only when the screen
is left and re-entered. Round 1 measured it at 1–2 minutes' granularity and read it as a
pre-fetch flash; at 0.26 s / 2 s / 9 s it is a stuck empty state on first mount.

Fix, unchanged in shape from round 1: hold the bucket's empty-state sentence until the projection
resolves (render nothing, or the summary alone) rather than asserting zero from an unloaded
snapshot — and find why the first mount never re-renders when the projection lands.

### `W3R2-n1` · nit · the proposal keepsake's masthead has no studio; the approval's does

`37-record-witnessed-preview.png` (masthead "RECORD OF DECISION" / **"Leah Hartwell"**) against
`24-proposal-record-preview.png` (masthead "RECORD OF DECISION" and a rule, nothing between).
`RecordOfDecision.studio` is documented as "Nil where the app holds no studio name — never a
person's name standing in for one (`W2R1-m2`)", so the proposal rail is drawing the rule it was
given. Two pieces of the same paper nonetheless carry different letterheads on the same phone in
the same session. Whether the proposal rail can resolve a studio name is a source question, not a
walk one.

### `W3R2-n2` · nit · "Tomorrow morning" chosen after midnight holds the reminders ~32 hours

`33-snoozed-tomorrow-morning.png`; `00572_she_sets_the_pace.sql:439-442`.

At **00:16 local** on Sep 6 the act wrote `snoozed_until = 2026-09-07 08:00` local — the calendar
day after, not the 8am seven hours away. The RPC computes `date_trunc('day', now) + 1 day + 8h`
for `tomorrow_morning`, deliberately declining the `next_local_morning` helper it uses for
`when_due` and the push window. Round 1 chose the same act at 23:17 and got the 8am 9 hours
later, so this only shows after midnight.

It matches its own label — Sep 7 *is* tomorrow morning — and R16's "no dark defaults on cadence"
cuts toward the quieter reading. But a homeowner awake at 00:16 who asks to be reminded "tomorrow
morning" is plausibly asking for the morning she is about to see. Recorded as a ruling for the ear
that rules the words, not filed as a bug; if it is ruled the other way, `next_local_morning` is
already in the migration and is a one-line swap.

### Carried, unchanged from round 1

- **`W3R1-n1`** · nit · `set_decision_snooze` accepts a snooze on a past-due approval. Re-proved
  live (rolled back) and in source. Nothing escapes; the refusal still lives at two clients and
  one downstream reader rather than at the write.
- **`W3R1-n2`** · nit · a settled option choice is stamped APPROVED (`12`). A ruling, not a code
  decision.
- **`W3R1-n3`** · nit · `iose-notes.md:48-58` still argues that "an option choice can no longer be
  e-signed", which `d2e6eefb7` reversed and which `06` and `10` disprove on screen.
  Strike or amend before the wave report travels.

## Noted, not filed

- **The haptic and the Reduce-Motion cross-fade are unverified** — by the harness's limit, not by
  the build's behaviour. Neither is reported as passing.
- **The bell feed lags one load** after an answer: at 05:17 the top row was still round 1's
  "You approved this edition. … 48m ago" and the Rug answer from 05:00 had not appeared.
  `W1R3-m1`'s known shape; not re-filed.
- **The Studio hub's "Six approvals are waiting on you"** did not move after I restored Dining
  chairs to `pending` by SQL (it should have read seven). A projection cache reacting to a write
  the app never saw — an artefact of my own repair, not a homeowner path; not filed.

## Housekeeping

Local stack was **not** reset. My mutations, all local, all on `127.0.0.1:54322`:

| what | when (UTC) |
|---|---|
| `…0d2c03` (Rug color) answered through the app — `responded / click_through`, Natural selected | 05:00:22 |
| `…0d2c02` (Dining chairs) **restored to its seed `pending` state** by SQL (round 1 had answered it; I needed the "Shaker Oak" title case that `W3R1-M1` was raised on) | 05:02:13 |
| `notification_preferences.reminder_cadence` → `daily`, then `right_away`, through Settings | 05:12:43, 05:13:11 |
| `decision_snoozes` row on `1ee658bb` — `tomorrow_morning`, through the app | 05:16:37 |
| `aee67ead` (Edition 904) answered through the app — `approved / electronic_signature / Margaret Whitfield` | 05:20:07 |
| one `set_decision_snooze` probe on G6, **rolled back** | 05:19 |
| device: `content_size` set to `accessibility-extra-large` and restored to `medium`; `ReduceMotionEnabled` set true and restored to false | — |

**One side effect worth recording.** The SQL restore of `…0d2c02` fired the notify path: a
`decision_attention` row appeared at 05:02:16 and `notification_preferences.reminder_cadence` was
rewritten to `weekly_sunday` at 05:02:13 (the column default is `daily`, so something in that path
derived it — plausibly from `digest_frequency = 'weekly'`). It is reachable only by moving a
`responded` decision back to `pending`, which no product path does; I mention it so the next reader
does not mistake it for a second walker. I also checked for a concurrent walker (round 1 had one):
no row anywhere moved during a 7-minute idle window, and every write above lines up with an action
of mine to the second.

The simulator was shut down at the end of the walk.

## Verdict

**No blocker and no major from the round-1 list survives** — `W3R1-B1`, `M1` and `M2` are all
fixed and their consequences walked through to the paper. One finding is raised **to** major:
`W3R2-M1`, the cold Studio hub, which round 1 under-measured. Everything the brief asked to see
on the spread, the keepsake and the pace passed, with two clauses (haptic, Reduce Motion) beyond
what this harness can witness.
