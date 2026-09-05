# Wave 2 simulator walk — round 2 ("The Decision, Delivered": the ceremony)

- **Worktree** `git -C … rev-parse --show-toplevel` →
  `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-integration`,
  branch `approvals/w2-integration`, HEAD **`a65b212c7`**
  ("docs(approvals): the W2 walk fixes, their gates, and the rebuilt walk app"), over the two
  round-1 fix commits `a1af62780` (W2R1-B1, W2R1-B2) and `23654c77e` (W2R1-M1, W2R1-M2).
- **App** `…/apps/mobile/Patina/.build/DerivedDataWalk/Build/Products/Debug-iphonesimulator/Patina.app`,
  `Patina.debug.dylib` stamped `2026-09-05 15:40`, `codesign --verify` → *valid on disk*,
  *satisfies its Designated Requirement*. The round-1 fixes are in the bundle: `strings` finds
  "This approval closed before it was answered" (2), "The discussion" (2), `decision_comments` (2).
- **Simulator** `29E64516-9C2F-4D77-95D8-55D7B61E017B` (`cae-w1-walk`). `CoreSimulatorService`
  had to be `killall -9`'d before the first `simctl list` would answer (the documented trap);
  then Simulator.app in front, boot, `defaults write cloud.patina.app DeploymentTarget local`,
  `simctl install`, launched `-DeploymentTarget local`.
- **HID preflight** — first tap ("Skip" on the onboarding card, AX id `Onboarding.SkipButton`)
  landed on the first attempt and the push primer mounted. Every assertion below was re-taken
  after its effect was visible.
- **Stack** local (`127.0.0.1:54322`), **not reset** — the ledger already carried this branch's
  `00569` (tail `00571, 00569, 00568, 00567`) and `project_approval_artifacts` already had `why`
  and `why_author_name`. Shots: `walk-shots-r2/` (37 files).

## The peer program is seeding the same project again

Mid-walk, "Awaiting your call" filled with rows whose context reads **"Web walk r2 row."** —
nine of them — and the workflow-gate fixture's own teardown ran under me: the three round-1
stamp rows (`e9f91c8c` expired, `cf8d4fa6` withdrawn, `12b02601` superseded) were **deleted**
between my first projection read and the stamp leg. Nothing below rests on a peer row. Every
row acted on or measured is one **I** minted under a `walk-r2:*` idempotency key, through the
real lifecycle RPCs, and read back through `list_my_project_decision_reviews` — the function
00569 redefines.

## Seed, verified by SELECT through the real projection

| what | id | evidence |
|---|---|---|
| published, **with a why** (returned) | `95c18815-…` | `why = "The slab we held reads warmer than the sample board."`, `whyAuthorName = Leah` |
| published, **with a why** (approved) | `ff98e15d-…` | `why = "Choosing walnut now keeps the joinery on one lead time."`, `whyAuthorName = Leah` |
| published, **no why** (held) | `8c3e2b00-…` | `why` NULL, `whyAuthorName` NULL |
| published, with a why (router/push target) | `1dae1e95-…` | `whyAuthorName = Leah` |
| approved **yesterday** | `b37c05ad-…` | `responded_at = 2026-09-04 19:32:26+00` |
| **expired**, unanswered | `e6eb966f-…` | `lifecycleStatus = expired`, `disposition = active`, `outcome` NULL |
| **withdrawn** | `6ab48003-…` | `disposition = withdrawn` (via `withdraw_project_approval_decision`) |
| **superseded** | `6efd6505-…` | `disposition = superseded` (via `supersede_project_approval_decision`) |
| proposals awaiting signature | `…cd201`, `…cd203` | `status = sent`, `document_kind = legacy`, `designer_client_id` set |
| notification whose entity is a proposal | `d9f1c984-…` | `deep_link = /?proposal=…cd203#mat-papers`, no entity pair |

Homeowner **`client@patina.dev`**, uid `a0000000-…-005`; project **Aspen Loft Refresh**
`b0000000-…-00d1`; designer **Leah Hartwell** `…-004`.

