# The paper answers a hand

Motion concepts for The Document, designer portal · 25 September 2026

Concept: Astra (GPT-6) · Review and synthesis: Fable · Build: Opus

Kody asked for "peaceful, large informational text that animates and reveals the details… think Her." The Document's promise pulls the other way: the studio won't notice Patina, and R15 says "nothing on the Desk ever moves." One test resolves the tension. **Ambient** motion moves without her addressing the thing; **performed** motion is the direct, finite consequence of her act. The log already obeys the test without naming it: I107, "All motion is interaction-triggered — R15 intact" (DECISIONS.md:6603), and D12's pick-up, "raise-to-fill scale (~270ms; reduced-motion: crossfade)" (DECISIONS.md:221-222). Every direction below is performed only. *Borrow the physics, not the personality*: the Dynamic Island's interruptible mechanism, without its living-organism character. The moment is Leah Kochaver adding a first hand while workload doubles, and the promise is less finding and re-finding, not more time on screen. Engagement facts are fictional fixtures.

---

## §1 The grammar

### Two states

**AT REST.** Large: identity, or the fact explaining why this needs a hand. Small: ownership, date, vitals, section names, action words. Absent: secondary explanation behind visible doorways. Never absent: an owed act, error, permission explanation, field label, decision-critical amount or confirmation.

**ADDRESSED.** The large line stays put. A bounded block (fact, act, doorway) arrives as one unit from the nearest seam: reading order, not delayed beats. Then everything stays still.

### Nine moves

E = existing `--ease-editorial`, cubic-bezier(.22,1,.36,1). Q = ease-in-out, cubic-bezier(.42,0,.58,1). O = ease-out, cubic-bezier(0,0,.58,1). RM = reduced motion. Times start at accepted intent.

| Move | Trigger · what moves · axis | Duration/ease | RM | Meaning |
|---|---|---|---|---|
| Ink answers | Address labeled seam · existing score/tint · no displacement | 100ms E | Instant tint | This word is usable |
| Detail rises | Address truth line · complete secondary block in reserved well · y:+4→0px | 160ms E | Instant final position | What that line rests on |
| Margin opens | Address existing margin item · explanation within rail allocation · x:+4→0px | 180ms E | Instant explanation | This belongs here |
| Paper is taken | Activate Pick up · full-bleed paper · scale .986→1 plus opacity | 270ms O, existing D12 | Existing 200ms opacity-only | Work now in hand |
| Sheet is drawn | Activate ledger/form doorway · laid sheet · y:+14→0px, paper opacity .6→1 | 240ms E, live DocSheet | Instant sheet | Glance without leaving |
| Sheet is returned | Put back/Esc/permitted backdrop · same sheet · y:0→+14px, veil fades | 180ms Q, proposed inverse | Instant, restore focus | Work underneath was kept |
| Ink lands | Action press · existing Scored Ink, then confirmed state in reserved status line | Existing 150–260ms, linear/E | Instant press/result | The act landed |
| Detail recedes | Address another region or close · optional block · y:0→+4px, margin x:0→+4 | 120ms Q | Instant hide | Finished looking, nothing discarded |
| Paper is put down | Explicit Put down/unconsumed Esc · held paper · scale 1→.986, opacity out | 200ms Q, proposed D12 inverse | Instant Desk return | Leave, keep its place |

"No letter-building, glyph scaling, blur or sentence masks. Small-reveal text is whole and full-ink from its accepted state; only its optional paper backing fades." A frozen frame never falsely implies that a save succeeded, a record vanished or a different engagement became active. The existing whole-paper pick-up is the one bounded scale and crossfade. It is not a pattern to repeat inside the page.

### Bands and easing

Reveal 120–180ms; recede 100–150ms; hover 80–120ms; structural 200–300ms; page entry 250–400ms; exit 150–250ms; focus ring 0ms (Material, HIG, Kowalski, Freiberg via the external memo). Astra declines the memo's .95–.97 scale on revealed **text** ("glyph resizing costs too much under a reading eye") for 4px travel. **(synthesis)** Fable keeps that refusal: no scale, blur, letter-building or masks on text. No spring, bounce or overshoot; CSS first, WAAPI to reverse at the current frame. ⌘K stays instant.

### Laws

