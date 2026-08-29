# Candidate mechanics — the catalogue

**How to use this file.** These are ten named mechanics that came out of planning. They are candidates, not instructions. **Adopt, adapt or refuse any of them — and name every decision.** A proposal that adopts M-3 in a changed form says so and says how it changed; a proposal that refuses M-6 says so and says why. An unmentioned mechanic reads to the judges as one you did not consider.

Two standing warnings before the list.

**Stacking rebuilds what we are trying to fix.** Each of these makes one thing quieter. Three of them layered on one screen make a column of mixed ink weights, mixed condensation triggers and mixed reversal acts — which is a new and subtler version of the cluttered column the ask complains about. Pick the smallest set that answers the four organs, and say which ones you left out because they were redundant rather than wrong.

**Nothing here is a filter.** Every mechanic below is written so that what it acts on stays in the flow, keeps its place, and comes back. If your adaptation of one of them removes a region from the paper's order, you have changed it into something the brief refuses (A.1, Law 2).

---

## M-1 · The Lens Line

**Mechanism.** The letterhead, the job ticket, the guide-or-red-letter block and the instruments row collapse into a single sticky band of 48–64px that changes what it says as she descends: identity and stage at the top of the document, then — as she passes into a region — the worst live exception, the money rung, and the install date, each printed as a scored word rather than a plate. It is one element, not a stack, so there is exactly one sticky thing on the page and exactly one height for the rest of the layout to reason about. At scroll 0 it is open at full letterhead height; the transition to closed is a reduction in reserved height, not a change of element. The eight ticket rows are redistributed per H1 rather than carried along.

**Risk.** Five things in 64px at 1440 is roughly 200px per thing after gaps, which is one short phrase each — the moment a real exception string is longer than "OVERDUE 6 days · Primary bedroom approval" the line either truncates a fact or grows and breaks SC3's stability. The collapse also destroys six of the eight ticket doors (`Drawings`, `Spec`, `Boards`, `People`, and the two unfold doors), so H1's redistribution is load-bearing rather than tidying, and `lib/document/ticket-derivation.ts:780-793` has to keep producing rows for whatever consumes them. Continuous height changes touch `--doc-seam-height` (`job-ticket.tsx:60`) and every consumer at `globals.css:1026-1037` and `commercial/money-region.tsx:48`, which today assume two discrete values.

**Conflicts with.** M-8 (both want the top band; see the conflict summary). Composes with M-2, M-3, M-7, M-9, M-10.

---

## M-2 · The Map Rail

**Mechanism.** The rail stops reprinting headings and becomes a vertical map of the paper: a ladder whose length is the document, with each region drawn at its **true proportional extent** rather than as an equal-height list item, the current position marked on it, and an exception mark on any region carrying one. Put down moves to the very top as the exit; the shelf leaves (plan room, spec book, mood boards, call sheet) become doors on the rail at every width rather than ticket rows that vanish at the seam; the timer reduces to a glyph at the foot. The seven-mark arc leaves the rail per S2, or turns vertical. It indexes every region on every one of the seven spreads, including the pre-work spreads that print nothing today (`lib/document/document-index.ts` `paperRegionsForSection`).

**Risk.** Proportional extents make short regions unclickably small: the schedule rule region at `mb-4` is a fraction of the FF&E body's height on the Vandersteen spread, and a 6px target fails 2.5.8 before it fails taste. Extending the index to brief/discovery/direction/proposal needs region data those spreads do not produce today, so the cost is in `document-index.ts` and the section components, not in the rail — E1 item 3 sizes it. Moving the leaf doors to the rail leaves the 1180–1439 tier's 56px glyph column carrying doors it has no room to label, which is where the current design already loses them.

