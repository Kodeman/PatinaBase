# Author brief — The Smart Lens

*For X and Y (the two rival proposal authors), their revisers, the merge author, and the mockup builder. This brief asks the questions. It does not answer them. Where it names a mechanism it is naming a candidate you may refuse — `source/mechanics.md` holds the catalogue, and refusing one with a reason scores as well as adopting one.*

**The ask (Kody, 2026-08-28) — verbatim:**

> "We are getting close to a design that feels right on the document. The spine on the left is still cluttered and could be better utilized to navigate the ins and outs of the document. The main header contains great info but takes up most of the screen height when opened up, each section is crammed into the next and the margin seems cramped for the space needed for the functionality it contains. Have a team of UI and UX designers sit down with the Patina engineering and interior design teams. Work with them to design the document so that it contains the needed information and actions, while feeling uncluttered and peaceful. Explore animations, content that appears when it needs to and lends to space when it isn't needed in frame. Think of the document as a smart lens that is always adjusting focus on what is needed as the designers move through the document. Present your strongest proposal to achieve this in an html document accompanied with a high fidelity mockup showcasing how the team will accomplish this challenging User experience and UI requirements."

---

## A.0 What you are being asked for

One proposal. Not options. Not a menu. The strongest single answer, argued, with the roads you did not take named separately.

**You are not asked to add features.** Every fact and every act on the Document today has a reason and a designer who relies on it. The job is to make **the same information and the same acts occupy less attention at any one moment**, and to make **the rail earn its 200px**. If your proposal's best idea is a new capability, it is answering a different ask.

Three things are true at once and the proposal has to hold all three:

1. Kody says it is *close*. R126 shipped and the register is loved. This is a composition and choreography problem, not a restyle.
2. The four complaints are specific and measured: the **spine** is cluttered and under-used as navigation; the **header** holds great information and eats most of the viewport when open; the **sections** are crammed into each other; the **margin** is cramped for what it carries.
3. The metaphor Kody handed over is not decoration. *A lens always adjusting focus* is a design constraint with teeth: a lens does not delete what is out of focus. It softens it, keeps it in place, and brings it back the instant you look. Everything in this brief follows from taking that literally.

Your unit of analysis is **four scroll states x three widths**: `s0 top` · `s1 seam` · `s2 mid (FF&E head at top)` · `s3 foot`, at 1440x900, 1280x800, 390x844. Twelve cells. A claim that does not name a cell is not a claim.

---

## A.1 The thesis, in Patina's language — the four lens laws

A lens is not a filter. Patina already ruled the difference once, in a different organ: **the room lens LIFTS, never filters**. Take that ruling as the seed of the whole proposal and generalise it to the document.

**Law 1 — What is in frame is full.** The region she is reading is at complete strength: every line, every number, every act, at the ratified R126 weight. There is no state in which the thing she is looking at is a summary of itself. If focus has to cost the focused region anything, the mechanism is wrong.

**Law 2 — What is out of frame yields.** A region she is not in condenses to its head plus one status line. It **keeps its place** in the paper's order — the same y-position in the scroll, the same neighbours, the same distance from the top — and it **never disappears**. Yielding is a change in density, not in existence. The word for what the paper does when she moves is *breathe*, not *collapse*.

**Law 3 — The spine is the map, not a second copy of the paper.** The 2026-08-14 second-look test is the one to hold against every tenant of the left edge: *something earns the left edge only if it is true across the whole document at once, or true outside this document*. A running index that reprints the headings she can already see is failing that test with a straight face. A map shows position, extent, and where the trouble is — things the paper cannot show her about itself while she is inside one part of it.

**Law 4 — Nothing hides.** Every condensation is reversible in **one act**, and its state is readable **without hover** — from a still screenshot, by someone who did not perform the transition. And the specific failure to avoid: **condensed must be distinguishable from empty on sight.** Today `region/use-region-fold.ts` folds by *unmounting the body* and leaving a 44px `FoldSeam`, and a designer returning to a document she folded three weeks ago — the key `patina:doc-fold:{docId}:{region}` outlives the session — reads that seam as *there is nothing here*. A lens that repeats that mistake at ten times the frequency, on scroll, without her asking, is worse than what we have.

**Refuse the filtering counter-thesis.** It will be tempting, and it is wrong for this product. Hiding what is not relevant right now is how a task app behaves; a document behaves like a document. The designer's trust in this surface rests on the fact that the whole job is on one piece of paper and she can always scroll to the rest of it. A proposal that removes regions from the flow, that shows only the current section, that swaps regions in and out of the DOM by relevance, or that decides on her behalf what she does not need to see, is answering a different question and will be returned. Yield, do not filter. Lift, do not hide.