**Two seed traps, confirmed again.** `supersede_project_approval_decision` refuses `phaseId` /
`sectionKey` in its payload ("unsupported project supersede payload keys") — the successor
inherits them. And `projects.proposal_id` must point at the row being signed: without it the
sign act fails honestly ("We couldn't record your signature. Nothing has been signed.", shot
`21`), and `projects` carries a trigger — `project proposal provenance is immutable after
activation` — so the link can only be set under `session_replication_role = 'replica'`.
Restored to NULL at the end.

---

## 1 · Today — the Record (P-21, P-12)

`01-today.png`, `37-today-final.png`.

- **P-21 — PASS.** MOVED draws the reader's own acts as sentences, each with its stamp WORD, its
  `PatinaStamp` mark, and a date: "You held the plan set to talk it through with your designer."
  · HELD · SEP 5 — "You approved the plan set." · APPROVED · SEP 5 — "You signed the proposal."
  · SIGNED · SEP 5, and earlier in the walk "You returned the plan set for revision." · RETURNED
  · SEP 5.
- **P-12 — PASS.** NEEDS YOU rows carry the clay left-margin rule; MOVED rows carry none. One
  "See all" per half; each half caps at three.
- **Open Stage-2 rows DO reach NEEDS YOU — observed this round** (`37`): once the signed
  proposals left the half, "Leah asked for your approval. · BY SEP 15" drew there beside the
  invoice. Today's feed reads `BadgeCountService`, whose `mergedDecisions` merges the projection.
  The Studio hub does not — see `W2R2-M1`.
- **"Nothing the caller does not answer appears" — NOT EXERCISED.** Every row this homeowner can
  see returns `viewerRole = lead`; the observing case needs a studio co-member signed into the
  client app, out of this walk's scope. The field is emitted and decoded; the negative is unwalked.
- The list eyebrow reads **"WAITING ON YOU"** over "Awaiting your call". No screen says DECISIONS.

## 2 · The approval ceremony (P-13, P-16, P-18, R1)

### The why, and its author — PASS

`04-approval-why-doors.png`. Under the question, above the edition line:

```
Approve the island stone as sampled?
The slab we held reads warmer than the sample board.   decisionDetail.approval.why
— Leah                                                 decisionDetail.approval.whyAuthor
Edition 901 · Due Sep 16, 2026                         decisionDetail.approval.edition
You are approving edition 901, exactly as shown.
```

On the approval with no why (`10-approval-no-why.png`) neither line draws — no orphan dash.

### The three doors — PASS

Equal weight, no fills, order Approve / Return / Hold
(`decisionDetail.approval.outcome.{approved,changes_requested,needs_discussion}`). The
verb-then-consequence line appears at the **confirm** beat:

- "Approve · Accept this exact edition and its stated impacts."
- "Return · Send this edition back for revision and a new approval request."
- "Hold · Keep this open while you and your designer talk it through."

### Return — PASS, and `W2R1-B2` is closed

`05-return-chosen.png`, `06-returned-stamp-discussion.png`, `12-cold-deeplink-returned.png`.

