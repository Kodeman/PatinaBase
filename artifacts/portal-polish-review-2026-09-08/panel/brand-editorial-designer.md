# Panel review — brand, editorial voice, and trust

**Slug:** `brand-editorial-designer` · **Date:** 2026-09-08
**Lens:** identity systems for design studios, architects, and premium
professional-services firms. I judge how each design makes Patina — and the
studio using it — look and sound.

---

## The short version

The current portals are typeset as **documents from a firm**. The proposal is
typeset as a **marketing site about a firm**. That difference is the whole
review from where I sit.

The current system already owns the single most valuable brand move in the
product: the standalone invoice's letterhead-and-colophon —
*"Quist Interiors / Des Moines, Iowa · prepared by Nora Quist"* at the head,
*"Prepared by Quist Interiors · Sent through Patina"* at the foot
(`shots/current/invoice-open-desktop.png`). The studio is the author; Patina
is the press. That is the promise, rendered.

The proposal never reproduces it. Across fifteen slides the studio's name
appears **twice** in total (`grep -c 'Middle West Studio' index.html` → 2),
the homeowner's name appears **zero** times, and the client's decision page,
receipt, and milestone carry neither. What they carry instead is a hero
photograph, a status pill, a filled CTA, and a green success card with a
circled ✓. A homeowner who receives that page cannot tell which firm sent it.
A studio principal opening it in front of a paying client is showing her
client a software product, not her own work.

What the proposal is right about — and it is a real, unglamorous truth — is
that the current pages are so restrained they read as *administrative*. The
homeowner sees line drawings and hairlines and never sees anything of her own
house. Honest, and dull; and dull is how a studio ends up looking cheap. The
fix is not the proposal's generated stock room. It is the studio's own
material, at real scale, captioned truthfully.

---

## Findings

`ID | severity | confidence | surface | claim | evidence | proposed change`

### Whose brand is on the page

`BE-01 | P1 | high | proposal | The proposed client page never names the homeowner; the current Threshold prints "PREPARED FOR NORA ELLISON" in its letterhead. | slide-06/07/11/12-1440.png — no addressee anywhere; grep of index.html returns no "Prepared for" | Restore a two-sided letterhead on every client surface: studio left, "Prepared for <Client>" right. **new**`

`BE-02 | P1 | high | proposal | Studio identity appears twice in the whole deck and is absent from the decision page, the receipt, and the milestone — the three surfaces where money is decided. | grep -c 'Middle West Studio' index.html = 2 (slide 6 dateline, slide 12 phone); slide-07-1440.png frame reads only "Living room · Table selection" | Put the studio's name (and mark, when set) in the frame of every client surface. **new**`

`BE-03 | P2 | high | both | The current invoice's colophon is the correct Patina-mark policy; nothing else in either design follows it. Both the current Desk footer and the proposed Desk footer carry a full PATINA wordmark. | invoice-open-desktop.png foot; desk-final-desk-1440.png footer; index.html:83 .studio-foot wordmark | Codify: wordmark permitted on designer surfaces (Patina's customer); on client surfaces, "Prepared by <Studio> · Sent through Patina" at the foot is the only Patina mark. **new**`

`BE-04 | P2 | med | proposal | The studio's client page opens with Patina's own deck headline — "A home taking shape." becomes "Your home, taking shape." — so the studio's letter opens in the vendor's marketing line. | slide-01-1440.png h1 vs slide-06-1440.png house heading | Rewrite → project + state: "Cedar Lane Study" / "One decision is waiting for you." **new**`

`BE-23 | P1 | high | current | Letterhead falls back to placeholder identity: the second house prints "LEAH HARTWELL" as the studio and "PREPARED FOR CLIENT USER" as the addressee. | client-local-dev-multi.png header | Never print a fallback in the letterhead — if the client's display name is unset, print nothing rather than "Client User". **new**`

`BE-34 | P3 | med | proposal | The deck frame stamps PATINA on every slide including the client mockups, so the demonstration of a studio-forward page is itself Patina-branded. | slide-06-1440.png | Print the studio letterhead inside the .app-frame so the mockup matches its own caption. **new**`

