# The Decision — Ceremony & Visual Language

Ceremony & visual design lane · client approval experience · 2026-09-03
Companion to discovery 01–04 in `../discovery/`. Read-only research; no code was changed.

Scope: what an approval **looks like, feels like, and leaves behind** — on desktop web, mobile web, and native iOS. Journey shape, copy strategy, and iOS navigation belong to the other three lanes; where this document touches them it says so and defers.

---

## 1. Critique of the current ceremony

### 1.1 What already reads as a ritual

Three things in the codebase are genuinely ceremonial, and everything below builds on them rather than replacing them.

**The gate break.** `SpineGate` (`apps/client-portal/src/components/making/spine-gate.tsx`) is the strongest device Patina owns. Its own header comment states the argument: *"The spine runs the length of The Making unbroken until something is owed. Where an act is required the line does not fade or branch: it STOPS, square, and does not resume until the client's name is on the paper. That break is the whole argument of the surface."* The break is drawn as a 5px square cap of phase ink on the incoming rule and a 3px cap at 50% ink below — the line literally resumes thinner until the act is taken. Discovery 02 §7 confirms it carries no shadow: *"depth here is value contrast, a warmer sheet of paper, and flat rules."*

**The stamp.** `GateStamp` (`apps/client-portal/src/components/approvals/gate-stamp.tsx`) is an inspection tag, not a status pill: doubled border, 1.5px outer and a 0.42-opacity inner rule at `inset-[2.5px]`, `-rotate-[2deg]`, `opacity-[0.88]`, mono caps at `tracking-[0.18em]`, no fill. Its comment ties it to the gate ceremony rulings — *"Ruling VIII, folio 13, mockup M8"* — and to the designer-side `StatusStamp` grammar. Its two variants are already ruled: `seal` in `--color-mocha`, `hold` bordered in `--color-gold` with `--color-charcoal` text, *"drawn deliberately as loud as the seal, per M8's own note that a holding gate must never read as a soft approval."*

**The standing sentence.** `standing-sentence.ts` composes the masthead in the right register: *"one paper waits for your name"*, *"finished work waits for your acceptance"*, *"a balance of $12,500 stands open"* — present tense, second person, counts under twelve spelled out, and *"nothing is ever reported as zero."* This is the only place in the client surface that sounds like a person.

**Scored Ink.** The action grammar (I107, `globals.css:558+`, ported into `making/scored-action.tsx`) is the correct primitive for an act of consequence: no box, no fill, no plate — a DM Mono word with a proofreader's rule under it, `--color-charcoal` over `--color-clay` for primary, ink flooding from the exact contact point (`--ink-x`/`--ink-y`, 260ms on `--ease-editorial`), press-in 70ms / press-out 240ms because *"a press is a fact; a release is a gesture."*

### 1.2 What reads as a form

**`/decisions/[id]` — `ProjectApprovalReview`.** The six-part anatomy is doctrinally correct (discovery 02 §2A: *"A gate has six parts and no more (Ruling II, folio 08): Artifact, Question, Scope, Impact, Authority, Confirmation"*), and the immutability sentence — *"You are approving edition {artifactVersion}, exactly as shown."* — is the best sentence in the whole approval surface. But the page's execution is a web form:

- The Impact step is a **three-column `<dl>`** of Cost / Schedule / Lead time rendering `+$4,200`, `+3 days`, `$0 — no cost change`. This is a spreadsheet row wearing serif type. Nothing here tells the homeowner what those numbers *do*, and it is the one moment where the homeowner is being asked to accept a consequence.
- The Confirmation step is **three radio buttons and a submit button**. The copy — *"Choose one outcome. Add questions or notes in Discussion below; comments do not submit an outcome."* — is a disambiguation notice, and it is doing the work that layout should do.
- The Authority step reads *"{completedReviewCount} of {requiredReviewCount} required reviews confirmed."* — an internal counter shown verbatim to a homeowner, in a system where discovery 02 §4 confirms the count is always 1 of 1.
- The review act **"I reviewed this exact edition"** is a legal attestation typed as a UI button, visually indistinguishable from "Post" on the comment box below it.

**`/proposals/[id]/sign`.** Discovery 02 §2C: a title, a subhead, a text input labelled **"Type your full name"** with helper copy *"Your typed name acts as your electronic signature."*, a required checkbox, and a submit button reading **"Sign authorization"** / **"Sign and authorize"** / **"Sign and accept"**. The one ceremonial gesture present — the name field is *"styled in the display/heading font so it visually reads as a signature"* — is the whole ceremony budget spent on a font swap. No rule to sign on, no date beside it, no letterhead above it, and no transition from the document it signs.

**The action bar.** Discovery 02 §6: `flex-col gap-4 sm:flex-row` and **not sticky**, so on mobile a homeowner scrolls a long agreement to the bottom to find *"Ask a question" / "Request a change" / "Decline" / "Sign document"* laid out as four peers. Declining and signing carry equal visual weight in the same row.

**`/decisions` and the header.** The list page groups into *"Project approvals (N)"*, *"Awaiting studio issue (N)"*, *"Overdue (N)"*, *"Awaiting Your Response (N)"*, *"Your Designer Is Handling (N)"*, *"History (N)"* — six parenthesised counters. That is a dashboard by any other name, and VISION §6 refuses dashboards. Above it, `ClientHeader` renders a numeric `CountBadge` with aria-label *"Approval tasks, {N} need attention"* — a badge, which VISION §6 refuses by name.

### 1.3 Where the visual language diverges

**Between the two systems, on the same surface.** Discovery 02 §9.5 names it: `/decisions` and `/proposals` are *"two separately-designed, separately-tested systems with overlapping vocabulary."* Concretely:

| | Project approval (Stage-2) | Proposal / commercial document |
|---|---|---|
| Act control | `ScoredAction` | plain buttons |
| Outcome mark | `GateStamp` (mocha seal / gold hold) | a status banner with a **green check icon** (*"Signed by {name} on {date}."*), or *"Fully executed on {date}."* |
| Ceremony | six named parts | one action bar |
| Inside The Making | announcement only — `ProjectApprovalGate` still hands off to legacy `/decisions/[id]` | fully inline on the spine |

The green check is a direct violation of VISION §6's refusal of red/green status, and it is the mark a homeowner sees at the single most important moment in the relationship.

**Between web and iOS.** Discovery 03 §6 is unambiguous: *"there is no dedicated 'stamp', 'receipt', 'seal', or 'scored ink' component in the design kit."* The iOS app marks a completed approval with the SF Symbol `checkmark.seal.fill` in exactly three places, plus a text banner (*"You've responded to this decision"*). Its acts are `PatinaButton` — a **52px full-width capsule with a filled background**, which is the precise thing I107 retired on the web. The two surfaces do not merely differ in polish; they are arguing opposite cases about what an action is.