**Conflicts with.** M-4 (who owns the paper's index and its pins) and M-8 (redundant position signal). Composes with M-1, M-3, M-9.

---

## M-3 · Reading-line Density

**Mechanism.** Every region carries one of three densities — `full`, `reading`, `condensed` — assigned by an IntersectionObserver rooted at the scroll container, with a hysteresis band so a region does not flicker at the boundary. **Bodies stay mounted at every density**; what changes is ink weight, line-height and which secondary strings print. `full` is the ratified R126 weight with nothing withheld. `reading` is the neighbouring region, legible but quiet. `condensed` is the head plus one status line, at the region's reserved height so nothing below it moves. Exactly one region is `full` at any offset (SC11), and the rail's `data-reading-index` names it (SC12).

**Risk.** Reduced ink weight is where 1.4.3 gets lost: the muted ramp bottoms out at `#65594E` on paper `#FCFAF6`, and any softer step fails 4.5:1, so `condensed` has to be *less text*, not *fainter text* — a distinction that is easy to state and easy to violate in a mockup. Keeping bodies mounted at a reserved height means the reserved height must be computed from the full body, which reintroduces the measurement problem `use-region-fold.ts` avoided by unmounting. And density assigned by position collides with density chosen by the designer: `region/use-region-fold.ts`'s three voices (`forceOpen` > `localStorage` > latched default) become four unless one of them is retired.

**Conflicts with.** M-5 (continuous versus discrete — a precedence rule is mandatory if both are adopted) and M-6 (two dimming systems on one screen). Composes with M-1, M-2, M-7, M-9, M-10.

---

## M-4 · The Gutter Margin

**Mechanism.** The margin's chips stop being a stacked column of cards and become one-line pins in the paper's own gutter, each sitting at the vertical position of the line it is about — a decision beside the FF&E row it decided, a message beside the approval it questions. What remains genuinely document-wide (the first-touch note, drafts, handoffs, presence) stays in a column, which can then narrow from 232px to roughly 160px. The freed ~72px goes to the paper's measure, which at 1440 is the difference between a 1008px and a 1080px paper column. The `+ Decision` / `+ Note` acts move to where the pin would land.

**Risk.** A pin has to have a line to point at, and a decision about the whole document has no line — so the mechanic needs a defined home for orphan items or it silently loses them, which is an information-loss defect. Pins at true vertical positions collide when two items are about lines 14px apart, and the collision rule (stack? cluster? offset?) is the whole design. `margin-item.tsx` carries `doc-elevated`, one of the three legal `--elevation-sheet` sites (NG2) — a pin in the gutter that keeps that shadow puts a shadow on the paper, which is a different thing from a shadow on a floating chip, and the sweep will see it.

**Conflicts with.** M-2 (both claim the job of showing where things are relative to the paper). Composes with M-1, M-3, M-9.

---

## M-5 · Section Zoom

**Mechanism.** Instead of a continuous density gradient, focus is discrete: entering a region is a state change that brings it to full and takes the others to condensed in one 300ms move, with a defined entry trigger (crossing the head, or clicking a rail target, or beginning an edit) and a defined exit. It reads as a lens *clicking* into focus rather than sliding, which is closer to how a real lens with detents behaves and much easier to reason about, test and announce. Because the change is discrete it can be a genuine state on the root (`data-lens-state`), which makes the reduced-motion form trivial: the same state, no transition.

**Risk.** A discrete change at a boundary she is scrolling across is exactly the oscillation problem, one order of magnitude more visible than a gradient's — a slow scroll parked on a head snaps back and forth unless the hysteresis is generous, and generous hysteresis means the wrong region is full for a noticeable distance. Discrete zoom also fights momentum: a trackpad fling through three regions either fires three transitions in 200ms or has to be damped (M-10). Announcing three discrete state changes per fling to a screen reader is noise, so 4.1.3 has to be answered by announcing only the settled state.

**Conflicts with.** M-3 (adopting both requires an explicit precedence rule: which one decides density, and what the other one is for). Composes with M-1, M-2, M-9, M-10.

---

## M-6 · Focus Follows the Pen

**Mechanism.** While she is editing — a fabric on an FF&E line, a date in the schedule — the line under the pen holds focus and its siblings recede, so the edit sits in a quiet field rather than a full column. The trigger is the edit itself, not scroll, so it is orthogonal to M-3 and M-5: it is the `editing` state in the state machine, entered on focus of an editable control and left on blur or commit.

**Risk.** **Flagged high-risk.** The obvious implementation is dimming the siblings, and dimming a block of rows is a large tinted surface laid over the paper — precisely what Kody has on record as reading "silly/terrible", and a contrast hazard for the dimmed text besides. If this is proposed at all, propose it as **ink weight on the edited line** — the line getting *heavier*, its rule turning clay, the pointer's own wash holding — rather than as its neighbours getting fainter, because making one row stronger costs nothing that a designer can lose and dimming eight rows costs eight rows of legibility. Two dimming systems on one screen (this plus M-3's `reading` density) is unreadable in any case.

**Conflicts with.** M-3 (two dimming systems). Composes with M-1, M-2, M-9 if and only if it is expressed as ink weight on one line.

---

## M-7 · The Ticket Dissolved

**Mechanism.** The eight-row job ticket stops existing as a block. Its rows are redistributed by the H1 sort: orientation rows fold into the lens line, door rows become rail doors or region-head acts, fact rows go to the region that owns the fact (money to the money head, dates to the schedule head, rooms and pieces to the FF&E head). `lib/document/ticket-derivation.ts` keeps deriving the same eight values — it is a good derivation and the facts are right — but nothing renders them as a table. What is left at the top of the paper is the lens line, and the ~300px the ticket occupied at `s0` is the single largest recovery available.

**Risk.** The ticket is currently the only place several facts appear at all, so every row needs a demonstrated destination before this can ship — an orphaned row is a fact that silently left the product. Two tests pin the ticket directly: `e2e/document/quiet-responsive-shell.spec.ts` asserts eight rows and `components/document/__tests__/job-ticket.test.tsx` asserts `--doc-seam-height` at `:519`, `:524` and `:529`; both are rewrites, not adjustments. Dissolving it also removes the sticky element every `[data-index-region]` scroll-margin is measured against, so whatever replaces it must publish the same variable or every anchor lands wrong.

