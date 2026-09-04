# Behavior and Copy — the homeowner's experience of being asked to decide

Client approval experience program · 2026-09-03 · Behavioral and copy design lane

**Scope.** How a homeowner feels when Patina asks for a decision, and every word we say to her while asking. Written against the four discovery reports in `../discovery/`, the vision, the brand-voice skill, the approval-authority contract, and ADR 0003. No code was changed.

**Standing note on examples.** Every name, address, dollar figure, date, and provenance line here is an **example** written to test the voice — Leah Kochaver's studio, the Brenner house on Van Hise Avenue in Madison, Anne and Dave Brenner. None of it is a real record, price, or maker claim. Real copy pulls real values from `project_approval_artifacts`.

**Voice rules this document holds itself to.** Plain-spoken Midwest. Second person, present tense. Sensory where there is something real to touch. Provenance stated, never implied. No luxury haze. Never "AI." Numbers true or marked as examples. The studio leads; Patina is quiet.

---

## 1. How a homeowner actually experiences a decision request

An approval is a money-and-irreversibility moment wearing a document's clothes. She is deciding whether to spend money she cannot easily get back, on a drawing she can only partly read, without her partner in the room, for a professional she likes and does not want to disappoint. Every part of the current flow either helps her with that or leaves her alone in it.

### The five anxieties, and where the current flow meets each one

**Money.** The Impact row is genuinely good: three deltas, signed, stated even at zero (`+$4,200`, `$0 — no cost change`, 02 §2A.5). Two things undercut it. A delta has no baseline — `+$4,200` against what total? — and the budget cross-check can fall back to *"Budget details are unavailable for this exact approved edition."* (02 §2A.2): honest, and at the money moment unsettling. Worse, on the agreement she is asked to sign, the design authorization ceiling can render *"Not yet set"* in italic (02 §2B). The italic exists for a good reason — never imply an authorized $0 — but a homeowner reading her own spending ceiling as blank on the page she is signing has a reason to stop, and no sentence explaining why.

**Irreversibility.** The best sentence in the product is here: *"You are approving edition {artifactVersion}, exactly as shown."* (02 §2A.1). Missing is the other half — what the approval sets in motion. The invalidation rail refreshes `section-gates`, `coordination-items`, `project-ffe-items`, `margin-items`, `document-state` (02 §3), and `_client_decision_blocks_phase` is fail-closed, so a pending approval **always** holds the phase shut (04 §2.7). The system knows exactly what her name unfreezes. She is never told.

**Not understanding the drawing.** The email hands her *"SHA-256 checksum: {64-char hex}"* (04 §3.1). To an engineer that is integrity evidence. To a homeowner it is a wall of characters in an email about her kitchen. Meanwhile the artifact itself arrives with a title, an edition number, and no reading aid at all.

**Spouse alignment.** There is one frozen decision lead (02 §1A) and `required_coapprover_id` is always written NULL (02 §4) — a defensible contract. The failure is in the conversation layer: `DecisionDiscussion` labels every comment not authored by the current viewer as **"Designer"** (02 §4). If Dave comments, Anne reads it as Leah. The one place the household shows up in the product misattributes it.

**Fear of offending the designer.** Three outcomes exist and are named honestly. Their *weight* is not equal. `approved` gets a `GateStamp` seal; `needs_discussion` gets a hold stamp drawn "as loud as the seal"; `changes_requested` gets **plain text, no stamp** (02 §2A). A homeowner scanning for which answer is the real answer reads that asymmetry instantly. On iOS the same instinct was handled better — `DecisionDeferral` composes *"About {subject} — not yet. I need a little more time before I decide."* (03 §1.1). That is a safe "not yet," well authored, and it exists nowhere on the web.

### What builds confidence, and what makes deciding feel good

- **Understanding.** Helped by the edition sentence and the stated deltas. Hurt by the checksum, the missing baseline, and the absence of any "what this releases" line — though that sentence practically exists already, as the designer's Scope note placeholder: *"What this releases, and what it does not."* (01 §A.5).
- **The designer's reasoning.** Almost absent. `approval.context` renders only if present, only as free text (02 §2A.4), and the composer's helper tells the designer it *"is never an approval response"* — true, and it has quietly become "this field doesn't matter." The thing that most reduces a client's anxiety is the least-supported field on the form.
- **Seeing consequences.** Hurt at the ask (no "after you approve" line) and again after: `decision_resolved` is addressed to the **designer**, not the client (04 §3.1). She takes the most consequential act in the product and gets no confirmation.
- **Closure and being trusted.** The `GateStamp` seal (doubled border, low-opacity ink, off-square, no shadow, 02 §7) is the correct instinct, well built — extend it, don't dilute it. And *"Decision lead — {clientName} · frozen at publish"* (01 §A.5) is a designer-facing line the client would love in her own words: being named as the one who decides is flattering in the honest way.
- **Seeing the house move.** The standing sentence (*"one paper waits for your name"*, 02 §7) and iOS's NEEDS YOU / MOVED eyebrows (03 §2.1) are Patina's strongest returning-home devices. Neither is what the approval email points at.

