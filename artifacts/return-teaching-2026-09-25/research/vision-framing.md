# Return teaching: vision framing

SQ-259 · 25 September 2026 · Checked against `VISION.md` v0.1, `VISION-DECISIONS.md` through V11, and `patina-brand-voice`. Intended path: `artifacts/return-teaching-2026-09-25/research/vision-framing.md`.

## §1 Feature test

- **Surface: #1, The Document.** It lives on the Desk and inside the Document. Patina Field counts as the Document off-desk (HT-33), so it may carry in-place notes about capture. It never goes on the iOS client app, the marketplace, or the client page. The client page is a letter from the studio (V9 P1), and Patina doesn't teach inside another author's letter.
- **Studio moment: S2, the first hands.** The owner is handing her way of working to someone else for the first time, and the new hand has to get productive without taking the owner's hours. VISION §2 says "the thing she cannot afford is a new system to learn." The system earns its place only if learning Patina stops being an event.
- **Stream: mostly the floor.** A subscription is kept because the tool keeps being useful, and the second seat is where the floor grows. The upside benefits indirectly: a studio that learns agreement → purchase order → deposit sends more furniture through designer-led projects. It is never a marketplace sales channel.
- **Promise: S4, "you won't notice Patina,"** plus "no lock-in, no hidden fees, pricing on one page." A release introduction is never an upsell.

**The tension.** "Teach her something when she returns" is the textbook re-engagement loop, and S4 rules it out by name: "never optimize the studio surface for engagement." VISION §6 also refuses engagement metrics. A lesson placed on arrival competes with the task she came to do. That makes Patina noticeable, which breaks the promise. But silence has a cost too. A studio that never learns the signed-agreement-to-PO path does the work twice by hand, and she notices *that*.

**The principle that resolves it: teach only what shortens the task she is about to do, where she is about to do it, and never to bring her back.** Every lesson has to name the task it shortens. If it can't, it doesn't get written. We judge lessons by whether the task got shorter, never by visits, opens, or click-through. The system has no scheduler of its own. The moment in her work is the only trigger.

## §2 Lifecycle model

| Stage | Needs to learn | Must NOT be interrupted with | Trigger | Surface |
|---|---|---|---|---|
| First hour | The Document is the whole tool: one project, one client, one room, one piece captured | Releases, billing, hands, money | Studio created; first sign-in | In place only. The empty region's one sentence (V9 P5) |
| First week | Library capture, previewing the client page, the proposal | Invoicing, Hours, seats | Account ≤7 days old; a project exists | In place; at most one note on return |
| First client page sent | What her client sees: her letterhead, Patina only in the colophon | Marketplace, other features | First client invite sent | The consequence sentence above the send act (V9 P3) |
| First agreement signed | Signed pieces become purchase orders; deposits and draws | Pricing tiers, the Pledge | First agreement reaches signed | One note next visit, anchored to that project |
| First invoice | Delivery status, print, surcharge | Hours, reporting | First invoice drawn | In place at the invoice |
| First hands (second seat) | **Owner:** roles, who sees money, Hours ledger scopes. **Hand:** their own first-hour path, cut to their role | Hand: owner-only capabilities. Owner: the hand's lessons | Second studio member accepts | Owner: one note plus one reviewed email. Hand: in place |
| Return after 7 / 30 / 90 days | 7: nothing new. 30: one lesson tied to the project she opens. 90: what changed, cumulatively | "Welcome back," counts of what she missed | Gap since last sign-in | Desk, one line; for 90 days, a collapsed list |
| A release shipped since last visit | A change to something she already uses first; a new capability second | Features her role or flag state can't reach | Release published after her last sign-in; flag on; role eligible | One note, plus a mark at the changed place the first time she meets it |
| Feature untouched after 60 days | Only when a current task shows the slow path (e.g. she types hours into notes) | A generic "did you know" | 60 days eligible, zero use, *and* a live task signal | In place, or silence |
| Dormant studio (90+ days, no active project) | Nothing in the product. She isn't there | Re-engagement drip, "we miss you" | No sign-in and no open engagement for 90 days | A 1:1 from Leah (§6: no funnel-spam) |

## §3 Content taxonomy

| Kind | What it is | Return-visit lesson? | In place | Email |
|---|---|---|---|---|
| (a) New-release introduction | Shipped since she last looked | **Yes**, once | Mark at the changed place, first encounter only | Only if it changes money or what a client sees |
| (b) A benefit never used | Eligible 60+ days, never touched | **No.** On arrival it reads as a nag | **Yes**, only when a live task shows the need | No |
| (c) A faster way | A shorter path to something she already does | Only if her last session took the slow path on the project she's opening | **Yes**, its home: after the third slow repetition | No |
| (d) Studio capability for the owner adding hands | Seats, roles, who sees money, Hours scopes | **Yes**, owner only, at the hands moment | At the invite act | Once, at invite-accept, owner only |
| (e) A client-facing promise | Something she can now tell clients ("your invoice shows when it was opened") | No | The consequence sentence at the send act | **Yes.** She needs reusable wording, read at a calm moment |

Only (a), (d), and a task-tied (c) earn space on the return visit.