### Voice, line by line

`BE-05 | P1 | high | proposal | Client-facing copy addresses the reader as "us" — the "us" is Patina, not the studio, breaking the single-author illusion on the one field where the homeowner speaks. | index.html:104 textarea placeholder "Tell us what you would like to change."; slide-12-1440.png | before → after: "Tell us what you would like to change." → "Tell Leah what you'd like to change." Label: "A note to your designer". **new**`

`BE-06 | P2 | high | proposal | Empty and milestone states drop into lifestyle-brand register — copywriting about homes in general, not a studio about this house. | slide-11-1440.png: "Your room story starts here." / "The last layer makes it yours." | before → after: "Your room story starts here." → "No photographs of this room yet. The plan and the material study are below." Milestone quote: the designer's own words, bylined and dated, never a house-written aphorism. **new**`

`BE-07 | P2 | high | proposal | Three registers on one screen: Playfair editorial headings over product-software controls. | slide-11 "Mark update as seen"; slide-07-state-receipt "Reset this demo"; slide-10 "Saving selection…"; slide-08 "Compact rows" | One register per surface. "Mark update as seen" → "Seen" or delete the control. **new**`

`BE-08 | P2 | high | current | Some current metaphors stop being clear exactly where money and logistics are at stake: a homeowner reading "The road · What is not home yet · one piece in motion" must decode a metaphor to learn a delivery status. Same for "the mat", "the letterbox", "Ledgers", "The Post". | client-local-dev-desktop.png §"The road"; client-path-b-desktop.png; desk-final-desk-1440.png footer | Keep the metaphor as the DM Mono running head; lead with the fact beneath it: "ON ITS WAY" / "One piece in motion · reading chair, arriving 12 August". **new**`

`BE-09 | P2 | med | current | "Leave the house" is the only place a metaphor governs a system action a client may need under stress; sign-out lives nowhere else on the page. | client-local-dev-multi.png mat | Word it "Sign out"; keep "the mat" and "leave the house" as running heads. `touches: R135`

`BE-10 | P3 | med | both | Both sides under-sign their one human message. Current signs "— L."; the proposal signs "Leah · Your designer" with an "LW" chat avatar. | client-local-dev-desktop.png studio note; slide-06-1440.png designer note | Sign "Leah Hartwell · Local Dev Studio" with the date; drop the initial-disc avatar (a chat convention on a letter). **known** (open question §8.7 — who writes the note)`

`BE-11 | P3 | med | proposal | The deck's own headlines are interchangeable design-agency lines — nothing in them uses Patina's lexicon (grain, provenance, maker, workshop, honest materials). | slide-07 "A beautiful choice should also be an informed one."; slide-11 "Make the change worth coming back to."; slide-12 "The same clarity, held in one hand." | Not blocking. Note only: the deck is not evidence the team can write Patina's voice. **new**`

`BE-35 | P3 | med | proposal | Three near-identical readiness phrases across two portals in one deck. | slide-06 "Ready to review" + "One decision ready for you"; slide-08 "Ready for your hand" | One phrase per concept: client "One decision is waiting"; designer "Waiting on you". **new**`

### Editorial system

`BE-12 | P1 | high | proposal | The client page is typeset as a marketing landing page — full-bleed hero, rounded card, sage pill, filled CTA. Its closest visual relatives are a furniture retailer's product page, not a studio's client presentation. | slide-06-1440.png, slide-07-1440.png | Keep the photograph; frame it as a document — letterhead, dateline, headline, image plate with a caption rule, line-item table, signature block. `touches: VISION.md:73, D4, R126`

`BE-13 | P2 | high | proposal | The money block loses every document signal the current system has: no reference number, no "prepared by", no cents, no currency, no due date, no signature. "$2,400 / Illustrative all-in selection total" is a price tag. | slide-06-1440.png, slide-07-1440.png line items | Give the decision a reference ("Selection No. 3 · Cedar Lane Study"), print cents in a tabular figure set, put the client's name against the consent line. **new**`

