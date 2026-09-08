# Panel review — Nora Ellison, homeowner lens

Reviewer slug: `nora-homeowner`. Persona: Nora Ellison, 52, physician, first-time
design client (Local Dev Studio / Leah Hartwell), Cedar Lane Study. Invoice
$4,060 due September 11; built-in shelving on the north wall installed and
awaiting my acceptance.

## In character — the walk

**Walk 1, lunch, desktop.** The current house page
(`client-local-dev-desktop.png`) tells me whose page this is in three
seconds — "LOCAL DEV STUDIO," "PREPARED FOR NORA ELLISON," "Cedar Lane
Study." The headline "Finished work waits for your acceptance" says there's
something to do, and within the first screen I have both the money and the
date: "The house stands at $11,100 agreed," "Owed on the open invoice $4,060
· due 11 September," repeated again in the letterbox. That's the most
reassuring thing on either page today — stated twice, in the same words, and
it never shifts as I read on. Labels like "THE STORY POLE" and "A GATE · THE
LINE STOPS UNTIL YOU ACCEPT" are jargon I don't know, but the ask underneath
— type your name, accept the shelving, $2,980 — is plain. Maybe 30 seconds
to orient, most of it spent on two words, none of it spent worrying about
money.

The proposal's house page (`slide-06-1440.png`) orients me just as fast, in
a different way: a gorgeous living-room photo, "Your home, taking shape," a
quoted note from "Leah." Warmer, more like a magazine. But I look for what I
came here for at lunch — what I owe and when — and it isn't on the page.
There's a $2,400 "selection total" for a coffee table and a note that
reviewing doesn't approve or order anything, but nothing about my $4,060 due
in four days. And the photo isn't my room — I have a bookcase built into a
north wall, not this couch and painting. A caption below, in small gray
type, says "illustrative concept, not an installed room," but a caption that
small doesn't compete with a photograph that convincing. First feeling:
pride at how far things have come. Second feeling, on catching the caption:
a small flinch — I was about to feel proud of a room I don't have. The
current page's line drawings never do that to me; they never pretend to be
photographs. The proposal reads like an ad for a show-home; the current page
reads like a ledger for my house.

**Walk 2, the decision.** The current gate asks me to type my full name
against a stated dollar figure — "TRADE SCOPE · $2,980" — under a headline
that says the work is finished and I'm accepting it. It feels like signing a
delivery slip: cold, but unambiguous about what I'm agreeing to.

The proposal's flow (`slide-07-1440.png` and states) is nicer software — a
finish toggle, a running total, "Continue to approval," a confirm panel, a
receipt — but "approval" is a heavy word for something the copy insists,
three separate times, does nothing: "does not charge you or place an
order," a checkbox reading "I understand this records my selection only,"
then a receipt repeating "No order placed. No payment taken." By the third
disclaimer I'm not reassured, I'm suspicious — if it truly does nothing, why
does it need a checkbox and a receipt to keep saying so? A checkbox is what
I click through on a hospital intake form without reading it; it doesn't
feel like commitment, it feels like liability language. If Leah and I ever
disagreed about what I'd agreed to, I'd trust the version where I typed my
own name against a dollar figure over the one where I ticked a box that
itself says it isn't binding.

**Walk 3, 11pm, phone.** The current phone page keeps money and the gate
where a thumb reaches, but "ACCEPT THE FINISHED WORK" renders as underlined
text, not a button — tired, I might read past it as a caption. The
proposal's phone frames go the other way: a big solid green "Continue to
approval" button, unmistakably tappable — genuinely more confident on a
phone than what exists today. But the same omission follows it down: nothing
about my invoice appears on either phone mockup, and 11pm-me is exactly the
person who needs that answered without hunting.

**Walk 4, nothing new.** The proposal's "Nothing needs you today" panel
(`slide-11-1440.png`) is the best copy in the deck: "Your latest approved
direction remains here... No invented urgency, random recommendations or
artificial progress." Exactly the tone I want from someone handling my
money. The current page has no equivalent — a quiet day is just silence, the
doorstep sentence not appearing at all. I can't tell if a first-time client
reads that absence as "you're caught up" or as a missing page. I'd come back
either way while I'm waiting on an invoice, but the proposal's explicit
reassurance would make it easier not to feel like I have to check.

## Findings

```
ID | severity | confidence | surface | claim | evidence | proposed change
```

