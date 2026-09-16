# Interaction Designer — the acts

## 1. Findings on today's head

**F1 — [HIGH] The `+N MORE` door re-lists every open input with the same act.**
`page.tsx:2145-2150` builds each sheet input row as `{ ..., act: guideAct }` — one shared act object, not each fact's own (`guideAct` = the topInput-derived act, `document-guide.ts` `withInputs` ~368-382: `Add ${firstInput.label}`). For Edna (budget, lifestyle both open) the sheet's "Lifestyle needs" row carries a button that says and does "Add working budget." Not a menu of distinct next steps — one step, printed twice with a decoy second button.

**F2 — [HIGH] The topInput is double-counted, not excluded, from the door's count.**
`guideInputs` (`page.tsx:1556`) is the *full* missing-essentials list; `withInputs` independently slices `inputFacts[0]` off it for the printed act. Nothing coordinates the two reads, so the item already named on the band's act line is also counted in `withheld` (`lens-band-derivation.ts`: `standingCount − (worst?1:0)`, and `worst` is null on a guide line) and re-listed in the sheet. Systemic, not Discovery-only: Direction's drafting-gap rows hit the same path, so every row there shares Direction's one static act ("Open the Contract Room") regardless of the gap it names.

**F3 — [HIGH] Two primary (leader) acts stand on screen together, uncaught.**
The band's line-2 act is `variant="primary"` (`lens-band.tsx:289`); the readiness band's "Begin the Direction" is too (`discovery-section.tsx:~455`). `DocumentActionGroup`'s one-leader-per-region guard can't see this: neither act is wrapped in a group, so each is its own trivially-passing region of one. Two leaders, two verbs, no wall between them — on the page the brief is asking us to declutter.

**F4 — [HIGH] The undo carries the lightest weight, and no forward consequence.**
"Move back to New Lead" is `variant="tertiary"` — single oak score, no ink pool, the quietest tier — for an act that returns the whole engagement to the lead queue. The only nearby text, `returnReason`, is the *refusal* reason, shown only when blocked; when the act is available, nothing says what pressing it does. Not "terminal" by V9's letter (no money, no signature), so P3's rule doesn't formally reach it — a gap in the doctrine, not proof the sentence is unneeded.

**F5 — [MED] The door mixes two weights of fact under one look.** `+N MORE` is unconditionally terracotta-ink whether it withholds real standing exceptions (overdue money, damage) or merely-open inputs. Edna's quiet "+2 MORE" reads identically to Sonnenberg's overdue one.

**F6 — [MED] Identical chrome, two press behaviors.** Discovery/Direction's input-derived act sets `activate:true` (opens the facet panel); I118's gate-branch act deliberately omits it ("the guide never activates what it names," DECISIONS.md:7482). Both render as the same mono act; nothing tells a designer whether pressing it scrolls or pops a panel.

**F7 — [LOW] At 390 pinned, only line 2 survives.** The band's declared 56px sticky box (verified exact-56 at every offset/width by `lens-band-height.spec.ts`) keeps line 2's act reachable always — but "Begin the Direction" and the toolrow need a scroll back up. On a 390 read "between two site visits," whichever item wins `rankStanding` is the only act a thumb can reach.

## 2. What every head must carry

Register, in order: **what** (identity + stage, one line) → **where** (one dated/counted fact) → **next** (one sentence, one act). Nothing else earns a line before content (P5).

- **Edna Courtney · Discovery** — *"Two essentials open — working budget, how they live. Call held 6 September."* Act: **Add working budget**. Identity/stage at 11px mono (letterhead already carries the 40px name); the standing/next sentence at 15px Inter (V9 P2 floor).
- **Cedar Lane Study · Direction** — *"One room still unscoped; fee schedule not chosen. Drafting since 2 September."* Act: **Choose the fee schedule** (named per-gap, never the generic "Open the Contract Room" while a specific gap exists).
- **Sonnenberg residence · Project · Design Development, week 3 of 9** — *"$17,500 overdue since 12 August; one piece blocked."* Act: **Resolve the balance**. `$17,500` and `12 August` are the sentence's heaviest tokens — money and dates should out-weight the surrounding words at the same 15px, not just meet the floor.

