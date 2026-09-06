# Wave 3 simulator walk — round 3, targeted ("The Decision, Delivered": the habit)

- **Worktree** `git -C … rev-parse --show-toplevel` →
  `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w3-integration`,
  branch `approvals/w3-integration`, HEAD at walk start **`7dc3686cc`**
  ("docs(approvals): the Wave 3 final fixes and their gates", docs only). The six code commits
  under it are the final fix round: `e5e194d5d` (`W3R2-M1`), `7e6452828` (`W3R1-n2`),
  `5a5dc17a6` (`W3R2-n1`), `a2304d219` (`W3R1-n1`, `W3R2-n2`), plus the three client-portal
  commits. **No product code was written this round.**
- **App** `…/apps/mobile/Patina/.build/DerivedDataWalk/Build/Products/Debug-iphonesimulator/Patina.app`,
  `Patina.debug.dylib` stamped **2026-09-06 01:13**, i.e. after the last iOS code commit
  (`a2304d219`, 01:01:33). The fixes are provable in the bundle:
  `strings Frameworks/PatinaDesignKit.framework/PatinaDesignKit | grep -E '^(APPROVED|CHOSEN|RETURNED|HELD|SIGNED)$'`
  → all five, **CHOSEN included**; `strings Patina.debug.dylib | grep -cF 'Nothing needs your answer'`
  → **2**; `… -cF 'past its date'` → **4**.
- **Simulator** `29E64516-9C2F-4D77-95D8-55D7B61E017B` (`cae-w1-walk`), Simulator.app in front,
  `defaults write cloud.patina.app DeploymentTarget local`, `simctl install`, launched
  `-DeploymentTarget local`. Shut down at the end.
- **HID preflight** — the first tap on "Have a password? Sign in" was swallowed (the known shape);
  the second landed and the sign-in sheet mounted (`auth.form.emailField` in the AX tree). Every
  assertion below was re-taken after its effect was visible.
- **Stack** local (`127.0.0.1:54322`). The fix agent reset it (both 00572 and 00573 were edited in
  place — see `stack-reset-notice.md`), so the stack was **re-seeded by me** before the walk and
  every fixture verified by SELECT. Ledger read at walk start: `00573, 00572, 00571, 00569, 00568,
  00567, 00566, 00565`. `pg_get_functiondef('public.set_decision_snooze(uuid,text)')` carries both
  new clauses — `RAISE EXCEPTION 'decision_past_due'` and `public.next_local_morning(...)` in the
  `tomorrow_morning` branch.
- **Shots** `walk-shots-r3/` (40 files).
- Homeowner **`client@patina.dev` / `password123`**, uid `a0000000-…-005`, "Client User"; project
  **Aspen Loft Refresh** `b0000000-…-00d1`; designer **Leah Hartwell** `…-004`. Second homeowner
  **`client-solo@patina.dev`** ("Nora Ellison", uid `…-c005`, project *Cedar Lane Study*) for the
  truly-empty case.

## ⚠ A second walker was on this stack again

As in round 1. Rows I did not create appeared under me and rows I did not touch moved:

| what the peer did | evidence |
|---|---|
| re-ran `workflow-gate-fixture.sql` at **06:20:21Z**, wiping my G-rows and re-minting them under new ids | my run's `overdue` was `8db1a9f9`; one minute later the only `Fixture G6` row was `3351d8a6`, `updated_at 06:20:21.152299` |
| re-ran `web-walk/seed-w3.sql` at **06:20:23Z** | the Edition 903/904 pair came back as `61924513` / `6e29e2b8` |
| minted **`644b3058` "Walk W3 - Hall lantern, Edition 905"** at **06:21:23Z** — a row no script of mine writes, context "The fifth ask, kept open for the walk's own answer." | `client_decisions.created_at`; it appeared in the app's awaiting list at 01:36 |
| wrote a `decision_snoozes` row `kind='never', snoozed_until='infinity'` on `6e29e2b8` at **06:31:20Z** | I had made no snooze; my own psql snooze probes all ran later and were rolled back |
| answered **G2** `changes_requested` at **06:34:19Z** and **905** `approved` at **06:35:22Z** | `client_decisions.responded_at`, while my app was on the awaiting list / Ed 904 |

