# Accessibility & Design-System Critic — the standing head

## 1. Findings on today's head

**F1 — HIGH. Heading order inverts, and breaks the house's own contract.** SPEC.md states the law in one line: "`h1` → `h2` → `h3` in order; exactly one `h1` per specimen page" (SPEC.md:587). The live DOM does not follow it. On Discovery, `page.tsx` mounts, in order: the letterhead's `<h1>` (block 1) → `LensBand`, which carries no heading at all (block 2) → `SectionStageLineMount` *not hosted* (`stageStripInScope` is false for `discovery`), which prints a `<h3 id={headingId} className="sr-only">Workflow stage</h3>` (block 3/4, `section-stage-line.tsx:57-69`) → `PreworkRegion` → `RegionHead`'s `<h2>Discovery</h2>` (block 5). That reads to an AT user browsing by heading level as **h1 → h3 → h2** — a skip on the way down and an inversion on the way back up, inside the very component the house SPEC uses to define the rule it breaks.

**F2 — HIGH. Region-jump targets lose their focus ring.** `RegionHead`'s `<h2>` (`region-head.tsx:185-191`) is `tabIndex={-1}` and carries a bare `outline-none`, with no paired `focus-visible:` utility. `.outline-none` is a Tailwind *utilities*-layer class; the document's global ring (`*:focus-visible { outline: 2px solid var(--color-quiet-ink); outline-offset: 3px; }`, `globals.css:1576`) lives in `@layer base`, which Tailwind always cascades under `utilities` — so the utility wins and the ring is suppressed. This heading is a real focus target: `use-document-running-index.ts:288` and `care-band.tsx` both call `.focus()` on `regionHeadingId(...)` from rail/ladder jumps. `doc-letterhead.tsx`'s own `<header>` gets this right two lines away (`focus-visible:outline focus-visible:outline-2 ... focus-visible:outline-[var(--color-clay-ink)]`) — so the pattern exists in the same file tree and simply wasn't carried to the region head. `lens-a11y.spec.ts`'s Tab-walk cannot see this: it only walks natural Tab order, and this node is reachable only by the programmatic jump.

**F3 — HIGH. A raw material pigment is printed as text, below the house's own floor.** Block 3's sub-label ("DISCOVERY & PROGRAMMING · CORE · STAGE 02") is styled `text-[var(--color-aged-oak)]` (`section-stage-line.tsx:75`) — the *raw* `#8B7355`, not a `-ink` companion. `globals.css:15-27` documents exactly why this is wrong: "Aged Oak and Clay remain material pigments for fills, borders, rules... when the same pigment is asked to also be READ ON PAPER, it takes the `-ink` value... No site using these qualifies as large text (the mono eyebrows are 9–12px), so 4.5:1 is the floor, not 3:1." Computed: aged-oak on `--doc-paper` (#FCFAF6) = **4.30:1**; on `--color-off-white` (#FAF7F2) = **4.20:1** — both below the house's own declared 4.5:1 floor at this text's actual 12px mono weight. `clay-ink` (#7C5E30, 5.75:1) sits one token away and is exactly what this line should use.

**F4 — MED. That failure is invisible to the e2e gate.** `lens-contrast.spec.ts`'s `SELECTORS` array checks the band's two lines, the rail's stop names/values, the rail doors, and region-head names/count lines — it never selects `[data-section-stage-line]` or `[data-workflow-document]`. Block 3/4 is the one head-level text node the contrast proof doesn't reach, which is presumably how F3 shipped.

**F5 — HIGH. The same glyph reports two unrelated measures.** The `StrataMark` at the letterhead (block 1) renders `fill={deriveFillState(sections)}` — whole-document shaping/commitment/delivery — with `label="Document progress"` (announced to AT as `role="img"`). The `StrataMark` inside the Discovery readiness band (block 6, `discovery-section.tsx:288,438`) renders `fill={fill}` from `deriveDiscoveryReadiness` — essentials-only, Discovery-local — with **no `label`**, so per the component's own logic it renders `aria-hidden="true"`. AT users are safe (only one is announced); sighted users are not: the identical three-bar glyph appears twice within ~150px representing two different fractions of two different things, which is exactly what V9's P5 ("one scale, one rhythm") is supposed to prevent.

**F6 — HIGH. The readiness count is a silent duplicate of a live one.** The band's line 2 (block 2) is `aria-live="polite" aria-atomic="true"`. The readiness band's "**3** of 5 essentials captured" (block 6) is a plain `<div>`/`<p>` with no role and no live region — filling in an essential elsewhere on the page updates it with zero announcement, while the band right above it *is* wired to announce changes to standing state. Two views onto nearly the same fact, one live, one mute.

**F7 — MED. The track bar cannot be a progress meter — but reads like one.** Each `<li>`'s bar in `section-stage-line.tsx:99-105` is `w-full` (always 100% of its own column, `aria-hidden="true"`, adjacent text carries the fact) — structurally it can never show partial completion. But visually, a solid filled horizontal bar directly under a real progress glyph (block 1) and above a real progress glyph (block 6) reads as a third progress signal in a 430px stack where only two of the three are real. Not an accessible-name bug (it's correctly hidden); a metaphor-collision bug for every user, worst for anyone leaning on visual pattern-matching to skip text.