**Arrival is the weakest link in all of it.** Her first-ever notice of a brand-new approval carries the subject *"Reminder: "{title}" needs your decision"* (02 §9.2) and contains **no link at all** (02 §9.1). She must remember a domain, sign in, and hunt through six buckets on `/decisions`. Every good thing downstream sits behind that.

---

## 2. Engagement without manipulation

The vision promises the homeowner *"you're engaged every day, and you and your designer are looking at the same agreed direction,"* and in the same breath refuses engagement metrics and funnel-spam. Those reconcile, and the reconciliation governs this lane:

> **Engaged every day means there is something true to read every day. It never means we ask for something every day.** The house is always moving. Patina's job is to keep an honest record of that movement where she can see it, and to ask for exactly one thing at a time, only when a real decision is genuinely owed.

iOS already models this correctly: NEEDS YOU never decays ("an open obligation does not age out of view," 03 §2.1), MOVED is a rolling seven-day window, and both cap at three rows. Obligations are permanent and few; news is recent and finite. That is the whole design.

### Principles

1. **The daily return is a record, not a feed.** She comes back to see what moved, not because we pinged her. The web portal has no Record; the standing sentence is the seed of one.
2. **Curiosity is earned with substance.** A notice that names the thing — the white oak, the back hall, the maker — earns the open. "Something needs you" trains her to ignore us.
3. **Reciprocity flows from the designer, never from the system.** The one-line why, the personal message, the answer in the thread. Leah gives first; that is why Anne answers.
4. **Progress is plain arithmetic, never scored.** *"Two papers wait for your name"* — never a bar, a percentage, or a streak.
5. **One ask per notice.** One decision, one door, one link.
6. **She sets the pace.** Snooze, "ask me Sunday," a cadence she controls. A homeowner who can turn the volume down does not have to turn us off.
7. **Waiting is never failure.** Overdue is information for the studio. To her it is at most "this is holding the cabinet order" — a consequence, stated once.

### The blacklist — patterns Patina will not use

| Pattern | Why not |
|---|---|
| False urgency, invented deadlines | Numbers must be true. The only real deadline is `due_at` / `valid_until` |
| Countdown timers | A plain statement of a true `valid_until` date only. No ticking clocks |
| Streaks, response-time scores, stats about the client | Refused by the vision. Also creepy |
| Confetti, celebration animation, sound | The ceremony is a stamp. Someone who just spent $18,400 (example) does not want a party |
| Guilt copy | *"has passed its due date and is still waiting on you"* is live today and fails this |
| Apologetic copy | *"Just a gentle nudge"* is live too, and reads like Patina is embarrassed to be there |
| Red/green status, badges as scoring | Vision §6 refuses both. Red stays reserved for one true overdue state on iOS |
| Social proof | There are no other people. It would be a lie |
| Engagement-optimized send timing | Send times follow her preferences and quiet hours, never open-rate tuning |
| Implied read receipts used as pressure | Telemetry is one-directional today (04 §6.3). Keep it so, or make it mutual and honest |
| Dark defaults on cadence | The default is the quietest cadence that still gets a real decision to her on time |
| Re-asking a dismissed permission prompt | `PushPrimerView` is deliberately one-shot (03 §8.5). Add a settings path, never an auto re-ask |

---

## 3. Comprehension aids

The rule: **the lightest device that makes the consequence legible.** Never a tutorial, never an explainer panel.

| Artifact | What she must understand | Lightest device |
|---|---|---|
| Design services agreement | What she is buying, what she is not, what the ceiling means, what follows signing | The kind-specific consent sentence (already strong) plus a stated reason when the ceiling is blank |
| Furnishings authorization | Which lines, at what price, and that a deposit follows | The named-lines list plus one "on signing" consequence line — the `SpineGate` caption pattern |
| Plan set | What changed since the last edition, and what approval releases | "What's different in this edition," two or three designer-written lines, plus the release line |
| Spec book | Which pieces are pinned, what is still open | Provenance line per piece plus a plain count of what remains unspecified |
| Budget version | The number, against the last number, and what moved it | Delta with baseline plus the one or two lines that account for it |
| Option decision | The visual difference, the cost difference, and that either is fine | Side-by-side image, one line of why from Leah, price difference stated once |

### The five devices

**A. The designer's one-line why.** Required at authoring, about 140 characters, under the question. Not a note "that is never an approval response" — the sentence that makes the ask make sense. *"The deeper counter run gets the sink under the window and keeps the back hall clear — worth the two extra days to me."*

**B. The delta story.** Change, baseline, consequence, in that order. Never sum the three deltas until product rules whether they are additive or independent. Until then, side by side: *"This adds $1,240 to the kitchen — $46,880 becomes $48,120. The install date moves two days later. Lead time is unchanged."*

