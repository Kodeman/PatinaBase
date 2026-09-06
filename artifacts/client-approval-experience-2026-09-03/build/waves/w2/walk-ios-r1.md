# Wave 2 simulator walk — round 1 ("The Decision, Delivered": the ceremony)

- **Worktree** `git -C … rev-parse --show-toplevel` →
  `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-integration`,
  branch `approvals/w2-integration`, HEAD **`cdda05919`**
  ("docs(approvals): the W2 carry fixes, their gates, and the H-14 read-through", docs only;
  the two commits under it are `f76c9e437` and `aa5fbbe72`).
- **App** `…/apps/mobile/Patina/.build/DerivedDataWalk/Build/Products/Debug-iphonesimulator/Patina.app`,
  `Patina.debug.dylib` stamped `2026-09-05 13:59`. The carry-fix code is in the bundle —
  `strings Patina.debug.dylib` finds `whyAuthorName`, `ApprovalDiscussion`, `decision_comments`
  and `The discussion` (the 124 KB `Patina` stub carries none of it; all app code is in the
  debug dylib, which is where those strings must be looked for).
- **Simulator** `29E64516-9C2F-4D77-95D8-55D7B61E017B` (`cae-w1-walk`), booted with Simulator.app
  in front, `defaults write cloud.patina.app DeploymentTarget local`, `simctl install`,
  launched `-DeploymentTarget local`.
