# The homeowner's approval, natively — iOS design brief

Scope: `apps/mobile/Patina` (Patina, the client app). All paths relative to
`/Users/kody/Code/patina-merged`. Read alongside discovery 03 (iOS), 04 §2.2 /
§3.3 (backend), 02 §2 / §7 (web ceremony and The Making), 01 §A.5 / §B.5
(designer copy). This is a design document; it proposes no code changes and
makes none.

Two constraints govern everything below. First, `docs/vision/VISION.md:22` —
the iOS app is "the studio's front door… not a consumer product in its own
right," so nothing here may be justified by homeowner engagement for its own
sake. Second, `VISION.md:52` — "you're engaged every day, and you and your
designer are looking at the same agreed direction… The decision record is the
relationship." An approval is the single richest entry in that record. Today
the app treats it as a form submission.

---

## 1. Critique of today's native flow

### 1.1 Push and the lock screen

The payload is `supabase/functions/apns-send/core.ts:59-73`:

```
aps: { alert: { title, body }, sound: "default" },
entity_type, entity_id, notification_log_id
```

That is the whole envelope. No `category`, no `mutable-content`, no
`thread-id`, no `collapse-id`, no `interruption-level`, no attachment — grep
for `UNNotificationCategory`, `UNNotificationAction`, `categoryIdentifier` or
`mutable-content` across `apps/mobile/Patina/Patina` and
`supabase/functions/apns-send` returns nothing. The lock screen is the first
frame of the journey and the only one where Patina has zero typographic
control: a grey system banner in San Francisco, indistinguishable from a
shipping notification.

Worse, the promise is only partly kept. `PushPrimerView.swift:24` states,
verbatim and ruled: *"We'll tell you when your designer sends something that
needs you — a decision, a proposal, or an invoice. Nothing else."* Push
categories that actually reach APNs today are `decision_required`,
`decision_overdue`, `decision_resolved`
(`Features/Decisions/DecisionPushHandler.swift:32-38`). `NotificationRouter`
carries `proposal` and `invoice` cases that are annotated as dead:
*"Forward-compatible: no edge function emits entity_type 'proposal' yet"*
(`App/DeepLinking/NotificationRouter.swift:65-67`, and `:71-73` for invoice).
The primer names three things and the rail delivers one. That is the single
most consequential gap in the whole native flow, because a proposal is the
largest financial artifact the app ever shows.

`DecisionPushHandler.handle(apnsUserInfo:)` (`:121-146`) is itself a stub —
its own header says the delegate call site *"is left as a stub call site per
the deck"* (`:22-24`), so the type-aware layer never runs; taps fall through
to the generic entity router. That works, but it means `decision_overdue`
arrives with no distinct treatment at all.

**Overdue is a presentation, never a state** — but `DecisionPushType.overdue`
(`:35`) carries `icon = "exclamationmark.triangle.fill"` (`:44`) and
`isActionRequired = true` (`:62`). A warning triangle on a lock screen for a
rug colour is the app raising its voice at a homeowner on the studio's behalf.

### 1.2 The Record's NEEDS YOU row

Screenshot: `artifacts/ios-daily-return-2026-08-26/shots/w6-x2-fix-02-today-record.png`.

Three rows under NEEDS YOU, verbatim from the shot:

- "Your invoice is due." — right rail `$4,250.00 · DUE SEP 2`
- "Leah Hartwell sent a proposal to review." — `BY SEP 11`
- "Leah asked about Dining chairs - Shaker Oak vs Windsor Elm." — `BY SEP 2`

This is the best writing in the app. `HouseRecordBuilder.title(for:)`
(`Features/Home/Models/HouseRecord.swift:407-419`) uses the designer's first
name only when she is a person and keeps a studio's name whole.
`HouseRecordRowPresentation` (`Features/Home/Views/HouseRecordCard.swift:29-106`)
refuses to print a date the card's own header cannot vouch for (`:44-49`).
`HouseRecordRowView` reflows to a `VStack` at accessibility text sizes
(`:357-368`) and speaks one aggregated label (`:376-378`). NEEDS YOU is never
window-filtered — *"an open obligation does not age out of view. Nothing
decays"* (`HouseRecord.swift:253`). All of that should survive untouched.

What is wrong is that NEEDS YOU and MOVED are drawn in identical typography:
same `bodySmallMedium` title (`:383`), same 56 pt row (`:370`), same
`monoLabel` right rail (`:395`), separated by a 10 pt eyebrow (`:307-312`) and
a hairline. "Leah asked about Dining chairs" and "A new story from the
workshop" are visual peers. The only thing separating an obligation from a
piece of news is `overdue` printed in `PatinaColors.error` (`:410`) — red
status, which `VISION.md:73` explicitly refuses.

The shot also shows a bell with a `9+` badge and a "Studio 5" count pill.
`VISION.md:73` refuses badges by name. And the count behind them is
`BadgeCountService.attentionCount` = pending decisions + pending proposals +
payable invoices (discovery 03 §1.6), which is fed by a feed query that reads
both the `in_app` and `push` rows of the same event — the documented
double-count seam at 04 §3.4. The homeowner is being badged with a number
that is, today, roughly twice the truth.

The 3-row cap (`HouseRecord.swift:204`, `maxRowsPerEyebrow = 3`) is sound. The
overflow is not: `seeAllFooter` (`HouseRecordCard.swift:266-288`) draws exactly
one "See all →" for the whole card and points it at *whichever half has more*
(`:268`). On a day with four open approvals and four moved items, the single
link on the card can lead to MOVED.

### 1.3 Decision detail

Screenshot: `shots/c-18-decision-detail.png`.