**C. Before and after.** Only where a predecessor exists (`predecessor_decision_id` is in the schema, 04 §1.5): *"Since edition 2: the island grew four inches, the pantry door swings the other way, and the pendant count went from three to two."*

**D. Provenance of a piece.** Where the brand voice earns its keep: *"White oak, quartersawn, built in Spring Green. Hardwax oil finish — it will darken a shade in the first year and then hold."*

**E. What happens after you approve.** One sentence, drawn only from what the data honestly supports — the discipline `SpineGate` captions already hold (02 §7: *"Everything else stays silent rather than inventing a consequence"*): *"Approving this releases the cabinet order and opens the install phase. Nothing is ordered before your answer."*

### Worked examples

**Plan set.** *(all figures examples)*

> **Kitchen and back hall — plan set, edition 3.** You are approving edition 3, exactly as drawn.
> **Leah's note.** The deeper counter run gets the sink under the window and keeps the back hall clear — worth the two extra days to me.
> **Since edition 2.** The island grew four inches. The pantry door swings the other way. The pendant count went from three to two.
> **What it costs.** $1,240 more — the kitchen goes from $46,880 to $48,120. Install moves two days later. Lead time is unchanged.
> **What it releases.** Approving this releases the cabinet order and opens the install phase. Nothing is ordered before your answer.
> **Due Thursday, October 8.**

**Option decision.** *(examples)*

> **Rug color — Natural or Sand.** Natural picks up the oak and disappears into it. Sand holds its own line against the floor — a little more contrast, a little more upkeep with the dog. Natural: $2,150. Sand: $2,150. Same price either way, same eight-week lead. Either is a good answer. If neither is right, say so and I'll bring two more.

---

## 4. The three outcomes as honest doors

**Design law: three doors, one frame, one grammar, equal weight.** If one outcome gets a seal and another gets plain text, we have told her which answer we wanted. Every outcome is a real answer, recorded with the same care, stamped with the same hand.

### The doors

| Door | Button label | Helper line |
|---|---|---|
| Approve | **Approve this edition** | *"You accept edition {N} exactly as shown, with the cost and schedule stated above."* |
| Changes | **Send it back for changes** | *"Tell Leah what to change. She'll revise it and send a new edition — this one closes."* |
| Discussion | **Hold it for a conversation** | *"Nothing moves and nothing is decided. Leah will reach out."* |

Above the three: *"Three answers, all of them fine. Pick the one that's true."* (replacing *"Choose one outcome. Add questions or notes in Discussion below; comments do not submit an outcome."* — the current line is accurate and reads like a terms-of-service clause).

Submit: **Record my answer** (busy: *"Recording…"*).

### What "changes requested" needs from the client

The contract leaves this open at the database layer and states the constraint plainly: *"Web can require it now; installed clients cannot."* Design accordingly, and split the requirement by surface rather than pretending they are the same:

- **Web:** the note is required, and never presented as validation. The textarea appears the moment "Send it back for changes" is selected, labeled **"What should change?"**, placeholder *"You can be blunt — it's easier to fix now than later."* Empty submit: *"Tell Leah what to change so she can send the next edition."* — an instruction, never *"This field is required."*
- **iOS:** encouraged and pre-opened, not enforced. Offer a prefilled opener in the spirit of `DecisionDeferral`: *"About the kitchen plan set — I'd like a change. "*, cursor at the end.
- **Everywhere:** changes requested closes this edition and starts the next one. Say exactly that.

### Follow-up copy, per outcome

**Approved.** Stamp **APPROVED** (existing seal). Line: *"Recorded: approved, {date}."* Afterglow: *"That's on the record. Leah has the cabinet order — she'll confirm the install week once the shop books it."* *(example)*

**Changes requested.** Stamp **RETURNED** (new variant, same grammar as the hold: doubled border, off-square, muted terracotta ink, no fill). Line: *"Recorded: returned for changes, {date}."* Afterglow: *"Leah has your note. She'll send the next edition — you'll get it here."* Her note is echoed under the stamp, so she sees what she said.

**Needs discussion.** Stamp **HELD** (existing hold). Line: *"Recorded: held for a conversation, {date}."* Afterglow: *"Nothing moves until you two have talked. Leah has it."*

On the door/stamp split — the picker says "Needs discussion," the record says "Held for discussion," documented in-code as deliberate. **Keep it and make it legible:** the door is named for her act, the stamp for the state it leaves the work in. Single-word marks (APPROVED / RETURNED / HELD) make the grammar one family.

---

## 5. Household

ADR 0003 is right and should not be softened: one lead answers, everyone else converses. The problem is not the rule. It is that today the rule is expressed by **erasing the other person** — every non-self comment is labeled "Designer" (02 §4).