Two further iOS divergences from the vision:

- `HouseRecord.state(for:now:)` (discovery 03 §2.1) reserves **red styling for `.overdue`**. Red status, refused.
- `BadgeCountService.attentionCount` drives a **tab badge**. Badges, refused. (Whether a tab bar belongs on the client app at all is a navigation-lane question; I only note that the badge is separable from the tab.)

**Between arrival and surface.** Discovery 02 §1A: the Stage-2 email carries **no link at all** — *"Open your Patina dashboard to review the options and pick one."* — and its very first send has the subject *"Reminder: '{title}' needs your decision"*. The ceremony begins with a reminder about something never seen, and ends at a URL the homeowner must type from memory. Everything designed below is downstream of that; the journey lane owns the fix, and this lane assumes it lands.

---

## 2. The design thesis

An approval in Patina should feel like **a letter that arrived from someone who knows your house** — a single sheet on warm paper, with a studio's name at the top, one question in the designer's own hand, the consequences written out in sentences a person would say aloud, a ruled line to sign on, and a stamp that settles into the paper and then stops moving forever. Not a task. Not a card in a queue. A piece of correspondence you could print, put in a drawer, and find in four years still legible about what you agreed to and why. Everything the system already knows how to do — the immutable edition, the SHA-256 checksum, the frozen authority, the trusted IP — is provenance, and provenance is Patina's native register: it should be *shown*, quietly, the way a maker's stamp is shown on the underside of a drawer, not hidden as compliance plumbing. **The one aesthetic risk I am choosing:** the letter arrives **closed**. On every surface, an approval's first frame is a folded sheet showing the studio's letterhead, the designer's name, and one line naming what waits — and the artifact is not visible until the homeowner unfolds it with a deliberate gesture. That is one extra action on a surface whose completion rate matters, and it will be measurable if it is wrong. I am taking it because the difference between a chore and an occasion is almost entirely whether you opened it, and because the unfold is also the honest place to record that the homeowner has *seen* the exact edition before they are asked to accept it.

---

## 3. "The Decision" — a shared ceremony grammar

Seven steps. The same seven on all three surfaces, in the same order, with the same names. A surface may compress a step into a line; no surface may skip one or reorder them.

### Step 1 — Arrival: the fold

**What it is.** The first frame of any approval, wherever it is first seen: a folded sheet. Letterhead band at the top (studio name, studio mark if one exists — `SendSheet` already resolves studio identity and logo per dispatch, discovery 04 §1.1.1), the designer's name in her own line, and one sentence in the standing-sentence voice naming what waits. The artifact, the money, and the outcome controls are all behind the fold.