`BE-14 | P2 | high | proposal | The receipt is a green success card with a circled ✓ — consumer-checkout grammar. It has a date but no parties, no reference, and no stated place it persists. | slide-07-1440-state-receipt.png | Redraw as a record: rule, "Selection recorded", parties, reference no., timestamp, "Recorded in Previously". Replace the ✓ disc with the existing `Stamp`. `touches: R51`

`BE-15 | P2 | high | proposal | "✓" is used seven times as typography — inside a pill set with no word space ("✓Selected finish"), in the receipt disc, and in three status strings ("✓ Direction draft saved"). | grep -c '✓' index.html = 7; slide-10-1440.png pill | Delete the glyph; state the fact in words; use `Stamp` for anything terminal. **new**`

`BE-16 | P2 | med | both | Date formats are inconsistent inside a single block. | client-local-dev-desktop.png letterbox: "due 11 September" one line above "due September 11."; proposal mixes "September 7", "September 7, 2026", "Monday, September 7" | One house style — "11 September 2026" wherever a legal date is shown; weekday only in the greeting. **new**`

`BE-17 | P3 | med | current | Two figure styles carry money on one page: DM Mono lining figures in the ledger, Playfair figures for the total, whose dollar sign rides high and crowds the numeral. | invoice-open-desktop.png right rail: "$16,730.00" vs "$9,130.00" | One tabular set (DM Mono) for every currency figure; Playfair for words only. **new**`

`BE-28 | P2 | med | proposal | "Below allowance $200" sits in the same ledger as "Piece $2,100" — a derived comparison typeset as a charge; and "Tax · illustrative $120" prints a tax figure no studio can stand behind. | slide-07-1440.png | Rule off the totals: charges above the rule; "Allowance $2,600 · $200 remaining" as a note below. Never print an illustrative tax figure on a client page. **new**`

`BE-38 | P3 | med | current | "The house stands at $11,100 agreed." is the clearest money sentence in the system, but the amount actually owed sits beneath it at metadata size — the smallest number on the page. | client-local-dev-desktop.png doorstep + letterbox | Set the owed figure at the agreed figure's size. Money owed never recedes. **new**`

### Imagery as brand

`BE-18 | P1 | high | proposal | On the slide arguing for materials, the materials are fake: "Natural oak"/"Smoked oak" sheets are CSS stripe gradients with no grain, and the "Solid oak table" thumbnail is a stock photo of a green-velvet dining set with a glass top. | slide-09-1440.png; index.html alt="Existing sample oak table asset" (assets/table.jpg) | Materials must be photographed samples at real scale, captioned with maker and species; failing that, the piece's own photograph. Never a gradient. **new**`

`BE-19 | P2 | high | proposal | The Desk board's side images (teal-backdrop pendant, green-chair dining room) are off-palette stock no studio in this paper/olive/ochre system would board. | slide-08-1440.png .board-side | Rebuild board specimens from studio captures; hold imagery to the same palette discipline as the type. **new**`

`BE-20 | P2 | high | proposal | Every client-facing photograph is a generated concept of a room that is not the client's ("illustrative concept, not an installed room"). Honest — but the homeowner never sees her own house, which the current portal at least draws. | slide-06-1440.png caption; current `room-band.tsx` draws her actual rooms | Rank image sources: installed photo > studio's own board or scan > vendor product photo at real scale > line drawing. A generated concept of someone else's room must not outrank the client's own scan. `touches: README.md:75-77` **known** (§8.8 — geometry source unresolved)`

`BE-21 | P2 | med | current | 64×64px piece plates are too small to be evidence; a $9,120 reading chair is rendered as list furniture. | tracking-row.tsx:109 (h-16 w-16); client-local-dev-desktop.png Study rows | Raise the plate to 96–120px on desktop above a value threshold; keep 64px in dense schedules. `touches: R126`

`BE-22 | P3 | high | current | The homeowner sees nothing of her own house but line drawings — no scan render, no board, no photography beyond thumbnails. Honest and dull, and dull reads as cheap. | client-local-dev-desktop.png, full page | One plate per room: the studio's own board or scan still, captioned with source and date. Honesty comes from the caption, not from absence. `touches: R126, README.md:75-77`