**1. Name the speaker.** Comment authorship becomes **You** · **Dave** (given name from the profile) · **Leah · Middle West Studio**. Studio-side comments are attributed to the studio, not to whichever internal person typed them — the contract requires that *"internal reviewer identities are not exposed to clients."* One designer name plus the studio name satisfies both the warmth and the constraint.

**2. Give the lead a "loop in" act.** On any decision, under the discussion thread:

> **Loop in someone**
> *"Add someone in your household to this project. They can read everything and join the conversation. You stay the one who answers."*
> Field: **Their name** · **Their email**
> Button: **Send the invitation**
> Confirmation: *"Dave can see the project now. You're still the one who signs."*

Invitation email, studio-signed:

> Subject `Anne added you to the Van Hise project` *(example)* · Preheader `Read the plans, join the conversation.` · Body: *"Dave — Anne added you to the Van Hise kitchen and back hall. You can read the plans, the specs, and the numbers, and talk with me right in the project. Anne signs off on decisions, so nothing is waiting on you. **Open the project →** — Leah Kochaver, Middle West Studio · Madison"*

**3. Tell the non-lead where he stands, once, without diminishing him.** In place of the outcome picker on a decision he can read but not answer: *"Anne answers this one. You can read every edition and say what you think below — she'll see it before she decides."* And in the discussion empty state: *"Say what you think. Anne sees it before she answers."*

**Where the lead sees the household.** When a household member has commented since the lead last looked, the decision row carries one plain line — *"Dave left a note"* — no badge, no count bubble.

**Ruling dependency.** The contract has not settled *"whether the configured lead/co-approver are internal studio reviewers or household approvers."* All copy above assumes **household**. If the ruling lands on studio reviewers, "loop in" becomes a pure conversation invite with no authority implication; only the co-approver strings change. Flagged in §9.

---

## 6. Notification and reminder policy

Every body below is designer-voiced and studio-signed. **Patina does not sign emails to homeowners.** Replacing the current *"— Patina"* sign-off with the studio's own name is the single most vision-aligned change in this section: the studio leads, Patina is quiet.

Push limits observed: title ≤ 60 characters, body ≤ 120 characters.

### 6.1 The eleven events

**1 · New approval issued** *(replaces the mislabeled first send)*

- Subject: `Leah sent the kitchen plan set for your approval`
- Preheader: `Edition 3, due Thursday. Three ways to answer.`
- Body: *"Hi Anne — the kitchen and back hall plan set is ready. Edition 3, exactly as drawn. The deeper counter run gets the sink under the window and keeps the back hall clear. It adds $1,240 and moves install two days later. Approving it releases the cabinet order; nothing is ordered before your answer. Approve it, send it back for changes, or hold it for a conversation — all three are fine answers. **Review the plan set →** Due Thursday, October 8. — Leah Kochaver, Middle West Studio · Madison"* *(values are examples)*
- Push: **"Leah sent the kitchen plan set"** / *"Edition 3 is ready for your approval. Due Thursday."*
- In-app: *"Leah sent the kitchen plan set for your approval — edition 3, due Thursday."*

**2 · New proposal or agreement sent**

- Subject: `Leah sent your design services agreement` (kind-specific, as today)
- Preheader: `The services, the rates, the ceiling, the terms.`
- Body: *"Hi Anne — here's the design services agreement for Van Hise. It covers the services, the role rates, the retainer, and the billing cadence. Furnishings and permission to purchase are not in it — those come later, separately. Ask me anything before you sign. **Review the agreement →** $6,500 retainer. Please review by October 15. — Leah Kochaver, Middle West Studio · Madison"* *(examples)*
- Push: **"Leah sent your design services agreement"** / *"The services, rates, and terms for Van Hise. Ready when you are."*
- In-app: *"Leah sent your design services agreement — ready for your signature."*

**3 · Reminder, 48 hours before due**

- Subject: `Thursday: the kitchen plan set`
- Preheader: `Still open. Approve, send back, or hold.`
- Body: *"Anne — the kitchen plan set is still open and due Thursday. Nothing has changed since I sent it: edition 3, $1,240 more, install two days later. Approving it releases the cabinet order. **Review the plan set →** If Thursday is tight, say so and we'll move it. — Leah Kochaver, Middle West Studio · Madison"* *(examples)*
- Push: **"Thursday: the kitchen plan set"** / *"Still open. Approve, send it back, or hold it."*
- In-app: *"The kitchen plan set is due Thursday."*

**4 · Overdue** *(one time only)*

- Subject: `The kitchen plan set is past its date`
- Preheader: `It's holding the cabinet order. No rush from me.`
- Body: *"Anne — the kitchen plan set went past its date Thursday. It's holding the cabinet order, so I wanted you to know rather than let it sit quietly. No penalty and no rush from me — if you need more time or want to talk it through, say so. **Review the plan set →** — Leah Kochaver, Middle West Studio · Madison"* *(examples)*
- Push: **"The kitchen plan set is past its date"** / *"It's holding the cabinet order. No rush — tell me what you need."*
- In-app: *"The kitchen plan set is past its date and holding the cabinet order."*

