# Leah Hartwell — studio principal — portal polish review

## The walk

**Monday, coffee, laptop.** I open the current Desk
(`desk-final-desk-1440.png`). Before I've even scrolled, it tells me what I
need: "One thing is overdue — Vandersteen," sitting right under the roster
head, ahead of every stage group. That's the fastest possible answer to the
first question I ask every morning. The Brief stage under it gives me the
lead I have to answer — "Marcus Wright · new lead — respond by Aug 31" in
one render, "respond by Sep 5" in the other — right there in plain text, no
click required. Nothing above the fold I didn't need: a greeting, a date, an
appears-once note, three acts, the roster. I could open this at a client's
kitchen table and nobody would think twice. What it does *not* do: nowhere
does it tell me which client replied to me last night, and nowhere does it
say "pick up where you left off Friday." Those are real gaps in the current
Desk, not proposal talking points — I'd have to remember or dig for both.

Now the proposed Desk (`slide-08-1440.png`). It leads with "Continue where
you left off" and a big photo of the Alder House with "Client feedback:
'We love the warmer oak'" underneath — that solves my Friday problem and my
"who replied" problem in one gesture, genuinely well done. But then: "Every
job · **3 shown in this prototype**." I have sixteen live jobs and their own
audit says my Desk had forty-three the day they looked at it. At my real
load, "Ready for your hand" has no stated limit, and the roster that carries
my whole studio is pushed under a hero photo, a concept board, and a task
list. The compact-rows toggle in `slide-08-1440-state-compact.png` shows
they thought about density, but never proven past three rows. I'd ask, by
name: show me this Desk with all sixteen jobs in it before I say yes. What
I'd hide from a junior: nothing structural — I'd rather my junior see the
whole roster too. Which one still works at 43 jobs? The current one, because
it's a list, and lists don't break.