**Every finding below therefore rests on a screen I drove myself, or on a row I wrote through the
app and read back by SELECT within seconds of my own action.** The stray `never` snooze was deleted
before the snooze walk so the block was read fresh (§4).

## Seed, verified by SELECT before the walk

| what the brief asks for | row | state at walk start |
|---|---|---|
| option choice, two options | `b0000000-…-0d2c03` "Rug color - Natural vs Sand" | pending, 2 options, Natural recommended |
| option choice, two options, long title | `b0000000-…-0d2c02` "Dining chairs - Shaker Oak vs Windsor Elm" | pending, Shaker Oak recommended |
| option choice, three options | `b0000000-…-0d3c01` "Entry sconce - three finishes" | pending, 3 options, Antique Brass recommended — seeded by `web-walk/seed-w3-r3-sconce.sql` (written this round, modelled on the repo seed's own two-option rows) |
| published Stage-2 approval, open, with a why | `6e29e2b8-…` "Walk W3 - Library elevations, Edition 904" | pending, due Sep 19, why + `whyAuthorName` |
| published Stage-2 approval, past due | `3351d8a6-…` (Fixture G6, Edition 902, due Sep 1) | pending; `created_at`/`sent_at` backdated to **Aug 24** in replica mode so the asked-on clause is earned |
| settled approval, approved with a name | `61924513-…` (Edition 903) | responded / `electronic_signature` / "Client User" |
| settled approval, returned with a note | `be7f9461-…` (Fixture G8) | responded / `changes_requested`, note on the row |
| signed proposal | `b0000000-…-0cd003` "Aspen Loft — Paintwork and plaster" | `accepted`, `signed_by_name = Client User`, Aug 7 |

Pending decisions for the homeowner at walk start: **8** (`select count(*) … status='pending'`).

---

## 1 · Studio hub, cold entry (verify 1)

### No false empty state — PASS

`02-hub-cold-t0.png` (t+0.3 s), `03-hub-cold-t2.png`, `04-hub-cold-t9.png`, `05-hub-cold-t35.png`.

Cold launch (`simctl terminate` + `launch`), Today, then **"See all that needs you"**. At every
sampled instant the Studio block draws **"Gathering your Studio…"** with a spinner. Round 2's
reading — "Awaiting you, zero things awaiting you / Nothing needs a decision." under a header
saying eight things need her eye — is **gone**. `e5e194d5d`'s `!hasLoaded` branch does what it
claims: the hub asserts nothing it cannot prove.

### The count matches Today — PASS, on the surface where the hub loads

`09-hub-via-studio-tab.png`.

Reached through the **Studio tab**, the hub answers at once:

```
Studio summary: Eleven things need your eye        (header hint, same source Today reads)
Awaiting you, eleven things awaiting you           (StudioHub.Section.awaitingYou)
Decisions, Eight approvals are waiting on you, Still open, Leah asked on Aug 24.
Invoice, $4,250.00 remaining, Due Sep 11
```

and the database agrees: `count(*) … status='pending'` for this homeowner = **8**. Eleven is the
whole attention set (eight decisions + invoice + proposal + …), and it is the same word the header
prints, so the two halves of one screen no longer disagree.

### The truly-empty copy — PASS

`39-solo-hub-empty.png`. Signed out, signed in as `client-solo@patina.dev` (Nora Ellison), whose
project carries **zero** decisions. Her one awaiting row is an invoice, so to reach a genuinely
empty section I marked that invoice `paid` by SQL (local, her own row, **reverted afterwards** —
see Housekeeping). The section then reads:

```
Awaiting you                              zero
Nothing needs your answer.
```

The retired sentence "Nothing needs a decision." appears nowhere. `StudioQueueSectionKind`'s new
word is on screen.

### But the hub reached from Today never loads at all — `W3R3-M1`, below

`02`–`05` are not a slow load that arrives. The hub pushed from Today's "See all that needs you"
sat on "Gathering your Studio…" at t+0.3 s, t+2 s, t+9 s, t+35 s, and — after a Back and a second
push — for a further **two minutes** (`06-hub-second-entry.png`, `07-hub-long-wait.png`,
`08-hub-t180.png`). It is a permanent state on that path, not a transition. Filed as a major.

---

## 2 · A settled option choice is stamped CHOSEN (verify 2) — PASS

`10-rug-two-plate-spread.png`, `11-rug-leaning-natural.png`, `12-rug-chosen-stamp.png`.

Walked the whole act on the Rug (two options, Natural recommended):

- Both plates measure **`171 × 133.67`** at `x = 24` and `x = 207` — identical frames, right edge
  378 inside a 402 pt screen.
- The line above them reads "Tap one to sit with it. Nothing is sent until you hold the act."
- Tapping Natural drew the clay rule + the filled clay dot and raised
  **"I choose Natural · PRESS AND HOLD"**, with the optional inline signature above it
  ("Sign it, if you'd like / Optional. Type your full legal name and your choice is recorded as
  signed; leave it empty and it is recorded as confirmed in Patina."). Immediately after the tap:

  ```
  id …0d2c03 | pending | responded_at (null) | selected = 0
  ```

- One 1.9 s press on the act:

  ```
  status    | responded_at                  | client_consent_method | client_signature
  responded | 2026-09-06 06:30:17.237877+00 | click_through         | (null)
  Natural = t   Sand = f
  ```

- The screen then draws the **CHOSEN** stamp over "You've responded to this decision", with
  "Your choice" on the chosen plate. `W3R1-n2` is closed: the word an option choice presses is no
  longer APPROVED.
- **Pixel probe** of that mark (`12`, crop `70,655 → 265,735`): interior **RGB(250,247,242)** — the
  page ground, so **no fill**; word **RGB(92,74,60)** (`#5C4A3C`, mocha); rule **RGB(111,95,82)**.
  No sage, no terracotta, no shadow.

---

## 3 · The proposal keepsake's masthead names the studio (verify 3) — PASS

`29-signed-proposal.png`, `30-proposal-share-sheet.png`, `31-proposal-record-quicklook.png`.

The signed proposal (`…0cd003`) draws the SIGNED mark, "Signed by Client User on Aug 7, 2026" and
**Keep a copy**. Pressing it opens the share sheet with the paper already in it; opened at full
size through Quick Look the record reads:

```
RECORD OF DECISION
Leah Hartwell
──────────────────────────────
Aspen Loft — Paintwork and plaster
Edition 1 · Issued Aug 3, 2026

[SIGNED]  You signed this proposal.

SIGNED
Client User
──────────────
August 7, 2026
Signed by typing your full legal name.
```

`W3R2-n1` is closed — the letterhead is now the same on both keepsakes. The approval record
(`27-record-approval-quicklook.png`) carries the identical masthead. The proposal record still
prints **no REFERENCE line**, which is the documented, deliberate shape (a proposal has no artifact
hash and the source will not invent one).

---

## 4 · The pace (verify 4)

### The snooze is refused server-side on a past-due approval — PASS, on every kind

`17-pastdue-approval.png`. G6 (`3351d8a6`, Edition 902, due Sep 1, asked Aug 24). The screen offers
no "Remind me" block at all — in its place: *"This one is past its date. The reminders stay until
it's answered."* — with the three deltas above it, stated independently (COST +$975 / SCHEDULE
+11 days / LEAD TIME +21 days), body ink, no red.

The refusal now lives at the **write**, not only at the read. As the homeowner, through `psql`:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-…-005","role":"authenticated"}';
select public.set_decision_snooze('3351d8a6-…','tomorrow_morning');
-- ERROR:  decision_past_due
-- CONTEXT:  PL/pgSQL function set_decision_snooze(uuid,text) line 60 at RAISE
rollback;
```

and the same error for **`sunday`**, **`when_due`** and **`never`**. `W3R1-n1` is closed.

### "Tomorrow morning" after midnight is the next 8am — PASS, walked live

`19-remind-me-block.png`, `20-remind-me-fresh.png`, `21-remind-me-four-words.png`,
`22-snoozed-tomorrow-morning.png`.

No device-clock change was needed: the walk itself ran after midnight local. On Ed 904 (open, due
Sep 19) the block reads **"Remind me"** over *"Still yours to answer; only the reminders wait."*,
and the menu carries exactly the four words — **"Tomorrow morning" · "Sunday" · "When it's due" ·
"Don't remind me — I'll come back"**. Choosing "Tomorrow morning" at **01:37 local**:

```
decision_id | kind             | snoozed_until          | at America/Chicago | created_at
6e29e2b8-…  | tomorrow_morning | 2026-09-06 13:00:00+00 | 2026-09-06 08:00   | 2026-09-06 06:37:29Z
now() at America/Chicago = 2026-09-06 01:37:43
```

**08:00 the same morning — 6.4 hours away, not the calendar day after.** Round 2's `W3R2-n2` (at
00:16 the act held the reminders ~32 hours) is closed; the RPC now uses `next_local_morning`. The
same arithmetic reproduced through `psql` on the same row, rolled back.

The said-line is honest about its two carve-outs: *"I'll hold the reminders until tomorrow morning.
If the date passes or a new edition arrives, I'll still say so."*

---

## 5 · Regression spot-checks (verify 5)

- **Keep a copy on all three settled surfaces — PASS.** `record.keepACopy` is in the accessibility
  tree, and opens a share sheet with the rendered paper already in it, on:
  1. the approval **answered in this session** (`6e29e2b8`, `24-approved-settled.png`,
     `25-share-sheet-approval.png`, `27-record-approval-quicklook.png`);
  2. the **signed proposal** (`…0cd003`, `29`–`31`);
  3. a **settled approval read back** — Fixture G8, returned, answered before my session
     (`33-returned-stamp.png`, act at `{{24, 551}, {77, 44}}` after a relaunch).
- **The paper itself — PASS.** The witnessing visit prints masthead / studio / title / Edition 904 /
  upright **APPROVED** (outline) / "You approved the plan set." / SIGNED · Margaret Whitfield /
  "September 6, 2026" / "Signed by typing your full legal name." / `REFERENCE c4c4c4c4c4c4`.
  **Twelve characters, and exactly twelve**: `project_approval_artifacts.artifact_hash` for that
  decision is length **64** and the paper prints the first **12**. R6 satisfied at both ends. No IP
  address anywhere.
- **The two-plate spread fits, and the plate says its own name — PASS.** `13-shaker-oak-two-plate.png`:
  on the exact case `W3R1-M1` was raised on, "**Shaker Oak**" / "Lighter, more casual." /
  `Recommended` on its own line / "$680" all draw whole; "Windsor Elm" unchanged.
- **The three-plate spread fits — PASS.** `14-sconce-three-plate.png`, `15-sconce-leaning.png`,
  `16-sconce-page2.png`. The paged plate's AX frame is **`{{24, 255}, {354, 121.67}}`** on a 402 pt
  screen — right edge 378, entirely inside the viewport (`W3R1-M2` stays closed). Three clay dots
  under it, the resting one filled, no numeral. Tapping Antique Brass drew the clay rule and the
  **leaning dot whole, inside the card**. Swiping advanced to "Blackened Steel" with the dot rule
  moved to its second position and the previous plate's clay rule peeking at the left edge.
- **Approve with typed name + hold — PASS, first time.** `23-approve-signature-rule.png`,
  `24-approved-settled.png`. Choosing Approve raised the rule and **only** then:
  `Approve · Accept this exact edition and its stated impacts.` / `YOUR NAME` /
  `SEPTEMBER 6, 2026` / "Your typed name acts as your electronic signature.", with
  `decisionDetail.approval.submit` reporting **`enabled: false`** until the name was on it, and
  "Choose another outcome" beneath. One 1.9 s hold:

  ```
  status    | answer   | client_consent_method | client_signature   | responded_at
  responded | approved | electronic_signature  | Margaret Whitfield | 2026-09-06 06:38:46.865Z
  ```

- **RETURNED stamp with note — PASS.** `33-returned-stamp.png`. Fixture G8 draws the **RETURNED**
  mark over "You returned this edition for revision.", then `THE DISCUSSION` /
  `YOU · SEP 6, 2026` / "The stair nosing profile is wrong; please take it back to the square
  edge." Also "No cost, schedule or lead-time change." where the deltas are zero.
- **Nothing sage, red or checkmarked — PASS.** Pixel probes: RETURNED interior `(250,247,242)`
  (no fill), rule `(144,115,70)`, word `(44,41,38)`; APPROVED word `(92,74,60)` mocha; SIGNED word
  `(92,74,60)`. A hue sweep over **all 40 shots** (quarter-scale, saturation-gated) found sage-range
  pixels only in the iOS **Keychain "Save Password?"** dialog (`00`, `36`) and red-range pixels only
  in the iOS **share sheet's Reminders app icon** (`25`, `26`, `30`) — system chrome, not Patina.
  No checkmark glyph on any Patina surface walked.
- **No numbers where words will do — PASS on the approval rails.** The hub prints
  "Awaiting you … **eleven**", "**Eight** approvals are waiting on you", "Conversation … **two**",
  "**Ten** unread updates", "Money & documents … **five**", "**Six** shared proposals / **Four**
  accepted", "**Two** shared invoices / **One** paid", "**Three** shared files / **One** project"
  (`09`, `28-hub-scrolled.png`). The bell's AX value is "Unread notifications" — a clay dot, never a
  figure. No `.badge(` on any tab in the tab bar's tree on any screen walked.
- **The retired words — PASS.** No "overdue", "gate", "task" or "dashboard" in any product string a
  homeowner reads. The past-due row says "Still open, Leah asked on Aug 24." on Today and "This
  response is past due." on the approval, both in body ink. (Two on-screen strings **do** contain
  "gate" — "Fixture gate whose response window has lapsed." and "Fixture gate published and pending
  a household response." Both are the **e2e fixture's own seed context**
  (`apps/designer-portal/e2e/helpers/workflow-gate-fixture.sql`), not product copy. Noted so the
  next reader does not file them.)
- **The why and its author — PASS.** `18-open-approval-ed904.png`: "The bookcase lost a bay, so the
  run is shorter." with "— Leah Hartwell" beneath, then "Edition 904 · Due Sep 19, 2026" and "You
  are approving edition 904, exactly as shown."
- **Kind chips — PASS.** The awaiting list draws `Approval` on the Stage-2 rows and
  `Color` / `Product` / `Material` on the choices.
- **Reminders cadence — PASS, carried.** `35-settings-reminders.png`: the Reminders row is a pop-up
  reading "Once a week, on Sunday", over the floor verbatim: *"Patina never mails about an approval
  before 8am, and your phone only buzzes between 8am and 8pm — your own clock. Anything later waits
  for the morning."*

---

## Findings

### `W3R3-M1` · major · the Studio hub pushed from Today never loads on a cold start — it gathers forever

`02-hub-cold-t0.png` (t+0.3 s) · `03` (t+2 s) · `04` (t+9 s) · `05` (t+35 s) ·
`06-hub-second-entry.png` · `07` · `08-hub-t180.png` **against** `09-hub-via-studio-tab.png`
(the same hub, same session, one tab-tap later, fully rendered).
`apps/mobile/Patina/Patina/Features/Profile/Views/StudioHubView.swift:59-61, 424-432`;
`…/ViewModels/StudioHubViewModel.swift:135-137`.

`W3R2-M1`'s **symptom** is fixed — the hub no longer says "Nothing needs a decision." over a header
saying eight things need her eye. Its **cause** is not: the pushed hub never asks for a load, and
the fix's new branch turns that into an unending placeholder instead of a lie.

The view's only load trigger is

```swift
.task(id: studioEntryKey) {
    guard isOnStudio else { return }
    await viewModel.load()
}
…
var isOnStudio: Bool {
    !coordinator.isHouseFirstRoot || coordinator.tabs.selected == .studio
}
```

With the `house-first` flag on (`[FeatureFlags] resolved via defaults: on=[house-first]` in the
device log) and the hub **pushed over the Today tab**, `tabs.selected == .today`, so `isOnStudio` is
false, the task returns, `load()` is never called and `hasLoaded` stays false. Before `e5e194d5d`
the view fell through that state to its sections and drew zeros; now `!viewModel.hasLoaded` holds
`loadingState` open indefinitely.

Measured, on a cold `simctl terminate` + `launch`: **still "Gathering your Studio…" at t+35 s**, and
after leaving and re-entering, still gathering **two minutes later** — `guard !isLoading` is not the
cause (`apply()` was never reached; no `[Studio] partial load failed` line appears in the device
log, and no source is at fault: `list_my_project_decision_reviews` answers correctly under `psql`
for this homeowner). The contrast is decisive: one tap on the **Studio tab** at 01:28 rendered
"Awaiting you, **eleven** things awaiting you" immediately, and from then on the pushed hub
rendered too (`34-hub-from-companion.png`) because `StudioHubViewModel.shared` is a singleton
carrying the tab's warm state.

**What a homeowner meets:** Today's "See all that needs you" is the natural first door into the hub,
and on a first run — before she has ever touched the Studio tab — that door opens onto a spinner
that never resolves. The Companion's "Your studio" row is the same door.

Fix, in shape: give the pushed hub its own load trigger (the `isOnStudio` guard exists to stop
eight fetches firing on a tab she is not looking at — a pushed hub she *is* looking at is exactly
the case it should let through), or let `loadIfNeeded()` run unconditionally on appear and keep the
guard only for the tab-switch key. A bounded timeout on the placeholder would also stop "gathering"
from being a terminal state.

### `W3R3-n1` · nit · the header hint is not held to the same honesty as the sections

`39-solo-hub-empty.png`: "**One thing needs your eye**" sits directly above
"Awaiting you / zero / Nothing needs your answer." The sections now wait for the projection
(`isAwaitingProjection`), but the hint is read from `BadgeCountService.shared.studioHint` and is
neither held nor reconciled with what the sections came to say. In this instance the disagreement
was caused by my own SQL invoice flip (the hint had not recounted), so it is not a live-path defect
— but it is the same shape of contradiction `W3R2-M1` was raised on, one line higher on the screen,
and the fix does not cover it.

### `W3R3-n2` · nit · numerals survive on the profile stats and the Companion

`09-hub-via-studio-tab.png` prints "**1** ROOM / **0** SAVED" (AX: "Room: 1", "Saved pieces: 0")
above a Studio block that spells every count in words; the Companion sheet reads "Your spaces,
**1 room**". These are the profile header and the Companion, not approval surfaces, and they predate
this program — recorded as P-24 residue for the ear that rules the words, not filed against Wave 3.

### Round-2 findings, re-verified

| id | severity (r2) | verdict this round |
|---|---|---|
| `W3R2-M1` | major | **symptom fixed, cause open** — the false empty state is gone; the hub still never loads on that path. Re-filed as `W3R3-M1` |
| `W3R2-n1` | nit | **FIXED** — §3 |
| `W3R2-n2` | nit | **FIXED** — §4, walked live after midnight |
| `W3R1-n1` | nit | **FIXED** — §4, refused at the write for all four kinds |
| `W3R1-n2` | nit | **FIXED** — §2, the stamp reads CHOSEN |
| `W3R1-n3` | nit | **FIXED** — `a633afde0` struck the stale paragraph from `iose-notes.md` |
| `W3R1-M1` / `W3R1-M2` | major | **still fixed** — §5 |

## Noted, not filed

- **The haptic and the Reduce-Motion cross-fade remain unverifiable** with this harness (no Taptic
  Engine in the simulator, no log for `UISelectionFeedbackGenerator`; `ffmpeg` still absent to cut
  frames out of `simctl io recordVideo`). Neither is reported as passing.
- **The companion/quick-actions endpoint returns HTTP 503** throughout
  (`[com.patina.app:companion] Failed to fetch API quick actions: serverError(statusCode: 503)`) —
  a local service that is not running, unrelated to this wave, and it does not block the hub load.
- **A total-failure hub was seen once** on the solo account right after the invoice flip
  (`38-solo-hub-error.png`, "We couldn't gather your Studio. Check your connection and try again."
  over "Last updated 1 minute ago."). "Try again" recovered it on the first press. Transient; the
  staleness line and the retry act behaved exactly as `R-01`/`L07-05` describe.

## Housekeeping

Local stack was **not** reset by me (the fix agent had already reset it). My mutations, all local,
all on `127.0.0.1:54322`:

| what | when (UTC) |
|---|---|
| `workflow-gate-fixture.sql` (the eight G-rows) and `web-walk/seed-w3.sql` (the 903/904 pair + the proposal signature) — both then re-run by the peer walker at 06:20:21/23, whose ids I used | ~06:19, superseded 06:20 |
| `web-walk/seed-w3-r3-sconce.sql` — the three-option "Entry sconce" decision + its 3 options (new file, committed with this report) | 06:20:5x |
| G6 (`3351d8a6`) `created_at`/`sent_at` backdated to 2026-08-24 in replica mode | 06:33 |
| the peer's stray `decision_snoozes` row (`kind='never'` on `6e29e2b8`) **deleted** so the snooze block could be read fresh | 06:36 |
| `…0d2c03` (Rug color) answered **through the app** — `responded / click_through`, Natural selected | 06:30:17 |
| `decision_snoozes` row on `6e29e2b8` — `tomorrow_morning`, **through the app** | 06:37:29 |
| `6e29e2b8` (Edition 904) answered **through the app** — `approved / electronic_signature / Margaret Whitfield` | 06:38:46 |
| four `set_decision_snooze` probes on G6, all **rolled back**, all `ERROR: decision_past_due`; one `tomorrow_morning` probe on Ed 904, **rolled back** | 06:33–06:35 |
| solo's invoice `…cc01` set `paid` to reach the truly-empty section, **reverted to `sent` / `paid_at = null`** | 06:53:20 → 06:55 |

The device's content size and Reduce Motion were left at their defaults (the AXXL pass was walked in
round 2 and the layout code did not move this round). The simulator was **shut down** at the end;
not deleted. No product code was written.

## Verdict

Four of the five things the brief asked me to verify pass outright, and the fifth passes on two of
its three clauses. **`W3R1-n1`, `W3R1-n2`, `W3R1-n3`, `W3R2-n1` and `W3R2-n2` are all closed**, and
`W3R1-M1` / `W3R1-M2` stay closed. Every regression on the list — the three keepsake surfaces, both
spreads, Approve with a typed name and a hold, the RETURNED stamp and its note, the pigments —
passes.

**One major stands.** `W3R2-M1` was fixed as a sentence, not as a screen: the hub reached the way
Today invites her to reach it never loads at all, and now says "Gathering your Studio…" forever
instead of "Nothing needs a decision." That is a better failure and still a failure, on the surface
this round was asked to clear first.