**5 · Nudge from the designer** *(designer-initiated, 3-day cooldown)*

- Subject: `Leah is checking in on your agreement`
- Preheader: `No hurry. Here if you have questions.`
- Body: *"Anne — checking in on the design services agreement. No hurry; I just want to make sure it didn't get buried. If there's anything you'd like to go over first, tell me and I'll walk you through it. **Review the agreement →** — Leah Kochaver, Middle West Studio · Madison"*
- Push: **"Leah is checking in on your agreement"** / *"No hurry — she's here if you have questions."*
- In-app: *"Leah checked in about your design services agreement."*

**6 · Resolved — approved** *(new; the client gets nothing today)*

- Subject: `Recorded: you approved the kitchen plan set`
- Preheader: `Edition 3, approved Tuesday. Here's what happens next.`
- Body: *"Anne — your approval of the kitchen plan set, edition 3, is on the record as of Tuesday, October 6. It releases the cabinet order. I'll confirm the install week once the shop books it. Nothing else is waiting on you. **See the record →** — Leah Kochaver, Middle West Studio · Madison"* *(examples)*
- Push: **"Recorded: the kitchen plan set is approved"** / *"Edition 3 approved. Leah has the cabinet order."*
- In-app: *"You approved the kitchen plan set, edition 3 — recorded Tuesday."*

**7 · Changes acknowledged** *(new)*

- Subject: `Leah has your changes on the plan set`
- Preheader: `Edition 3 is closed. The next one is coming.`
- Body: *"Anne — I have your note on the kitchen plan set. Edition 3 is closed; I'm drawing the next one and you'll get it here. Your note, so you have it: "Can we keep the pantry door swinging into the hall?" — Leah Kochaver, Middle West Studio · Madison"* *(example)*
- Push: **"Leah has your changes"** / *"Edition 3 is closed. The next one is on its way."*
- In-app: *"Leah has your changes on the kitchen plan set. A new edition is coming."*

**8 · Superseded / revised**

- Subject: `A new edition of the kitchen plan set`
- Preheader: `Edition 4 replaces edition 3.`
- Body: *"Anne — edition 4 of the kitchen plan set is ready and replaces edition 3. Since the last one: the pantry door swings into the hall, the island came back four inches. Cost holds at $48,120; install holds at the week of November 9. Edition 3 stays in the record. **Review edition 4 →** Due Friday, October 16. — Leah Kochaver, Middle West Studio · Madison"* *(examples)*
- Push: **"Edition 4 of the kitchen plan set"** / *"It replaces edition 3. Due Friday."*
- In-app: *"Edition 4 replaces edition 3 — ready for your approval."*

**9 · Withdrawn**

- Subject: `I pulled the kitchen plan set back`
- Preheader: `Nothing is waiting on you.`
- Body: *"Anne — I pulled the kitchen plan set back before you answered, so nothing is waiting on you. The shop revised the cabinet lead time and I want the plan to reflect it. A corrected edition is coming. — Leah Kochaver, Middle West Studio · Madison"* *(example)*
- Push: **"Leah pulled the plan set back"** / *"Nothing is waiting on you. A corrected edition is coming."*
- In-app: *"Leah withdrew the kitchen plan set. Nothing is waiting on you."*

**10 · Signed confirmation**

- Subject: `Signed: your design services agreement`
- Preheader: `Recorded October 2. Awaiting the studio countersignature.`
- Body: *"Anne — your signature on the design services agreement is recorded, October 2, signed Anne Brenner. It takes effect once I countersign; I'll do that today. The retainer invoice comes next, separately. **See the agreement →** — Leah Kochaver, Middle West Studio · Madison"* *(examples)*
- Push: **"Signed: your design services agreement"** / *"Recorded October 2. Leah countersigns next."*
- In-app: *"You signed the design services agreement — recorded October 2."*

**11 · Paper-signed record**

- Subject: `Your signed agreement is in the record`
- Preheader: `Recorded from the paper original you signed.`
- Body: *"Anne — the agreement you signed on paper is in the project record: signed Anne Brenner, October 2, recorded October 3. The scan is attached if you want to see it. Nothing else is needed from you. **See the record →** — Leah Kochaver, Middle West Studio · Madison"* *(examples)*
- Push: **"Your signed agreement is in the record"** / *"Recorded from the paper original. Nothing needed from you."*
- In-app: *"Your paper-signed agreement is recorded — October 2."*

### 6.2 Cadence rules

**The ladder, per decision.** Issue → one reminder 48 hours before due → one on the due date → one overdue notice → **stop.** After that Patina goes quiet and the item is the studio's to chase by hand. A system that keeps emailing after the fourth notice has stopped informing and started nagging.