N1 | P2 | high | proposal | House-page mockup states no money owed anywhere, though it's the first screen a client sees | `slide-06-1440.png` | Add an owed/due line to the house-page header, mirroring the current doorstep
N2 | P1 | high | proposal | A photoreal room photo, disclaimed only in small gray caption text, risks being read as the client's real finished room | `slide-06-1440.png` image + caption | Don't use photoreal renders for unbuilt rooms, or mark "not your room" as prominently as confidence-rendering already requires elsewhere — touches: R107 (:3775)
N3 | P2 | high | proposal | The current drawn rooms can never be mistaken for real photos; the proposal's photoreal room can, recoverable only via a small caption | `client-local-dev-desktop.png` vs `slide-06-1440.png` | Keep drawn-room grammar for anything unbuilt; reserve photography for verified installed work
N4 | P2 | high | both | Three stacked disclaimers (button copy, checkbox, receipt) on one low-stakes act reads as over-explained and raises suspicion instead of lowering it | `slide-07-1440.png`, `-state-confirm.png`, `-state-receipt.png` | State the consequence once, near the button; drop the checkbox if the act truly has none
N5 | P2 | med | proposal | "Approval" promises more finality than the act delivers, given the copy repeatedly says it approves nothing | `slide-07-1440.png` | Rename the low-stakes act away from "approval"; reserve that word for terminal acts, as the current gate does
N6 | P3 | med | current | "THE STORY POLE" / "the line stops until you accept" are internal metaphors a client can't decode, though the ask underneath is clear | `client-local-dev-desktop.png` | Restate client-facing labels in plain words; keep metaphors as internal naming only
N7 | P1 | high | both | Typing a full name against a dollar figure reads as deliberate and attributable; a checkbox plus colored button reads like a click-through I wouldn't trust in a dispute | `client-local-dev-desktop.png` gate; `slide-07-1440-state-confirm.png` | Keep/adopt typed-name confirmation for consequential acts; reserve one-click confirm for genuinely low-stakes ones, stated once
N8 | P2 | med | current | The Threshold's quiet day is silence, not a stated reassurance, unlike the proposal's explicit "nothing needs you" | `current-state.md` §3 vs `slide-11-1440.png` | Add a calm "nothing needs you" line when there is genuinely no ask — touches: VISION-DECISIONS.md V8
N9 | P2 | high | current | The terminal accept action renders as underlined text, not a button; at night on phone it could be read past as a caption | `client-local-dev-phone.png` | Give the terminal accept action more visual weight than a body-text link — touches: I107 (no boxes/fills)
N10 | P2 | high | proposal | Neither phone mockup shows the invoice or its due date, the one fact that matters most this week | `slide-06-390.png`, `slide-07-390.png` | Surface the owed/due line on the client house-page mockup at both breakpoints
N11 | P1 | high | proposal | Proposal studio-name fixture ("Middle West Studio") differs from the real fixture ("Local Dev Studio"); whose name is on a document must never be a leftover | `proposal-digest.md` §6 vs `current-state.md` §1 | Sweep placeholder studio names before anything ships; verify name interpolation end to end
N12 | P3 | med | proposal | Finish swatches change price context but explicitly don't change the room photo, though a user picking a finish would expect the photo to update | `slide-07-1440-state-smoked.png` caption | Either swap the photo per finish, or make clearer before the click that the photo won't change
N13 | P3 | low | proposal | Precise price ($2,100) sits beside vague timing ("lead time to be confirmed") — most of the rest of the system pairs money with a date | `slide-07-1440.png` | Where price is precise, state timing with equal precision or explain why not yet
N14 | P3 | med | current | "Previously" entry reads as truncated mid-sentence ("Nothing...") — unclear if real or a capture artifact | `client-local-dev-desktop.png` | Verify this isn't truncating in production; an incomplete record undermines trust in the record
N15 | P2 | high | both | "Letterbox" and "mat" are internal metaphor names; a client with no design background wouldn't connect them to "where I pay" or "where I sign out" without trial and error | `current-state.md` §3, §5 | Confirm client-visible copy uses plain words even where component names keep the metaphor internally
N16 | P1 | high | proposal | Receipt state's "next step" has no date or channel ("your designer confirms... separately") — vague exactly where the brief flags vagueness as a trust failure | `slide-07-1440-state-receipt.png` | State how and roughly when the designer follows up, matching the rest of the system's habit of dating every step
N17 | P2 | med | both (designer side, visible to me as the client) | The proposal's Desk mockup shows glossy imagery at 3 jobs; the current Desk is dense plain-text at real load (16 jobs, 1 overdue) — as the client whose file is one of those rows, I want confidence Leah can still find me at load | `desk-final-desk-1440.png` vs `slide-08-1440.png` | Validate any Desk imagery against 16–43 live jobs, not the demo's 3 — touches: R126
N18 | P3 | low | proposal | Deck chrome overlaps mockup content in full-page captures | `slide-06-1440.png`, `slide-07-1440.png` | Capture artifact per the brief's own note — no change needed
N19 | P2 | med | current | The letterbox's envelope line-drawing is calm but not self-explanatory as "invoice" on first view | `client-local-dev-desktop.png` | Consider a plain-language label ("Invoice") on first view, receding like the existing MarginNote pattern
N20 | P3 | med | current | A dark "N" widget appears in the desktop margin; current-state's own known-issues list records it overlapping the letterbox's balance line on phone ≤600px — I could not independently confirm the overlap in the phone capture I reviewed | `client-local-dev-desktop.png`; `current-state.md` §8 item 3 | Re-verify the phone overlap against the balance-due sentence, which is marked never-dim for exactly this reason