## §4 Naming

1. **Margin Notes.** The Document is paper, and a note in the margin sits beside the work, never inside it. The name states the guardrail. *"Margin note · A signed agreement now opens its own purchase orders."*
2. **Workshop Notes.** A note left on the bench for whoever works next. Straight from the lexicon, and it fits the new hand. *"Workshop note · Log hours in Field; they land on this project's ledger."*
3. **With the Grain.** Working with the tool rather than against it. Fits the faster-way kind. *"With the grain · Paste a maker's link and the piece fills itself in."*
4. **Worn In.** Patina is what use leaves behind; the tool wears to the studio's hand. *"Worn in · ⌘K now finds a client by street name."*
5. **Provenance.** Where a change came from and when. Best kept for the release record, and it risks colliding with piece provenance. *"Provenance · September: invoices tell you when they were opened."*
6. **Bench Notes.** Plain-spoken, in a maker's register, but further from the Desk's vocabulary. *"Bench note · Hand a new hire their own seat in two lines."*

**Recommendation: Margin Notes.** It uses the Document's own vocabulary (paper, margin, colophon), it describes placement, which is the guardrail itself, and it reads plain rather than literary. Most notes show the name only as a DM Mono label.

## §5 Guardrails

1. **One note per visit and two per week, per person.** Each in-place note fires once and doesn't count toward the cap. *(S4: "gets out of the way.")*
2. **Never a modal, overlay, popover, or tooltip tour.** A note is set type in the margin or on the Desk. Ignoring it is enough. *(§4; §6 no shadows. V9 keeps elevation to three sites.)*
3. **Never during a task in progress.** No note appears while a form is dirty, a composer has focus, or an act is pending. An in-place note appears only once its region is at rest. *(§4: "when and where you need it.")*
4. **Dismissed means gone for good,** per person, per note. A per-person quiet switch silences everything. Three ignored notes in a row quiet the system for 30 days. *(S4.)*
5. **Long gaps get one cumulative catch-up.** After 30+ days: one collapsed "Since you were last here" line, at most three items relevant to the project she opens, and the rest on a plain changes page. Never a count ("12 new features"). *(§6 no badges; V11.)*
6. **Audience is exact.** Seats, money, permissions and pricing go to the owner only. A hand is never taught what their role can't do. A flag-off feature is never taught; flags fail closed. *(§2.)*
7. **No streaks, checklists, progress bars, "3 of 7 done," badges, or dots.** *(V11 names streaks and progress bars as refused; §6.)*
8. **Measure notes, never people.** Success is a shorter or unassisted task. A per-note aggregate is kept only to retire weak notes. There are no open-rate targets, and the owner never sees which hand read what. *(§6; V9: "does not license measuring her.")*
9. **House type only.** DM Mono label (`MARGIN NOTE · 25 SEP`), Inter body, Playfair only for a release headline, on the house-sheet scale. State pigments only, no icons, no emoji. *(Brand-voice formats; V9 P5.)*
10. **One sentence of outcome, one act.** No "AI," "engine," "powered by," "New!", or "Did you know." Numbers must be true. *(§6; brand-voice hard rules.)*
11. **Never sell.** No upgrade-to-unlock teasers, no tier pitches, no marketplace piece suggestions, no Pledge language. The Pledge is legal-gated, even though the brand-voice skill says to state it plainly. VISION wins. *(§4 no hidden fees; §3 counsel gate.)*
12. **Never on a client surface, and never an unreviewed send.** Nothing reaches the client page, decision papers, or `/pay/<token>`. Every email is a draft that lands `awaiting_review`. *(V9 P1; Agent OS external-send rule.)*

## §6 Open rulings for Kody

1. **Name.** Margin Notes / Workshop Notes / no visible name. *Recommend: Margin Notes, shown only as the DM Mono label.*
2. **Email at all.** None / release-driven reviewed letter / invite-accept only. *Recommend: a reviewed owner letter at most monthly, skipped in any month where nothing changes her work.*
3. **Author and approver.** Leah writes every note / agents draft and Leah approves / Kody writes release notes. *Recommend: agents draft into `awaiting_review`, with Leah as sole approver. Teaching is her half of the company (§1).*
4. **Owner visibility into hands' learning.** None / aggregate / per person. *Recommend: none. Anything more is the utilisation score V11 refuses.*
5. **Dormant studios.** Silence / a Leah 1:1 list / one automated letter. *Recommend: a Leah 1:1 list, never sent automatically.*
6. **Caps.** 1 per visit and 2 per week / 1 per week / 1 per visit only. *Recommend: 1 per visit and 2 per week, with in-place notes exempt but once-only.*
7. **Louder treatment for money-moving releases** (e.g. a surcharge change). Same margin note / the consequence sentence at the affected act / a one-time banner. *Recommend: the consequence sentence. A banner is engagement chrome.*
8. **Brand-voice drift.** The skill's tagline ("Where Time Adds Value") is open as V5, and its Pledge rule contradicts the VISION §3 legal gate. Options: rule V5 and correct the skill / leave both. *Recommend: correct the skill's Pledge line now, and keep the tagline out of notes until V5 is ruled.*