**Conflicts with.** Nothing structurally — it composes with everything, and M-1 largely presumes it.

---

## M-8 · The Standing Rule

**Mechanism.** The head of the region currently in frame pins beneath the lens line at reduced height, R99-style: the 24px Playfair head drops to the mono register, the status and exception strings fold into the same line, and it stays there until the next region's head pushes it out. She always knows what she is inside of, at zero cost when she is between regions, and the answer is one line rather than a rail glance. The precedent is exact and already shipped — the schedule rule "pins beneath the title at reduced height, labels fold into the line, zero layout shift".

**Risk.** It is a second sticky band under the first, and two stacked sticky bands are a header again — SC2's 108px condensed budget has to cover both or the mechanic is self-defeating. It duplicates the rail's position signal outright: if M-2's map already marks the current region, the standing rule is a second copy of the same fact on the same screen, which is exactly what the critics' standing assignment hunts for. And each pin/unpin is a `--doc-seam-height` change, so the value becomes a function of two elements rather than one.

**Conflicts with.** M-1 (top-band budget) and M-2 (redundant position signal). Composes with M-3, M-5, M-7, M-9, M-10.

---

## M-9 · The Quiet Foot

**Mechanism.** The foot of the paper — the AccountBand or KickoffBand, the `previous-work.tsx` settled bars, `doc-colophon.tsx`, and the Record — is given a deliberate arrival rather than being the place the scroll runs out. As the last region reaches full, the lens line reduces to identity alone and the rail's map fills to its end, so the screen visibly signals *this is the bottom of the job*. C10 keeps the Record at the foot; this makes the foot worth reaching.

**Risk.** The foot is the least-visited part of the paper and any budget spent there is budget not spent on the header, which is the ask's actual complaint. Settled bars carry R8's rule that they show no unfold hint, so an arrival treatment must not read as an invitation to open them. If the arrival is animated it is a second ambient-ish move competing with `doc-breath` for the one-move budget (M4 in the brief).

**Conflicts with.** Nothing. Composes with everything.

---

## M-10 · Tempo Damping

**Mechanism.** Density transitions are gated on scroll velocity: during a fast scroll nothing changes density at all, and the lens settles only once velocity falls below a threshold for a defined dwell. A fling through four regions therefore produces one transition at the destination rather than four in flight, which fixes momentum, oscillation and screen-reader noise in one move. It must expose a **deterministic `settle()` hook** — a function the mockup's probe and the eventual e2e tests can call to force the settled state synchronously, plus a `window.__lensSettled()` promise — because a velocity-gated system that can only be observed by waiting is a system nobody can test.

**Risk.** The threshold and the dwell are two more magic numbers on top of M-3's hysteresis band, and the wrong dwell makes the lens feel late — a designer who stops scrolling and waits 400ms for the page to decide what she is reading will describe it as laggy, not peaceful. Velocity from `scroll` events is noisy on trackpads and worse on touch; the implementation has to smooth it, and smoothing adds latency to the very thing that is already late. Under `prefers-reduced-motion` there is no transit to damp, so the damping must still gate the *state change* or the reduced-motion form flickers where the animated form does not.

**Conflicts with.** Nothing. Composes with everything, and M-3 and M-5 both need it.

---

## Conflict summary

| Pair | The conflict | What a proposal adopting both must produce |
|---|---|---|
| **M-1 ⟷ M-8** | Both spend the top band. The lens line at 48–64px plus a standing region head is two sticky bands, and SC2 budgets 108px for all of it. | One height budget covering both, with the arithmetic, and the state where only one of them is present |
| **M-2 ⟷ M-4** | Both claim the job of saying where things are relative to the paper — the rail as a map of regions, the gutter as pins on lines. | A division of labour: which one owns the index, which one owns the pins, and the rule that keeps them from printing the same fact twice |
| **M-3 ⟷ M-5** | Continuous density versus discrete zoom. Two systems assigning density from position. | An explicit **precedence rule**: which one decides a region's density, and what the other one is then for. Without it, both are refused |
| **M-3 ⟷ M-6** | Two dimming systems on one screen — neighbouring regions at `reading`, and sibling rows dimmed under the pen. | One dimming system. If M-6 survives, it survives as ink weight on the edited line, never as tint on its siblings |
| **M-2 ⟷ M-8** | Redundant position signal: the rail marks the current region and the standing rule names it, on the same screen, at the same moment. | A reason the redundancy earns its space, or one of the two dropped. The critics' standing assignment will find this one first |

**M-7, M-9 and M-10 compose with everything** and with each other. They are the three that cost nothing to combine — which is not a reason to take all three, only a reason not to worry about their interactions.