**F8 — MED. The stage number does not monotonically advance.** `SECTION_STAGE` (`workflow-stage-derivation.ts:92-100`) maps `direction → 05` and `proposal → 03` — the number a reader sees at the top of every spread goes **02 → 05 → 03** across Discovery → Direction → Proposal. A number that is supposed to orient ("where does this stand") and instead runs backward is worse than no number, particularly for a reader building a mental model stop-to-stop. `touches: R111` — worth a ruling regardless of which seat's direction wins.

**F9 — MED. Mono-uppercase microcopy sits below the house's own metadata floor.** `globals.css:100` declares `--type-metadata-min: 12px` as guidance. Actual sizes in the head: letterhead vitals `text-[11px]` (`doc-letterhead.tsx:92`), band line 1 `text-[11px]` (`lens-band.tsx:228`), band's `+N MORE` `text-[11px]` (`lens-band.tsx:311`), readiness eyebrow `text-[11px]` (`discovery-section.tsx:438`). The floor is opt-in (a `.quiet-*` class, not an enforced minimum), so this isn't a broken contract the way F3 is — but it is six-plus separate all-caps DM Mono lines stacked before real content, several under the house's own stated comfortable-reading size, which is a compounding cost specifically for readers who rely on word-shape (all-caps flattens ascenders/descenders, the exact cue dyslexic readers use most).

**F10 — LOW (positive, worth preserving). The refusal pattern in block 7 is the right model.** "Move back to New Lead" stays `aria-disabled` rather than `disabled` when refused, keeping it in the tab order with its reason wired via `aria-describedby` (`discovery-section.tsx:~555-562`) — the reason is announced with the control rather than hidden. Nothing else in the head does this as cleanly; it's worth copying forward rather than losing in a redesign.

## 2. What every head must carry

Register, in order: **what** (identity) → **where** (stage/standing) → **next** (one act). One line each, one home each.