**Tuesday, Nora's kitchen table.** Current Threshold (`client-local-dev-
desktop.png`, Cedar Lane Study): "$4,060 · due 11 September," a schematic
line drawing of the study with a dashed footprint for the shelving still
awaiting my client's word, and a plain underlined "ACCEPT THE FINISHED WORK"
after she types her name. I'd show this without apologizing — the numbers
are exact, the drawing doesn't pretend to be more finished than it is. My
only hesitation: a first-time client seeing hand-drawn dashes and hatching
might read "unfinished app" rather than "honest drawing." I'd want one line
of explanation the first time she sees it.

The proposal's client opening (`slide-06-1440.png`): "Your home, taking
shape," a beautiful, moody, photorealistic living room, my note in quotes,
"$2,400... within the $2,600 allowance," a sage "Ready to review" pill, a
solid dark-green "Review the table selection" button. Would I show this to
Nora without apologizing? Only if she never asks "wait, is that my room?" —
and she will, because it looks completely real, and the disclosure ("Living
room · illustrative concept, not an installed room") is caption-sized type
under the image, not something she'd read before reacting to the photo. My
$2,400 table looks like a considered recommendation right up until she
realizes the room around it is fiction — then it looks like I dressed up a
product listing as her home. That's the single biggest risk in the deck for
me. The pill-and-button pairing, plus the receipt screen's green checkmark
badge (`slide-07-1440-state-receipt.png`), reads like a checkout flow — I've
fired software for looking like this. Clean, but not *my* clean. On slide 9's
finish comparison — the textured oak swatches in the designer document —
yes, I want that, for *me*, not for Nora; the simpler circular swatches she
gets on slide 7 are the right amount of choice for a client deciding on
warmth, not grain direction.

**Thursday, phone, between visits.** Current mobile Desk
(`desk-final-desk-390.png`): overdue line and my first five Brief-stage
jobs are on screen before I've scrolled past my own thumb's first swipe,
bottom tab bar always there. I can check what needs me and go back to
tile samples in under ten seconds. The proposed mobile Desk
(`slide-08-390.png`) makes me scroll past a full-width hero photo and a
concept-board collage before "Ready for your hand" appears at all — on a
sidewalk between two site visits, that costs me real time. `slide-12-390.png`
shows the same content in a phone-bezel specimen, more condensed, and I do
like the inline date-field error and the plain textarea — that's the kind of
detail that makes software feel like it was built by people who use it.

## Findings

L1 | P3 | high | current | Overdue-job callout is the single fastest thing on the Desk | `shots/current/desk-final-desk-1440.png` ("One thing is overdue — Vandersteen," ahead of any stage group) | Keep this line's position exactly; any redesign must not push it below a hero element.
L2 | P1 | high | proposal | Proposed Desk buries the full roster under a hero photo + task card, demoed at 3 jobs against the deck's own "43 jobs" audit finding — no proof this holds at real scale | `shots/proposal/slide-08-1440.png`; `proposal-digest.md` §3 slide 2, §6 roster-count discrepancy | Require a Desk mockup rendered with a real 16–43 row roster, all seven stages, before any sign-off. touches: VISION.md:58, V8
L3 | P1 | high | proposal | Client hero image is a photorealistic generated room that is not the client's actual room; disclosure is caption-sized text, not visually loud | `shots/proposal/slide-06-1440.png` ("Living room · illustrative concept, not an installed room") | Put the "not your room" label on the image itself (a pinned corner strip, ≥14px, both breakpoints), not only in a caption line below it. touches: R107
L4 | P2 | med | proposal | Sage "Ready to review" pill + solid CTA + green checkmark receipt reads as e-commerce checkout rather than a designer's recommendation | `slide-06-1440.png`, `slide-07-1440-state-receipt.png`; source CSS `.pill`, `.check-round` (index.html:9,9) | Drop the pill and checkmark badge; state readiness in a plain sentence in the designer's voice. touches: VISION.md:73, I107
L5 | P2 | high | current | Threshold's hand-drawn hatch/dash room diagrams risk reading as "unfinished" to a first-time client despite being intentionally honest | `shots/current/client-local-dev-desktop.png` ("One mark stands open on this drawing") | Add a one-time, dismissible explainer the first time a client sees the drawing key, so restraint doesn't read as incompleteness. touches: R107
L6 | P3 | high | current | FF&E lines missing a photo show a bare diagonal-hash placeholder beside real dollar amounts as high as $14,880 | `shots/current/document-final-document-ffe-1440.png` ("Brass-and-oak console" $3,600; "Walnut nightstands ×2" $1,850) | Give the placeholder a small material/category glyph and a "photo pending" label instead of a bare hash block on high-value lines.
L7 | P2 | med | both | Terminal money/approval actions are visually inconsistent: invoice "Pay" is a solid filled button; Threshold's "accept finished work" is an underlined text link | `shots/current/invoice-open-desktop.png` ("Pay $9,130.00" filled button) vs `shots/current/client-local-dev-desktop.png` ("ACCEPT THE FINISHED WORK" text link) | Pick one visual weight for acts that finalize money or acceptance and apply it to both surfaces. touches: I107
L8 | P2 | med | proposal | Proposal's client decision screen correctly weights one filled primary next to one underlined secondary for the same decision | `shots/proposal/slide-07-1440.png` ("Continue to approval" filled vs. "Request a change" underlined) | Borrow this exact hierarchy for the Threshold's WallGate/DoorGate accept actions. touches: I107
L9 | P3 | low | proposal | "Nothing needs you today" reassurance panel is warm and explicitly flagged as an example; untested against a genuine multi-week gap | `shots/proposal/slide-11-1440.png` ("Example designer note · replace with a genuine project update") | unverified — request a version populated with a real project's longest actual gap before judging tone.
L10 | P2 | high | proposal | Designer-only finish comparison (textured oak swatches) is appropriately richer than the client-facing swatch picker | `shots/proposal/slide-09-1440.png` vs `slide-07-1440.png` | Keep the split; confirm in build that the textured comparison component is never reused on the client route. touches: R126, I107
L12 | P3 | high | current | Mobile Desk keeps the overdue line and first Brief rows on-screen with a persistent bottom tab bar — a genuine "check it in a thumb" pattern | `shots/current/desk-final-desk-390.png` | Keep; this is exactly the on-site, between-visits pattern I need.
L13 | P2 | med | proposal | Proposed mobile Desk requires a full screen of scroll (hero photo + concept collage) before "Ready for your hand" appears | `shots/proposal/slide-08-390.png` | On mobile specifically, promote the action list above the photo, or shrink the photo to a thumbnail strip. touches: VISION.md:58
L14 | P3 | high | proposal | Mobile date-field error uses a real inline message plus `aria-invalid`, not a color-only cue | `shots/proposal/slide-12-390.png` ("Choose a date after today. This is a static error specimen.") | Adopt this pattern for any current form in either portal (unverified whether current forms have an equivalent).
L15 | P3 | high | proposal | Component sheet documents a 44px minimum target and a visible 3px focus outline on every interactive element | proposal source `index.html:9` (`outline:3px solid var(--olive)`); `shots/proposal/slide-10-1440.png` | Adopt the focus-visible convention repo-wide regardless of which visual language ships; current-state docs don't name an equivalent convention. touches: expert judgment
L16 | P3 | low | current | No distinct marker on the Desk surfaces "client replied last night" separately from "new lead" or "quiet" | `shots/current/desk-final-desk-1440.png`, `desk-onboarding-02-desk.png` — no such state observed | Add a quiet, non-badge sentence-level marker (matching the overdue-line pattern) for a fresh client reply. touches: VISION.md:50 (informational only, not an engagement mechanic)
L17 | P3 | med | proposal | New olive/ochre accents read as warm, material-appropriate for an interior studio, not corporate | `shots/proposal/slide-05-1440.png` token row; `current-state.md` §5 confirms zero current usage | Adopt the palette even independent of whichever interaction patterns ship on top of it. touches: R126
L18 | P2 | med | current | The "Previously" ledger and letterbox both read as dated, named, and exact — the money/paper-trail clarity the job demands | `shots/current/client-local-dev-desktop.png` ("Previously" list with dates and SIGNED/SENT tags; letterbox total/paid/balance) | Keep; don't let any redesign compress or visually de-emphasize this ledger.
L19 | P2 | low | proposal | Designer-facing "Save direction draft" sits below internal-only language ("Client's stated preference") with no observed leakage of that language to the client route | `shots/proposal/slide-09-1440.png` | Keep the internal/external tone split; verify in build the client route never echoes unconfirmed "stated preference" copy back at her. touches: R126
L20 | P1 | med | both | Current Threshold's honest schematic never risks the "is this my room" confusion; the proposal's photoreal hero introduces exactly that risk | `shots/current/client-local-dev-desktop.png` vs `shots/proposal/slide-06-1440.png` | Consider a middle path: keep the honest schematic as the primary record, and let a clearly-labeled "inspiration" reference photo sit beside it at reduced size, never as the hero. touches: R107
L21 | P3 | high | current | `client-portal/globals.css` still declares `--color-error: #C77B6E` though refusals must never be red-by-name on this page | `current-state.md` §5, citing `apps/client-portal/src/app/globals.css:53` | Remove the token or rename/repurpose it so no future component can reach for red-by-name on the Threshold. known: DECISIONS.md:10717, current-state.md §8 item 9