### Money and documents as brand moments

`BE-26 | P1 | high | current | The standalone invoice is the strongest brand artifact in the system — letterhead + domain, "prepared by", itemized makers, a signed note, honestly priced payment options ("+ $273.75 · This covers what card processing costs."), and the colophon. Nothing in the proposal reaches it. | invoice-open-desktop.png | Protect it; use it as the template for authorizations and selection records. **new**`

`BE-27 | P2 | high | current | Path B's "Furnishings authorization No. 7" — quoted scope in italic, itemized pieces, consent checkbox, typed signature line — is a record a homeowner would keep. The proposal's equivalent (checkbox + green card) is not. | client-path-b-desktop.png vs slide-07-1440-state-confirm.png | Port the authorization's structure into the proposal's approval flow rather than replacing it. **new**`

### Tone consistency between the two portals

`BE-29 | P2 | high | proposal | "One family, different responsibilities" does not hold in the renders: client and designer mockups share the same hero photo, the same olive CTA, the same card and pill. The Desk's dry working voice and the house's formal attended voice have merged into one marketing voice. | slide-06 vs slide-08 (both assets/room.jpg, both .primary); slide-12 both phones | Keep the family in type and paper; differentiate by density and address — designer surfaces terse and third-person about jobs, client surfaces addressed, dated, and signed. **new**`

`BE-30 | P2 | high | current | The mobile Desk bar prints "TODAY 0:47" — a dwell timer — on the studio's front door, in the only golden italic on the page. It makes Patina look like time-tracking software. | desk-final-desk-390.png bottom bar | Remove it, or move it behind "More" as a billable-time entry labelled in words. `touches: VISION.md:50-52`

`BE-33 | P3 | med | proposal | Ochre is declared "a material accent, not a body-text color" on slide 5, then used as the border and ground of the failure panel on slide 11 — so a material sample and an error look alike. | slide-05-1440.png caption; slide-11-1440.png .warning | Give refusal its own treatment (rule + body ink); keep ochre for material only. `touches: DECISIONS.md:10717`

`BE-36 | P3 | low | proposal | The prototype's success language is ephemeral `role="status"` text ("✓ Direction draft saved") — the toast pattern by another name, contradicting the deck's own "persistent inline record" rule on slide 10. | index.html feedback strings; slide-10 "Update / completion" | Specify the persistent inline record the deck already asks for. `touches: R51`

`BE-37 | P2 | med | proposal | Loading is a spinner ("Saving selection…" with a ring); the client portal's `HoldAction` explicitly refuses spinners and uses ink. Two pending languages would ship on the two sides of the same table. | slide-10-1440.png; scored-action.tsx:266-267 | Extend the ink-fill to the designer side rather than introducing a ring. `touches: I107`

### Housekeeping that reads as amateur

`BE-24 | P2 | med | current | The mat prints column headings with no rows beneath them ("THE PAPERS", "YOUR DETAILS"), contradicting the page's own "absence is silence" discipline. | client-local-dev-multi.png mat | Drop any mat column with no content. **new**`

`BE-25 | P2 | med | current | A filled dark disc marked "N" floats over the client page at lower left — the heaviest ink on a hairline page, unlabelled. | client-local-dev-desktop.png, client-local-dev-multi.png | Confirm it never renders for a real client. **known** (§8.3 — tester-notes widget, confirmed high severity, overlaps the letterbox ≤600px)`