**When not to send.** No second automated notice for one decision inside 24 hours. None on a decision she has answered or snoozed. No due-date reminder where there is no `due_at` — that one gets the issue notice and nothing more until the designer nudges. No nudge on a paper-issued document (already correct in `proposal-watch-derivation.ts`). Never two decisions in one email body.

**Quiet hours.** Honored for everything except the overdue notice, which is time-critical (matching today). Add a floor: nothing before 8am or after 8pm local, and no automated approval mail on Sunday.

**Immediate versus digest.** Widen the existing two cadences to three, in her words: **"Tell me right away"** · **"Once a day"** · **"Once a week, on Sunday."** Issue and overdue notices always break the digest — a new decision and a passed date are news, not summary. Reminders and nudges fold in.

**Cooldowns.** The 3-day designer nudge cooldown and the 1-hour in-app reminder cooldown both stay, and neither is a client-facing number — but the nudge cooldown becomes visible in the *designer's* copy rather than only enforced server-side.

**Her controls.** On any open decision: **"Remind me later"** → *"Tomorrow morning"* · *"Sunday"* · *"When it's due"* · *"Don't remind me — I'll come back."* Confirmation: *"I'll ask you Sunday."* And once, on her first decision: *"You can change how often I check in, any time, in your settings."*

### 6.3 Verbatim replacements

| Current (verbatim) | Replaced by |
|---|---|
| Subject `Reminder: "{title}" needs your decision` **on a first send** | `{Designer} sent the {artifact kind} for your approval` (event 1) |
| The same subject **as a reminder** | `{Due day}: the {artifact title}` (event 3) |
| `Your designer is waiting on a decision: {title}.` | `The {artifact title} is ready. Edition {N}, exactly as drawn.` |
| `It's due in approximately {N} hour(s).` | `Due {weekday}, {month day}.` |
| `Open your Patina dashboard to review the options and pick one.` | **Review the {artifact kind} →**, a real link to `/decisions/{id}` |
| `Approval artifact: {title} ({kind}, version {N}).` + `SHA-256 checksum: {hash}` | `Edition {N} of the {kind}, issued {date}.` — the hash moves to the record |
| `— Patina` | `— {Designer full name}, {Studio name} · {City}` |
| Subject `Overdue: "{title}" still needs your decision` | `The {artifact title} is past its date` (event 4) |
| `The decision {title} has passed its due date and is still waiting on you.` | `…went past its date {weekday}. It's holding {the real consequence}, so I wanted you to know.` |
| Subject `A gentle reminder about your proposal: "{title}"` | `{Designer} is checking in on your {document label}` (event 5) |
| `Just a gentle nudge — {designerName}'s proposal {title} is still waiting for you whenever you have a moment to review it.` | `Checking in on the {document label}. No hurry; I just want to make sure it didn't get buried.` |
| `Thanks for signing "{title}". Your designer is now activating your project.` | Event 10's body — the signature date, the countersignature, what comes next |
| (nothing sent to the client on resolution) | Event 6 — the approval receipt |

---

## 7. Copy for every state and screen