- **Never before her act; never mid-task.** Mount, incoming updates and passive intersection cannot invent intent. Pointer address = 100ms cancellable dwell in a labeled seam; focus, click, tap, Enter and Space are immediate. Scroll-caused pointer crossings are ignored.
- **Parity.** Pointer and keyboard reveal identical facts and acts. Focus outline 0ms. Touch uses the same visible Detail control, never a long-press. Targets at least 44px.
- **Never absent at rest.** An owed act, error, permission explanation, field label, decision-critical amount or confirmation is never hidden to make the page quiet.
- **Hover is optional.** Hover reveals optional explanation, not essential controls. Keep hit targets fixed. Trigger OR body hover/focus sustains the reveal. Moving into blank paper does not snatch it away; addressing another region, Close detail or put-down ends it. No timeout-dismiss.
- **Holds.** Focus inside, text selection, dirty input, validation, pending action or an open Sheet holds the region. Scrolling/hovering elsewhere cannot collapse it. Explicit safe completion/departure releases the hold. Animation never saves, sends or discards.
- **No lure.** No new badge, dot, count or pulse; no count-up, list stagger, entry ceremony, auto-scroll or snapping.
- **Type never reflows under a reading eye.** Wells reserve content-sized space before interaction and never shrink. A full-section opening lays out once, anchored to its heading.
- **Reverse from the current frame**, with no flourish queue, finish-before-close or input lock. Semantic state follows the act, not `animationend`. Closed details leave tab order/accessibility tree; expanded state and landmarks agree. Find-in-page, print and plain reading expose the complete text without motion.
- **RM preserves every fact, act and hold.** No transform, parallax or smooth scroll. The OS preference and the mockup toggle both count.

No new ambient motion: the spine breath is not expanded, and R35's sweep stays operation feedback.

### Large type and density

.t-d1 means 34px Playfair Display, "not a slogan at 70px"; it names the work or a sourced standing fact, never a greeting. One address adds one reason (up to two lines), two fact rows and one doorway. "Wrap, never truncate."

**(synthesis) The live Desk arrival stagger is dropped.** Today the Desk staggers roster cards on first paint (translateY 14px→0, 320ms + 60ms per card, capped at seven; inventory §3). It is the one existing arrival animation that contradicts this grammar, and all three directions drop it: a small doctrinal correction the team should see.

**Mandatory floor.** Desk needs and day's line (R143), the editable household/vitals line, the Room head action, field labels and complete ⌘K rows stand at rest in every direction.

---

## §2 Three directions

### 1. Open Edges

**Thesis.** Today's Document, with its seams made useful. A need, fold or margin item answers where it already stands. Nothing clears for an entrance; there is no new reading mode. The page stays recognizable, "which is its strength and its limit as a new concept."

**At rest and reveal.** Today's roster, Contents, 34px identity and 16px standing fact; sections readable. A Detail seam raises a bounded explanation into reserved paper; a margin note opens inside its rail.

```
DESK AT REST                 DESK ADDRESSED
Middle West · Find anything   Middle West · Find anything
Finish approval today.        Finish approval today.
[Ainsworth] Finish needed     [Ainsworth] Finish needed
 Review finish · Detail        Review finish · Close detail
 [reserved paper]              Sample recorded Sep 24.
Delgado · Review delivery      Workshop awaits finish choice.

DOC AT REST                  DOC ADDRESSED
Ainsworth Residence [34]      Ainsworth Residence [34]
Household · vitals · Edit      Household · vitals · Edit
Finish needed [16] · Review   Finish needed [16] · Review
existing readable section    existing readable section
Detail [reserved paper]      White oak, clear oil.
                             Spring Green workshop.
```

| Move | Timing | End |
|---|---|---|
| Explanation y+4→0 | 160ms E | Under its line |
| Margin x+4→0 | 180ms E | Inside existing rail |
| Sheet y±14 | In 240ms E / out 180ms Q | Work underneath retained |