- **HID preflight** — tapped "Have a password? Sign in" on the Welcome screen and asserted the
  sign-in sheet mounted (`00-launch.png` → the AX tree showing `auth.form.emailField`). The
  first tap was swallowed (walk-r1's documented behaviour); the second landed. Every assertion
  below was re-taken after its effect was visible.
- **Stack** local (`127.0.0.1:54322`). Shots: `walk-shots-r1/` (53 files).

## The stack was NOT carrying this branch — one additive apply, no reset

The brief said the steward had reset the stack and not to reset it. It had been reset again by a
peer program since: the ledger read `00571, 00568, 00567, …` with **no 00569**, and
`project_approval_artifacts` had neither `why` nor `why_author_name`. `00571_studio_invoices.sql`
(the `agent-si-*` program) mentions nothing on this rail (`grep -ci
'project_approval|get_project_decision_reviews|respond_project_approval|decision_comments'` → 0),
so instead of a reset I applied **only** this branch's migration and recorded it in the ledger:

```
psql … -f .../00569_approval_why_viewer_role_and_receipt.sql        # exit 0
insert into supabase_migrations.schema_migrations(version) values ('00569');
select column_name … where table_name='project_approval_artifacts'  → why, why_author_name
select version … order by version desc limit 4                      → 00571, 00569, 00568, 00567
```

**⚠ The same peer program seeded the same project throughout this walk.** Rows named
"Approve the plaster finish as sampled?", "Approve the hall runner width?", "Approve the pantry
shelving run?" and others appeared under me mid-walk, and `cd102` was re-dated after I signed it.
Every finding below rests on a row **I** minted or on source, never on a row whose provenance is
the peer's. One leg (§4) is contaminated and is reported as such.

## Seed, verified by SELECT through the real projection

`apps/designer-portal/e2e/helpers/workflow-gate-fixture.sql` (G1–G8), then a walk seed of my own
(`walk-r1:*` idempotency keys) run through the real lifecycle RPCs. Read back as the homeowner
through `public.get_project_decision_reviews`, which is the function 00569 redefines:

| what | id | evidence |
|---|---|---|
| published, **with a why** | `c918babc-…` | `why = "Choosing walnut now keeps the joinery on one lead time."`, `whyAuthorName = Leah`, `viewerRole = lead` |
| published, no why | `9cb52b81-…` (G2) | `why` NULL, `whyAuthorName` NULL |
| approved (backdated a day) | `b37c05ad-…` (G3) | `responded_at = now() - 1 day` |
| returned | `c6780018-…` (G8) | `outcome = changes_requested` |
| superseded | `12b02601-…` (G4) | `disposition = superseded` |
| withdrawn | `cf8d4fa6-…` | `disposition = withdrawn` (via `withdraw_project_approval_decision`) |
| expired | `e9f91c8c-…` | `lifecycleStatus = expired`, `disposition = active` |
| two proposals awaiting signature | `…cd101`, `…cd102` | `status = sent`, legacy kind, `designer_client_id` set |
| notification whose entity is a proposal | `notification_log` | `metadata->>'entity_type' = 'proposal'` |

Homeowner **`client@patina.dev` / `password123`**, uid `a0000000-…-005`; project **Aspen Loft
Refresh** `b0000000-…-00d1`; designer **Leah Hartwell** `…-004`.

**Two seed traps worth recording for the next walker.** A hand-inserted proposal cannot be signed:
`_sign_proposal_authorized_00400` demands (a) a `designer_client_id` — else *"has no exact
designer↔client relationship"* — and (b) `projects.proposal_id = proposal.id` — else *"has a
conflicting project link"*. The three seeded Aspen Loft proposals are all **commercial documents**
(`design_services` / `furnishings_authorization` / `trade_scope`), which take the countersign rail
and refuse `sign_proposal` with *"commercial documents require their dedicated signature
authority"*. A signable row must be `document_kind = 'legacy'`, carry the relationship, and be the
one row `projects.proposal_id` points at.

---

## 1 · Today — the Record (P-21, P-12)

`04-today-needs-you.png`, `50-today-moved-final.png`.

- **P-21 — PASS, with the mark.** MOVED draws the reader's own acts as sentences, each with its
  stamp WORD **and its `PatinaStamp` mark**, dated:
  "You signed the proposal." · SIGNED · SEP 5 — "You held the plan set to talk it through with
  your designer." · HELD · SEP 5 — "You approved the plan set." · APPROVED · SEP 5, and earlier in
  the walk "You returned the plan set for revision." · RETURNED · SEP 5. `iosd4-M4` (three rounds
  open) is **closed on this tree**.
- **P-12 — PASS.** NEEDS YOU rows carry the clay left-margin rule; MOVED rows carry none. Exactly
  one `See all that needs you` and one `See all that moved`; each half caps at three rows.
- **Open rows under NEEDS YOU — not observable.** The half caps at three and the invoice plus two
  proposals filled it, so no Stage-2 row reached Today in this seed. They are all present one
  level down: "Awaiting your call" listed four Stage-2 approvals plus the three legacy rows
  (`06`, `07`). Not a defect I can attribute — the cap is P-12's own, and the seed is mine.
- **"Nothing the caller does not answer appears" — NOT EXERCISED.** 00569 emits `viewerRole` and
  the projection returned `lead` for every row this homeowner can see, so the observing case
  never existed in this seed. Proving it needs a studio co-member signed into the client app —
  a second account, out of this walk's scope. The field is emitted and decoded; the negative is
  unwalked.
- The list eyebrow reads **"WAITING ON YOU"** over "Awaiting your call" — `iosd3-M1`'s carry
  holds; no screen says DECISIONS.

## 2 · The approval ceremony (P-13, P-16, P-18, R1)

### The why, and its author — PASS

`08-approval-why-top.png`. Under the question, above the edition line:

```
Approve walnut for the island joinery?
Choosing walnut now keeps the joinery on one lead time.     decisionDetail.approval.why
— Leah                                                      decisionDetail.approval.whyAuthor
Edition 901 · Due Sep 16, 2026                              decisionDetail.approval.edition
You are approving edition 901, exactly as shown.
```

The web's own order, the em dash, the muted attribution. On the approval with no why
(`15-approval-no-why.png`) neither line draws — no orphan dash. **The carry fix lands, and
H-14 is confirmed closed by observation**, not only by the delegation argument: `why` and
`whyAuthorName` reach the phone through `list_my_project_decision_reviews` unchanged.

### The three doors — PASS

Equal weight, no fills, order Approve / Return / Hold
(`decisionDetail.approval.outcome.{approved,changes_requested,needs_discussion}`). The
verb-then-consequence line appears at the **confirm** beat, not on the doors:

- "Approve · Accept this exact edition and its stated impacts."
- "Return · Send this edition back for revision and a new approval request."
- "Hold · Keep this open while you and your designer talk it through."

### Return — PASS on every clause

`09-return-chosen.png`, `10-note-typed.png`, `11-returned-stamp.png`.

The composer **pre-opens** with the outcome ("WHAT SHOULD CHANGE?", placeholder "Tell Leah what
to change.", help "Optional. Your note goes to your designer with this returned edition."), and
**no name is asked**. A released press does not submit (`status = pending` after a 0.1 s tap); a
1.4 s press does, on the **first** attempt:

```
select status, answer, client_consent_method, client_signature from client_decisions where id='c918babc-…'
 responded | changes_requested | (null) | (null)
select author_id, body from decision_comments where decision_id='c918babc-…'
 a0000000-…-005 | The grain reads too busy on the long run.
select action_kind, idempotency_key from project_approval_action_receipts where decision_id='c918babc-…'
 responded | 191DAA90-F88F-4914-AE39-290A0AB0833B      ← app-minted, exactly one
```

The note lands on the **approval** (`decision_comments`), not the project thread — `IOSC-02`
holds. Consent stays NULL for a Return, as the mid-Wave-2 ruling requires. RETURNED stamp settles.

### Approve — PASS, and the signature is real

`16-approve-signature-rule.png`, `17-signature-typed.png`, `18-approved-stamp.png`.

The signature rule appears **only** under a chosen Approve: `YOUR NAME` … `SEPTEMBER 5, 2026`
(today), a typed line, "Your typed name acts as your electronic signature.", and the hold act
unlit until the name is on it. First submit succeeded:

```
select status, answer, client_consent_method, client_signature, client_consented_at
  from client_decisions where id='9cb52b81-…'
 responded | approved | electronic_signature | Margaret Whitfield | 2026-09-05 19:43:06.941623+00
 responded receipt: 49960216-FCEB-4E27-B072-94FCA09B5064   ← exactly one
```

APPROVED stamp measured on the shot: interior **RGB(250,247,242)** = the page ground, i.e.
**no fill**; word **RGB(92,74,60)** (#5C4A3C, mocha) at **8.99:1**; rule RGB(111,95,82) at
**5.55:1**. No checkmark, no green, no sage.

### Hold — PASS

`19-hold-confirm.png`, `20-held-stamp.png`. Hold shows **no name field and no composer** — the
consequence line, then press-and-hold. `client_consent_method` stays NULL. HELD stamp settles
(golden-hour rule RGB(136,119,55), word RGB(44,41,38), no fill).

### The past-due row says so without shouting — PASS

`19`: "Approve the issued plan set? This response is past due." / "Edition 902 · Due Aug 31,
2026" — body ink, no red, and the retired word appears nowhere.

## 3 · The proposal — the sign act and the seal (P-19)

`24-sign-act.png`, `25-sign-armed.png`, `29-seal-moment.png`, `30-after-done.png`.

- **The act — PASS.** Full-screen, eyebrow SIGN, title, **edition line** "Edition 2 · Issued
  Sep 2, 2026", the terms block (PROJECT / TOTAL / TERMS / EXPIRY), the consent checkbox ("I
  agree to the scope and investment in this proposal." — `consentLineFor`'s else branch, right
  for a `proposals` row), the typed name under today's date, `Sign proposal` / PRESS AND HOLD,
  and "Not yet". The act is unlit until both the consent and the name are given (measured:
  `proposalSign.confirm` `enabled: false` with the box unticked, `true` after).
- **The seal — PASS.** Held; the sign cover dismissed and the seal presented one runloop later
  (`IOSC-05`): SIGNED stamp settled at rest, the signer's name beneath in mono caps, headline
  "Signed", and **"Leah Hartwell has your signature. You'll have a copy."** — the ruled P-19
  sentence, with no "countersigns". `Done` returned to the detail showing the SIGNED stamp and
  "Signed by you"; the seal did **not** re-present.
- **The row:**
  `select status, signed_at, signed_by_name, accepted_at from proposals where id='…cd101'` →
  `accepted | 2026-09-05 19:51:42.917405+00 | Margaret Whitfield | 2026-09-05 19:51:42.917405+00`.
- **The haptic could not be observed** — the simulator has no Taptic Engine and emits no log for
  `UINotificationFeedbackGenerator`. Unverified, by the harness's limit.
- **The honest failure is honest.** Before the seed traps above were fixed, the hold produced
  "We couldn't record your signature. Nothing has been signed." and the row was untouched
  (`26-seal-moment.png`) — the RPC refused and the app said so without inventing a success.
  See finding `W2R1-n2` on that sentence's ink.

### Reduced motion — PARTIAL

- **The setting that worked:** `xcrun simctl spawn <udid> defaults write com.apple.Accessibility
  ReduceMotionEnabled -bool true`. `simctl ui` has no `reduce_motion` option on this runtime
  (it offers only `appearance`, `content_size`, `increase_contrast`). Confirmed live: Settings →
  Accessibility → Motion showed `REDUCE_MOTION` switch `AXValue "1"` (`31-reduce-motion-on.png`).
- Signed the second proposal under it (`32-rm-sign-armed.png`, `33-rm-seal-1.png`);
  `…cd102 → accepted | 2026-09-05 19:55:43 | Margaret Whitfield`. The seal presented, and the
  stamp's resting geometry is **identical** to the non-reduced pass — same position, same tilt.
- **What is NOT proven: that the settle is a cross-fade only.** `simctl io screenshot` takes
  ~0.5 s per frame, longer than the 420 ms settle, so no mid-flight frame could be sampled. The
  cross-fade claim still rests on the lane's source pins, not on this walk.

## 4 · The lock screen (P-22, P-06)

- **Category registration — PASS, from the log.** On launch, both the app and SpringBoard print
  `[com.apple.UserNotifications:Connections] [cloud.patina.app] Setting 3 notification
  categories`. The three are `PATINA_DECISION` / `PATINA_PROPOSAL` / `PATINA_INVOICE`, with
  actions `PATINA_OPEN` / `PATINA_ASK_QUESTION` (`NotificationCategories.swift:36-38, 90-91`).
- **The letter's register — PASS.** `simctl push` with `category: PATINA_DECISION`,
  `thread-id: decision-<id>`, `interruption-level: active` landed on the lock screen reading
  **"Leah asked for your approval." / "Do the library elevations read right to you?"**
  (`37-lockscreen.png`) — the designer's voice, no warning register, collapsed onto its thread
  (the icon carried the thread's own count overlay).
- **The springboard badge — PASS.** `aps.badge` moved the home-screen number while the app was
  backgrounded (`40`, `42`: badge 3, then 12 as unread `in_app` rows accumulated; AX
  `Patina … AXValue "12 new items"`). The in-app bell stayed a dot — `DailyRoomView.BellButton`
  AXValue **"Unread notifications"**, never a number. R5 both halves hold.
- **The two acts could NOT be driven.** Long-press and swipe-down on the banner did not expand it
  on this device, and the banner is absent from the AX tree (`describe_screen` on SpringBoard
  returns icons only), so `Open` / `Ask a question` were not exercised by hand. Their presence is
  evidence-backed only by the registered-category count and the source.
- **The router, both Threshold shapes — PASS**, driven through the in-app feed, whose row tap
  runs the same `NotificationRouter.route(forDeepLink:)` (`NotificationRouter.swift:64`). Two
  `notification_log` rows were seeded carrying **only** `deep_link`, no entity pair:
  - `/?proposal=b0000000-…-cd102#mat-papers` → opened that exact proposal
    ("Aspen Loft — Stair and rail", $9,600.00, `proposalDetail.sign` present).
  - `/projects/b0000000-…-00d1#approval-e6210384-…` → opened that exact approval
    (`decisionDetail.approval.question` = "Approve the router target edition?", a row minted for
    this test so the peer could not touch it).
- **Universal links do not claim the Threshold's project path.** `simctl openurl
  https://client.patina.cloud/projects/<id>#approval-<id>` opened **Safari**
  (`34-router-approval-anchor.png`); `/decisions/<id>` and `/proposals/<id>` open the app. That is
  the `applinks:` claim set, which `NotificationRouter`'s own header names — recorded, not filed,
  because a Threshold link reaches the phone as a push payload, never as a tapped web URL.
- **⚠ One earlier banner tap DID open an approval detail, but the peer program had answered the
  decision the push named seconds earlier**, so which row the router chose is unattributable.
  That measurement is discarded; §4's PASS rests on the two clean feed-driven runs above.

## 5 · The stamps (P-17, P-16)

| state | drawn | evidence |
|---|---|---|
| APPROVED | yes | `18` — rule 5.55:1, word 8.99:1, no fill |
| RETURNED | yes | `11` — rule RGB(144,115,70) clay, word RGB(44,41,38), no fill |
| HELD | yes | `20` — rule RGB(136,119,55) golden hour, no fill |
| SIGNED | yes | `29`, `30`, `50` — word RGB(92,74,60) mocha (R13 holds) |
| SUPERSEDED | yes | `47` — rule RGB(109,98,88) at **5.55:1**, word RGB(78,67,57) #4E4339 at **8.99:1**, interior = page ground. `IOSC-04` and `IOSC-R2-02` both confirmed on the device. |
| WITHDRAWN | yes | `48` — struck-through word in a bordered stamp, beside "Your designer withdrew this approval. Nothing is being asked of you here." |
| **EXPIRED** | **NO** | `49` — see `W2R1-B1` |

- **Nothing sage on the ceremony screens** — every approval and seal screen measured above is
  clay / golden-hour / mocha / body ink. **But sage survives two screens away on the same rail:**
  see `W2R1-M1` and `W2R1-M2`.
- **`DecisionListView` empty state carries no checkmark** — `DecisionListView.swift:179` mounts
  `PatinaEmptyState(title:message:ctaTitle:ctaAction:)` with **no `icon:`**, above a comment that
  says why. Source evidence only: an empty list was unreachable, because the peer program kept
  seeding open approvals onto this project throughout the walk.
- **`changes_requested` is RETURNED everywhere it was seen** — the door reads "Return", the stamp
  RETURNED, the recorded sentence "You returned this edition for revision.", the Record row "You
  returned the plan set for revision." + RETURNED. `grep -rn "Declined"` over
  `Features/Decisions/` returns three comment lines and no live literal.

---

## Findings

### `W2R1-B1` · **blocker** · an expired approval draws nothing at all

`49-stamp-expired.png`. A published approval whose window lapsed unanswered
(`e9f91c8c-…`, `lifecycleStatus = 'expired'`, `disposition = 'active'`) renders the question, the
edition line and the impact block, and then **stops**: no EXPIRED stamp, no sentence, no doors.
The homeowner is shown an ask with nothing to do and no word for why.

`ProjectApprovalBlock.closureLeg` has exactly three branches — `isWithdrawn`, `isSuperseded`,
`answeredOutcome ?? recordedOutcome` — and a lapsed unanswered row satisfies none, while
`outcomeLeg` refuses the doors because `canRespond` is false. `PatinaStamp.State.expired` exists
and prints "EXPIRED"; a count of its mounts in the app is **zero** (as are `.awaiting`,
`.reviewed`, `.declined` — this is `IOSC-R2-03` observed live, and the expired case is the one a
seeded row actually reaches).

P-17's brief names eleven states; this walk's brief names expired as one of the three to show.
The fix is a fourth `closureLeg` branch and a sentence; the state and its pigment already exist.

### `W2R1-B2` · **blocker** · the change note is still write-only on iOS

`11-returned-stamp.png`, `12-returned-reentered.png`, `13-returned-cold-discussion.png`.

The note the homeowner writes with a Return lands in `decision_comments` (proven above) and
**never appears back on the approval** — not after the submit, not on a re-entry, not on a cold
launch by deep link. The screen shows the RETURNED stamp, the sentence, and "Discuss this with
your designer", and nothing else. `decisionDetail.approval.discussion` and
`…discussionUnreadable` are both absent from the AX tree. This is exactly the defect
`IOSC-R2-01` was raised and closed for.

Not RLS and not the server:

```
psql, as the client's uid:   select … from decision_comments where decision_id='c918babc-…'  → 1 row
REST, with her own JWT:      GET /rest/v1/decision_comments?decision_id=eq.c918babc-…        → 1 row
```

And the app never asks. A full cold approval load captured with `log stream` lists every REST
table the app hit — `profiles, invoices, client_decisions, rpc, comms_threads, projects,
notification_log, user_settings, user_roles, project_documents, profile_presence,
notification_preferences, leads, editorial_stories, device_push_tokens` — and
**`decision_comments` is not among them**.

**Root cause, from the source.** `ApprovalDiscussionBlock.body` is
`content.task(id: readKey)`, and `content` is a `@ViewBuilder` whose only two branches are
`if !discussion.comments.isEmpty` and `else if discussion.isUnreadable`. On first mount both are
false, so `content` resolves to an empty optional view — which SwiftUI does not render, so the
`.task` attached to it **never runs**, so `comments` can never become non-empty. The block is
inert by construction, and no test can see it because a test never renders the view.

Fix: attach the `.task` to something that is always in the tree — e.g. wrap the conditional in a
`Group { … }.task(id: readKey)`, or hang the task off a zero-height `Color.clear`.

### `W2R1-M1` · major · sage marks an answered state on the proposals list

`22-proposals.png`, `ProposalListView.swift:62`. The **ACCEPTED** section header is drawn in
`PatinaColors.sage` — measured **RGB(168,181,160)** on the page ground, against
RGB(130,97,47) for the sibling "AWAITING YOUR REVIEW" header. The rows under it carry the
SIGNED eyebrow. The 2026-09-05 ruling is explicit: *"Sage stops carrying approval meaning:
SIGNED/APPROVED/answered marks … move to mocha ink; DELIVERED/PULSE material states keep sage."*
An accepted-and-signed proposal group is an answered state, not a material one.

It is also **2.2:1 on the page** as a text heading, under the 4.5:1 bar the same wave's
`ContrastTests` applies to every stamp word.

### `W2R1-M2` · major · a filled sage checkmark is used as status on the decision detail

`DecisionDetailView.swift:339, 346-353`. The legacy option-choice branch draws a selected option
with a sage 1.5 pt stroke and, beside it, `Image(systemName: "checkmark.circle.fill")` in sage
over the words "Your choice". That is three refusals at once — a checkmark icon as status, a
fill, and sage carrying approval meaning — on the screen the homeowner reaches from the same
"Awaiting your call" list as the Stage-2 ceremony, one row away.

`ProjectApprovalActTests.theStage2BranchHasNoStatusColour` deliberately covers only the three
Stage-2 files, so this is outside the branch-wide refusal by design. It needs a scope ruling:
the option-choice rail is not "the ceremony", but it is the same list and the same reader.

### `W2R1-m1` · minor · the composer's placeholder and its help line name the designer differently

`09-return-chosen.png`. The field says **"Tell Leah what to change."** (the resolved given name,
`IOSC-03`'s fix) and the line under it says **"Optional. Your note goes to your designer with
this returned edition."** One control, two ways of naming the same person, two lines apart. The
help line should take the same `designerGivenName` the placeholder already resolved, with "your
designer" as its own fallback.

### `W2R1-m2` · minor · P-19's sentence names a person where the ruling names a studio

`29-seal-moment.png`. The ruled line is **"{Studio} has your signature. You'll have a copy."**;
what a homeowner reads is **"Leah Hartwell has your signature."** — the designer's full name.
`countersigningStudio` resolves from the project the app holds and this project carries no studio
name, so the fallback is the designer. Truthful, but it is not the sentence that was ruled, and
it is the one line of the seal a homeowner will re-read. Either widen the resolution to
`organizations.name` (which the sign-off ruling already does for the city) or rule the personal
form in.

### `W2R1-n1` · nit · the Studio hub's approval count is stale after an act

`21-proposals-list.png` and after. The hub row still read "Three approvals are waiting on you"
after three of them had been answered in this session; a relaunch corrected it. Same root as
`W1R3-m1` (`BadgeCountService` is not refreshed by the act that changed it), one surface over.

### `W2R1-n2` · nit · the signature failure is the one red sentence on the rail

`26-seal-moment.png`. "We couldn't record your signature. Nothing has been signed." is drawn in
red. It is an error, not a status, so it is not the refusal `IOSC-R3-01` names — but it is the
only red text a homeowner meets in the whole ceremony, and the wave has spent three rounds taking
red off every other line. Worth one ruling on whether an error keeps its own register.

### `W2R1-n3` · nit · numerals survive where the same screens spell counts in words

Studio hub: "1 unread thread", "14 unread updates", "7 shared proposals", "4 accepted",
"2 shared invoices", "1 paid", "3 shared files, 1 project", "1 piece on its way",
"Aspen Loft Refresh and 2 more". Proposals list section headers: "AWAITING YOUR REVIEW (3)",
"ACCEPTED (4)". Restates `W1R3-n2`; still outside P-24's ruled scope, still on the same screens
whose siblings read "Eleven things need your eye" and "Awaiting you · seven".

### `W2R1-n4` · nit · the Stage-2 card still carries no kind chip where the legacy row does

`06-decision-list.png`. On "Awaiting your call" the legacy sign-off draws an `Approval` chip and
the two option choices draw `Color` / `Product`; the four Stage-2 approvals draw none. Restates
`W1R3-n3`, unchanged.

---

## Housekeeping

- **Local stack**, mutations, all local and all on the shared stack a peer program is also using:
  `00569` applied additively plus its ledger row; the workflow-gate fixture's own scoped
  teardown+setup; three approvals minted, reviewed and published under `walk-r1:*` keys
  (`c918babc`, `cf8d4fa6` → withdrawn, `e9f91c8c` → expired via replica mode, and
  `e6210384` for the router test); G3's `responded_at` backdated one day; the four responses the
  app itself recorded (`c918babc` returned, `9cb52b81` approved, `b764bab6` held, plus the two
  proposal signatures); `…cd101` / `…cd102` inserted as legacy proposals awaiting signature;
  `…cd002` / `…cd003` briefly set to `sent` and **restored** to `accepted` with their original
  `signed_at` (their `accepted_at` was reconstructed as `signed_at`, which was not recorded
  before the change — worth a reset before the next SQL gate run);
  `projects.proposal_id` pointed at `…cd101` then `…cd102` for the sign legs and **restored to
  NULL**, its seeded value; two `notification_log` rows seeded for the router test.
- **Nothing was pushed. No production mutation. No product code was written.**
- **Harness traps.** Blitz taps are swallowed intermittently (two or three attempts on several
  controls; every assertion was re-taken after the effect was visible). `simctl io screenshot`
  got stuck returning a stale SpringBoard frame for several minutes while a notification banner
  was up — `killall Simulator` + reopening Simulator.app (the device stays booted) cleared it,
  and the AX tree stayed correct throughout. `CoreSimulatorService` crashed once on the first
  boot attempt and needed `killall -9 com.apple.CoreSimulator.CoreSimulatorService`.
- Simulator shut down at the end; not deleted.