| State / screen | Current copy (verbatim) | Proposed | Why |
|---|---|---|---|
| Arrival — header nav | `"Approval tasks, {N} need attention"` | `"Waiting on you, {N}"` | Not a task queue |
| Arrival — list headings | `Awaiting Your Response (N)` · `Your Designer Is Handling (N)` | `Waiting on you (N)` · `Leah has these (N)` | Plain, second person; name the person |
| Arrival — card eyebrow | `Project approval` | `An approval · edition {N}` | Names the ask and the immutability |
| Artifact header | `You are approving edition {artifactVersion}, exactly as shown.` | **Keep verbatim** | The best sentence in the product |
| Artifact — budget mismatch | `Budget details are unavailable for this exact approved edition.` | `The live budget has moved since this edition was issued. The numbers below are the ones you're approving.` | Explains instead of apologizing |
| The why | *(no such field client-side)* | `Leah's note. {one line, required at authoring}` | Largest confidence gain available |
| Scope | free text `approval.context`, optional | Relabel **What this releases** and require it | Reuses the designer's own placeholder intent |
| Deltas | `+$4,200` / `$0 — no cost change` | `$1,240 more — $46,880 becomes $48,120.` / `No change to cost.` | A delta with a baseline is a fact |
| Authority | `{completedReviewCount} of {requiredReviewCount} required reviews confirmed.` | `You're the one who answers this. {N} of {M} confirmations recorded.` | Being named reassures; a bare count does not |
| Review complete, draft | `Review complete. Your designer can now issue this request.` | `You've confirmed edition {N}. Leah issues it next — nothing is waiting on you.` | Removes the dead-end feeling |
| The ask (helper) | `Choose one outcome. Add questions or notes in Discussion below; comments do not submit an outcome.` | `Three answers, all of them fine. Pick the one that's true.` | Permission, not a disclaimer |
| The act — three doors | `Approved` / `Changes requested` / `Needs discussion`, and their helper lines | The labels and helpers in §4 | Verb then consequence; "gate" is our word, not hers |
| Confirmation stamp | `Approved` / `Held for discussion` / *(none for changes)* | `APPROVED` / `HELD` / `RETURNED` | Three doors, three stamps, one grammar |
| Afterglow | *(none)* | `That's on the record. {what happens next, from real data}` | Closure plus consequence |
| Waiting — pending | *(no standing line on web)* | `One approval waits for your answer.` | Ports the standing-sentence grammar to web |
| Waiting — studio issue | `Your review is complete. The studio is preparing the approval for issue.` | `You're done with this one. Leah issues it next — usually a day or two. Ask her here if it sits.` | Ends a client-visible dead end (02 §9.6) |
| Waiting — overdue | `Overdue (N)` | `Past its date (N)` | Descriptive, not accusatory; no red |
| Edge — expired | `This proposal has expired{ on {date}}. Contact your designer to renew.` | `This expired {date}. Ask Leah for a fresh copy and she'll send one.` | Names the person |
| Edge — withdrawn | `This document was withdrawn and no longer asks anything of you.` | Keep, and add `Leah will send a corrected version if one is coming.` | Already plain; add the next step |
| Edge — superseded | `This edition was replaced and can no longer be signed.` | `Edition {N} replaced this one. Open edition {N} →` | Give her the door, not just the notice |
| Edge — declined | `You declined this proposal{ on {date}}.{ Reason: {reason}}` | `You declined this on {date}.{ You said: "{reason}"}` | Her words quoted as hers |
| Edge — ceiling blank | `Not yet set` (italic) | `Not yet set — Leah sets this with you before any purchasing is authorized.` | Turns an alarming blank into a stated process |
| Error — stale artifact | `The artifact changed or the review could not be confirmed. Refresh and review it again.` | `This edition changed while you had it open. Reload and take one more look before you answer.` | Explains, then instructs |
| Error — signed out | *(silent redirect to `/auth/signin?callbackUrl=…`)* | `Sign in and we'll take you straight to the {artifact kind} Leah sent.` | A step, not a wall |
| Discussion helper | `Comments help you and your designer discuss the work. They never submit or change an approval outcome.` | `Talk it through here. Nothing said here changes your answer above.` | Same truth, half the words |
| Discussion authorship | `You` / `Designer` | `You` / `{Given name}` / `Leah · Middle West Studio` | Fixes the household mislabel (02 §9.3) |

**Keep verbatim, unchanged:** `Budget details are loading…` · `I reviewed this exact edition` · `Your typed name acts as your electronic signature.` · `Comment could not be posted. Your draft is still here; try again.` · the dead-share-link page · the kind-specific sign-page consent sentences. Each is already plain, honest, and in voice.

---

## 8. Proposals