## Marked new / known / touches (after reading §7–8)

N1–N7, N9–N17, N19 — **new**, formed cold from the walk. N8 — **new**, but
sits against V8's daily-return license for the client page (touches: V8).
N18 — **known**, matches the brief's own capture-artifact note. N20 —
**known**, matches current-state.md §8 item 3 verbatim; I flagged that I
couldn't reproduce it myself rather than claiming independent confirmation.
N2/N3 touch R107 (:3775, "confidence renders honestly") — the same honesty
principle already governing drawn rooms is what the photoreal mockup room
puts pressure on. N9 touches I107 directly (scored-ink actions carry no
boxes/fills) — my proposed fix conflicts with this ruling; flagging rather
than resolving. N17 touches R126 (Kody's rejection of banded Desk color).

## What the proposal gets right

- The decision-card sequence — see the room, read the designer's framing,
  see price against allowance, then decide — is a genuinely better emotional
  order than a bare dollar figure, and matches how Leah would walk me
  through a choice in person.
- "Nothing needs you today" is the best single piece of copy in the deck:
  calm, factual, explicit that it won't invent urgency.
- The mobile decision flow puts a full-width, high-contrast, unmistakably
  tappable button right where my thumb is — better than the current
  equivalent.
- Pricing against my allowance ("$200 below allowance"), not just a raw
  total, answers "is this okay" before I have to ask.
- The retry/error copy ("Selection wasn't saved. Your choice is still here.
  Check your connection, then try again") reads as a human sentence, not a
  technical string.
- The accessible-forms notes on slide 12 (16px body, labeled inputs, inline
  errors, focus return) are the right things to protect, and none looked
  contradicted in the mockups I reviewed.

## What's already excellent in the current portals

- Money owed and its due date, stated twice in identical wording, within
  the first screen of the house page — no hunting, no reconciling two
  numbers.
- Generated room drawings never risk being mistaken for a real photo — no
  moment of feeling tricked.
- The typed-full-name accept gate for finished, owed work is the most
  trustworthy interaction I saw across either design — the one I'd point to
  in a dispute.
- "Previously" as a running, dated, plain record of every signed document
  gives me a paper trail without asking Leah to resend anything.
- The letterbox balance line is marked to never be dimmed or hidden — the
  right intent, even where a phone overlap bug undercuts it today.

## Top 5 changes for polish & professionalism

1. **Put money owed on the house page, always, both designs, both
   breakpoints.** Where: top of the client house page, same spot the current
   doorstep uses. What: "Owed on the open invoice $X · due [date]," present
   even in illustrative states, above or beside the featured decision — not
   buried in a footer/letterbox the reader must find. Phone: identical
   placement, right after the headline. States: null-render when nothing is
   owed, never a $0 placeholder. Why: this is the fact a client opens the
   portal to check; a redesign that drops it is a regression regardless of
   polish elsewhere. touches: R135, R137.

2. **Reserve photoreal room photography for verified, installed rooms.**
   Where: client house page, room bands. What: a hard rule — unbuilt rooms
   get the current drawn-room grammar (or a clearly-illustrated sketch), not
   a photoreal hero image. Sizes: current drawn-room proportions. States:
   installed → real photo; not installed → drawing, dashed where
   unconfirmed. Why: a convincing fake room risks a moment of feeling
   deceived, which damages trust in every other number on the page. touches:
   R107 (:3775).

3. **Collapse the triple disclaimer on the selection-recording action into
   one sentence, and stop calling it "approval."** Where: decision-card CTA
   and confirm step. What: rename toward something matching its actual
   weight ("Note my choice"); state the consequence once, near the button;
   drop the checkbox unless there's evidence clients skip the sentence.
   Order: photo → price/allowance → one sentence of consequence → button.
   Why: three reassurances on one low-stakes click reads as hedging, not
   clarity.

4. **Give the terminal, money-real accept action visual weight matching its
   consequence, especially on phone.** Where: the current accept-gate CTA.
   What: an ink-fill or solid-underline state distinct enough from a plain
   link that a tired or first-time user recognizes it as the thing to press.
   Sizes: no smaller than the existing 44px control box. States: default /
   pressed (existing ink-fill) / disabled until name typed. Why: an action a
   client could miss at 11pm is a failure regardless of how correct the
   underlying grammar is. touches: I107 (flagging the conflict, not
   resolving it).

5. **Say what happens next, with a date, every time an act is recorded.**
   Where: the proposal's receipt state and any equivalent current-portal
   confirmation. What: add a concrete next step ("Leah will confirm by
   [date]") matching the specificity the system already gives money and
   phases. States: if no date is knowable yet, say so explicitly ("date to
   follow"). Why: every other number on these pages is dated; an undated
   next step breaks that pattern exactly where a client wonders "did this go
   anywhere?"