Removed (Was → Is → why):
- Block 3/4 (eleven-stage sub-label + track bar) → **deleted**. Line 1 already prints the stage phrase (`stagePhrase()`); the plate restates it a beat later in a second vocabulary — exactly Kody's complaint.
- Block 5 ("Nothing yet") → **deleted** for Discovery; it sits above "3 of 5 captured" and contradicts it (P5).
- Block 6's primary "Begin the Direction" → **demoted** to status text; the StrataMark glyph stays (R66's progress ritual), but the act lives once, in the band, and becomes the band's sentence the moment `ready` flips true.
- Toolrow and undo → **kept**, unchanged in tier, but the door behind them gets fixed (F1/F2) and separated by kind (F5).

## 3. My one direction — One Line, One Door, One Leader

```
DISCOVERY — desktop, at rest
┌────────────────────────────────────────────────────────────────┐
│ EDNA COURTNEY · DISCOVERY                                       │  line1, 11px mono
│ Two essentials open — working budget, how they live   ADD BUDGET +1 MORE │  line2, 15px + 1 act + door
└────────────────────────────────────────────────────────────────┘
  (StrataMark status strip — text only, no button, no da-act class)
  Run the discovery call · Attach the room scan · Add inspiration   ← secondary, unchanged
  Move back to New Lead — returns this to the lead queue; nothing here is lost.  ← tertiary + always-on consequence

DISCOVERY — 390, pinned
[← Edna Courtney · Discovery]
Open · budget, lifestyle           ADD BUDGET +1

DIRECTION — desktop
CEDAR LANE STUDY · DIRECTION                         DRAFTING SINCE 2 SEP
One room unscoped; fee schedule not chosen        CHOOSE THE FEE SCHEDULE

PROJECT — desktop
SONNENBERG RESIDENCE · PROJECT · DESIGN DEVELOPMENT · WEEK 3 OF 9       $212,000
$17,500 overdue since 12 August                       RESOLVE THE BALANCE +1
```

Sticky band = the page's *one* leader region. Stage line (3/4) **merges** into line 1, deleted as a separate print. Region head (5) **demotes**: it prints nothing while the band already states the standing fact, returning only once something concrete exists beneath it. Readiness band (6) **demotes** from second CTA to caption; once `ready` is true, its fact and act *become* the band's sentence — one primary, never two.

Hover/focus/press: keep the Scored Ink grammar exactly as built — value-only feedback, 2px clay-ink ring, no shadows. One change: a demoted caption carries no `da-act` class, no pool, no ring — it's text, dropping one stop from the "six acts before content" the brief counted.

Keyboard order, desktop and 390 alike: **band act → door (fixed, deduped) → toolrow ×3 → undo**. At most 5 stops, each distinct.

Quiet case (Osterberg, care): band prints *"Everything is settled. Close the book."* — one sentence, one act, `withheld = 0` so no door, no readiness strip, no toolrow unless there's something to do.

## 4. Honors / departs

**Honors:** R127's one declared 56px sticky band as the whole height contract; R126/R140's register and Scored Ink tiers, unchanged; V9 P5 (quiet region renders nothing) — *extended* to the stage plate and readiness band, not just content regions; W3-R2's inputs-own-section principle, kept, now visually distinguished from exceptions (F5).

**Departs:** `touches: R111` — the eleven-stage sub-label loses its own pre-content line; it was already restating line 1. `touches: R66` — the readiness band's own act is removed in favor of the band's; R66 called this a *soft gate, no ceremony*, so removal reads as more aligned with the ruling than against it, but the button existed and I'm cutting it. `touches: I118` — I'm not resolving the activate/no-activate split (F6), just naming it; Kody should rule whether input-derived acts stop auto-opening panels for consistency with gate acts, or gate acts start.

## 5. One risk for Kody to rule on

F1/F2 are not a design debate — they are a live defect. Every one of the three directions in the coming deck will render its `+N MORE` door on top of the same shared-act, non-deduped list, because the bug lives in `page.tsx`'s model-building, not in any component we'd be re-skinning. I'd ask Kody to rule: fix this now, as a standalone patch, independent of and before whichever direction ships — otherwise all three decks demo a door whose second row silently does the first row's job.