`BE-31 | P3 | med | current | The BRIEF stage plate is a slate blue absent from the documented pigments (clay, golden hour, terracotta, sage). | desk-final-desk-1440.png "BRIEF · 5"; current-state §5 | Name the blue in the token set or restage BRIEF onto an existing pigment. `touches: R126`

`BE-32 | P3 | low | current | The Desk footer account chip prints the same name twice — "Leah Hartwell" in Inter over "LEAH HARTWELL" in DM Mono caps — reading as a studio-name fallback showing the person. | desk-final-desk-1440.png footer right | Show the person once when the studio is unset. **new** (unverified whether the fixture's studio is literally named for her)`

`BE-39 | P3 | low | proposal | A proposal that lists "human authorship" under Keep is itself unsigned — "the main design lead" is the only attribution. | slide-15; proposal-digest §1 | Sign it. **new**`

---

## What the proposal gets right

1. **The diagnosis is true and nobody inside the system would have said it.**
   "The design recedes. The administration remains." A studio selling rooms
   shows its client drawings of obligations. That is a real brand problem and
   the deck names it without sneering at the existing work.
2. **The captioning discipline is genuinely excellent** and is the part I
   would adopt whole: "illustrative concept, not an installed room";
   "Generated concept imagery · finish samples are illustrative"; "Sample
   display is not color-accurate. Review a physical sample before committing
   if finish is critical."; "Maker and lead time to be confirmed by the
   studio." That last sentence is worth more to a studio's credibility than
   the hero photograph above it.
3. **The non-commitment copy around approval is exactly right** —
   "Reviewing does not approve or place an order"; "Approval records this
   selection and finish. It does not charge you or place an order. Your
   designer will confirm purchasing separately." This is the language of a
   firm that expects to be held to what it wrote.
4. **"Nothing needs you today."** is a better sentence than the current
   "quiet · nothing needs your hand" — plainer, and it does not ask a
   homeowner to parse a metaphor. Its supporting line ("When there is a real
   update, it will appear with its date and source.") is a promise, stated.
5. **"No invented urgency, random recommendations or artificial progress"**
   and "Do not use designer dwell time as a goal" — the deck volunteers
   restraint it was not asked for, and its own success criteria refuse
   engagement metrics.
6. **It keeps the right things:** Playfair/Inter/DM Mono, the paper family,
   left alignment, one document, one continuous house page, human authorship,
   truthful financial detail. It is an amendment, not a replacement.
7. **The states slide is honest about failure** — a retry panel with a reason
   and a recovery, and an empty state with a rule against "an anonymous empty
   rectangle." Both are gaps in the current system.

## What is already excellent in the current portals

1. **The invoice colophon** — "Prepared by Quist Interiors · Sent through
   Patina." Studio as author, Patina as press. This should be the governing
   brand rule for every client surface.
2. **The letterhead pattern** — studio caps left, "PREPARED FOR NORA ELLISON"
   caps right, Playfair project name, "Installation · September 2026". No
   other portal in this category opens like a letter.
3. **The furnishings authorization** (Path B) — quoted scope in Playfair
   italic, itemized pieces with prices, a consent line, a typed signature.
   A homeowner would print this.
4. **Money sentences that state a fact:** "The house stands at $11,100
   agreed." / "INV-2026-0301 · $4,060 total · $0 paid. Balance $4,060, due
   September 11." A number, a party, a date, a state.
5. **The card-fee honesty** — "+ $273.75 · This covers what card processing
   costs." Plain-spoken, Midwest, and it buys more trust than any photograph.
6. **The stamp, the scored action, the hold-to-sign ink.** A twelve-state
   inspection stamp that ages in border weight only is a real identity
   asset — proprietary, non-transferable, and correct for a firm that deals
   in provenance.
7. **"Absence is silence."** A region with nothing to say renders nothing.
   Almost no product has the discipline to ship that.
8. **The dot, not the badge.** A 7px mark instead of a count chip is the
   single clearest signal that this is a document and not a dashboard.

---

## Top 5 changes for polish and professionalism

### 1. One letterhead law, one colophon law — on every client surface

**Where:** `threshold.tsx` doorplate (`:1193-1201`), `letterbox-door.tsx`,
the invoice, and every proposed client screen.
**What:** a fixed masthead block, and a fixed foot.

```
STUDIO NAME (DM Mono 11px, .12em, --text-muted)        PREPARED FOR <CLIENT>
Playfair 28–34px project name
DM Mono 11px  Phase · Month Year
———————————————————————————— hairline, --doc-rail-stock
   … page …
———————————————————————————— hairline
Prepared by <Studio> · Sent through Patina        (DM Mono 10.5px, --text-faint)
```

**States:** studio unset → the designer's full name, silently. Client display
name unset → print the masthead with the right-hand slot **empty**; never
"CLIENT USER" (BE-23). Patina's wordmark never appears above the colophon on
a client surface.
**Why:** the homeowner should be able to name the firm she is paying without
scrolling, and the studio should be able to open the page in front of that
homeowner without explaining who Patina is.
`touches: R135` (the colophon is page furniture, not a header)

### 2. Turn the proposal's receipt into a record

**Where:** the proposal's `#approvalReceipt`; the client portal's accept
gates.
**What:** delete the sage card, the `.check-round` and the ✓. Replace with a
document block on paper: `Stamp` (existing component, rotated, "RECORDED"),
Playfair 20px "Selection recorded", then DM Mono 11px metadata in three
lines — `SELECTION No. 3 · CEDAR LANE STUDY` / `Nora Ellison · Local Dev
Studio` / `Recorded 7 September 2026, 9:15 am`. Then body ink: "Smoked oak ·
Round oak coffee table · $2,400.00. No order placed, no payment taken. Leah
will confirm availability and purchasing." A text link: "This is filed under
Previously."
**States:** recorded, superseded (stamp ages in border weight only), failed
(rule + body ink, no colour).
**Why:** the moment a client commits is the moment she decides whether this
firm is serious. A check circle says app; a stamped, numbered, party-named
block says record.
`touches: R51, I107`

### 3. Make materials real, or don't show them

**Where:** proposal slides 8 and 9; the Document's FF&E and direction views.
**What:** ban procedural material fills outright (the CSS stripe "oak" is the
worst single artifact in the deck). Image source hierarchy, enforced by
caption: `installed photograph` > `studio board or room scan` > `vendor
product photograph` > `line drawing`. Every image plate gets a caption rule
and a caption in DM Mono 11px stating **what it is, whose it is, and when**:
"Natural oak · sample from Harmon Bench Works, photographed 2 September".
Piece plates rise from 64px to 96–120px on desktop above a value threshold.
**States:** no image → the current bordered placeholder block plus the
caption line ("No photograph yet · plan below"), never a decorative stand-in.
**Why:** Patina's whole lexicon is grain, provenance, honest materials. A
gradient posing as oak, on a page asking a homeowner to spend $2,400, is the
one thing a designer's own client will notice and mention.
`touches: R126, VISION.md:73`

### 4. Rewrite the client-facing copy so the studio is speaking, not Patina

Exact rewrites:

| before | after |
|---|---|
| "Tell us what you would like to change." | "Tell Leah what you'd like to change." |
| "Your home, taking shape." | "Cedar Lane Study" / "One decision is waiting for you." |
| "Your room story starts here." | "No photographs of this room yet. The plan and the material study are below." |
| "The last layer makes it yours." (house-written) | the designer's own sentence, bylined and dated |
| "Mark update as seen" | "Seen" — or remove |
| "Ready to review" / "One decision ready for you" / "Ready for your hand" | client: "One decision is waiting" · designer: "Waiting on you" |
| "The road · What is not home yet" | running head "ON ITS WAY", then "One piece in motion · reading chair, arriving 12 August" |
| "Leave the house" | "Sign out" (keep "the mat" as the running head) |
| "Tax · illustrative $120" | omit; show charges only |
| "Below allowance $200" (as a ledger line) | below the totals rule: "Allowance $2,600 · $200 remaining" |

**Why:** every "us" and every metaphor-in-place-of-a-fact is a place where
the homeowner is reminded she is inside somebody's software.
`touches: R135` (sign-out wording)

### 5. Take the dwell timer off the studio's front door

**Where:** designer portal mobile bar (`desk-final-desk-390.png`: "TODAY /
0:47", golden italic).
**What:** remove the running counter from the persistent bar. If billable
time matters, it belongs behind "More" as a named entry ("Time on the
Vandersteen job"), in DM Mono, not as an ambient stopwatch in the only
decorative italic on the page.
**Why:** two brands are being made here at once. A stopwatch on a designer's
home screen makes Patina look like a time-and-attendance product, and it is
the one element on the Desk that contradicts the promise the studio was sold.
`touches: VISION.md:50-52`
