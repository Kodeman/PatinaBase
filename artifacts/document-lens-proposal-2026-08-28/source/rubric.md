# Rubric — how the proposals are criticised and judged

Seven axes. Scored **1–10 per axis, never averaged.** A proposal is a shape, not a number; an average would let a 9 on motion discipline pay for a 3 on lens honesty, and those are not convertible currencies. Judges and critics both report the shape.

This file is `source/instruments.md` §7 expanded. Where the two differ, this one is the operative text.

---

## The seven axes, with anchors

Score 1–2 where the axis is not addressed at all; 3, 6 and 9 are anchored below; 10 is reserved for an answer that changes what the team thinks is possible on this axis, and a judge awarding one says what it taught them.

### Axis 1 — Uncluttered and peaceful

*Does the screen actually get quieter, measurably, without anything leaving the product?*

| | |
|---|---|
| **3** | Elements are removed but the frame budget barely moves; "peaceful" is asserted rather than measured; or the screen is quieter because a fact was deleted. A proposal whose §6 table has no target numbers lands here at best. |
| **6** | The first region head at 1440 at rest lands at or under 45% of the frame, with the arithmetic shown against `research/12-layout-measurements.json`. Every element removed from a band has a named new home. The condensed band is under budget at 1440 and 1280. |
| **9** | Every one of the twelve state-width cells has a measured budget under target; the top band carries at most five things and each is argued individually; and a practitioner walk of the design says the screen got quieter *without* saying anything got lost. Peace is demonstrated by what a designer says, not by what is absent. |

### Axis 2 — Lens honesty

*Nothing hides. Every condensation is reversible in one act, readable without hover, and distinguishable from empty on sight.*

| | |
|---|---|
| **3** | Something disappears with no reversal in one act; or a condensed state cannot be told from an empty one; or a state is legible only on hover (which is also an automatic return). A design that unmounts a region body on scroll lands here by construction. |
| **6** | Every condensation names its reverse act and the string it still prints while condensed. Folded-by-choice and condensed-by-position are visibly different states, and the difference is described, not just asserted. |
| **9** | Plus the <=40-character condensed line is specified per region; the collision case — a region both folded by choice and out of frame — is ruled explicitly; and a designer looking at a **still screenshot** can say which state each region is in. The returning-designer case (a fold stored under `patina:doc-fold:{docId}:{region}` from three weeks ago) is answered by name. |

### Axis 3 — Orientation at depth

*At any scroll offset she can say which document, which region, what is wrong, and how to get back.*

| | |
|---|---|
| **3** | At the foot she cannot say which document she is in, or which region, or how to leave; or at least one of T1–T16 costs more acts than it does today. |
| **6** | Identity, stage and current region are legible at every scroll offset at 1440 and 1280. All sixteen tasks reach their door in <=2 acts at >=1440, and the exceptions below 1440 are declared with reasons. |
| **9** | Plus the rail reads as a **map** — position, extent, exception, distance to the next thing needing her — on all seven spreads including the four pre-work spreads that print nothing today; and 390 loses no task the desktop has. |

### Axis 4 — Engineering credibility

*Could this team build this, in waves, starting Monday, without a rewrite?*

| | |
|---|---|
| **3** | The waves are one program with a flag on it; mechanisms are named without files; one or more of the three load-bearing mechanisms (`use-region-fold`'s three voices, the ticket seam and `--doc-seam-height`, the running-index observer's band and jump lock) is unanswered; tests are gestured at rather than listed. |
| **6** | Each wave is valuable on its own and lands in real file paths. All three load-bearing mechanisms are answered explicitly — what each *becomes*. The test blast radius is enumerated file by file with rewrite-or-delete and a reason. Rollback is stated per wave. |
| **9** | Plus a first wave that ships in days behind a fail-closed flag; the 1500-character regex in `lib/document/__tests__/stage2-approval-cutover-contract.test.ts:19` handled by name with what happens to it; `lib/document/__tests__/shadow-gate.test.ts` and `contrast.test.ts` shown to stay green; and any dependence on a browser feature (`animation-timeline: scroll()`, `content-visibility`) carrying a named JS fallback and a support statement. |