| # | Name | Surface(s) | What changes | Why it delights or engages | Dependencies | Effort | Risk |
|---|---|---|---|---|---|---|---|
| 1 | **A first notice that reads like a first notice** | Email, in-app | Split `decision_required` into an issue notice and a reminder notice with distinct copy | Her first-ever notice stops reading as a scolding for something she has never seen | `decision_notifications.kind` enum widening (migration); `_enqueue_decision_notification` (00466); `publish_client_decision` (00464); `renderDecisionEmail` | M | Enum widening, the `(decision_id, kind)` unique constraint, and 00466's re-arm semantics must land together |
| 2 | **Put the door in the email** | Email | Add a `ctaButton()` deep link to `/decisions/{id}` from `CLIENT_PORTAL_URL`; audit the shell footer, which resolves from `DESIGNER_PORTAL_URL`; replace the SHA-256 line with an edition-and-date line and keep the hash in the record | Removes the largest friction in the journey — one tap instead of remembering a domain and hunting six buckets, and the inbox stops carrying a wall of hex about her kitchen | `_shared/decision-notify.ts` (link + artifact citation block, :260-278); `_shared/branded-email.ts` `portalBase()`; env on every importing function | S | A `_shared/*` edit means redeploying every importing edge function; confirm no evidentiary need for the hash in the client copy |
| 3 | **The designer's one-line why** | Composer, web review, iOS | Require the artifact's `context`, relabel it, render it under the question as "Leah's note" | The highest-leverage anxiety reduction available; puts the designer in the room at the moment of decision | `project_approval_artifacts.context` (exists, 00463); `project-approval-document.tsx`; `ProjectApprovalReview`; `DecisionDetailView` | S–M | Requiring a field changes designer flow — confirm with Leah before enforcing |
| 4 | **Three doors, three stamps** | Web review, The Making, iOS | Add a `RETURNED` stamp variant; shorten all three to single-word marks | Ends the asymmetry that quietly teaches "approve is the real answer" | `gate-stamp.tsx`; `project-approval-review.tsx`; stamp tests | S | Snapshot/test churn |
| 5 | **Say what changes requested needs, kindly** | Web review, iOS | Require the note on web with instructional copy; pre-open an encouraged composer on iOS | Turns a validation error into the point of the door | Web validation before `respond_project_approval`; `DecisionsViewModel`; **blocked on the contract's pending DB-layer ruling** | S | Web/iOS asymmetry must be deliberate and documented |
| 6 | **The approval receipt** | Email, push, in-app | Send the client a resolution confirmation with a real "what happens next" line; `decision_resolved` goes only to the designer today | Closure is what makes deciding feel good; today the biggest act in the product is met with silence | `_enqueue_decision_notification` recipient resolution (00466); a client-facing kind; `decision-notify.ts` | M | Stage-2 recipient resolution must stay bound to the frozen snapshot |
| 7 | **Household names, not "Designer"** | Web discussion, iOS | Label authors by given name; attribute studio comments to the studio | Fixes an outright misattribution and makes a partner present instead of erased | `DecisionDiscussion`; a display-name read for co-household authors; RLS review | M | Must not expose internal reviewer identities — the contract forbids it |
| 8 | **"Loop in" a household member** | Web, email | The lead invites a participant who reads and comments but never answers | Spouse alignment is one of the five anxieties and has no product answer today | New invite path; household membership; ADR 0003 stays literally true; **blocked on the lead/co-approver ruling** | L | Auth and RLS surface; easy to accidentally imply approval authority |
| 9 | **She sets the pace** | Web, iOS, email footer | Per-decision snooze ("ask me Sunday") and a three-value cadence in plain words | A homeowner who can turn the volume down never has to turn us off | `notification_preferences.reminder_cadence` widening; a snooze store; `decision-reminders` honoring both | M | Snooze must never suppress an overdue notice or a superseding edition |
| 10 | **End the "Awaiting studio issue" dead end** | `/decisions`, The Making | Replace the bucket copy with a real sentence, a rough expectation, and a way to ask | Removes the one state where she did her part and the product goes quiet | `decisions/page.tsx`; `the-making.tsx` deferred buckets | S | Any stated timing must be true — "usually a day or two," never a promise |
| 11 | **Push that keeps the primer's promise** | iOS, backend | Emit `entity_type` `proposal` and approval pushes; fix the in-app/push double-count seam first | The primer already promised this and the routes exist and are tested | `notify_client_attention` (00534); `apns-send`; `NotificationRouter`; the `channel IN (in_app, push)` filter seam | M | Ship the double-count fix first or she reads every notice twice |

---

## 9. Open rulings for Kody and Leah

**Carried from `APPROVAL-AUTHORITY-CONTRACT.md` — copy is blocked on all five:**

1. **Are the lead and co-approver household approvers or internal studio reviewers?** §5 assumes household. If the ruling goes the other way, "loop in" loses its authority implication and every co-approver string is rewritten.
2. **Does every outcome require click-through or e-signature evidence?** Stage-2 review is `portal_clickthrough` and the response is a radio plus a button, while a proposal takes a typed name. Moving approvals to a typed signature changes §4's ceremony materially — and would be the more fitting act for a money moment.
3. **Must "changes requested" carry a comment at the database layer?** Proposal 5 ships web-required and iOS-encouraged in the meantime. A DB requirement makes the surfaces consistent but strands installed clients that cannot supply one.
4. **Are cost, schedule, and lead-time deltas additive or independent?** §3 states them side by side because summing them would be an invented number. A ruling unlocks the shorter sentence.
5. **What is the immutable-retention policy for generic project documents?** Until it lands, project documents cannot be approvable artifacts, so §3 covers only plan sets, spec books, and budget versions.

**Raised by this lane:**

6. **Who signs email to a homeowner?** This document replaces `— Patina` with the studio's own name everywhere. It follows from the vision ("the studio leads, Patina is quiet") and is a visible brand change to approve deliberately.
7. **Does the client get an approval receipt?** Proposal 6 says yes. Confirm it does not read as one more email to someone who just told us she is busy.
8. **Is "HELD" the right stamp word?** Precise, slightly institutional. Alternatives: "TALKING," "ON HOLD," "PAUSED." Leah's ear decides.
9. **Do approvals push at all?** The iOS primer promises decisions, proposals, and invoices. Either keep the promise for approvals or narrow the primer's copy to match reality.
10. **What happens after the overdue notice?** §6.2 says Patina goes quiet and hands the item to the studio. Confirm the studio wants that hand-off rather than a continuing ladder.
11. **Should the checksum ever be client-visible?** Proposal 2 removes it from email and keeps it in the record. Confirm no evidentiary requirement puts it in her copy.
12. **One word for the ask.** The product says approval, decision, gate, sign-off, and task for the same family of thing. Recommendation: **"approval"** in client copy always; "decision" only for option choices like "Rug color — Natural vs Sand"; "gate" never in front of a homeowner.
13. **Does a partner get his own login?** Proposal 8 assumes yes. If not, the household design collapses to shared-link reading and §5 needs a different shape.