---

## A.2 The four organs, and the questions each has to answer

### The spine — `components/document/doc-spine.tsx`

Sticky, `h-screen`, `--doc-rail-stock` `#E8E3DB`, 200px at >=1440, a 56px glyph column at 1180–1439, a sheet at 390. What it holds today, top to bottom: **Put down** (`:48`) · **seven StrataMark markers in a horizontal row** at >=1440 (`:99-110`, future marks inert) · the **active label pair** · `spine-running-index.tsx` — a scroll-spy "On this paper" listing regions, but only on the project spread (approvals/schedule/ffe/money; approvals+ffe on install/care; **nothing at all** on brief/discovery/direction/proposal, per `lib/document/document-index.ts` `paperRegionsForSection`) · `spine-timer.tsx` · a presence line. Roughly two thirds of the rail is empty, and the top third mixes four tenses — *leaving* (Put down), *the whole arc* (the seven marks), *this minute* (the timer), *right now* (the active label).

- **S1 — What does the rail earn as the map?** Answer with the 08-14 test applied tenant by tenant. What is true across the whole document at once? What is true outside this document? What is neither, and where does it go instead?
- **S2 — Does the seven-mark row belong in the spine or in the header?** It is the arc of the job, not the depth of the paper. A horizontal row inside a vertical column teaches the wrong axis. If it stays, say what the vertical axis then means; if it moves, say what it costs the rail and what the header gives up to take it.
- **S3 — Index every region on every spread, including pre-work.** Brief, discovery, direction and proposal currently print an empty rail. What does the index show on a spread whose regions have no counts? Write the actual line: what does a value line read with no number behind it, and is a region with nothing in it still worth a line? (It probably is — a line that says a region exists and is empty is orientation; a missing line is a hole.)
- **S4 — Where do the timer, the presence line and Put down live?** Each one separately. Put down is an exit and true outside the document. The timer is this minute. Presence is other people. If the rail is a map, at most one of those is a map feature.
- **S5 — 200 vs 160 vs 56-with-a-leaf.** Do the arithmetic honestly: `200 + 1040 + 232 = 1472 > 1440`. At exactly 1440 the grid `min-[1440px]:grid-cols-[200px_minmax(0,1fr)_232px]` leaves the paper column **1008px**, so the paper's `max-w-[1040px]` is never reached at the width where the three-column layout first appears; with `px-12` that is 960px of measure. Every pixel the rail gives back goes to the paper up to 1040 and then to the desk. Say what width the rail should be, what that buys the measure, and whether a narrower rail can still be a map.

### The header — the stack above the first region head

Measured at 1440x900, `s0`, project spread. The first region head lands at roughly **y 700–790 of 900 — 78 to 88% of the frame is consumed before the work starts.**

| # | Block | File | What it says | Approx. height at `s0` | Survives the seam? |
|---|---|---|---|---|---|
| 1 | Letterhead | `doc-letterhead.tsx` (`#document-project-status`, 40px title `:59`, `doc-rule-mid`) | Household, project title, stage plate | ~120–150px | No — scrolls away; identity re-prints in the seam |
| 2 | Vitals + Phases fold | `letterhead-vitals.tsx` | 11px mono vitals; Phases fold; optional 44px in-hand row | ~40px closed, ~85px with the in-hand row, more with Phases open | No |
| 3 | Job ticket | `job-ticket.tsx` (`sticky top-0 z-[4]` `:362`; sentinel `doc-ticket-sentinel` `:345`; `SEAM_HEIGHT_VAR='--doc-seam-height'` `:60`) | 8 rows — Rooms · Pieces · Drawings · Spec · Boards · Money · Dates · People (`lib/document/ticket-derivation.ts:780-793`), ~36px each | **~300px** | Yes — folds to a **2-line seam** (identity + worst two exceptions) once the letterhead sentinel passes |
| 4 | Red-letter zone XOR guide | `red-letter-zone.tsx` / `document-guide.tsx` (`my-5 border-y py-4`) | The exceptions, or the one next act | ~80–110px | No |
| 5 | Instruments | `letterhead-instruments.tsx` | The document's own acts | ~50px | No |
| 6 | Client approvals | region, `mt-6 py-6 border-y` | First real region | starts ~700–790 | — |
| 7 | Schedule rule region | `schedule/schedule-rule-region.tsx`, `mb-4`, folded by default | The dates rule | — | — |