`MonoLabel(text: "DECISION")` (`Features/Decisions/Views/DecisionDetailView.swift:110`),
`h2` question — "Rug color - Natural vs Sand" (`:112-114`) — then description,
then two option cards each ending in a full-width charcoal **"Choose this"**
(`:271-279`).

Native-good: real Playfair display type, no shadows, the "Recommended" pill is
quiet clay (`:226-234`), and the R06 contract refuses to make a contentless
card approvable (`:194-195`, `:275`).

Web form in a native shell: this is a radio group rendered as two submit
buttons. There is no state between *reading* and *committed* — a homeowner
cannot hold an option, put the two side by side, or mark a leaning. Both
options in the shot cost $850, so the only differentiator is a one-line note
and an image the fixture lacks; when there is one, `PatinaAsyncImage`
letterboxes it to a fixed 180 pt (`:199-203`), the wrong crop for a swatch.

The two honest non-answers — "Not yet" and "Neither of these"
(`DecisionDeferral.swift`, drawn at `DecisionDetailView.swift:306-317`) — are
14 pt plain text links beneath two heavy black buttons: the truthful answer is
the weakest element on the screen. And the designer is absent. The Record row
says "Leah asked"; the detail never names her, and offers "Discuss this with
your designer" only when a thread happens to resolve (`:326-340`).

### 1.4 The consent sheet

`DecisionConsentSheet` (`DecisionDetailView.swift:368-448`). Eyebrow "CONFIRM
YOUR CHOICE" (`:389`), the option title, then: *"Approving sends your decision
to your designer and unblocks any work waiting on it."* (`:394`).

Then an opt-in `Toggle` — **"Add my signature" / "Type your full name to e-sign
this approval."** (`:399-407`). The homeowner decides whether her own approval
carries a signature. `client_decisions.client_consent_method` supports both
(`:364-366`), so this is legal; it is also a decision no homeowner has context
to make, presented at the moment of highest commitment.

The confirm is a clay `PatinaButton("Approve")` (`:423-435`). On success:
`selectedOptionId` is set, the sheet dismisses, and a sage line reading
**"You've responded to this decision"** with `checkmark.seal.fill` appears in
the header (`:178-187`). That is the entire ceremony.

There is no haptic anywhere on this path. `grep -rn "HapticManager\|sensoryFeedback"`
across `Features/Decisions`, `Features/Proposals`, `Features/Invoices` and
`Features/Home` returns one unrelated hit, `Features/Home/Views/DailyRoomView.swift:504`.
The most consequential taps in the app are silent.

### 1.5 Proposal document and sign

Screenshots: `shots/c-10-proposal-detail-top.png`, `c-11b-proposal-sign-act.png`,
`c-11c-sign-sheet.png`.

`ProposalDetailView` (`Features/Proposals/Views/ProposalDetailView.swift`) is
the best screen in the app: "PROPOSAL" eyebrow, a two-line Playfair title, an
INVESTMENT block at `:117-141`, then seven narrative blocks (`:145-154`). It
reads like a document.

Then it ends like a form. The sign footer (`:158-173`) is one sentence —
*"Ready to move forward? Sign to confirm the scope and kick off your
project."* — above a clay pill at the bottom of a long scroll, floating under
the Companion dock (visibly colliding in `c-11b`). Nothing marks the document
as complete, or the boundary between reading and acting.

The document also never states its own edition. The web gate carries a
load-bearing immutability sentence — *"You are approving edition
{artifactVersion}, exactly as shown."* (02 §2A.1). iOS has no counterpart: a
homeowner signs an $18,500 document without being told which version it is.

The sign sheet (`ProposalSignSheet.swift:33-86`) is a `.medium`/`.large` detent
over the dimmed document (`ProposalDetailView.swift:57`). `restatedTerms`
(`:90-112`) is genuinely excellent — every line comes from the bundle, and
`ProposalSignTerms.swift:10-13` states the law: *"Nothing here is invented…
the client signs what the server said, never what the app composed."* It did
not render in the walk fixture, which is why `c-11c` shows a bare name field
under one sentence.