The composer **pre-opens** with the outcome ("WHAT SHOULD CHANGE?", placeholder "Tell Leah what
to change."), and **no name is asked**. Return (HID keycode 40) in the field does nothing — the
value stays one line, no newline (the mid-Wave-2 single-line ruling). A 0.1 s press does not
submit (`status = pending` after it, and the hold ring read "11 percent"); a 1.6 s press does,
on the **first** attempt:

```
select status, answer, client_consent_method, client_signature from client_decisions where id='95c18815-…'
 responded | changes_requested | (null) | (null)
select author_id, body from decision_comments where decision_id='95c18815-…'
 a0000000-…-005 | The stone reads too warm beside the walnut.
select action_kind, idempotency_key from project_approval_action_receipts where decision_id='95c18815-…'
 created | walk-r2:return-create · published | publish-v1:95c18815-… ·
 responded | 6EE42906-9E82-47EC-BA2C-17B61276EF9F ·  review_confirmed | walk-r2:r1-review
```

Exactly one `responded` receipt, app-minted. Consent stays NULL for a Return, as ruled.

**And the note reads back.** `THE DISCUSSION` / `YOU · SEP 5, 2026` / "The stone reads too warm
beside the walnut." draws **immediately after the submit** (`06`) and again on a **cold
deep-link launch** (`12`, app terminated, `simctl openurl …/decisions/95c18815-…`).
`decisionDetail.approval.discussion` is in the AX tree in both. `W2R1-B2` is **CONFIRMED FIXED**
on the device, in both the states it failed in.

### Approve — PASS, and the signature is real

`07-approve-signature-rule.png`, `08-signature-typed.png`, `09-approved-stamp.png`.

The signature rule appears **only** under a chosen Approve: `YOUR NAME` … `SEPTEMBER 5, 2026`
(today), a typed line, "Your typed name acts as your electronic signature.", and
`decisionDetail.approval.submit` measured `enabled: false` until a name is on it, `true` after.
First submit succeeded:

```
select status, answer, client_consent_method, client_signature, client_consented_at
  from client_decisions where id='ff98e15d-…'
 responded | approved | electronic_signature | Margaret Whitfield | 2026-09-05 20:52:59.883163+00
 responded receipt: 823641BD-ED50-4D2B-8D23-20D07AD8439D   ← exactly one
```

APPROVED stamp measured on `09`: interior **RGB(250,247,242)** = the page ground (**no fill**);
word **RGB(92,74,60)** (#5C4A3C, mocha) at **8.99:1**; rule RGB(111,95,82) at **5.55:1**. No
checkmark, no green, no sage.

### Hold — PASS

`11-held-stamp.png`. Hold shows **no name field and no composer** — the consequence line, then
press-and-hold. `client_consent_method` stays NULL (`responded | needs_discussion | (null) |
(null)`). HELD stamp: golden-hour rule, word RGB(44,41,38), interior = page ground.

## 3 · The proposal — the sign act and the seal (P-19)

`19-sign-act.png`, `20-sign-armed.png`, `22-seal-moment.png`, `23-proposal-after-done.png`.

- **The act — PASS.** Full-screen, eyebrow SIGN, title, **edition line** "Edition 2 · Issued
  Sep 2, 2026", the terms block (PROJECT / TOTAL / TERMS / EXPIRY), the consent line ("I agree
  to the scope and investment in this proposal."), the typed name under today's date,
  `Sign proposal` / press-and-hold, and "Not yet". `proposalSign.confirm` measured
  `enabled: false` with the box unticked and the name empty, `true` after both.
- **The seal — PASS.** Held; the sign cover dismissed and the seal presented: SIGNED stamp
  settled at rest, the signer's name beneath in mono caps, headline "Signed", and **"Leah
  Hartwell has your signature. You'll have a copy."** `Done` returned to the detail showing
  SIGNED / "Signed by you"; the seal did **not** re-present.
- **The row:** `select status, signed_at, signed_by_name, accepted_at from proposals where
  id='…cd201'` → `accepted | 2026-09-05 21:03:20.031878+00 | Margaret Whitfield |
  2026-09-05 21:03:20.031878+00`. The reduced-motion pass on `…cd203` →
  `accepted | 2026-09-05 21:09:04.703784+00 | Margaret Whitfield`.
- **SIGNED ink** measured on `22`: word RGB(92,74,60) mocha at 7.86:1, rule RGB(111,95,82) at
  5.72:1, interior = page ground. R13 holds.
- **The haptic could not be observed** — the simulator has no Taptic Engine and emits no log for
  `UINotificationFeedbackGenerator`. Unverified, by the harness's limit. `SealMomentView.settle()`
  fires `HapticManager.shared.notification(.success)` once, unconditionally, on `.onAppear`.

### Reduced motion — the settle is a cross-fade, measured in flight

- **The setting that worked:** `xcrun simctl spawn <udid> defaults write com.apple.Accessibility
  ReduceMotionEnabled -bool true`. `simctl ui` still offers only `appearance`, `content_size`,
  `increase_contrast` on this runtime — no `reduce_motion`. Confirmed live: Settings →
  Accessibility → Motion, switch `REDUCE_MOTION` AXValue **"1"** (`24-reduce-motion-on.png`).
- **This round the settle was sampled in flight**, which round 1 could not do: `xcrun simctl io
  … recordVideo` for the whole act, then frames pulled at 30 fps with an `AVAssetImageGenerator`
  script (`requestedTimeToleranceBefore/After = .zero`). Frames `27-rm-settle-t0.png`,
  `28-rm-settle-t100ms.png`, `29-rm-settle-t366ms.png`.
- **The stamp's own settle is a cross-fade.** Across the 15 frames of the settle the stamp's
  horizontal extent is **constant at 224 px** — no scale, no rotation — while its ink darkens
  monotonically (mean 497 → 334). That matches `SealMomentView`: under `reduceMotion`,
  `scale` returns 1 and `rotation` returns 0, and only `opacity` animates over
  `settleDuration`.
- **What the frames also show:** the seal's composition rises ~65 pt over those same ~330 ms.
  That is the `.fullScreenCover` presentation (`ProposalDetailView.swift:74`), not the stamp —
  a system transition that cross-fades only when *Prefer Cross-Fade Transitions* is on, and
  that switch measured `REDUCE_MOTION_REDUCE_SLIDE_ANIMATIONS` AXValue **"0"** (its default).
  Filed as `W2R2-n1`, not as a defect in the seal.

## 4 · The lock screen (P-22, P-06)

- **Category registration — PASS, from the log.** On launch both the app and SpringBoard print
  `[com.apple.UserNotifications:Connections] [cloud.patina.app] Setting 3 notification
  categories`. The three are `PATINA_DECISION` / `PATINA_PROPOSAL` / `PATINA_INVOICE`, each
  carrying `PATINA_OPEN` ("Open") and `PATINA_ASK_QUESTION` ("Ask a question"), both
  `.foreground`; all five identifiers and the words are in the shipped dylib.
  `NotificationCategories.refusedActionWords` pins approve / sign / accept / pay / decline out
  of any banner act.
- **The letter's register — PASS.** `simctl push` with `category: PATINA_DECISION`,
  `thread-id: decision-1dae1e95-…`, `interruption-level: active` landed as a banner
  (`30-push-banner.png`) and, with the device locked, on the lock screen
  (`32-lockscreen.png`) reading **"Leah asked for your approval." / "Do the library elevations
  read right to you?"** — the designer's voice, no warning register, collapsed onto its thread
  (the icon carried the thread's own "2").
- **The springboard badge — PASS.** `aps.badge: 22` moved the home-screen number while the app
  was backgrounded (`30`, `31`); the SpringBoard AX tree reports the Patina icon AXValue
  "21 new items" / the badge "22". The in-app bell stayed a dot — `DailyRoomView.BellButton`
  AXValue **"Unread notifications"**, never a number. R5 both halves hold.
- **The two acts could NOT be driven, again.** Long-press on the banner and on the lock-screen
  cell did not expand it; a swipe-left reached iOS's own Options sheet (Mute / View Settings /
  Turn Off) rather than the app's actions. The cell's AX `custom_actions` are
  `["Options", "View", "More", "Clear All"]` — the OS's, and the harness has no way to invoke
  an AX custom action. Their presence rests on the registered-category count and the source.
- **The router, both Threshold shapes — PASS**, driven through the in-app feed, whose row tap
  runs the same `NotificationRouter.route(forDeepLink:)`. Two `notification_log` rows were
  seeded carrying **only** `deep_link`, no entity pair:
  - `/?proposal=b0000000-…-cd203#mat-papers` → opened that exact proposal
    (`35-router-proposal-query.png`, "Aspen Loft — Primary bath stone").
  - `/projects/b0000000-…-00d1#approval-1dae1e95-…` → opened that exact approval
    (`36-router-approval-anchor.png`, `decisionDetail.approval.question` = "Do the library
    elevations read right to you?").
- **`simctl openurl` on the Threshold shape opens Safari** (`34-openurl-threshold-anchor.png`):
  `route(forUniversalLink:)` reads only the path, and the `applinks:` entitlement claims
  `/decisions/*`, `/proposals/*`, `/invoices/*`, `/piece/*` — not `/projects/*`. That is
  `_shared/client-portal-links.ts`'s own documented split ("Keep sending those"), so it is
  recorded rather than filed. It is only a defect if a client-facing message ever carries the
  `/projects/<id>#approval-<id>` form to a phone — a backend/web question, noted for the
  steward.

## 5 · The stamps (P-17, P-16)

| state | drawn | evidence |
|---|---|---|
| APPROVED | yes | `09` — rule 5.55:1, word 8.99:1, no fill |
| RETURNED | yes | `06` — bordered, no fill, beside "You returned this edition for revision." |
| HELD | yes | `11` — golden-hour rule, word RGB(44,41,38), no fill |
| SIGNED | yes | `22`, `23`, `37` — word RGB(92,74,60) mocha |
| **EXPIRED** | **yes** | `13` — rule RGB(109,98,88) at **5.55:1**, word RGB(78,67,57) at **8.99:1**, interior = page ground, beside "This approval closed before it was answered. Your designer can send it again." **`W2R1-B1` CONFIRMED FIXED.** |
| SUPERSEDED | yes | `15` — bordered, beside "A later edition has replaced this one. This edition is closed." |
| WITHDRAWN | yes | `14` — struck-through word in a bordered stamp, beside "Your designer withdrew this approval. Nothing is being asked of you here." |

- **Nothing sage on these screens.** A full-frame scan of `17-legacy-option-choice.png` for any
  pixel where green exceeds both red and blue (count > 200) returns **zero**. The ceremony
  screens measure clay / golden-hour / mocha / body ink throughout.
- **`DecisionListView`'s empty state carries no glyph** — `DecisionListView.swift:173-185`
  mounts `PatinaEmptyState(title:message:ctaTitle:ctaAction:)` with **no `icon:`**, above a
  comment naming P-17 as the reason. Source evidence only: an empty list was unreachable,
  because the peer program kept seeding open approvals onto this project.
- **`changes_requested` is RETURNED everywhere it was seen** — the door reads "Return", the
  stamp RETURNED, the recorded sentence "You returned this edition for revision.", the Record
  row "You returned the plan set for revision." + RETURNED. `grep -rn "Declined"` over
  `Features/Decisions/` returns only comment lines; the live "Declined" literals are
  `ProposalStatusDisplay` for a **declined proposal**, which R13 keeps.

---

## Findings

### `W2R2-M1` · **major** · the Studio hub never counts a Stage-2 approval

`02-studio-hub.png`. With **six** Stage-2 approvals and **three** legacy rows pending for this
homeowner, the hub's Awaiting-you row reads **"Decisions · Three approvals are waiting on you"**,
and the section header reads "Awaiting you · eight" (3 decisions + 1 invoice + 4 proposals). The
number was "Three" before I answered three approvals and "Three" after, on the same session and
after a relaunch — it never moved, because the six were never in it.

Not a cache and not staleness. `StudioHubViewModel.fetchDecisions()` is
`DecisionsAPIClient.listPending()` — a direct `client_decisions?status=eq.pending` read — and
RLS hides every Stage-2 row from that read. Proven as the homeowner's own uid:

```
set local role authenticated; request.jwt.claims.sub = a0000000-…-005
select count(*) from client_decisions where status='pending';           → 3   (all legacy)
-- while, as postgres:
select count(*) filter (where approval_contract is not null) …          → 6   Stage-2 pending
```

`list_my_project_decision_reviews` is "the only read that hands a homeowner her own approvals at
all" (`DecisionsAPIClient+ProjectApprovals.swift:395`). Two callers read it —
`DecisionsListViewModel` and `BadgeCountService` — and **`StudioHubViewModel` is not one of
them**: `grep -c "ProjectApproval" StudioHubViewModel.swift` → `0`. So Today's NEEDS YOU is right
(`37`, it reads `BadgeCountService.mergedDecisions`) and the "Awaiting your call" list is right,
and the hub between them is wrong.

The wrong number is the mild case. `StudioQueueBuilder` builds `decisionRows` from that same list,
so a homeowner whose only open asks are Stage-2 approvals — the ordinary case this whole program
builds toward — gets **no Decisions row on the hub at all**, and "See all" from a Today row that
says "Leah asked for your approval" lands on a hub that does not mention it.

*Fix:* give `StudioHubViewModel` the same merge the badge service already has — call
`fetchProjectApprovalReviews()` beside `listPending()` and pass the result through
`BadgeCountService.mergedDecisions`, which is already `static` for exactly this reason.

*(This absorbs and corrects round 1's `W2R1-n1`, which read the same row as a stale count. It was
never stale; it was never counting them.)*

### `W2R1-m1` · minor · the change-note composer names the designer two ways — **UNCHANGED**

`05-return-chosen.png`. The field says **"Tell Leah what to change."**
(`ProjectApprovalCopy.notePlaceholder(designer:)`) and the line under it says **"Optional. Your
note goes to your designer with this returned edition."** (`ProjectApprovalCopy.noteHelp`, a
`static let` with no designer parameter, `ProjectApprovalCopy.swift:164-165`). One control, two
ways of naming the same person, two lines apart.

### `W2R1-m2` · minor · P-19's sentence names a person where the ruling names a studio — **UNCHANGED**

`22-seal-moment.png`. The ruled line is **"{Studio} has your signature. You'll have a copy."**;
what a homeowner reads is **"Leah Hartwell has your signature. You'll have a copy."**
`SealMomentView`'s `studioName` resolves from the project the app holds, which carries no studio
name, so `whatHappensNext` falls back to the designer's full name. Truthful, not the ruled
sentence, and it is the one line of the seal a homeowner re-reads.

### `W2R2-n1` · nit · under Reduce Motion the seal still arrives with a slide

`27/28/29-rm-settle-*.png`. The **stamp's** settle is a pure cross-fade — measured, constant
224 px width across the settle, ink 497 → 334 — exactly as `SealMomentView` promises. But the
seal is a `.fullScreenCover` (`ProposalDetailView.swift:74`), and its arrival still translates
the whole composition ~65 pt upward over the same ~330 ms, because a cover's presentation is the
system's and cross-fades only under *Prefer Cross-Fade Transitions*
(`REDUCE_MOTION_REDUCE_SLIDE_ANIMATIONS`, measured AXValue "0" — its default). A reader who has
turned Reduce Motion on still gets a moving seal. Wanted: a ruling on whether the ceremony's
covers should honour `reduceMotion` themselves (`.transition(.opacity)` on the presented
content) or accept the platform default.

### `W2R1-n2` · nit · the signature failure is the one red sentence on the rail — **UNCHANGED**

`21-sign-failure-red.png`. "We couldn't record your signature. Nothing has been signed." is drawn
in **RGB(156,76,63)** (`proposalSign.error`). An error, not a status, so not the refusal
`IOSC-R3-01` names — but it is the only red text a homeowner meets in the whole ceremony, after
the wave has taken red off every other line (the money rail's "Past due · {date}" now reads in
body ink).

### `W2R1-n3` · nit · numerals survive where the same screens spell counts in words — **UNCHANGED**

`02-studio-hub.png`: "19 things need your eye" beside a sibling that reads "Awaiting you ·
eight"; "25 unread updates", "9 shared proposals, 5 accepted", "2 shared invoices, 1 paid",
"3 shared files, 1 project", "1 piece on its way", "Aspen Loft Refresh and 2 more".
`16-proposals-list.png`: section headers "AWAITING YOUR REVIEW (4)" and "ACCEPTED (5)".
Restates `W1R3-n2`; still outside P-24's ruled scope.

### `W2R1-n4` · nit · the Stage-2 card carries no kind chip where the legacy row does — **UNCHANGED**

`03-decision-list.png`. On "Awaiting your call" the legacy sign-off draws an `Approval` chip and
the two option choices draw `Color` / `Product`; every Stage-2 approval draws none. Nothing is
mislabelled — the detail carries the APPROVAL eyebrow — the list is just inconsistent about
naming its kind. Restates `W1R3-n3`, unchanged.

### `W2R2-n2` · nit · the sign act title-cases the studio's own terms

`19-sign-act.png` vs `23-proposal-after-done.png`. The seeded `payment_terms` is "Fifty percent
on signature."; the sign act's TERMS row prints **"Fifty Percent On Signature."** while the
proposal detail prints it back correctly. A title-casing pass is capitalising a sentence the
studio wrote, including its prepositions.

---

## Closed this round

| finding | round 1 | round 2 |
|---|---|---|
| `W2R1-B1` an expired approval draws nothing | blocker | **FIXED** — `13-stamp-expired.png`: EXPIRED stamp (rule 5.55:1, word 8.99:1, no fill) + "This approval closed before it was answered. Your designer can send it again." |
| `W2R1-B2` the change note is write-only on iOS | blocker | **FIXED** — `06` (on submit) and `12` (cold deep-link launch): THE DISCUSSION / YOU · SEP 5, 2026 / her own note |
| `W2R1-M1` sage marks an answered state on the proposals list | major | **FIXED** — `16`: ACCEPTED header RGB(92,74,60) mocha at **7.86:1**, was RGB(168,181,160) at ~2.2:1 |
| `W2R1-M2` a filled sage checkmark used as status | major | **FIXED** — `17`: the selected option draws a **mocha** rule (RGB(92,74,60)) and the words "Your choice" in mocha at 7.52:1; no glyph anywhere, and zero greenish pixels on the screen |

---

## Housekeeping

- **Local stack**, all mutations local, on a stack a peer program is also using: three approvals
  minted, reviewed and published under `walk-r2:*` (`95c18815` returned, `ff98e15d` approved,
  `8c3e2b00` held); three more for the stamps (`e6eb966f` expired via replica mode,
  `6ab48003` withdrawn, `6efd6505` superseded, plus its successor); one for the router/push legs
  (`1dae1e95`, held at the end); three legacy proposals inserted (`…cd201`, `…cd202`, `…cd203`)
  and two of them signed by the app; two `notification_log` rows seeded for the router test;
  `projects.proposal_id` pointed at `…cd201` then `…cd203` for the sign legs and **restored to
  NULL**, its seeded value.
- `…cd202` was left over from round 1 in an impossible shape (`status = 'sent'` with `signed_at`
  set); the app reads it as SIGNED and withholds the sign door, which is why the reduced-motion
  pass used a freshly minted `…cd203`. Not a defect — no production path writes that row.
- **Nothing was pushed. No production mutation. No product code was written.**
- **Harness traps.** `CoreSimulatorService` needed `killall -9` before the first `simctl list`.
  `xcrun simctl openurl` fails with `LSApplicationWorkspaceErrorDomain error 115` while the
  device is locked. Blitz's `device_action` cannot invoke an AX **custom action**, which is the
  only route to a notification's app-defined buttons. In zsh, `set -- $pair` does not word-split
  — a shot loop written that way silently wrote `.png`. `$TMPDIR` differs between sandboxed and
  unsandboxed Bash calls; the scratchpad path is the one that survives both.
- **New in this harness:** in-flight animation frames are obtainable —
  `xcrun simctl io <udid> recordVideo`, then a Swift `AVAssetImageGenerator` with
  `requestedTimeTolerance*` = `.zero` at 30 fps. Round 1 could not sample a 420 ms settle with
  `simctl io screenshot`; this can.
- Simulator shut down at the end; not deleted.