## What the proposal gets right

- "Continue where you left off" and a client-feedback quote surfaced right on the Desk (`slide-08-1440.png`) solves a real problem: I don't currently have a fast answer to "what was I doing Friday."
- The client decision screen's line-item math (`slide-07-1440.png`: Piece, Delivery, Tax, Selection total, Allowance, Below allowance) is exactly the kind of transparent arithmetic that makes a $2,400 recommendation defensible in front of a client who is spending real money.
- Repeated, explicit non-commitment language ("Reviewing does not approve or place an order," "Approval records this selection... does not charge you") on every screen of the decision flow — this protects me from a client who thinks she already bought something.
- The richer, textured finish-comparison swatches scoped to my own document (`slide-09-1440.png`), not pushed onto the client — correctly reads that I need more material information than she does.
- New olive/ochre palette (`slide-05-1440.png`) feels like it belongs in an interior design studio, not a SaaS dashboard.
- Documented 44px targets, visible focus rings, `aria-invalid` inline errors, and a stated reduced-motion behavior (`slide-11-1440.png`, `slide-12-1440.png`) — real accessibility discipline, not an afterthought.
- The compact-rows density toggle on the Desk (`slide-08-1440-state-compact.png`) at least gestures at the real-load problem, even though it's never demonstrated at real load.