### Axis 5 — Motion discipline

*Every move is in the grammar, means something, stills honestly, and moves nothing under her.*

| | |
|---|---|
| **3** | A move exists that is not in the grammar table; or a reduced-motion cell reads "n/a" or "none" alone; or a tint larger than a row appears anywhere; or layout shift is not addressed. |
| **6** | The grammar table is complete with every column filled — `name · trigger · property · duration · easing · reduced-motion form · site`. Hysteresis is stated with two numbers and the distance between them. Zero layout shift is claimed **with the mechanism** that delivers it, not as an aspiration. |
| **9** | Plus every reduced-motion cell is a real **form** that carries the same information as the animated one; the one-ambient-move budget is defended (`doc-breath` stays alone, or a second is named and argued); the hysteresis survives a 4x slow reading without oscillating; and momentum and reverse-scroll are ruled separately, because they are different. |

### Axis 6 — Still Patina

*Does this look like the same product, made by the same hand?*

| | |
|---|---|
| **3** | Restyles the R126 register; pushes the type scale further; adds a second icon language; or introduces a large tinted surface. Any of these alone puts the axis here. |
| **6** | The register is intact and the new organs are built from tokens, weights and rules that already exist. Colour appears only on small state-carrying things. Nothing on THE STUDIO desk block is touched. |
| **9** | Plus the new organs look like they were always there — a practitioner cannot pick the new from the R126 floor in a still — and the proposal names, in §2, what it deliberately did **not** restyle even though it was tempting. |

### Axis 7 — The 390 form

*The same lens in one column, not a reduced product.*

| | |
|---|---|
| **3** | 390 is a separate design with its own metaphor, or it carries a shorter task list than the desktop does. |
| **6** | The same lens, one column. Every task reachable on the desktop is reachable at 390. Targets are >=44px where touch is likely, >=24px everywhere (2.5.8). |
| **9** | Plus the mobile bar and the spine sheet speak the same lens vocabulary as the desktop organs; the condensed line is the **same string** at 390 as at 1440; and 390 is the state that *proves* the thesis — the narrowest frame is where "what is out of frame yields" has to be true — rather than the one that barely survives it. |

---

## Automatic returns — and only these

A returned proposal is not scored. It goes back to its author with the violation named.

1. **A violation of NG1, NG2, NG3 or NG4.** One document at a time; the one-token, three-site shadow budget proven by computed style; no Thumb Index; the R126 register as the floor and not a starting point for restyling.
2. **Any hover-only affordance** — any act, state or piece of information that is available or legible only while a pointer is over an element, at any width, in any lens state.

**That is the whole list.** In particular there is **no unpriced-amendment return in this program**. Under the canon latitude (instruments §5) `DECISIONS.md` is context and amendments are never priced and never penalised — a refuter *labels* what a move amends, for the record only, and that label carries no score effect. A judge or critic who deducts for an amendment, or returns a proposal for making one, has made a scoring error and their verdict is corrected before it counts. If an amendment is a bad idea, say so on the axis it damages — clutter, honesty, orientation, feasibility, motion, register, mobile — and never on the ground that it amends something.

---

## The two judge lenses

Both judges read the same two proposals and the four critiques. Neither judge is an author, and neither has seen the other's verdict.

**J1 · Practitioner (Opus, high).** Scores axes **1, 2, 3 and 7**. Every score names the persona behind it — which of P1 (solo principal), P2 (three-person studio), P3 (junior, week one) or P4 (FF&E/procurement) is speaking when the score is what it is, and on which of T1–T16. A score with no persona attached is not a score, it is an opinion.