- **Edna Courtney, Discovery:** *"Edna Courtney · Discovery, week 1"* → *"3 of 5 essentials captured — budget and how they live are still open"* → **Add scope & rooms** / **Begin the Direction** once ready. (15px sentence, band line 2; identity+stage at 11px, band line 1.)
- **Cedar Lane Study, Direction:** *"Cedar Lane Study · Direction"* → *"Drafting — 2 of 3 rooms scoped, fee schedule not chosen"* → **Open the Contract Room**.
- **Sonnenberg residence, Project:** *"Sonnenberg residence · Design Development, week 3 of 9 (estimated)"* → *"$17,500 overdue since 12 Aug"* (the worst standing fact outranks the guide's calm "nothing is waiting on you") → **[the act that resolves the overdue item]**, with "Open the FF&E schedule" demoted to the region ledger.

What is removed:
- **Was:** a free-standing `<h3 class="sr-only">Workflow stage</h3>` landmark (block 3/4) with its own oak sub-label. **Is:** the stage fact folded into the region head's existing `eyebrow` slot (`RegionHead` already accepts one). **Why cut:** it was never really its own region — hosting already exists for `scope`; extend it everywhere, and the phantom h3 goes with it, fixing F1 for free.
- **Was:** the readiness band, a second `<div>` restating a fraction the band already half-states via the guide headline. **Is:** folded into band line 2 as the standing exception. **Why cut:** it duplicates F6 and F5's second glyph in one move.
- **Was:** two `StrataMark`s. **Is:** one, at the letterhead, always labelled. **Why cut:** F5 — one glyph, one meaning.
- **Was:** the equal-width track bar. **Is:** nothing (P5: a decorative device with no real data renders nothing). **Why cut:** F7.

## 3. Direction: fold the landmarks, not just the pixels

```
DESKTOP — Discovery
┌ h1 Edna Courtney ─────────────────────────── vitals ┐
├ sticky band (56px, unchanged) ───────────────────────┤
│ EDNA COURTNEY · DISCOVERY, WEEK 1        [date]      │  line 1, 11px
│ 3 of 5 essentials captured — budget, lifestyle open   [Add scope & rooms]│  line 2, 15px
├────────────────────────────────────────────────────┤
│ eyebrow: DISCOVERY & PROGRAMMING · CORE · 02          │  clay-ink, 12px
│ h2 Discovery                                          │
│ 3 of 5 essentials captured                            │  ← ONE count, here
│                                    [Run the call] [Attach scan] [Add inspiration] [Move back to lead]│
└────────────────────────────────────────────────────┘
```
390 is the same stack, one column, nothing sticky changes: the collapse the Lens already performs (line 1 yields to zero height once the letterhead is saying the same thing) is the correct behavior — my direction doesn't touch it, it removes the redundant blocks *feeding* it. Direction and Project reuse the identical frame; only the eyebrow's stage number, the band's standing sentence, and the ledger's acts change (Direction: eyebrow "CONCEPT/SCHEMATIC · CORE · 05" — pending F8's ruling; Project: eyebrow from the schedule resolver, "DESIGN DEVELOPMENT · CORE · 06 · week 3 of 9 · estimated").

**Merge/demote/door/delete:** merge blocks 3+4+5 into one `<h2>`-anchored region (kills the phantom h3, F1). Demote the track bar to nothing (F7 — P5's own words). Delete the second `StrataMark` and the readiness `<div>` (F5, F6), folding their one live fact into the band's already-`aria-live` line 2. Door: none of this needs a door — nothing here was hiding detail, it was restating the same one.

**Interaction:** region-head `<h2>` gets `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--color-clay-ink)]` — the same declaration `doc-letterhead.tsx` already uses (F2, one-line fix, no new token). Press/hover on the band's act and the ledger's acts stay exactly as `DocumentAction` already does them — `da-pool` wash, 44px target, `motion-reduce` respected — nothing here needs new motion.

**Quiet case (P5):** Marcus Wright, brief, nothing standing yet: band line 2 prints the guide's own sentence ("Decide on this inquiry") with no fraction, no second glyph, no bar — because there is nothing to count yet, not because something was hidden.

## 4. Honors / departs

**Honors:** R127's 56px sticky-band contract (untouched); the `-ink` companion system and its 4.5:1 floor (F3 extends it rather than crossing it); P5 "a region with nothing to say renders nothing" (drives F7's deletion); the `aria-disabled`-in-tab-order pattern (F10, kept, not touched).

**Departs:** `touches: R111` — F8's stage-number inversion is surfaced but not resolved here; it's an information-architecture call, not mine to rule. `touches: I114` — I114 moved the eleven-row rail into the section head "which is block 3/4"; my direction folds that head *into* the region head rather than keeping it free-standing, which is a step past what I114 ruled. Worth crossing: I114 solved "don't show all eleven rows," not "don't show a second landmark," and the second landmark is what F1 catches.

## 5. One risk for Kody to rule on

Folding the stage eyebrow into `RegionHead` removes a `data-workflow-document` mount point the codebase treats as load-bearing in several other places (the hosted/`scope` branch, tests keyed on `[data-section-stage-line]`). If any direction from this panel merges blocks 3–5, someone needs to inventory every reader of that attribute before it moves — otherwise a clean accessibility fix ships a quiet regression somewhere the panel never looked.