**Layout.** Full-bleed on the paper stock, `--doc-paper` (#FCFAF6) on the `--color-off-white` (#FAF7F2) ground. A 1px `--doc-ink-border` hairline under the letterhead band. Below the fold line — a `--rule-mid` (1.5px `--color-charcoal`) horizontal rule with a 12px gap broken into it at the left, echoing the spine's square cut — sits the unfold act.

**Typography.** Studio name: Playfair Display 22px/1.2 in `--color-charcoal`. Eyebrow: DM Mono 11px uppercase `tracking-[0.18em]` in `--color-quiet-ink` — the kind line, e.g. `A LETTER FROM YOUR STUDIO`. The waiting line: Playfair Display italic 19px in `--text-body` (`--color-mocha`), max 52ch. Date: DM Mono 11px, `--text-subtle`.

**Palette.** No accent colour at arrival. Warmth comes from paper value only (`--doc-paper` over `--color-off-white`, 1.1:1) plus the charcoal rule. The one exception is the fold rule's left cap, which takes the phase ink `--phase-procurement` (#E8C547) at 60% — the same cap `SpineGate` already draws.

**Motion.** The unfold: the lower sheet grows from `scaleY(0)` with `transform-origin: top` over **520ms** on `--ease-editorial` (`cubic-bezier(0.22, 1, 0.36, 1)`), while the fold rule's weight drops from `--rule-mid` to `--rule-hair` over the same clock. Content beneath fades in over the last 220ms only — never staggered per element, which reads as a loading skeleton. **Reduced motion:** no unfold animation; the act still exists and still records the unfold, the sheet simply appears.

**Sound / haptic (iOS).** Haptic: yes — `HapticManager.shared.impact(.soft, intensity: 0.5)` at the moment the fold releases. Paper does not click; a soft impact is the closest tactile analogue and the kit already ships it as `companionPulse()`. **Sound: no, anywhere in this ceremony.** A homeowner may open this in bed at 11pm; a chime would make a private moment feel like a notification. This is a standing rule, not a per-step judgement.

**Per surface.**
- *Desktop web:* the fold is the top of `/decisions/[id]` and `/proposals/[id]`, 760px column centred (the width `ProposalDocument` already uses).
- *Mobile web:* identical, full width less 20px gutters; the unfold act is a 44px scored line, not a full-width bar.
- *Native iOS:* the fold is the top card of `DecisionDetailView` / `ProposalDetailView`, and — critically — the **NEEDS YOU row on the Record is the outside of the envelope**. Tapping the row opens the detail already unfolding, so the gesture is continuous.

```
┌─────────────────────────────────────────────────────┐
│  KOCHAVER DESIGN                                    │  Playfair 22 charcoal
│  ─────────────────────────────────────────────────  │  1px --doc-ink-border
│                                                     │
│  A LETTER FROM YOUR STUDIO · SEPTEMBER 3            │  DM Mono 11 --color-quiet-ink
│                                                     │
│  Leah has one question about the dining room        │  Playfair italic 19 --text-body
│  before the walnut goes on order.                   │
│                                                     │
│  ▬▬▬───────────────────────────  ──────────────────  │  --rule-mid, gap at left,
│      ▲ cap: --phase-procurement 60%                 │  square cap on the rule
│                                                     │
│      OPEN THE LETTER                                │  ScoredAction, primary
│      ═════════════                                  │  double score: charcoal/clay
└─────────────────────────────────────────────────────┘
```

### Step 2 — The artifact presented

**What it is.** The existing **Artifact** part, unchanged in substance: `approval.artifactTitle`, the edition, and the load-bearing sentence *"You are approving edition {artifactVersion}, exactly as shown."* What changes is that the artifact stops being a heading with metadata under it and becomes **a plate on the page** — a thumbnail or rendered preview of the plan issue, spec sheet, or budget checkpoint, set inside a 1px `--doc-ink-border` frame with 8px of `--doc-paper` margin inside the frame, like a mounted print.

**Typography.** Part legend `ARTIFACT` in DM Mono 11px uppercase `--color-quiet-ink`. Title in Playfair Display 24px `--color-charcoal`. Edition line in DM Mono 11px `--text-subtle`: `EDITION 3 · BUDGET CHECKPOINT · 3 SEPT`.

**Provenance mark.** The SHA-256 checksum already travels in the email body (discovery 01 §A.3). Print it here too, as a maker's mark rather than a compliance string: DM Mono 10px `--text-faint`, first 12 characters, prefixed `CHECKSUM`, on the frame's bottom-left outside edge. Its presence is the point, and it is what makes the keepsake (§5) credible.

**Palette.** Frame `--doc-ink-border`. No fill, no shadow (D4 holds).

**Motion.** None. The artifact is already there when the fold opens.

**Per surface.** Desktop: plate at 100% column width. Mobile web and iOS: same, edge-to-edge less gutters; the budget breakdown (currently a per-room, per-category table) collapses to the three totals with a scored `SEE THE ROOMS` disclosure.

### Step 3 — The ask, in the designer's voice

**What it is.** The **Question** part. Today it is the page's `<h1>`, rendered verbatim, which is correct and should stay the `<h1>`. What is missing is attribution: the homeowner is answering a person, and the page never says whose question it is.

**Layout.** The question sits alone with 32px above and 24px below, indented 24px from the artifact plate's left edge, with a 2px vertical rule in `--color-clay` running its full height at the indent — a pull-quote, in the one place on the page that earns one.

**Typography.** Playfair Display 28px/1.35 `--color-charcoal`, max 34ch. Beneath it, right-aligned to the question block: `— Leah` in Playfair Display italic 15px `--text-body`. The **Scope** note (`approval.context`) follows in Inter 15px/1.6 `--text-body`, `whitespace-pre-wrap` preserved, under a DM Mono legend `WHAT THIS COVERS` — a plainer word than "Scope" for the person reading it (the copy lane owns final wording).

**Motion.** None.

**Per surface.** Identical everywhere; the type scale drops to 24px on mobile web and `PatinaTypography.h3` (24pt Playfair) on iOS.

```
┌─────────────────────────────────────────────────────┐
│  ARTIFACT                                           │  DM Mono 11 caps
│  ┌───────────────────────────────────────────────┐  │
│  │                                               │  │  1px --doc-ink-border
│  │        [ plan issue / budget plate ]          │  │  8px --doc-paper inset
│  │                                               │  │
│  └───────────────────────────────────────────────┘  │
│  CHECKSUM 4f9c2ab17e03                              │  DM Mono 10 --text-faint
│                                                     │
│  Dining room budget · Edition 3                     │  Playfair 24 charcoal
│  You are approving edition 3, exactly as shown.     │  Inter 14 --text-muted
│                                                     │
│  ┃  Do we hold the walnut table at $8,400, or       │  Playfair 28, 2px --color-clay rule
│  ┃  step down to the ash at $5,900?                 │
│  ┃                                       — Leah     │  Playfair italic 15
│                                                     │
│  WHAT THIS COVERS                                   │  DM Mono 11 caps
│  This releases the dining order only. Lighting      │  Inter 15/1.6 --text-body
│  stays open until the fixture walk next week.       │
└─────────────────────────────────────────────────────┘
```

### Step 4 — The weighing

**What it is.** The **Impact** part, rewritten from a three-column `<dl>` into **one sentence plus one ledger line**. The rule from `project-approval-model.ts` survives intact — *"A zero delta is stored evidence, so it is stated rather than omitted"* — but a zero is stated in words.

**The sentence** is composed the way `standing-sentence.ts` composes the masthead: pure, from real values only, never invented. Shape:

> `Saying yes adds four thousand two hundred dollars and three days. Lead time does not move.`

Rules carried over from the standing sentence: present tense, second person where a person appears, counts under twelve spelled out, money in whole dollars, and nothing reported as zero — a delta of zero becomes *"does not move"*, never *"$0"*. Three zero deltas collapse to one clause: *"Nothing about the money or the dates moves."*

**The ledger line** sits under the sentence in DM Mono 11px `--text-subtle`, signed and exact, for the homeowner who wants the figures: `COST +$4,200 · SCHEDULE +3 DAYS · LEAD TIME UNCHANGED`. Sentence for feeling, ledger for fact; both from the same three integers.

**Palette.** No colour encodes direction. A positive cost delta is not terracotta and a negative one is not sage — that is red/green by another route. Both are `--text-subtle`. The *sentence* carries the meaning.

**Motion.** None.

**Per surface.** Identical. On iOS the sentence is `PatinaTypography.patinaVoice` (18pt Playfair italic) — the app already reserves that face for "Patina's voice," which is exactly right here — and the ledger is `MonoLabel` at `PatinaTypography.monoLabel`.

### Step 5 — The act

**What it is.** The **Confirmation** part, and on the proposal rail the sign page. Full treatment in §4. In the grammar: this is the only place on the page where more than one thing can be chosen, and it is drawn as **a ruled line to sign on**, never as a form.

**Layout (choice — project approvals).** Three outcomes stacked, each a full-width row with a 44px minimum height (already enforced at `project-approval-review.tsx:415`), separated by `--rule-hair`. Each row: the outcome word in Playfair Display 18px, its one-line meaning in Inter 14px `--text-muted` beneath, and — on the left, in the 24px gutter — an **empty ruled box, 14px square, 1.5px `--color-charcoal`**, which fills with a hand-drawn tick in `--color-mocha` when chosen. Not a radio dot. A checkbox on paper. The three meanings stay exactly as written today (*"Accept this exact artifact and its stated impacts."* etc.). The commit act sits below, as a scored press (§4).

**Layout (signature — proposals).** A ruled signature line: a 1px `--color-charcoal` rule 320px wide with the typed name sitting *on* it in Playfair Display 26px `--color-charcoal`, the date printed in DM Mono 11px at the rule's right end, and `--text-faint` DM Mono under the rule reading `YOUR TYPED NAME IS YOUR SIGNATURE`. The consent checkbox uses the same 14px ruled box. The commit act is a scored press.

**Motion.** The tick draws in over 180ms on `--ease-editorial`. The typed name does not animate. **Reduced motion:** tick appears.

**Haptic (iOS).** `impact(.light)` on each choice change (`selectionChanged()` is too mechanical for a decision of this weight); `thresholdCrossed()` at the completion of the press-and-hold.

```
┌─────────────────────────────────────────────────────┐
│  YOUR ANSWER                                        │  DM Mono 11 caps
│                                                     │
│  ▣  Approved                                        │  14px ruled box, mocha tick
│     Accept this exact artifact and its stated       │  Inter 14 --text-muted
│     impacts.                                        │
│  ─────────────────────────────────────────────────  │  --rule-hair
│  ▢  Changes requested                               │
│     Return this edition for revision and a new      │
│     approval request.                               │
│  ─────────────────────────────────────────────────  │
│  ▢  Needs discussion                                │
│     Hold the gate while you and your designer       │
│     talk it through.                                │
│                                                     │
│      PRESS AND HOLD TO RECORD                       │  ScoredPress, primary
│      ══════════════════════                         │  scoring fills L→R as held
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  SIGN HERE                                          │  DM Mono 11 caps
│                                                     │
│      Margaret Whitfield                             │  Playfair 26 charcoal
│  ______________________________     3 SEPT 2026     │  1px charcoal rule · DM Mono 11
│  YOUR TYPED NAME IS YOUR SIGNATURE                  │  DM Mono 10 --text-faint
│                                                     │
│  ▣  I authorize the studio to procure only the      │  14px ruled box
│     named lines at the quantities and client        │  Inter 14 --text-body
│     prices shown.                                   │
│                                                     │
│      PRESS AND HOLD TO SIGN                         │  ScoredPress, primary
│      ═══════════════════                            │
└─────────────────────────────────────────────────────┘
```

### Step 6 — The seal

**What it is.** The stamp lands, and the page becomes a record. Full system in §5. In the grammar: the act row is **replaced in place** by the stamp and one sentence — never a toast, never a redirect, never a modal. R83's ruling on the designer side (a failure is a quiet inline band at the act site) applies to success too.

**Layout.** The stamp sits where the act was, left-aligned, with the recorded line beside it: `Approved · 3 September 2026`. Under it, in DM Mono 11px `--text-faint`, the evidence line: `RECORDED 3 SEPT 2026, 3:12 PM · ELECTRONIC SIGNATURE`. Beneath that, one scored tertiary act: `KEEP A COPY` → the record page (§5).

**Motion.** `gate-seal-settle` as it exists today: 420ms on `--ease-editorial`, `scale(0.92) rotate(0deg)` → `scale(1) rotate(-2deg)`, opacity 0 → 1. It plays **only when the outcome was recorded in this session** — never on revisit. This mirrors the discipline `ProposalDetailStatusIconTests` already enforces on iOS (the seal glyph appears only with a real signature record). **Reduced motion:** the stamp is present at final transform, no animation.

**Haptic (iOS).** `HapticManager.shared.notification(.success)` — the single strongest haptic in the whole ceremony, spent exactly once, at the seal. Nowhere else.

### Step 7 — The afterglow

**What it is.** The consequence, shown immediately, in the place the homeowner already understands: **the line resumes**. On The Making the gate's break closes — the resume cap thickens from 3px at 50% ink to the full 5px at 100% ink — and the standing sentence recomposes without the clause that named this paper. That is the reward, and it is the honest one: the thing you did unblocked the thing you were waiting for.

**Layout / copy.** One line under the seal, composed from real downstream state only, in the caption voice `SpineGate` already uses (Playfair italic 15px `--text-body`): *"Three pieces order the moment the studio places them."* If no honest consequence exists, the line is silent — `SpineGate`'s own rule: *"Everything else stays silent rather than inventing a consequence."*

**Motion.** The spine resume draws over `--duration-editorial` (700ms), left cap first. **Reduced motion:** resumed line present, no draw.

```
The Making spine — before and after
───────────────────────────────────

BEFORE                                AFTER
   │                                     │
   │  Sept 1 · the walnut arrives        │  Sept 1 · the walnut arrives
   │                                     │
▬▬▬┼───────────────────────────       ───┼───  (line unbroken)
   │  A GATE · THE LINE STOPS            │
   │  UNTIL YOU SIGN                     │   ┌───────────┐
   │  Furnishings authorization No. 7    │   │ APPROVED  │  GateStamp, seal, -2°
   │  Furnishings authorization ·        │   └───────────┘  --color-mocha
   │  $12,500                            │   Approved · 3 September 2026
   │  Two thousand five hundred          │   RECORDED 3:12 PM · ELECTRONIC SIGNATURE
   │  dollars on signing                 │
   │                                     │   Three pieces order the moment
   │  Three pieces order the moment      │   the studio places them.
   │  you sign.                          │
   │                                     │      KEEP A COPY
   │      SIGN                           │      ────────
 ──┼──  (thin, 50% ink)                  │
   │                                     │
```

```
iOS Record — the signed state
─────────────────────────────

┌───────────────────────────────────┐
│  NEEDS YOU                        │   before: MonoLabel eyebrow
│  Leah asked about the dining       │
│  room budget.            Due Fri  │
└───────────────────────────────────┘

              ↓  after the seal

┌───────────────────────────────────┐
│  MOVED                            │   the row crosses the eyebrow
│  ┌──────────┐                      │
│  │ APPROVED │  You approved the    │   PatinaStamp, seal, -2°
│  └──────────┘  dining room budget. │   PatinaColors.mocha
│                3 SEPT              │   MonoLabel --text-faint
└───────────────────────────────────┘
```

---

## 4. Signature as an act

### The evidence constraint, first

Discovery 04 §1.5 fixes the vocabulary: `client_consent_method` is `NULL | 'electronic_signature' | 'click_through' | 'paper'`, and `client_signature` is **text**. Discovery 04 §1.5 also pins `project_decision_review_confirmations.review_method` with a CHECK of exactly `'portal_clickthrough'`. Discovery 02 §3 confirms the strongest evidence Patina holds is not the gesture at all — it is the **server-derived trusted IP**, captured by `resolveClientIp` and passed only to the service-role `*_with_trusted_ip` RPCs, closing the hole migration 00400 was written to close.

Two consequences. First: **no gesture change can improve the evidence**, so a gesture should be chosen for meaning, not for law. Second: **a drawn signature makes the evidence worse.** There is no `PKCanvasView` in the client app (discovery 03 §6), no column to hold an image, and a finger-scrawl on glass is both less identifying than a typed legal name and unprintable at keepsake quality. I recommend against drawn signatures on every surface, permanently.

### Recommendation per surface

| Surface | Act | Evidence written | Why |
|---|---|---|---|
| Desktop web — `/proposals/[id]/sign` | **Typed name on a ruled line**, then a scored press to commit | `signedByName` + consent checkbox + trusted IP → `electronic_signature` | Keyboard is the native instrument. The typed name in Playfair on a rule already reads as a signature; the ceremony is in the paper around it, not in the input. |
| Mobile web — same route | **Typed name**, field docked above the keyboard; scored press to commit | same | A drawn signature on mobile Safari is the worst of both worlds — no pressure data, no palm rejection, and it competes with page scroll. |
| Native iOS — `ProposalSignSheet` | **Typed name + scored press-and-hold** | same (`sign_proposal` RPC) | The hold is the commitment gesture; the name remains the legal signature. `DecisionConsentValidationTests` pins the sheet to the RPC contract, so the field cannot change — but nothing pins the button. |
| Native iOS — `DecisionConsentSheet` | **Typed name + scored press-and-hold** when the decision requires e-signature; **scored press-and-hold alone** when it is click-through | `electronic_signature` or `click_through` | The sheet already branches on consent method; the gesture should branch with it. |
| Project approval — review confirmation (**"I reviewed this exact edition"**) | **Scored press-and-hold**, all surfaces | `review_method: 'portal_clickthrough'` — **unchanged**, no migration | A hold is still a click-through. This is the strongest argument for the press: an attestation should cost more than a tap, and here it costs nothing schema-side. |
| Project approval — the response (`Approved` / `Changes requested` / `Needs discussion`) | **Ruled tick + scored press-and-hold** | outcome only — `respond_project_approval` captures no name | Asking a homeowner to type her name to say "needs discussion" would be theatre. The choice is the act; the hold is the commitment. |
| Paper original (`record_offline_signature`) | Not a client act at all | `paper` | Studio-side. It surfaces on the client side only as a stamp (§5). |

### "Scored Ink" for iOS — the `ScoredPress` component

The web's Scored Ink has no iOS counterpart (discovery 03 §6). This is the port, and it is the one new primitive this lane asks for.

**Form.** A DM Mono uppercase word — `PatinaTypography.monoLabel` at 10pt is too small for a primary act, so **12pt DM Mono Medium, tracking 1.2** — sitting above its scoring. Primary: two rules beneath, 1.5px `PatinaColors.charcoal` at 4pt below the baseline box and 1px `PatinaColors.clay` at 7.5pt, matching `.da-primary`'s `::before`/`::after` offsets exactly. Secondary: one 1px rule at 28% charcoal. No capsule, no fill, no background — this replaces `PatinaButton`'s 52px filled capsule at approval act sites only, not app-wide.

**Target.** A 44pt minimum `contentShape(Rectangle())` around the word, invisible, exactly as `.da-act` owns the honest box while `.da-hit` witnesses it.

**The ink.** On touch-down, an ink pool fills from the contact point: a `Circle()` in `PatinaColors.charcoal` inside a `.mask()`, scaled from 0 to full over 260ms with `.timingCurve(0.22, 1, 0.36, 1)` — the Swift spelling of `--ease-editorial`. The word inverts to `PatinaColors.Text.inverse` as the pool passes it; the clay score stays legible on top of the charcoal flood, which is the whole argument of I107's stacking.

**The hold.** Reuse `HoldableModifier` (`apps/mobile/Patina/Patina/Design/Gestures/HoldGesture.swift`) at `duration: 1.2` — long enough to be deliberate, short enough not to feel punitive. Progress drives the *scoring*, not a progress bar: the 1.5px charcoal rule fills left-to-right as the hold advances, so the act is literally being scored under the word. Completion at 100%.

**Haptics.** `impact(.light)` at touch-down (already `PatinaButton`'s behaviour, kept for continuity), `thresholdCrossed()` — `impact(.medium, intensity: 0.7)` — at completion, `notification(.success)` at the seal in step 6. No haptic on cancel.

**Accessibility.** `HoldableModifier` already ships the correct fallback: a VoiceOver-visible `accessibilityAction(named: "Activate")` and a tap path that completes immediately, with `accessibilityValue` reporting percent. That is the pattern; the new component must not lose it. Under `\.accessibilityReduceMotion`: no bead, no travel, instant flood, and the hold duration drops to 0 (a single tap commits) — a motion preference should never impose a longer physical gesture.

---

## 5. Stamps, seals, receipts

### One grammar, ten states

Everything below is one component with four dials: **border weight** (single / doubled), **border pigment**, **word ink**, **rotation** (−2° stamped here / 0° not stamped here). No fills in the client stamp system — the designer portal's filled `--fill-*-tint` variants stay designer-side, where a dense FF&E table needs them. No badges. No red/green pair anywhere: `--color-terracotta-ink` appears exactly once (Declined) and never opposite a sage counterpart, so no traffic-light reading is available.

| State | Border | Word ink | Weight | Rot. | Extra |
|---|---|---|---|---|---|
| **Awaiting you** | *no stamp* | — | — | — | The gate break **is** the state. Away from the spine (a list, the Record), draw an outline in `--color-golden-hour-ink` with a `--color-charcoal` word, **upright at 0°** — deliberately not yet stamped. |
| **Approved** | `--color-mocha` | `--color-mocha` | doubled | −2° | settles once |
| **Signed** | `--color-mocha` | `--color-mocha` | doubled | −2° | signer's name in Playfair 15px beneath the stamp |
| **Paper-signed** | `--color-mocha` | `--color-mocha` | doubled | **0°** | second mono line `ON PAPER` inside the double rule; upright because it was not stamped on this surface |
| **Needs discussion** (recorded as *Held for discussion*) | `--color-golden-hour-ink` | `--color-charcoal` | doubled | −2° | as loud as the seal, per M8 |
| **Changes requested** | `--color-clay-ink` | `--color-charcoal` | **single** | −2° | single rule = not terminal |
| **Declined** | `--color-terracotta-ink` | `--color-charcoal` | single | −2° | — |
| **Withdrawn** | `--text-subtle` | `--text-muted` | single | 0° | 1px `--text-muted` strike through the word |
| **Superseded** | `--text-subtle` | `--text-muted` | single | 0° | mono tie-line beneath: `→ EDITION 4` |
| **Expired** | `--text-subtle` | `--text-muted` | single | 0° | date printed in mono beneath |

Two changes from what ships today, both deliberate:

1. **`GateStamp`'s `hold` variant moves from `--color-gold` to `--color-golden-hour-ink` (#79651E).** The existing token was added for this one caller and pairs a light gold border with a charcoal word; the `-ink` companion is the same hue at 5.45:1 on paper and makes the border readable as a mark rather than a wash. `--color-charcoal` word is unchanged.
2. **`SIGNED` moves from `--color-sage` to `--color-mocha`.** Today the designer-side `SignedSeal` stamps SIGNED in sage while the client-side `GateStamp` seals in mocha — two pigments for one meaning across the table. Worse, sage is a green, and a green mark on the single most consequential state is exactly the read VISION §6 refuses. Mocha is the ink of a signed hand and is already the client seal. Sage stays a material pigment (walkthrough phase, delivered goods) and stops carrying approval meaning.

### How they age

A stamp settles **once** and then stops. Three rules:

1. **`gate-seal-settle` plays only on the session in which the outcome was recorded.** On every later visit the stamp is simply present. A stamp that re-animates on each page load is a badge pretending to be paper.
2. **One aging step, at 30 days.** Outer border opacity 0.88 → 0.74; the inner doubled rule 0.42 → 0.26; the word ink unchanged (legibility never degrades). One new token, `--stamp-aged: 0.74`, and one derived inner value. Nothing ages further, ever — patina settles, it does not fade to nothing.
3. **Terminal states age; open states do not.** Approved, Signed, Paper-signed, Declined, Withdrawn, Superseded and Expired age. Awaiting you, Changes requested and Needs discussion stay at full ink no matter how old, because they are still asking something.

### The keepsake — "The Record of Decision"

A single printable sheet a homeowner would actually keep. Route `/decisions/[id]/record` and `/proposals/[id]/record`; on iOS a `ShareLink` over an `ImageRenderer` PDF of the same layout. It reuses the print classes `ProposalDocument` already carries (`proposal-print-area` / `proposal-print-hide`, discovery 02 §2B) and should eventually replace the current "Download PDF" button, which is a bare `window.print()` of the whole page and, per discovery 02 §9.9, may not produce a savable file at all on some mobile browsers.

```
┌───────────────────────────────────────────────────────────┐
│                                                           │
│              KOCHAVER DESIGN · MADISON, WI                │  DM Mono 11 caps, centred
│                                                           │
│                  Record of Decision                       │  Playfair 32 charcoal
│                                                           │
│  ═════════════════════════════════════════════════════    │  --rule-strong
│                                                           │
│  THE ARTIFACT                                             │  DM Mono 11
│  Dining room budget · Edition 3 · budget checkpoint       │  Inter 15
│  Checksum 4f9c2ab17e03d5b8…                               │  DM Mono 10 --text-faint
│                                                           │
│  THE QUESTION                                             │
│  Do we hold the walnut table at $8,400, or step down      │  Playfair 20
│  to the ash at $5,900?                          — Leah    │
│                                                           │
│  THE WEIGHING                                             │
│  Saying yes adds four thousand two hundred dollars        │  Playfair italic 17
│  and three days. Lead time does not move.                 │
│  COST +$4,200 · SCHEDULE +3 DAYS · LEAD TIME UNCHANGED    │  DM Mono 11 --text-subtle
│                                                           │
│  ─────────────────────────────────────────────────────    │  --rule-hair
│                                                           │
│  ┌──────────┐    Margaret Whitfield                       │  stamp + Playfair 24
│  │ APPROVED │    ______________________  3 SEPT 2026      │  1px charcoal rule
│  └──────────┘                                             │
│                                                           │
│  Recorded 3 September 2026 at 3:12 PM Central, by          │  Inter 13 --text-muted
│  electronic signature, from a device in Madison, WI.       │
│                                                           │
│  ─────────────────────────────────────────────────────    │
│  Patina · one living record of one engagement             │  DM Mono 10 --text-faint
└───────────────────────────────────────────────────────────┘
```

Two notes. The consent method is written **in a sentence** — *"by electronic signature"* / *"from a signed paper original, recorded by the studio"* / *"by click-through confirmation"* — never as the raw enum. And the IP is never printed; the city derived from it is enough for a keepsake, and printing an IP address on a document a homeowner may share is a privacy mistake the legal record does not need.

---

## 6. Component inventory

| Component | Surfaces | Extends / new | Props & states | Accessibility |
|---|---|---|---|---|
| **`ArrivalFold`** | desktop web, mobile web | **new** (client-portal `making/`) | `studioName`, `studioLogoUrl?`, `designerName`, `waitingLine`, `dateLine`, `onUnfold`, `defaultOpen` | The unfold act is a real `<button>` with `aria-expanded`; the sheet is `aria-hidden` while folded so SR users are not read hidden content. Content is in DOM order, so a screen-reader user who expands hears the letter top to bottom. Unfold respects `prefers-reduced-motion`. |
| **`ArtifactPlate`** | all three | **new**; wraps existing artifact fields | `title`, `kindLabel`, `version`, `checksum`, `previewUrl?`, `fallback` | Preview `img` gets `alt` naming the artifact and edition, never "image". Checksum is `aria-hidden` decorative provenance; the accessible name carries edition instead. |
| **`TheAsk`** | all three | **new** | `question`, `attribution`, `context?` | Stays the page `<h1>` with `aria-labelledby="project-approval-question"` — the existing contract is preserved exactly. Attribution is inside the heading's labelled region, not a separate landmark. |
| **`WeighingLine`** | all three | **new**; replaces the Impact `<dl>` | `costCentsDelta`, `scheduleDaysDelta`, `leadTimeDaysDelta` → sentence + ledger | Sentence and ledger are one `<p>` pair, not a table — a three-cell `<dl>` read aloud is three orphan fragments. Ledger uses `·` separators with `aria-hidden` on the dots. |
| **`RuledChoice`** | all three | **new**; replaces the outcome radios | `options[]`, `value`, `onChange`, `disabled` | A real `radiogroup` with real `input[type=radio]` visually replaced by the ruled box — never `div role=radio`. Keeps `min-h-11`. Focus-visible: the clay proofreader's caret `‸` before the word, per I107's focus ruling, not a browser ring. Contrast: `--color-charcoal` box on `--doc-paper` = 12.6:1. |
| **`SignatureLine`** | desktop web, mobile web | extends today's sign-page input | `value`, `onChange`, `placeholder`, `dateLabel`, `helperText` | Keeps `autoComplete="name"`, `required`, `minLength=2`. The rule is `border-bottom` on the input itself so it never detaches from the field. Helper text wired via `aria-describedby`. Playfair at 26px is above every large-text threshold. |
| **`ScoredAction`** | desktop web, mobile web | **existing**, unchanged | — | Already correct. Reused for every act on both approval rails, replacing the plain buttons on `/proposals/*`. |
| **`ScoredPress`** | all three | **new** (web: wraps `ScoredAction`; iOS: new, wraps `HoldableModifier`) | `label`, `holdMs = 1200`, `onComplete`, `loading`, `loadingLabel`, `variant` | Web: `aria-describedby` says "press and hold to record"; `Enter`/`Space` complete immediately (a keyboard user cannot hold meaningfully). iOS: inherits `HoldableModifier`'s `accessibilityAction(named: "Activate")` and `accessibilityValue` percent. Reduced motion → hold collapses to a tap. VoiceOver label: "Record your answer, approved" — the *outcome* is in the label, not just the verb. |
| **`PatinaStamp`** | all three | web: extends `GateStamp`; iOS: **new**, ports it | `label`, `state` (the ten of §5), `settle`, `aged`, `sublabel?` | Currently `aria-hidden="true"` with the meaning carried by adjacent text — **keep that**, it is right. The stamp is decoration over a sentence, and duplicating it would read the state twice. Every combination clears 4.5:1 on `--doc-paper`, `--color-off-white` and white. Rotation is `transform` only, never `writing-mode`, so text remains selectable and translatable. |
| **`RecordOfDecision`** | all three | **new**; reuses `proposal-print-area` / `proposal-print-hide` | `decision \| proposal`, `outcome`, `signer?`, `recordedAt`, `consentMethod`, `checksum` | A single `<article>` with real headings; the print stylesheet is the only styling that changes between screen and paper. `@media print` forces `--doc-paper` to white and drops all rotation to 0° (a tilted stamp on a laser printer reads as a misfeed). |
| **`SpineResume`** | web (The Making) | extends `SpineGate` | `accent`, `resumed` | Purely decorative rules, already `aria-hidden` in `SpineGate`. The state change is announced by the seal's `role="status"` line, not by the rule. |
| **`HouseRecordStampRow`** | iOS | extends `HouseRecordRow` | adds `stamp: PatinaStamp?` to a MOVED row | VoiceOver reads the row's sentence; the stamp is `.accessibilityHidden(true)`. Removes the `.overdue` red styling in favour of weight and the `Awaiting you` upright stamp. |

Cross-cutting accessibility rules for this system:

- **Contrast floor 4.5:1** on every ink, on all three paper stocks (`--doc-paper`, `--color-off-white`, white). All `-ink` tokens used above are already measured for this in `globals.css`; `--color-gold` is not, which is why §5 moves the hold stamp to `--color-golden-hour-ink`.
- **44px/44pt targets** everywhere, invisible where the visual is a scored word.
- **Focus is a caret, not a ring** — the clay `‸` from I107, on every act in this ceremony, so focus reads as proofreading rather than as browser chrome.
- **No motion is required to understand any state.** Every animated transition has a still terminal frame that carries the full meaning.

---

## 7. Proposals

**P1 · The letter arrives closed**
*Surfaces:* desktop web, mobile web, iOS.
*What changes:* `ArrivalFold` becomes the first frame of `/decisions/[id]`, `/proposals/[id]`, `DecisionDetailView` and `ProposalDetailView`. Studio letterhead, designer's name, one waiting sentence, one unfold act.
*Why it delights:* it converts a task into correspondence, and it gives the designer's studio its name on the page at the moment the homeowner is most attentive.
*Sketch:* §3 step 1.
*Dependencies:* `project-approval-review.tsx`, `proposals/[id]/page.tsx`, `SendSheet`'s existing per-dispatch studio identity/logo snapshot (discovery 04 §1.1.1).
*Effort:* M. *Risk:* one extra act on a completion-critical flow — flag it and measure. No vision refusal.

**P2 · The weighing becomes a sentence**
*Surfaces:* all three.
*What changes:* the three-column Impact `<dl>` becomes `WeighingLine` — one standing-sentence-voice sentence plus one mono ledger line.
*Why it delights:* it is the difference between reading a variance report and being told what happens if you say yes.
*Sketch:* §3 step 4.
*Dependencies:* `project-approval-review.tsx` §5 Impact block, `formatMoneyDelta`/`formatDayDelta`, the composition rules in `making/standing-sentence.ts`.
*Effort:* M (the composer is pure and unit-testable, like `standing-sentence.test.ts`). *Risk:* none; the "zero is stated, never omitted" rule is preserved.

**P3 · The ask gets a hand**
*Surfaces:* all three.
*What changes:* the question becomes a pull-quote with a `--color-clay` rule and `— {designer first name}` attribution.
*Why it delights:* the homeowner is answering a person she knows, and today the page never says so.
*Sketch:* §3 step 3.
*Dependencies:* `project-approval-review.tsx` Question block; the designer's name already resolves for the Record row copy on iOS (`HouseRecordBuilder.title(for:)`).
*Effort:* S. *Risk:* none.

**P4 · Press and hold to record**
*Surfaces:* all three.
*What changes:* `ScoredPress` replaces the tap on "I reviewed this exact edition", "Submit response", and every sign submit. iOS gains the component; web wraps `ScoredAction`.
*Why it delights:* the weight of the gesture matches the weight of the act, and the scoring filling under the word as you hold is the most Patina interaction in the product.
*Sketch:* §3 step 5, §4.
*Dependencies:* `scored-action.tsx`, `globals.css` I107 block, `HoldGesture.swift` (`HoldableModifier`, which already ships the VoiceOver fallback), `HapticManager`.
*Effort:* M web / L iOS. *Risk:* none — `review_method: 'portal_clickthrough'` is unchanged, so no migration.

**P5 · SIGNED comes home to mocha; the hold stamp gets a readable ink**
*Surfaces:* all three, plus the designer portal's `SignedSeal`.
*What changes:* `SIGNED` moves `--color-sage` → `--color-mocha`; `GateStamp`'s `hold` border moves `--color-gold` → `--color-golden-hour-ink`.
*Why it delights:* one pigment for one meaning on both sides of the table, and it removes the last green from the approval ceremony.
*Sketch:* §5 table.
*Dependencies:* `gate-stamp.tsx`, `proposal-watch.tsx` `SignedSeal`, `proposal-watch-derivation.ts` `deriveStamp`.
*Effort:* S. *Risk:* **closes** a vision refusal (red/green status). Needs Leah's eye on the mocha SIGNED against the designer-portal ground.

**P6 · Ten states, one stamp**
*Surfaces:* all three.
*What changes:* `PatinaStamp` implements the full ten-state table, including the aging step; `checkmark.seal.fill` and the green check on `/proposals/[id]` are both retired.
*Why it delights:* every terminal state finally looks like it belongs to the same office, and a signed stamp looks settled rather than celebratory.
*Sketch:* §5.
*Dependencies:* `gate-stamp.tsx`, `commercial-document-shell.tsx` state banners, `proposals/[id]/page.tsx:182-252`, `ProposalDetailView.statusIcon(for:justSigned:)`, `ProposalStatusDisplay.swift`.
*Effort:* M. *Risk:* `ProposalDetailStatusIconTests` pins the current icon rule — the test's *intent* (a seal only with a real signature record) must survive the swap.

**P7 · The Record of Decision**
*Surfaces:* all three.
*What changes:* a printable one-sheet keepsake, and a scored `KEEP A COPY` act at the seal. Replaces the raw `window.print()` "Download PDF".
*Why it delights:* it is the only artifact in the product a homeowner might put in a drawer, and it makes the checksum and the frozen edition feel like provenance rather than paperwork.
*Sketch:* §5.
*Dependencies:* print classes on `ProposalDocument`, `project_approval_artifacts` (title/version/hash), `client_consent_method`, `SignatureLedger`.
*Effort:* M web / M iOS (`ImageRenderer` → `ShareLink`). *Risk:* none. Do **not** print the IP.

**P8 · The line resumes**
*Surfaces:* web (The Making), iOS Record.
*What changes:* after an outcome, the gate's break closes with a 700ms draw, the standing sentence recomposes, and the afterglow caption prints only when real downstream state supports it. On iOS the row crosses from NEEDS YOU to MOVED carrying its stamp.
*Why it delights:* the reward for deciding is seeing the thing you unblocked.
*Sketch:* §3 step 7.
*Dependencies:* `spine-gate.tsx`, `the-making.tsx`, `standing-sentence.ts`, `HouseRecord.swift` / `HouseRecordBuilder`.
*Effort:* M. *Risk:* captions must stay silent when no honest consequence exists — `SpineGate`'s existing rule.

**P9 · The gate ceremony comes inside The Making**
*Surfaces:* web.
*What changes:* `ProjectApprovalGate` stops handing off to legacy `/decisions/[id]` and hosts the seven-step ceremony inline on the spine, the way signature gates already do.
*Why it delights:* it removes the one place where the single pane stops being single, and it is the inconsistency discovery 02 §9.5 calls out inside the flagged surface itself.
*Sketch:* the spine wireframe in §3 step 7, with steps 2–6 in the break.
*Dependencies:* `the-making.tsx:274-319`, `ProjectApprovalReview`, `use-project-approvals.ts`.
*Effort:* L. *Risk:* none doctrinally; it is the surface delivering on its own thesis. Gate behind `single-pane`, which already fails closed.

**P10 · Retire the count badges**
*Surfaces:* web header, iOS tab.
*What changes:* `ClientHeader`'s numeric `CountBadge` becomes a typographic mark — the nav word set in `--color-charcoal` with a 1.5px clay under-score when something waits, no number. iOS `BadgeCountService` stops setting the tab badge; the Record's NEEDS YOU eyebrow already carries the truth.
*Why it delights:* it stops the product counting chores at a homeowner, which is what VISION §6 refuses and §4 promises against.
*Sketch:* the scored word, exactly `.da-secondary`'s single hairline.
*Dependencies:* `app-chrome.tsx:60-84`, `client-header.tsx:124-129`, `BadgeCountService.swift:73`.
*Effort:* S. *Risk:* **closes** a vision refusal. Kody may want the iOS springboard badge kept for re-engagement — that is an open ruling (§8).

**P11 · The action bar stops treating decline as a peer**
*Surfaces:* desktop web, mobile web.
*What changes:* on `/proposals/[id]`, the four acts re-rank: `Sign` as scored primary, `Ask a question` as secondary, `Request a change` and `Decline` as tertiary (unscored until asked, per I107). On mobile the primary act docks to a 48px row — the pattern the designer portal already uses — so a long agreement no longer hides its own act.
*Why it delights:* the page stops asking "which of these four" and starts asking one thing, with the others available.
*Sketch:* the tertiary/secondary/primary ladder is already drawn in `globals.css`.
*Dependencies:* `proposals/[id]/page.tsx:277-318`, `scored-action.tsx`.
*Effort:* S. *Risk:* none. Decline must remain reachable without scrolling — tertiary, not hidden.

**P12 · Red leaves the Record**
*Surfaces:* iOS.
*What changes:* `HouseRecord`'s `.overdue` red styling is replaced by the upright `Awaiting you` stamp plus a mono `OVERDUE SINCE 28 AUG` line in `--text-subtle`; the row's weight, not its hue, carries urgency.
*Why it delights:* overdue stops feeling like an error state and starts reading like a note in the margin.
*Sketch:* §3 iOS Record wireframe.
*Dependencies:* `HouseRecord.swift:440-452`, `HouseRecordRow`.
*Effort:* S. *Risk:* **closes** a vision refusal. Needs the copy lane's wording for the overdue line.

---

## 8. Open rulings for Kody & Leah

**R-C1 · The closed letter.** Is one deliberate unfold worth the completion-rate risk on a surface where an unanswered approval blocks a phase? This lane says yes and would ship it behind a flag with the unfold recorded as an event; the journey lane may disagree. *Kody to rule; measure before widening.*

**R-C2 · SIGNED in mocha.** Moving the designer-side `SIGNED` seal off sage removes the last green from the ceremony but changes a mark Leah has been looking at for months. *Leah's eye required, on the designer portal ground and on paper.*

**R-C3 · Does terracotta survive as Declined?** The refusal is red/green *status coding*, and terracotta at 1.5px with no sage counterpart is a warm clay pigment, not a red light. But a homeowner may not read the distinction. Alternative: Declined takes the muted grammar (`--text-subtle`) like Withdrawn. *Leah to rule.*

**R-C4 · Drawn signatures, ruled out permanently?** §4 recommends never building finger-drawn signature capture, on evidence and craft grounds. This is the sort of thing that gets re-proposed every six months. *Kody to rule it closed or leave it open.*

**R-C5 · The iOS springboard badge.** P10 removes the tab badge as a vision refusal. The app icon's own springboard badge is a different object — it is how a homeowner learns something arrived when the app is shut. Keep it, or does the refusal reach the home screen? *Kody to rule.*

**R-C6 · What "Awaiting you" looks like away from the spine.** On The Making the break *is* the state and no stamp is needed. In `/decisions`, in the Record, and in any list, an upright unstamped outline is proposed. Is an un-stamped stamp legible, or does it read as a bug? *Worth a paper proof before building.*

**R-C7 · Whose name is on the letterhead?** The keepsake and the arrival fold both put the studio's name at the top and Patina's in the footer. Correct per VISION §4 ("you won't notice Patina"), but it makes the studio the counterparty in the homeowner's memory of the record. *Confirm with Kody that this is intended, since it touches how the Pledge and the margin stream are eventually explained.*

**R-C8 · Does the ceremony apply to the third rail?** Discovery 01 §C notes the codebase is mid-migration toward a design-services / commercial-document rail (`document_kind`, `commercial_state`, `send_commercial_document`). This document designs against Stage-2 approvals and the proposal/commercial sign path as they exist today. If the third rail is where new client agreements actually live, the ceremony should be built there first. *Kody to confirm the target rail before implementation is scheduled.*

**R-C9 · The "Awaiting studio issue" dead end.** Discovery 02 §9.6: a homeowner who finishes her review sits in a bucket reading *"Your review is complete. The studio is preparing the approval for issue."* with no timing and no act. The ceremony has no step 6 for her — she completed an attestation and got no seal. Proposal: stamp `REVIEWED` in the muted grammar with the date, so the act she took is visible. *Needs a copy-lane sentence and a product ruling on whether a homeowner should ever see this state at all.*