Two further gaps. The field is a `PatinaTextField` with `icon: "signature"`
(`:50-57`) — a handwriting glyph beside a control that only accepts typed
characters, promising an act it cannot perform. And there is no consent
checkbox: the web sign page requires a ticked box carrying kind-specific
consent copy (02 §2C: *"I agree to the scope and investment in this
proposal."*), while iOS requires two characters of name. That asymmetry is
both legal and experiential.

On success, `ProposalDetailViewModel.sign` sets `didSign = true` and closes the
sheet (`ViewModels/ProposalsViewModel.swift:130-144`). The header line changes
to "Signed by you" beside a ~14 pt `checkmark.seal.fill`
(`ProposalDetailView.swift:87-89`, gated correctly by
`ProposalStatusDisplay.swift:38-51`). No seal, no confirmation screen, no
statement of what happens next, no acknowledgement that an email is on its way
(the `proposal-sign-confirmation` call is best-effort and invisible to the
client — discovery 03 §1.2). The web surface has `GateStamp` — a doubled
border, low-opacity ink, a couple of degrees off-square, from the same
"inspection-tag grammar" as the designer side (02 §7 Stamps). The client app
has an SF Symbol.

### 1.6 Back to the Record

Nothing settles. `HouseRecordBuilder` composes NEEDS YOU from
`StudioQueueBuilder.itemizedAwaitingRows` (`HouseRecord.swift:243-250`), so on
the next rebuild the row is simply gone. `HouseRecordRow.Kind`
(`HouseRecord.swift:22-35`) has no `decisionAnswered` or `proposalSigned` case
— MOVED cannot carry the thing the homeowner herself did. The largest act of
the month leaves no mark on the surface she returns to daily, and by the next
morning the app has forgotten it happened.

---

## 2. Native affordances — keep or refuse

| Affordance | Verdict | Why |
|---|---|---|
| Rich push with artifact image (`mutable-content` + Notification Service Extension) | **Keep** | The lock screen is the first frame of the ceremony and today it is a grey system banner; one board thumbnail or option swatch makes the arrival Patina's rather than iOS's. |
| Push action **Open** | **Keep** | Free, and it makes the deep link explicit rather than depending on tap-through. |
| Push action **Ask a question** | **Keep** | The honest non-answer needs to be as reachable as the answer; it routes to the project thread and resolves nothing, matching `DecisionDeferral`'s existing contract. |
| Push action **Approve** / **Sign** | **Refuse** | `sign_proposal` requires an authenticated client and the app must present the server's restated terms before consent (`ProposalSignTerms.swift:10-13`; 00400:66,86). A one-tap approve from a lock screen consents to a document the person has not seen — it breaks the authority contract, and a phone on a kitchen counter is not proof of who tapped. |
| Live Activity / lock-screen countdown for an open decision | **Refuse** | It is a persistent engagement instrument with a running timer, and the Record's own law is that *nothing decays* and overdue is presentation, not state. A homeowner watching a clock tick on a rug colour is the opposite of "fewer surprises" (`VISION.md:52`). |
| Home-screen widget carrying an open approval | **Keep, narrowly** | The widget exists and is deliberately scoped: `PatinaWidgetShared/HouseWidgetPayload.swift:14-15` records that Q8 rules it carries what MOVED, never what is owed, and `:58` says the type has no member to draw a count from *by construction*. Keep that. Propose one dated, sentence-shaped line — "Leah asked about the dining chairs · Aug 28" — and no number, ever. This needs a Kody/Leah ruling (§8, R2), not a designer's decision. |
| Lock-screen accessory widget for an approval | **Refuse** | `accessoryRectangular` already draws MOVED; putting an obligation on the lock screen is a badge with extra steps. |
| Focus filters | **Refuse** | Configuration work handed to a homeowner who did not ask for an app. No studio moment maps to it. |
| App Intents / Siri — "what is Leah waiting on?" | **Keep (read-only)** | One `AppIntent` returning the Record's NEEDS YOU sentences, spoken. Delightful, zero authority risk. |
| App Intents that approve or sign | **Refuse** | Same authority argument as the push action. |
| Handoff / universal-link continuity from Mail | **Keep, and fix** | The mapping already exists (`DeepLinkHandler.swift:217-241`) and 00534 writes matching `deep_link` paths. But see §5: a link arriving while signed out is dropped. |
| PencilKit drawn signature | **Keep, as an addition** | On a touch device, drawing your name is the ceremony. It must never be the only path — motor accessibility and Dynamic Type users need the typed field — and the typed legal name must still be what goes to `sign_proposal(p_signed_name text)`; the drawing is evidence attached alongside, not the value. |
| Haptics | **Keep, sparingly** | Four moments only (§3). Must respect `SettingsService.hapticsEnabled` (`Services/Settings/SettingsService.swift:134-137`), which nothing on the money rail reads today. |
| SF Symbols as the "signed" mark | **Refuse as the primary** | `checkmark.seal.fill` is Apple's glyph, used by every app; it cannot be Patina's seal. Keep it in the notification feed row where it reads as an icon, not a mark. |
| Custom seal / scored-ink glyph | **Keep** | The web already has one grammar (`GateStamp`, 02 §7); iOS has none (discovery 03 §6). This is the single largest missing piece. |
| Dynamic Type | **Keep, extend** | `HouseRecordRowView:357-368` already reflows correctly; the decision and proposal screens do not. Every new component below must be built with `dynamicTypeSize` branching from the start. |
| VoiceOver | **Keep, extend** | `HouseRecordRowPresentation.spoken` (`:95-105`) is a model of how to do this. The seal and the sign sheet need the same care: the seal must announce as a sentence, not as an image. |
| Reduce Motion | **Keep, mandatory** | `PatinaCompanionMotion.shellAnimation(reduceMotion:)` already exists (`PatinaDesignKit/.../Tokens/PatinaCompanionMotion.swift:23-30`); the ceremony must route every animation through it. |

---

## 3. The native ceremony

The shared grammar, rendered natively. Timings assume the existing tokens:
`Animation.patinaHero` = spring(response 0.5, damping 0.82)
(`Design/Animations/PatinaTransitions.swift:14`) and
`PatinaCompanionMotion.morphResponse` = 0.48 (`:10`).

### Step 1 — Arrival (lock screen)

```
┌─────────────────────────────────────────┐
│  ▤  PATINA                        now   │
│                                          │
│  Leah asked about the dining chairs      │
│  Shaker Oak or Windsor Elm — she's       │
│  leaning oak. Two minutes.               │
│                                    ┌───┐ │
│                                    │▨▨▨│ │  ← option swatch
│                                    └───┘ │     (attachment)
├─────────────────────────────────────────┤
│      Open        │   Ask a question      │
└─────────────────────────────────────────┘
```

New: a Notification Service Extension target to download the attachment, and
a `UNNotificationCategory` registered at launch. Structure: extension only, no
SwiftUI. Haptic: none (system owns it).

### Step 2 — The Record row (the daily door)

```
NEEDS YOU
┌──────────────────────────────────────────────┐
│ ▎ Leah asked about Dining chairs —           │
│ ▎ Shaker Oak vs Windsor Elm.       BY SEP 2  │
├──────────────────────────────────────────────┤
│ ▎ Leah Hartwell sent a proposal              │
│ ▎ to review.                       BY SEP 11 │
└──────────────────────────────────────────────┘
MOVED
  Meadow Linen Sectional arrived.       AUG 28
```

The change is one rule: NEEDS YOU rows carry a 2 pt clay margin rule at the
leading edge (`▎`), MOVED rows do not. That is the whole differentiation —
no colour change, no weight change, no badge. It reads as a marginal mark on
a page. Extends `HouseRecordRowView` (`HouseRecordCard.swift:343-422`) with one
`kind`-derived overlay; `HouseRecordRow.Kind` already distinguishes the three
NEEDS YOU cases (`HouseRecord.swift:25-27`). Reduce Motion: no motion here at
all. Haptic: none — this is a list.

### Step 3 — The artifact spread (decision)

Push to `DecisionDetailView`, not a sheet: the artifact is a place, and the
back chevron must mean "I did not decide."

```
‹
DECISION · ASKED BY LEAH · SEP 2

Dining chairs —
Shaker Oak vs Windsor Elm

The oak reads warmer against the floor
you already have. Windsor is the safer
neutral.                          — Leah

  ┌───────────────┐  ┌───────────────┐
  │ ▨▨▨▨▨▨▨▨▨▨▨▨▨ │  │ ▨▨▨▨▨▨▨▨▨▨▨▨▨ │
  │ ▨▨▨▨▨▨▨▨▨▨▨▨▨ │  │ ▨▨▨▨▨▨▨▨▨▨▨▨▨ │
  └───────────────┘  └───────────────┘
    Shaker Oak         Windsor Elm
    $850               $850
    Leah's leaning
  ─────────────────────────────────────
        ○  hold        ○  hold

           [  I choose Shaker Oak  ]

     Not yet          Neither of these
```

Two changes to `DecisionDetailView.swift:189-281`. First, a paged
`TabView(.page)` or side-by-side spread instead of a vertical stack of cards
with a button each — comparison is the whole task, and stacking makes it
impossible. Second, one "hold" selection state (a filled clay dot, `MonoLabel`
caption) that sets a leaning without committing, and a single act button that
names the chosen option — "I choose Shaker Oak", not "Choose this". The
deferral acts sit at equal weight below it, not smaller.

Transition into the spread: `.navigationTransition(.zoom(sourceID:in:))` from
the Record row on iOS 18+, falling back to the standard push. Motion:
`Animation.patinaHero`. Haptic on hold: `UISelectionFeedbackGenerator`
(`HapticManager.shared.selectionChanged()`), or in SwiftUI
`.sensoryFeedback(.selection, trigger: heldOptionId)`. Reduce Motion: cross-fade
at `PatinaCompanionMotion.reducedMotionCrossfadeDuration` (0.18).

### Step 4 — The act (full-screen, not a sheet)

The sign/consent step must be a `.fullScreenCover`, not a `.medium` detent
over a dimmed document. A half-sheet says "one more field". A full screen says
"this is the moment".

```
┌──────────────────────────────────────────────┐
│                                       Cancel │
│                                              │
│  YOU ARE SIGNING                             │
│                                              │
│  Aspen Loft — Living Room Refresh            │
│  Edition 3, exactly as shown.                │
│                                              │
│  PROJECT   Aspen Loft Refresh                │
│  TOTAL     $18,500.00                        │
│  RETAINER  $4,625.00                         │
│  TERMS     Net 30                            │
│  EXPIRES   Sep 8                             │
│                                              │
│  ────────────────────────────────────────    │
│                                              │
│         ╭─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─╮          │
│         │      Sign here           │         │
│         │   ~~~~~~~~~~~~~~~~~      │         │
│         ╰─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─╯          │
│              Clear   ·   Type instead        │
│                                              │
│  ☐ I agree to the scope and investment       │
│    in this proposal.                         │
│                                              │
│         [      Sign proposal      ]          │
└──────────────────────────────────────────────┘
```

`restatedTerms` (`ProposalSignSheet.swift:90-112`) stays exactly as written —
it is already correct — with the edition line added above it. The `PKCanvasView`
sits in a dashed rule, `Type instead` swaps to the existing `PatinaTextField`,
and the consent checkbox is new (matching the web's requirement, 02 §2C).
Haptic on stroke start: `UIImpactFeedbackGenerator(style: .soft)` at 0.4
intensity, once, not per-stroke. Reduce Motion: the cover presents with a
cross-fade rather than a slide.

### Step 5 — The seal

This is the moment that does not exist today, and it is the whole point.

```
        ╔═══════════════════════════╗
        ║   ╭───────────────────╮   ║
        ║   │      SIGNED       │   ║      ← 2° off-square,
        ║   │   Sarah Whitmore  │   ║        doubled rule,
        ║   │     Sep 3, 2026   │   ║        clay ink at 0.7
        ║   ╰───────────────────╯   ║
        ╚═══════════════════════════╝

           Leah has it. The project
           is open.

           Your copy is on its way
           to sarah@…

              [  Back to the house  ]
```

New component, `PatinaSeal`, living in `PatinaDesignKit/Sources/PatinaDesignKit/Components/`
so both apps and the designer's Field view can use one mark. It is the iOS
counterpart to the web `GateStamp` (02 §7): a doubled border, low-opacity ink,
two degrees off square, mono caps, **no shadow and no fill** — the same
grammar, so the surfaces rhyme rather than merely coexist.

Motion, and this is the only expressive animation in the whole flow: the seal
scales from 1.06 to 1.0 with a slight rotation settle over 420 ms using
`Animation.patinaHero`, while the rule beneath draws left-to-right in 320 ms
(`.easeOut`, via a trimmed `Path` or `.contentTransition`). Nothing bounces.
Nothing sparkles. It presses.

Haptic: `UINotificationFeedbackGenerator().notificationOccurred(.success)` —
or `.sensoryFeedback(.success, trigger: didSign)` — fired once, on the seal's
appearance, not on the button tap. It is the press of the stamp.

Reduce Motion: the seal cross-fades in at 0.18 s with no scale and no
rotation; the haptic still fires. VoiceOver: the seal is one element labelled
"Signed by Sarah Whitmore on September 3, 2026" with `.isStaticText`, and
focus moves to it automatically via `.accessibilityFocused`.

### Step 6 — Afterglow, then settling

The seal screen dismisses to the document, which now carries the seal inline
at the top, in place of the current sage text line
(`ProposalDetailView.swift:91-113`). On the Record, the row does not vanish —
it moves:

```
NEEDS YOU
  Leah Hartwell sent a proposal
  to review.                        BY SEP 11

MOVED
  You signed the living room proposal.   SEP 3   ← afterglow, day of
  Meadow Linen Sectional arrived.        AUG 28
```

The afterglow line is the homeowner's own act, written in second person, dated
honestly. It lives in MOVED and ages out on the existing 7-day rolling window
(`HouseRecord.swift:203`) like everything else — no special-casing, no
persistence, no decay rule to invent. This requires one new
`HouseRecordRow.Kind` case (see §4).

---

## 4. Daily Return integration

**Day 1.** The row appears under NEEDS YOU with its clay margin rule and
`BY SEP 2` in the right rail. Nothing else changes on the home screen. No
banner, no interstitial, no "you have 3 things".

**Day 3.** Identical. The row does not move, does not grow, does not change
colour, does not gain a count. `HouseRecord.swift:253` already rules that
NEEDS YOU is never window-filtered and nothing decays; the corollary is that
nothing escalates either. The only thing that changes across days is the
right-rail date getting closer, which is a fact, not a nag.

**Past due.** The right rail changes from `BY SEP 2` to `ASKED AUG 22 ·
OVERDUE`, which is what `HouseRecordRowPresentation.make` already composes
(`HouseRecordCard.swift:53-58`). One change: drop `PatinaColors.error`
(`:410`) and set the word in `PatinaColors.Text.primary` at the same mono
size. `VISION.md:73` refuses red status, and the word "overdue" carries its own
weight; painting it red is the app editorialising on the studio's behalf. This
is presentation only — no `client_decisions` status changes, and the app must
never say "you are late."

**After the decision.** Two beats. Immediately: the afterglow line in MOVED,
"You chose Shaker Oak." or "You signed the living room proposal.", dated today.
Then, at the ordinary 7-day window boundary, it ages out like any other MOVED
row — no tombstone, no history section to maintain. The permanent record lives
where it belongs, on the artifact itself (the sealed proposal, the resolved
decision) and in `client_decisions` / `proposal_engagement`. The Record is a
daily surface, not an archive.

**The 3-row cap.** Keep `maxRowsPerEyebrow = 3` (`HouseRecord.swift:204`). Fix
the overflow: draw a `See all →` per half when that half has more, rather than
one for the card pointing at whichever half is larger
(`HouseRecordCard.swift:266-288`). An obligation must never be reachable only
through a link labelled for the news half. If both halves overflow, two links;
this is a card that already draws hairline rules between sections, so a second
link costs nothing structurally.

**The spouse's device.** Today there is no distinction: RLS scopes reads to
`designer_clients.client_id = auth.uid()` (discovery 03 §1.1), so a
non-lead household member either sees nothing or, if separately related, sees
the same actionable rows. The web side has the same gap — 02 §4 notes the
comment thread labels everyone "You" or "Designer" and cannot distinguish a
second household member. Meanwhile `sign_proposal` is hard-gated: *"proposal %
may only be signed by its client"* (00400:86), and the designer-side authority
line freezes a single decision lead at publish (01 §A.5: *"Decision lead —
{clientName} · frozen at publish"*).

The native answer, once the backend supports a second participant: a non-lead
sees the same row with the same margin rule, and the same artifact spread —
reading is shared, because the promise is "you and your designer are looking
at the same agreed direction" and a spouse who cannot see the proposal is
outside that sentence. What differs is the act. Where the lead sees
"I choose Shaker Oak", the non-lead sees a quiet line: *"Sarah is the one who
signs this. You can tell her what you think."* with the thread affordance at
full weight. No greyed-out button — a disabled act reads as a bug. This
depends on a schema decision that does not exist yet (§8, R4).

---

## 5. Push and continuity spec

### 5.1 Payload per entity_type

All three share the existing envelope (`apns-send/core.ts:59-73`) plus new
keys. Copy is composed by `notify_client_attention`'s `p_title` / `p_body`
(00534:150-222), so this is a copy change in the calling triggers, not in the
edge function — except for the fields marked NEW, which are `buildApnsPayload`
changes.

**decision** — `entity_type: "decision"`, `type: "decision_required"`

- title: `Leah has a question` (designer first name when a person, studio name whole — mirror `HouseRecordBuilder.title(for:)`, `HouseRecord.swift:407-419`)
- body: `Dining chairs — Shaker Oak or Windsor Elm. Two minutes.`
- category: `PATINA_DECISION` — actions `Open`, `Ask a question`
- deep link: `https://client.patina.cloud/decisions/<id>`
- `thread-id`: `decision-<id>` (NEW) — a reminder collapses onto the original
- `collapse-id`: `decision-<id>` (NEW)
- `interruption-level`: `active` (NEW). Never `time-sensitive`: a rug colour is not.

**decision_overdue** — same shape, `thread-id` unchanged so it replaces rather
than stacks. Body drops the warning register: `Still waiting on the dining
chairs, whenever you have a minute.` Icon `exclamationmark.triangle.fill`
(`DecisionPushHandler.swift:44`) should become `clock`.

**proposal** — `entity_type: "proposal"`, `type: "proposal_sent"`. **This is
the gap.** `NotificationRouter.swift:65-68` already routes it and is tested;
nothing emits it. The `sync_proposal_send_in_app_log` trigger (00534) writes
the bell row — it needs to pass `proposal` as `p_entity_type` through to the
push envelope.

- title: `Leah sent your proposal`
- body: `Aspen Loft — Living Room Refresh. $18,500, good through Sep 8.`
- category: `PATINA_PROPOSAL` — actions `Open`, `Ask a question`
- deep link: `https://client.patina.cloud/proposals/<id>`
- attachment: the proposal's first mood-board image (NEW, needs the service extension)
- `thread-id` / `collapse-id`: `proposal-<id>`

**invoice** — `entity_type: "invoice"`, `type: "invoice_due"`. Also unemitted
today (`NotificationRouter.swift:71-74`).

- title: `An invoice from Leah`
- body: `$4,250, due Sep 2.`
- category: `PATINA_INVOICE` — actions `Open` only. No "Pay" action: Stripe Checkout is an `SFSafariViewController` hand-off with a poll-first settle (discovery 03 §1.3), which cannot start from a notification action.
- deep link: `https://client.patina.cloud/invoices/<id>`

**Quiet hours.** None exist for push today. The SMS rail honours 8am–8pm
(04 §3.2) and it is the right precedent: `notify_client_attention` should
defer the push envelope (never the `in_app` row) outside 8am–8pm in the
recipient's timezone, releasing at 8am. This matters more on iOS than on web
because a phone is on a nightstand.

### 5.2 Changes to apns-send / notify_client_attention (04 §3.3)

1. `buildApnsPayload` (`core.ts:63-73`) gains optional `category`,
   `thread-id`, `collapse-id`, `interruption-level`, and `mutable-content: 1`
   with an `attachment-url` custom key for the service extension to fetch.
2. `notify_client_attention` gains a `p_category` and `p_attachment_url`
   parameter, defaulted null so existing callers are untouched.
3. The proposal-send and invoice triggers pass `p_entity_type` through to the
   push leg so `entity_type` is `proposal` / `invoice` on the wire — this
   alone activates two already-tested, currently-dead routes.
4. **The double-count seam** (04 §3.4, documented at 00534:120-133): the iOS
   bell query filters `channel IN (in_app, push)`, so every attention is read
   twice, and `BadgeCountService.attentionCount` inherits the error. The fix
   is on the client — narrow `NotificationsAPIClient`'s filter to
   `channel = 'in_app'`. This must land before any of the push work above,
   because adding two new push categories doubles two more things.

### 5.3 The "Not now" re-ask path

`PushPrimerTrigger.shouldPresent` (`PushPrimerView.swift:96-101`) is gated on
`PushTokenService.hasAskedForAuthorization`, and
`armAuthorizationPromptGate()` (`Services/API/PushTokenService.swift:103-109`)
is a true one-shot per install; `resetAuthorizationPromptGate()` (`:112-115`)
is marked *"Test/debug seam — never used by product code."*

There is a live defect here. Settings has a **Notifications** toggle
(`Features/Settings/Views/SettingsView.swift:110-118`) whose setter,
`SettingsService.setNotificationsEnabled` (`Services/Settings/SettingsService.swift:123-130`),
writes `user_settings.push_notifications` and
`notification_preferences.channels_push` — and never calls
`requestAuthorizationAndRegister()`, never checks
`UNUserNotificationCenter.notificationSettings`, never opens iOS Settings. A
homeowner who tapped "Not now" can switch this toggle on, see it stay on, have
the server believe push is enabled, and receive nothing, forever, because no
token was ever written to `device_push_tokens`.

The path: make that row authorization-aware. Read
`UNAuthorizationStatus` on appear. If `.notDetermined`, the toggle calls
`requestAuthorizationAndRegister()` (the primer's promise sentence can sit
beneath it as helper copy). If `.denied`, the row stops being a toggle and
becomes a link reading *"Turn on in iOS Settings"* opening
`UIApplication.openSettingsURLString`. If `.authorized`, current behaviour is
correct. No re-prompting anywhere else — one ask, plus one honest door the
person opens herself.

### 5.4 Email → universal link → signed out

The mapping is already right: 00534 writes `deep_link` as
`/proposals|/invoices|/decisions/<id>` and
`DeepLinkHandler.route(forUniversalLink:)` (`:217-241`) parses exactly that,
with plural canonical and singular aliased (`:224-228`).

The break is auth. `DeepLinkHandler.handle` queues a URL only when
`coordinator.phase == .launching` (`:64-71`); otherwise it calls
`openExternal(route)` immediately. `AppCoordinator.derivePhase()` (`:259-271`)
returns `.auth` for a signed-out user once auth state is ready, and the drain
in `recomputePhase` fires only on `newPhase == .main` from a link stashed
during `.launching` (`:243-246`). So: a homeowner taps her proposal link in
Mail, the app opens to the sign-in screen, she signs in — and lands on Today.
The proposal she was invited to read is two taps away and unannounced.

The fix is one line of intent: queue into `pendingDeepLink` whenever the phase
is not `.main`, not only when it is `.launching`. The drain already exists.
The right behaviour, stated for the ceremony's sake: the link is remembered
through sign-in, and after authentication the artifact opens directly, with
the same arrival transition as a push tap, so the email and the app read as
one continuous act.

---

## 6. Component and file mapping

| Proposed component | Extends / new | File(s) under `apps/mobile/Patina` (or DesignKit) | Backend dependency | Effort |
|---|---|---|---|---|
| `PatinaSeal` — the signed/approved mark | New | `PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaSeal.swift` | none | M |
| `SealMomentView` — full-screen seal + afterglow | New | `Patina/Features/Shared/Views/SealMomentView.swift` | none (reads the RPC result already returned) | M |
| `SignActView` — full-screen act, replaces the detent sheet | Extends `ProposalSignSheet.swift` | `Patina/Features/Proposals/Views/ProposalSignSheet.swift`, `ProposalDetailView.swift:43-58` | none | M |
| `DrawnSignatureCanvas` — PencilKit, with "Type instead" | New | `Patina/Features/Shared/Views/DrawnSignatureCanvas.swift` | new column or `proposal_engagement.metadata` blob for the drawing; `sign_proposal` still takes the typed name (00400:408-427) | L |
| Consent checkbox on sign | New (parity with web 02 §2C) | `ProposalSignSheet.swift` | none | S |
| Edition line — "Edition N, exactly as shown." | Extends `ProposalSignTerms` | `Patina/Features/Proposals/ProposalSignTerms.swift:1-89` | `get_client_proposal_bundle` must return the version (00407) | S |
| `DecisionSpread` — paged comparison + hold state | Extends `DecisionDetailView.swift:189-281` | `Patina/Features/Decisions/Views/DecisionDetailView.swift` | none | L |
| Named act button — "I choose Shaker Oak" | Extends | `DecisionDetailView.swift:257-281` | none | S |
| Signature always-on (drop the opt-in Toggle) | Extends | `DecisionDetailView.swift:399-421` | `apply_client_decision` already accepts `electronic_signature` (00117) | S |
| NEEDS YOU margin rule | Extends `HouseRecordRowView` | `Patina/Features/Home/Views/HouseRecordCard.swift:343-422` | none | S |
| Drop `error` red from `overdue` | Extends | `HouseRecordCard.swift:406-411` | none | S |
| Per-half `See all →` | Extends | `HouseRecordCard.swift:266-288` | none | S |
| Afterglow row kinds (`decisionAnswered`, `proposalSigned`) | Extends `HouseRecordRow.Kind` | `Patina/Features/Home/Models/HouseRecord.swift:22-35`, `:395-455` | needs resolved-at timestamps in the Studio queue read | M |
| Notification Service Extension (rich push) | New target | `apps/mobile/Patina/PatinaNotificationService/` | `mutable-content` + `attachment-url` in `apns-send/core.ts:63-73` | M |
| Notification categories + actions | New | `Patina/App/AppDelegate.swift`, new `Patina/Features/Notifications/NotificationCategories.swift` | `category` key in the payload | M |
| Wire `DecisionPushHandler.handle` into the delegate | Extends (the stub named at `DecisionPushHandler.swift:22-24`) | `Patina/App/AppDelegate.swift` | none | S |
| Proposal / invoice push emission | Backend | `supabase/migrations/` (new), `apns-send/core.ts` | `notify_client_attention` passes `p_entity_type` to the push leg (00534:150-222) | M |
| Bell filter → `channel = 'in_app'` (double-count fix) | Extends | `Patina/Services/API/NotificationsAPIClient.swift:135-145` | none | S |
| Notifications settings row → authorization-aware | Extends | `Features/Settings/Views/SettingsView.swift:110-118`, `Services/Settings/SettingsService.swift:123-130`, `Services/API/PushTokenService.swift:92-115` | none | M |
| Signed-out deep-link hold | Extends | `Patina/App/DeepLinking/DeepLinkHandler.swift:60-71`, `App/Coordinators/AppCoordinator.swift:239-256` | none | S |
| Widget: one open-approval line (pending ruling R2) | Extends | `PatinaWidgetShared/HouseWidgetPayload.swift`, `PatinaWidget/HouseWidgetViews.swift:55-80` | none | M |
| `AppIntent` — "what is Leah waiting on?" | New target files | `Patina/Features/Home/Intents/OpenObligationsIntent.swift` | none | M |
| Quiet hours on the push leg | Backend | `supabase/migrations/` (new) | `notify_client_attention` | M |

---

## 7. Proposals

**P1 · The Seal.** *What changes:* a `PatinaSeal` component plus a full-screen
seal moment after every signature and every decision, replacing the current
sheet-dismiss-and-sage-line. *Why it delights:* it is the only moment in the
flow that acknowledges what the person just did; it turns a form submit into
an act with a mark. *Dependencies:* none. *Effort:* M. *Risk:* low — it must
never fire without a real signature record, the rule
`ProposalDetailStatusIconTests` already pins.

**P2 · Proposal and invoice push.** *What changes:* emit `entity_type`
`proposal` / `invoice` on APNs so the primer's promise is kept; the routes are
already written and tested. *Why:* the largest financial artifact in the app is
currently silent on the lock screen. *Dependencies:* the double-count fix (P3)
must land first. *Effort:* M. *Risk:* medium — two new push categories on a
rail whose in-app leg is currently double-read.

**P3 · Fix the double count.** *What changes:* narrow the bell query to
`channel = 'in_app'` (04 §3.4). *Why:* every "9+" and every Studio count the
homeowner sees today is roughly double; a count that is wrong is worse than no
count. *Dependencies:* none. *Effort:* S. *Risk:* low.

**P4 · Rich push with the artifact.** *What changes:* a Notification Service
Extension and `mutable-content`, so a decision push carries the option swatch
and a proposal push carries the board. *Why:* the arrival becomes recognisably
Patina before the app opens. *Dependencies:* P2. *Effort:* M. *Risk:* low —
degrades to today's plain banner if the fetch fails.

**P5 · Notification actions: Open and Ask a question. Never Approve.**
*What changes:* two `UNNotificationAction`s per category. *Why:* the honest
non-answer becomes as reachable as the answer, from the lock screen, which is
where a homeowner is when she has neither time nor certainty.
*Dependencies:* P2. *Effort:* M. *Risk:* low.

**P6 · The act goes full screen.** *What changes:* `.fullScreenCover` instead
of a `.medium` detent over a dimmed document, carrying the restated terms, an
edition line, a consent checkbox, and a drawn-or-typed signature. *Why:* a
half sheet reads as one more field; a full screen reads as a moment, and the
edition sentence closes a parity gap with the web gate. *Dependencies:* the
bundle RPC must return the version. *Effort:* M–L. *Risk:* medium — the
consent checkbox adds friction, the same friction the web already has.

**P7 · Drawn signature via PencilKit.** *What changes:* a canvas with a
"Type instead" escape hatch, alongside the typed field. *Why:* signing with
your finger is the one thing a phone does better than a laptop — the whole
argument for signing on iOS. *Dependencies:* storage for the drawing
(`proposal_engagement.metadata` is the low-risk home); the typed legal name
still goes to `sign_proposal`. *Effort:* L. *Risk:* medium — must not become
the only path, and must not be presented as carrying weight the typed name
does not.

**P8 · The decision spread.** *What changes:* two options side by side with a
non-committal "hold" state and one named act button, replacing a stack of two
submit buttons. *Why:* comparison is the actual task and the current screen
makes it impossible; a hold state gives permission to lean before committing.
*Dependencies:* none. *Effort:* L. *Risk:* medium — needs care at three or
more options and at accessibility text sizes.

**P9 · The afterglow row.** *What changes:* two new MOVED kinds so "You chose
Shaker Oak." appears on the Record the day it happens, aging out on the
existing window. *Why:* the person's own act stops vanishing; the Record
starts reflecting the relationship, not only the queue. *Dependencies:*
resolved-at timestamps through the Studio queue read. *Effort:* M.
*Risk:* low.

**P10 · Obligation gets a margin rule; overdue loses its red.** *What changes:*
a 2 pt clay leading rule on NEEDS YOU rows; `overdue` in primary text. *Why:*
obligation stops depending on a 10 pt eyebrow to distinguish itself from news,
and the app stops using red status the vision refuses. *Dependencies:* none.
*Effort:* S. *Risk:* low.

**P11 · Per-half "See all".** *What changes:* each overflowing half draws its
own link. *Why:* an open obligation must never be reachable only through a
link labelled for the other half. *Dependencies:* none. *Effort:* S.
*Risk:* low.

**P12 · Continuity: hold the link through sign-in, and make the Settings
toggle honest.** *What changes:* queue deep links whenever the phase is not
`.main`; make the Notifications row authorization-aware with an
iOS-Settings door when denied. *Why:* the email-to-app path currently drops a
signed-out homeowner on Today, and the Settings toggle currently lies.
*Dependencies:* none. *Effort:* S + M. *Risk:* low.

---

## 8. Open rulings for Kody and Leah

**R1 · Does an approval ceremony belong on the front door at all?**
`VISION.md:22` calls the iOS app "a marketing and qualification instrument the
studio owns; not a consumer product in its own right," and `:50` forbids
optimizing the studio surface for engagement. Everything in §3 is homeowner
craft. The case for it is `:52` — the homeowner promise, and "the decision
record is the relationship." The case against is that the web client portal
already has the ceremony (02 §7) and iOS is duplicating it. Needs a ruling
before P6–P8 are built.

**R2 · May the widget carry one open obligation?**
`HouseWidgetPayload.swift:14-15` records ruling Q8 — the widget carries what
MOVED, never what is owed — and `:58` makes the type structurally incapable of
a count. §2 proposes one dated sentence with no number. That is a change to a
standing ruling and is not a designer's call.

**R3 · Signature always, or optional, on a decision?**
`DecisionConsentSheet` (`DecisionDetailView.swift:399-409`) lets the homeowner
decide whether her own approval is signed. §3 proposes always-signed for
ceremony and for evidentiary consistency with proposals. Leah's ear on whether
that reads as heavy for "which rug"; Kody's on whether
`client_consent_method = 'click_through'` still needs to exist.

**R4 · Does a spouse see the approval, and what may they do?**
No schema supports a second household participant today, and the web has the
same gap (02 §4). §4 proposes shared reading, single-signer acting, with copy
rather than a disabled button. This is a data-model ruling first.

**R5 · Does the drawn signature carry weight, or is it decoration?**
`sign_proposal(p_signed_name text)` (00400:408-427) takes a typed name and
nothing else. If a drawing is stored, is it evidence, and does it need to
appear on the designer's side and on the countersigned PDF? Counsel question,
not a design one.

**R6 · Quiet hours for push.**
The SMS rail honours 8am–8pm (04 §3.2); push honours nothing. Adopt the same
window on the push leg only, leaving the in-app bell immediate?

**R7 · The lock-screen voice.**
§5 rewrites `decision_overdue` from "A decision is overdue"
(`DecisionPushHandler.swift:53`) to "Still waiting on the dining chairs,
whenever you have a minute." That is a voice change on the one Patina surface
a homeowner cannot dismiss without reading. Leah's ruling.

**R8 · Badges.**
`VISION.md:73` refuses badges; the shipped home screen shows a "9+" bell and a
"Studio 5" pill (`shots/w6-x2-fix-02-today-record.png`), and
`BadgeCountService.attentionCount` exists to drive them. Either the ruling
bends or the counts come off. Fixing the double count (P3) makes them correct
but not permitted.