**J2 · Product and engineering (Opus, high).** Scores axes **4, 5 and 6**. Every cost claim cites a file — a real path, and a line where the line is what makes the point. "This is expensive" without a file is struck.

**Both judges end with two things, in this order:**

1. **Who is worse off.** Name the persona who loses under the proposal you favour, say what they lose, and do not soften it. Every real design decision costs somebody something; a judge who cannot name the loser has not understood the proposal.
2. **An explicit merge instruction.** Which organ comes from which proposal — spine from X, header from Y, and so on, by name — and **what dies**. Not "combine the best of both": a list of organs with a source, and a list of things that do not survive the merge. The merge author works from these two instructions and is entitled to disagree only in writing.

---

## The critic pass

Four critics, fresh contexts, each reading **both** proposals. No critic is an author of either. All four run before the revisers and before the judges.

**C-design (Opus).** Is this uncluttered, or merely emptier? Does the lens metaphor survive a real Tuesday — the Vandersteen specimen, an overdue approval, a damaged console and a carrier window closing tomorrow — or does it only survive a demo scroll? Is it still Patina paper, or has it become an app that happens to use Playfair? And the hardest question: **where does a deletion beat a mechanism** — where would simply removing an element achieve what a page of choreography is being spent on?

**C-feasibility (Opus).** Every mechanism checked against the actual tree with `file:line`. Every test the proposal breaks, named, including the ones the proposal did not name. Every dependence on a browser feature, with its support story and its fallback. Every place a layout property is animated or a sticky element's height becomes dynamic, and what shifts as a result. Where the proposal's §9 waves are not actually independent.

**C-practitioner (Opus, P1 recast).** Walk T1, T3, T4, T7, T9, T10 and T13 through the proposed mechanics, in the persona's voice, first person, present tense, with the mandatory `Frame budget:` line on every task. **Every moment that becomes recall instead of recognition is a defect** — every time the design requires her to remember that something is there rather than showing her. Also: every place the new design costs her an act that today costs none.

**C-access (Sonnet).** Reduced-motion parity — is the same information on screen with the transit removed, for every move in the grammar? Focus under condensation — where does the caret go when the thing it is in changes density, and does 2.4.11 hold under the pinned band? WCAG **2.4.7** (focus visible), **2.4.11** (focus not obscured), **1.4.13** (content on hover or focus), **2.3.3** (animation from interactions), **1.4.3** (contrast) — each cited by number against a specific element and state. Target sizes at 390. And the announcement problem: a region changing density is a state change with **no trigger**, so say what a screen reader hears, on what element, and how often before it becomes noise.

### The standing assignment — all four critics

> **At every scroll offset, list everything on screen that is a second copy of something else on screen.**

Run it at `s0`, `s1`, `s2` and `s3`, at 1440 and 1280, for both proposals. Project identity, stage, the worst exception, the money rung, the install date, the current region's name and the current region's position are the seven facts most likely to appear twice. A design that quiets the screen by condensing while still printing the same fact in three organs has not answered the ask; it has redecorated it.

### How critics report

- **Report every defect. Never filter, and never suppress a low-severity or low-confidence finding** — a severity filter costs recall, and the synthesis, not the critic, decides what matters.
- Every defect carries **both** a **severity** (`blocker` · `high` · `medium` · `low`) and a **confidence** (0–1). Confidence below 0.5 appends the sentence "what would settle this".
- Number every defect **Dx-nn** where `x` is the critic's letter — `Dd-` design, `Df-` feasibility, `Dp-` practitioner, `Da-` access — and `nn` runs from 01. Number per proposal, and say which proposal each defect is against; a defect against both gets a number under each.
- Every defect names the **scroll state** and the **width**, cites the proposal section it lands in, and where relevant a `file:line`.
- **End with the seven-axis scorecard, per proposal, never averaged** — seven numbers and one sentence each, even though the scoring verdict belongs to the judges. The critics' scorecards are an input the judges are free to disagree with in writing.