The eight ticket rows are also **doors**: room chips expand; `ffe` · `money` · `schedule` unfold their region; `planroom` · `specbook` · `moodboards` are leaves (dead below 1440 — no routes); `People` opens the call-sheet overlay. Six of the eight doors exist **only at `s0`** — once the ticket seams, the seam carries identity and the worst two exceptions and every leaf door is gone.

- **H1 — Sort all eight ticket rows into ORIENTATION / DOORS / FACTS.** Every row goes in exactly one bucket, with the sentence that puts it there. A row that is two of those things is the finding, not an exception. Then say where each bucket lives in your design: orientation and doors do not have to live in the same organ, and probably should not.
- **H2 — Can letterhead + ticket + guide + instruments collapse to one lens line of 48–64px?** If yes, it holds at most **five things** and you must argue for each one individually: *title · stage plate · worst exception · money rung · install date*. Argue each in, or swap it out for something you can argue better. If the answer is no — if five is too few or the line is the wrong shape — say what the right shape is and why, and pay the frame-budget cost openly.
- **H3 — What is at scroll 0?** The full letterhead is a moment of arrival, and arrival is worth something. Say whether the lens opens open and closes as she descends, or opens closed and can be opened, and what the very first screen of a document she has not looked at in ten days should be.
- **H4 — The one reversing act.** Whatever the lens line becomes, there is one act that takes it back to full. Name it, place it, give it its word, and make its state readable **without hover** — a chevron that only appears on hover is an automatic return.
- **H5 — Zero layout shift.** The precedent is R99: the schedule rule "pins beneath the title at reduced height, labels fold into the line, zero layout shift". Say how your header change achieves the same, mechanically — what reserves the space, what element the sticky thing measures against, and what happens to `--doc-seam-height` and its consumers (`globals.css:1026-1037`, `commercial/money-region.tsx:48`, every `[data-index-region]` scroll-margin) if the seam's height stops being one of two fixed values.

### The sections and the margin