**Reduced motion.** Explanations and Sheets are instant; pick-up is the 200ms opacity-only fade. The same explicit unfolding and the same facts.
**Complies with** D1–D11 (D4's named exceptions only), D12/D14, R21/R22/R35/R95/R143, all R150 type and leader rules, I107 and truth-framing. **Amends** R15 (performed-seam permission) and names the finite inverse put-down and Sheet exit. No R150 amendment.
**Kill risk.** "A seam merely wiggles information already visible. Delete the reveal instead of decorating it."

### 2. Plain Lines

**Thesis.** The screen-only Her direction: a few large, complete work sentences with enough small print to act honestly. The work speaks, never Patina. Detail rises under the line she addresses; the line neither shrinks nor moves. Recede follows moving on, never an idle timer.

**At rest and reveal.** One 34px truth per engagement or section, with small identity, mandatory context and the primary act. Secondary metadata is genuinely lost to scanning, recovered by Tab through visible Detail controls and "Show all detail," a click/Space latch.

```
DESK AT REST                 DESK ADDRESSED
Middle West · Show all detail Middle West · Show all detail
AINSWORTH                    AINSWORTH
Finish needed. [34]          Finish needed. [34]
Review finish · Detail       Review finish · Close detail
[reserved paper]             White oak sample recorded.
DELGADO                      Workshop awaits clear oil.
Delivery needed. [34]        Open record

DOC AT REST                  DOC ADDRESSED
Ainsworth · household/vitals  Ainsworth · household/vitals
DIRECTION                    DIRECTION
Finish needed. [34]          Finish needed. [34]
Review finish · Detail       Review finish · Close detail
[reserved paper]             Sample recorded Sep 24.
PROCUREMENT                  Spring Green workshop.
Delivery not booked. [34]    Open the finish record
```

| Move | Timing | End |
|---|---|---|
| Supporting block y+4→0 | 160ms E | Headline unchanged |
| Address next unheld line | Old 120ms Q/new 160ms E concurrently | No queue |
| Show all hold | 0ms | All blocks together |

**Reduced motion.** The same sparse/dense choice, with detail instant and no type travel.
**Complies with** D1–D11, full-bleed D12, D14, R21/R22/R35/R95, R143 visible needs and day's line, I107, truth-framing and the mandatory floor. **Amends** R15, plus R150 R3/R6 and band-only leader allocation for large section facts without duplication. It also needs approval for less secondary roster density than R143 treats today.
**Kill risk.** Comparing work now means opening several lines. "Permanent use of Show all means the sparse resting premise failed, not that users need training."

**(synthesis)** Built at full strength (34px needs, sparse rest, working Show all), not as a straw man.

### 3. Reading Line

**Thesis.** One paper column, addressed by scrolling. A large fact begins each section; bounded detail resolves at the reading line, then stays still. No parallax, pinned scenes or letter-by-letter construction. "It should feel like following a page with a finger, not operating a slideshow."

**At rest and reveal.** Names, needs and acts sit in a stable-length column over reserved wells. The reading line is an invisible threshold at clamp(112px, 28vh, 200px); only deliberate scroll addresses the crossing section (24px hysteresis). The reveal happens once over 160ms, holds while she stops, and recedes only offscreen and unheld.

```
DESK AT REST                 DESK AT READING LINE
Middle West                  Middle West
AINSWORTH                    AINSWORTH
Finish needed. [34]          Finish needed. [34]
Review finish · Detail       Review finish · Detail
[reserved paper]             Sample recorded Sep 24.
DELGADO                      Workshop awaits clear oil.
Delivery needed. [34]        Open record

DOC AT REST                  DOC ADDRESSED BY SCROLL
Ainsworth · household/vitals  DIRECTION
DIRECTION                    Finish needed. [34]
Finish needed. [34]          Review finish · Detail
Review finish · Detail       Sample recorded Sep 24.
[reserved paper]             Spring Green workshop.
PROCUREMENT                  Open the finish record
```

| Move | Timing | End |
|---|---|---|
| Scroll-address y+4→0 | 160ms E per crossing | Still while reading |
| Hold by focus/tap/act | 0ms | Work protected |
| Offscreen unheld recede | 120ms Q | Geometry retained |

**Phone.** The same column; no snapping, sticky headline or viewport-height scenes.
**Reduced motion.** All optional summaries stand visible and there is no automatic scroll reveal. Full-section acts and holds remain.
**Complies with** D1/D2/D4/D6–D11, the D12 full-bleed principle, D14, R21/R22/R35/R95/R143, I107 and truth-framing. **Amends** R15; R150 band-only/silent-head allocation; D12 desktop rails and the D3 collapse boundary, for single-column anchored margin access at every width. D5 margin ownership stays; this is not a feed.
**Kill risk.** Blank wells lengthen the work, and scroll is an imperfect proxy for reading. "Losing her place or scrolling twice for one fact kills the direction."

---

## §3 The six studio moments, compared

| Moment | Open Edges | Plain Lines | Reading Line |
|---|---|---|---|
| Arrive at Desk | Current readable needs; no roster stagger | Large named needs; never blankness | Single-column needs, all visible |
| Pick up document | Existing 270ms raise, no extra head entrance | Same; required facts already there | Same, into one reading column |
| Read then act | Optional Detail; explicit full Unfold | Address raises detail; Enter/tap pins; explicit act opens full work | Scroll or Detail addresses; entering work pins it against later scroll |
| Pull/put back Sheet | 240ms draw/180ms return; state retained | Same; rows/labels never sparse | Same; suspend reading-line updates beneath it, restore anchor |
| ⌘K | Instant and complete | Dense instant counterweight | Instant jumps; with put-down, the only designed cuts between reading contexts |
| First hand | Same controls as Leah; eligible static note only | Visible Detail and Show all; no hover discovery required | Read naturally or tap Detail; no threshold knowledge required |

Acts use existing Scored Ink and factual confirmation, never celebration.

**(synthesis)** Moment 6 (first hand) has no mockup by design: R-DM7 recommends the same still Desk, so a separate arrival would contradict it.

---

## §4 Trade-offs and recommendation

"These are design judgments to test, not measured productivity claims."

| Test | Open Edges | Plain Lines | Reading Line |
|---|---|---|---|
| Quiet at rest | Familiar working density, fully still | Fewest visible secondary facts; broad paper between lines | Still single column; more blank paper outside the reading place |
| Time-to-detail | Essential work 0ms; optional block 160ms after focus/tap, 260ms from pointer entry including dwell | Same preview timing; more facts require that step; Show all 0ms | Scroll travel is variable, then 160ms; tap/focus alternative 160ms |
| Scannability | Closest to today; little lost | Needs remain scannable, cross-job context suffers; keyboard sweep/Show all recover it | Sequential reading strong, nonadjacent comparison weak; ⌘K jumps rather than compares |
| First-week hand | Existing words and seams; least new learning | Detail is visible, but the difference between preview and held work must be learned | Natural scrolling helps; automatic disappearance is harder to predict |
| Phone | Existing layout, visible tap targets; no hover dependency | Large truths wrap, reducing jobs visible at once; show-all can be long | Native strength, but reserved wells increase thumb travel; never scroll-lock |
| Reduced-motion parity | Same layout and states, small reveals instant | Same sparse/dense choice, instant transitions | All summaries visible, same facts/acts; visual sparsity is intentionally not identical |
| Doctrine amendments | R15 performed exception; inverse exits named | R15 plus R150 fact/type/leader allocation and secondary roster-density ruling | R15/R150 plus D12 rail layout and D3 all-width collapse |
| Build cost | S — existing seams/overlays, optional wells | M — consistent disclosure/hold state and density fallback | L — reading-position ownership, offscreen recede, geometry, selection and responsive interaction |
| "You won't notice Patina" | The answer appears where her hand already is | The tool withdraws, but may make her ask too often | The reading place becomes the address, but may make her manage that address |

### Recommendation, and the question it leaves open

**(synthesis) The deck's central question is R-DM2, not R-DM1.** R-DM1 (performed motion allowed, ambient still banned) is common ground for all three directions. The real choice is how much may disappear at rest. There are two honest positions on that, and neither is softened here.

**Astra, as the designer:** "Take Open Edges forward as the default candidate. It improves a real studio moment without asking Leah to exchange her working map for our visual idea. Its restraint must not become timidity." Graft Plain Lines' truthful hierarchy and trial its large Desk needs, "but do not silently apply its R150 amendment to Open Edges." Graft Reading Line's guarantee that stopping, selecting or entering work holds the place, never its automatic scroll-disclosure. Astra's own doubt: "Open Edges may be too slight to satisfy the desired change in feeling."

**Kody's ask, as the brief:** "Peaceful, large informational text that animates and reveals the details… think Her" describes Plain Lines, not Open Edges: large text as the resting state, detail as the performed answer. Its cost is real and named (cross-job context suffers; a permanent Show all means the premise failed). The walk tests that cost; it does not disqualify the direction in advance.

**What would change the recommendation (Astra).** Leah and a first-week hand find the finish-approval job, compare it with the delivery job, reach the record, enter a draft, pull Accounts and return, by keyboard, at phone width and with reduced motion. Watch for wrong choices, repeated reveals, lost place and requests to show everything; never measure dwell or delight. "Plain Lines wins only if the reduced surface makes those tasks clearer without extra hunting." "No direction earns production approval from a beautiful replay alone."

---

## §5 Mockup index

Each file opens from disk and carries "Fixture · Middle West Studio · not a client record". **(synthesis)** A DM Mono "mockup controls" strip holds Replay (AT REST, then trigger 1, then hold), Reduced motion (adds to the OS setting, never overrides it), Pause/Resume and Slow ×4 ("review aid, not a product setting"). Nothing animates on load. Pause freezes running animations and holds a pending Replay or dwell until Resume; it cannot freeze her own scrolling. A new Replay cancels any pending one. Slow ×4 multiplies every move, the 100ms dwell and the 360ms Replay hold, but does not stretch a move already in flight. Reading Line Replay jumps to the reading line, then runs the 160ms reveal; in the product she scrolls. At 760px and below the strip folds to one Controls button and the caption to its first line. `?frame=product` hides caption and strip, leaving the paper and one fixture line at its foot.

| File | Direction | Surface | Trigger 1 | Caption |
|---|---|---|---|---|
| `01-direction1-desk.html` | Open Edges | Desk | Address Ainsworth: R/F; Review finish: P | "The need reads before the hand moves." |
| `02-direction1-document.html` | Open Edges | Held document | Margin Detail, x+4→0 180ms E (phone: anchored Sheet) | "The margin opens without moving the work." |
| `03-direction1-sheet.html` | Open Edges | Accounts sheet | Accounts: S/I; Put back/Esc: B | "A glance, then the same place." |
| `04-direction2-desk.html` | Plain Lines | Desk | Ainsworth R/F, then Delgado concurrent X/R/G; Show all 0ms | "The work in a few lines; the rest when asked." |
| `05-direction2-document.html` | Plain Lines | Held document | Direction address R/F; Enter/tap pins; Save note | "The sentence stays; its evidence comes forward." |
| `06-direction2-command.html` | Plain Lines | ⌘K | Command at 0ms; Accounts starts S/I | "When the question is exact, the answer is immediate." |
| `07-direction3-desk.html` | Reading Line | Desk | Scroll crossing Ainsworth at L: R/F | "Scroll finds the next piece of work, without pulling the page." |
| `08-direction3-document.html` | Reading Line | Held document | Scroll or Detail: R/F; Review finish pins | "Where she stops is where the paper stays open." |
| `09-direction3-sheet.html` | Reading Line | Sheet return | Accounts S/I with reading line suspended; B restores | "Put it back and carry on, not start again." |

Key: R 160ms E · X 120ms Q · P 270ms O · D 200ms Q · S 240ms E · B 180ms Q. Detail wells reserve at least 144px desktop, 192px phone, or their content height if taller; margin wells are content-sized, with no minimum.

**Prototype limitations.** Verification is source-only: `verify/oracle.mjs` and in-memory runs of the shared script, with no browser, phone or screen-reader walk, so rendered layout, focus order and announcements are unverified. Navigation is partial: Library and the other fixture doorways are not in this mockup; the finish record, the held document, Accounts and the note sheet are the only destinations built. 08 carries one margin note and no drawer, and the Desk pick-up lands on a short held brief; neither is evidence about a full margin or a full-record task. The .32 ink veil is a fixture value derived from the palette, not a live token. Reading Line pages add a 50vh run-out below the last section so it can reach the reading line: real reading length, not free polish. Native find reaches closed detail only where the browser supports `hidden="until-found"`; elsewhere print is the static path.

---

## §6 Rulings for Kody (verbatim)

These are proposed rulings, not decisions already taken. The mockups compare consequences; they do not amend production doctrine.

**R-DM1 — May R15 explicitly allow performed motion while ambient motion remains banned?**
Options: A Keep its literal "nothing on the Desk ever moves"; B Allow finite, reversible motion caused by her act, retain only the existing active-spine breath as an ambient exception; C Consider another ambient exception in a separate program.
Recommend B. Generalize the I107/D12 test. No concept here depends on C. R35's actual pending-operation sweep remains operation feedback, not permission for a resting loop.

**R-DM2 — How much secondary information may disappear at rest?**
Options: A Existing readable Document plus optional seam explanations (Open Edges); B Truth-line-first with visible Detail controls and a Show all hold (Plain Lines); C Reading-place-first with bounded scroll reveals (Reading Line).
Recommend A for the default candidate; compare B and C in the nine mockups before choosing any broader removal. In every option, Desk needs/day line, errors, labels, primary acts, household/vitals, decision-critical amounts and command sub-labels remain visible. They are not bargaining chips for quiet.

**R-DM3 — May section standing facts join document identity at 34px, amending R150's silent heads and band-only leader allocation?**
Options: A Keep document name 34 / standing fact 16 / silent region head; B Permit one 34px section fact at its own place, removing any duplicate standing fact; C Make each section name large regardless of its information.
Recommend A for Open Edges; authorize B only as the explicit Plain Lines/Reading Line concept amendment. Decline C. A heading earns scale by stating work, not by naming navigation. The household/editable vitals remain controls, not expendable small print.

**R-DM4 — Does deliberate scrolling count as addressing a section?**
Options: A No, detail requires labeled focus/tap/click; B Yes for optional explanation, with stable geometry, an equal explicit control and task holds; C Let scroll automatically open and close working sections.
Recommend B for the Reading Line experiment only, A for the default's working content; decline C. Reading Line also needs the named D12/D3 layout amendment for all-width single-column margin access. No scroll-triggered loss of draft, selection or place is acceptable.

**R-DM5 — When should a revealed explanation recede?**
Options: A As soon as pointer leaves; B On the next unheld address or explicit close, with blank paper and reading pauses doing nothing; C Only on explicit close for every preview.
Recommend B, plus C once she pins or enters work. Show all is a persistent click/Space toggle within the current surface, never a physical long press. No idle countdown. If B proves unpredictable in a walk, use C before adding more choreography.

**R-DM6 — What should reduced motion preserve when the concept depends on scroll-disclosure?**
Options: A Same hidden summaries but no travel; B Fully printed summaries in the same column, with all full-section acts intact; C Remove those summaries.
Recommend B for Reading Line; A for the explicit-control Open Edges/Plain Lines variants. Decline C. Information and task parity matter more than matching the sparse screenshot. Motion off must be a first-class working surface.

**R-DM7 — Should a first hand receive a different visual arrival?**
Options: A Same still Desk, with only an already-eligible once/in-place teaching note; B A special animated welcome or tour; C No teaching note even when the existing program calls for one.
Recommend A. The studio's first hand should inherit its working language, not be greeted by a second interface. This motion program must neither expand nor silently disable the existing teaching program.

---

## §7 Astra's three doubts, and where research narrowed the brief

**Doubts (REPORT).**
1. "Open Edges may be too slight to satisfy the desired change in feeling. The correct response is to compare the working mockups, not add idle motion."
2. "Plain Lines may trade useful simultaneous context for attractive empty paper. If Leah holds Show all on permanently, its central premise failed."
3. "Reading Line cannot know whether scrolling means reading, skimming or reaching another act. Stable wells avoid jumps but impose real page length; task holds protect work but may weaken its visual simplicity."

**Where research contradicted or narrowed the brief.**
- Her's near-empty screen works because voice carries the interaction; it is not evidence that a screen-only working tool should hide its structure. Kinetic-type comprehension evidence is thin, so no productivity claim is warranted.
- "Everything else absent" conflicts with R143 needs, command disambiguation, editable household/vitals and field labels. These stay printed.
- R150 keeps region heads silent; large section truths need named amendments.
- The live Desk stagger is not replayed (§1); live ⌘K is instant, so a reveal there would be regression. Prototype v4's height transitions are no mandate to animate layout under text.
- A hover can be accidental. Labeled seams, dwell, holds and explicit alternatives constrain that.