## What's already excellent in the current portals

- The Desk's "One thing is overdue — [name]" line: the single fastest triage signal I could ask for, positioned exactly where my eye lands first.
- The stage-grouped roster itself: it is just a list, so it does not visually break at 16 jobs or at 43 — the current design's biggest structural strength.
- The Threshold's letterbox and "Previously" ledger: exact dollar amounts, exact dates, signed/sent status on every past document — nothing vague about money or paper here.
- The invoice's payment-method breakdown (`invoice-open-desktop.png`): showing the fee difference between bank transfer, card, and check in dollars, not fine print, is the kind of honesty that builds trust with a homeowner paying five figures.
- Mobile Desk's persistent bottom tab bar and above-the-fold overdue/lead information — genuinely built for someone checking a phone between two site visits, not a demo.
- The room drawing's confidence-honesty convention (dashed/lighter for unconfirmed) — even though I'd want a first-time explainer, the underlying idea that the drawing should never claim more certainty than the studio has is exactly right for a business built on trust.

## Top 5 changes for polish & professionalism

1. **Prove the Desk at real load before anything ships.** Where: the proposed Desk (`slide-08-1440.png`/`-390.png`). What: render the same layout with a genuine 16-row roster across all seven stages (use the repo's own Leah/16-job fixture), and again at 43. Under what conditions: before any decision to adopt "Ready for your hand" or the hero-photo treatment. At what scale: full studio scale, not 3 jobs. Why: a layout that only works at demo scale is not a polish gain for the person who actually has to use it every morning. touches: VISION.md:58, V8
2. **Move the "not your room" disclosure onto the image, not under it.** Where: any client-facing generated/concept room photo (Threshold hero, decision screens). What: a persistent, high-contrast label pinned to a corner of the image itself (e.g., "CONCEPT — not [Project] yet"), ≥14px, present at both 1440 and 390, not a caption line that requires reading past the photo. States: normal, and a second state once a real installation photo replaces it (label disappears). Why: a beautiful fake room next to a real dollar figure is the fastest way to lose a client's trust in everything else on the page. touches: R107
3. **Replace the sage pill / checkmark-badge decision language with a plain designer sentence.** Where: `slide-06`, `slide-07` "Ready to review" pill and receipt checkmark. What: remove the pill component and the round check badge; state the same fact ("one decision is ready for you") as body text in the existing type scale, and let the receipt confirm in a sentence rather than a checkout-style badge. Why: pills and checkmark badges are the visual grammar of consumer checkout flows; a studio that fired software for looking amateur should not adopt them wholesale. touches: VISION.md:73, I107
4. **Unify the visual weight of terminal/financial actions across both portals.** Where: Threshold's WallGate/DoorGate "accept" actions and the invoice's "Pay" button. What: pick one control style — filled button or bordered — for any action that finalizes money owed or work accepted, and apply it identically on both surfaces; low-stakes navigational acts can keep the scored-ink text treatment. States: default, hover, disabled (e.g., before consent checkbox), loading. Why: a client should never have to guess, from visual weight alone, whether tapping something is reversible or final — right now one surface treats "accept $2,980 of finished work" as a plain text link while another treats "$9,130 payment" as a solid button. touches: I107
5. **Add a one-time explainer for the room-drawing key, and a distinct "client replied" marker on the Desk.** Where: Threshold, first view of any room's drawing key; Desk roster, per-job. What: (a) a dismissible margin note the first time a client sees the hatched/dashed drawing, explaining what the marks mean, styled like the existing `MarginNote` pattern; (b) a quiet sentence-level marker (not a badge or count) alongside a job's existing state line — "Nora replied last night" — using the same typographic register as "One thing is overdue." Why: (a) prevents intentional restraint from reading as an unfinished product to a first-time client; (b) closes the one real gap I found in my own current morning routine — knowing who wrote back overnight — without adding a single badge, tile, or notification bell. touches: R107 (a); VISION.md:50 (b, informational only)