Region heads (`region/region-head.tsx`: 24px Playfair h2 `:127`, 12.5px status and exceptions line, the ledger's index-0 entry inked, an optional Fold) **own no spacing at all**. The gap between one region and the next is set at each call site, and the set of values in use today is `mt-6/py-6` (approvals) · `mb-4` (schedule frame) · `mt-2` (schedule ledger) · `mt-5` on a rule (FF&E) · `mb-5` (money). Five different answers to one question. `region/region-rule.tsx` draws a 6px double rule. `region/use-region-fold.ts` runs three voices — `forceOpen` beats `localStorage` `patina:doc-fold:{docId}:{region}` beats a latched default — and folding **unmounts** the body behind a 44px `region/fold-seam.tsx`.

The margin (`margin-rail.tsx`) is 232px, `sticky top-0 h-screen col-start-3` at >=1440, and a `fixed w-[min(360px,calc(100vw-56px))]` sheet from 1180–1439. Into that column go: the first-touch note, file-change notes, the "In the margin" head with a `+ Decision` / `+ Note` row, a Drafts collapsible, decision / message / money chips (`margin-item.tsx`, carrying `doc-elevated` — one of the three legal shadow sites), a note composer, and a handoff group. That is six tenses of work in one 232px column, and at 1280 all of it is behind a tab.

- **R1 — One region-spacing token.** Name it, give it a value, list every adopter, and list the exceptions with the reason each is an exception. "Every region uses it" is a fine answer if it is true; if it is not, the exceptions are where the design lives.
- **R2 — Define reading-line density precisely.** Not "dimmed". Give the ink percentage per level, name which elements change and which do not, and answer three questions explicitly: do **acts** print at reduced density? do **exceptions** ever go quiet? does a **number** ever soften? (An overdue day-count that fades because she scrolled past it is an information-loss defect, not a lens.)
- **R3 — How density coexists with the explicit fold.** Folded-by-choice and condensed-by-position are two different states and a designer must be able to tell them apart **on sight, in a still**. Say what is visibly different. Then rule the collision: what does a region that is *both* folded and out of frame look like, and what happens when she scrolls to a region she folded last month?
- **R4 — What must the 232px hold, versus the paper's own gutter?** The margin's contents are not one kind of thing. Sort them: notes about this document, notes about a line in this document, drafts, handoffs, presence. Some of those belong beside the line they are about; some belong in a column; some belong in a sheet. Say which, and what the column's width becomes once you have moved what should move.
- **R5 — Which margin tenses survive at rest?** At `s0` with nothing happening, what is in the margin? At `s2` while she edits an FF&E line? The margin is the only organ that could plausibly *gain* content as the lens focuses, and if that is your answer, say what it gains and what it gives back.

### Motion

The vocabulary that exists, in `app/globals.css`: `doc-raise` 270ms `:249` (applied `page.tsx:1764`) · `doc-sheet-up` `:237` · **`doc-breath` 3s `:271` — the only ambient motion in the system, on the active spine mark** · `fold-in` and `fold-arrow-flip` 300ms `--ease-editorial` `:404-437` · `desk-settle` 320ms with a 60ms stagger `:384` · `strata-sweep` `:468` · `.row-wash` — the ink-pool hover, `clip-path` circle from the pointer, 260ms in / 200ms out `:327-349` · `.doc-elevated` `:294`. Twelve `prefers-reduced-motion` blocks, each naming its rules rather than blanketing `*`. Tokens: `--ease-editorial` `cubic-bezier(0.22,1,0.36,1)`, `--duration-fast 150ms` / `--duration-normal 300ms` / `--duration-slow 500ms` / `--duration-editorial 700ms`, `--press-in 70ms` / `--press-out 240ms`. The running-index observer (`hooks/use-document-running-index.ts`) uses a `-20% 0px -62% 0px` band and a 700ms jump lock.

- **M1 — The grammar table.** `name · trigger · property · duration · easing · reduced-motion form · site`, one row per move, existing and new. **A move not in the table does not exist** — the mockup probe diffs against it, and an unlisted animation is a defect.
- **M2 — What animates on a condense?** Name the properties. If any of them is a layout property, say why the layout shift is acceptable and how it is contained; the default answer is that layout never animates and only ink, opacity and reserved height change.
- **M3 — The hysteresis rule, proven at 4x.** Give two thresholds, not one: the offset at which a region leaves `full` and the different offset at which it comes back. Give the number of pixels between them and the reason that number and not a smaller one. The mockup runs at `--motion-scale: 4` and a prober watches the boundary for oscillation.
- **M4 — The breath stays the only ambient motion** unless you name a second one, say where it lives, and say the sentence it speaks. Ambient motion is the most expensive kind; the budget is one.
- **M5 — Reduced motion is a form, never "n/a".** Every row's reduced-motion cell holds a real thing a designer sees: a flat tint, an instant swap, a static rule, a printed word. Under `prefers-reduced-motion: reduce` the same information must be on screen; only the transit is gone.

---

## A.3 Success criteria — SC1–SC13

These are what the mockup's probe prints and what the judges check the frame-budget table against. They are design targets, not measurements of anything that exists; say so if a target is wrong and give a better one with the reason.

| # | Criterion | Threshold |
|---|---|---|
| SC1 | First region head, y-position at 1440, lens at rest, scroll 0 | **<= 405px** (45% of a 900px frame). Today: 700–790px (78–88%) |
| SC2 | Header band height at 1440 in the condensed state | **<= 108px** (12% of the frame) |
| SC3 | Lens-line height sampled at scroll 0 / 400 / 1200 | condensed value **<= 64px** and **stable** — the same number at 400 and 1200, no drift |
| SC4 | Rail utilisation (`inkPx / railHeightPx`) at 1440 | **>= 70%** on the project spread, **>= 55%** on a pre-work spread |
| SC5 | Hover-only acts, all widths, all states | **0** |
| SC6 | Elements still animating 1s after entering any dev-bar state, under reduced motion | **0**, via the media query **and** via the dev-bar toggle |
| SC7 | Composite text contrast in every lens state, including condensed | **>= 4.5:1** |
| SC8 | Computed `box-shadow` census over the whole mockup | exactly the **three** `--elevation-sheet` sites, value `rgba(44,41,38,.08) 0 1px 2px`; everything else `none` |
| SC9 | External requests | **0** |
| SC10 | Horizontal overflow at 1440 / 1280 / 390 | **0** — nothing escapes its frame |
| SC11 | Density map at scroll 0 / 400 / 1200 | exactly **one** region at `full`; **no** region with zero readable text |
| SC12 | The rail's `data-reading-index` versus the `full` region | agree at every offset; **never null** while the paper is in view |
| SC13 | Tab-through at 1440 | reaches **every** act in DOM order with a visible focus ring, and no focus lands behind the pinned seam (2.4.11) |

---

## A.4 The keeps

**The four hard no-gos.** Not re-proposable, and each is an automatic return.

- **NG1 — one document at a time (D1).** No split view, no tabs, no peek-or-hold, no persistent global nav over an open document. `Esc` / Put down is the exit. A lens that shows two documents at reduced density is a split view wearing a metaphor.
- **NG2 — the shadow budget (D4).** Exactly one token, `--elevation-sheet: 0 1px 2px rgba(44,41,38,.08)`, at exactly three sites: the margin chip, the open ledger sheet, the studio drawer. Zero other shadows anywhere. Proven by a computed-style sweep, not a source grep — a `filter: drop-shadow` counts.
- **NG3 — no Thumb Index.** Removed by Kody: "do not re-propose". If your rail wants an alphabet of tabs down its edge, that is the Thumb Index and the answer is no.
- **NG4 — the R126 register is the floor.** 40px Playfair letterhead, 24px Playfair region heads, the five-step scale 40/24/18/15/14, an 11px mono floor, three rule weights (`--rule-hair` 1px at 10% / `--rule-mid` 1.5px `#2C2926` / `--rule-strong` 2px plus a hairline double), paper `#FCFAF6`, rail stock `#E8E3DB`, desk `#FAF7F2`, charcoal `#2C2926`, the `-ink` companions (clay `#7C5E30`, terracotta `#9C5340`, golden-hour `#79651E`, sage `#5F6B57`), the muted ramp `#4E4339` / `#5A4E43` / `#65594E`, filled stamps (~1.18:1 tint, 1.5px pigment border, charcoal word, -1.5deg), the six saturated stage tab plates (`--tab-brief #497093` … `--tab-install #823832`, white label), the ink-pool hover wash (clip-path circle from the pointer, 260ms in / 200ms out, `--ease-editorial`, ~1.12:1 over its own ground, a flat `-still` tint under reduced motion), 48px product crops on catalog-linked lines. **You build on this. You do not restyle it.** "Typography goes no further than the mockup" (R126). THE STUDIO desk block is untouched.

**Kody's taste, on the record.** Large tinted surfaces read as "silly/terrible" — colour belongs on small state-carrying things. "The sections and animated highlighting" were loved; whatever you do, that character survives. "Don't push the typography further."

**Four more, which the register already embodies — context, not new law:**

- **C7 — one inked leader per region; overflow always visible, never hover-gated.** The lens must not become a reason to hide an act behind a pointer.
- **C6 — scored ink, not buttons.** No plates, no boxes, no chips-as-buttons. A new act in a new organ is still a scored word.
- **C10 — the Record lives at the foot of the paper.** The foot is a destination, not a leftover; a lens that condenses everything above it must still make arriving there feel like arriving.
- **C20 — one icon language.** No second iconography. If your rail needs a glyph it does not already have, argue for it as an addition to the one language rather than importing a set.

**Everything else is open ground** — composition, mount order, disclosure, motion, the spine's job, the header's job, spacing tokens, what appears when. Amendments to `DECISIONS.md` are **never priced and never penalised**. Name what you amend, quote <=25 words, say what it becomes, and move on; the refuter labels it for the record and that is all.

---

## A.5 The shape you deliver

Exactly the eleven-section proposal contract in `source/instruments.md` §6, in that order, with those names:

1 Thesis (<=120 words, one falsifiable sentence) · 2 What stays identical · 3 Lens mechanics table (`trigger · what changes · from→to · duration & easing · reduced-motion equivalent · what never moves · F-ids` — no empty cells) · 4 Organ by organ (spine · header · region heads and spacing · margin · motion grammar · 1280 · 390) with mount-order consequences · 5 The lens state machine (`at rest · reading · editing · condensed · mobile`, every transition with its reverse) · 6 Frame budget against `research/12-layout-measurements.json`, with targets · 7 Findings addressed · 8 Canon note (named, not priced; NG1–NG4 each with the mechanism that leaves it untouched) · 9 Engineering path (waves, real file paths, what `use-region-fold`'s three voices / the ticket seam and `--doc-seam-height` / the `-20% 0px -62% 0px` observer and its 700ms jump lock become, tests rewritten or deleted by path including the 1500-char regex in `lib/document/__tests__/stage2-approval-cutover-contract.test.ts:19`, the gates that stay green, rollback per wave) · 10 Risks, >=5, each with its falsifying observation · 11 Refuses, >=4.

Write it as one proposal. No "option A or option B", no "we could either". The roads you rejected go in `roads-not-taken.md`, named, with the one thing that killed each.
