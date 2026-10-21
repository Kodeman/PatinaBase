LENS:ux-opus

## 1. Root causes

1. **The head has lines, not slots.** Each element gets its own row, so it is placed by where its data comes from, not by its role. The head is a single `grid-cols-1`; the lead sits in its own `basis-full` row and the tools in another (`region-head.tsx:241`, `:328`, `:336`). In Kody's FF&E shot, "Bill 21 uninvoiced" and "Edit selections" carry nearly the same underline, though A5 says 15/500 against 14/400. Nothing tells her "this is the one". Lead and tools alone cost about 110px.
2. **Qualifiers sit apart from what they qualify.** The held reason is an 11.5px line under the whole tools row, not under its act (`region-head.tsx:228-237`). More opens a div below the head (`ffe-section.tsx:2614`), and so does Details (`money-region.tsx:403`). In the shot, More shows a focus box with a stray "^" glyph, and nothing opens next to it.
3. **The best spot goes to the least-used control.** Collapse sits right beside the name, the easiest target on the head (`region-head.tsx:305`). Eyebrows repeat the name ("Project financial summary" / "Project financials"). Closeout has no Collapse and sits in a tinted box. Each head is shaped differently, so a designer cannot learn one place to look.
4. **The rail cannot name the job.** The household line hides itself for placeholder names (`act-names.ts:267`), the title is never printed, and the block still reserves `min-h-[107px]` (`doc-spine.tsx:195`). Kody's rail shot shows "PROJECT", a blank space, then a rule. The rail's first line, "BACK TO STUDIO OVERVIEW", is an action set in mono caps (`doc-spine.tsx:175`), which breaks R201.
5. **The rail shows no sign that it does anything.** Chapter rows are `block w-full py-1` with no hover (`lens-ladder.tsx:466`), and values are 11px (`:89`). Room rungs show only while Pieces is being read (`:118`). They are 27px, under the 44px floor (`:503`), and spill into a "+N more" overflow count (`:523`), which V18 Q1 bans. The doors sit below a flex gap (D-B52). On a phone, the MobileBar truncates the section name ("SECTION: PRO…", `mobile-bar.tsx:409`), which breaks A4.

## 2. Head anatomy: "The Act Line"

The rule a designer learns once: **"Name. Where it stands. What to do. Everything else is under More."**

| # | Slot | Type | Notes |
|---|---|---|---|
| 0 | **Fold** | 16px chevron in a 44×44 target, muted | Hangs in the left margin at the name's cap height, in the same spot on every head. It is the outline triangle from Word or Finder: "this folds the section" |
| 1 | **Name** | `.t-d2` 26/1.2 Playfair 500, ink | Flush to the measure. Keeps `tabIndex=-1` so a rail jump can land on it |
| 2 | **State** | `.t-body` 16/1.55 Inter 400, ink | One sentence. Counts are never appended to it |
| 3 | **Tally** | `.t-meta` 12/1.5 mono, muted | Counts and figures, joined by " · ". The body's money line moves here, so it prints once. Collapses when empty |
| 4 | **Act line** | one row: lead 15/500 with the clay score · 24px gap · tools 14/400 with a hairline underline · More ⌄ 14/400 | **One left-justified row** that wraps if needed. The lead always comes first. "→" appears only on acts that leave the section |

Gaps: name→state 8px, state→tally 4px, tally→act line 12px.

**Collapse** is slot 0. Its label is "Fold {name}" or "Unfold {name}", with `aria-expanded` and `aria-controls`. Folded, the head shows slots 0-2 (about 64px) and the chevron points right. Closeout gets a fold too.

**More** is the only disclosure word (R162); Details is retired. More opens a **shelf inside the head**, directly under the act line, between hairlines, with a 12px inset and 44px rows. Focus moves to the first row; Esc or More closes the shelf and focus returns to More. No popover, no shadow. Financials' ladder and explainer are reading, not acts, so they move into the body as its first fold.

**Held acts:**
- A **held lead** keeps its place, with its reason on the same baseline in `.t-body-sm` 14 muted ("Close out project · {reason}"), linked by `aria-describedby`. One unit, on the scale.
- **Held tools** move into the More shelf: the act shows muted, with its 14px reason beneath.

The model is "the act line is what I can do now; More is the rest, and says why."

Tab order: Fold → lead → tools → More → shelf rows.

| Slot | FF&E | Client approvals | Project financials | Project closeout | The record |
|---|---|---|---|---|---|
| 0 Fold | ⌄ | ⌄ | ⌄ | ⌄ (new) | ⌄ |
| 1 Name | FF&E selections | Client approvals | Project financials (eyebrow dropped) | Project closeout (eyebrow, box and StrataMark dropped) | Project record (rail matches) |
| 2 State | 21 priced selections are not yet invoiced. | 3 awaiting decision · Anne Hartwell | Client budget $48,000, $24,868 remaining. $23,132 authorized. | Everything is settled — close the book when you're ready | 4 complete |
| 3 Tally | 1 ready · 20 released · $404 priced · $23,132 released | (none) | (none) | (none) | (none) |
| 4 Lead | Bill 21 uninvoiced | Chase the approval | Record the payment | Close out project · {held reason from the gate} | Open project record (`aria-expanded`) |
| 4 Tools | Edit selections → · Add items | New approval | Draft an invoice | (none) | 2 awaiting publish → (to Client approvals) |
| More shelf | Record a selection change · Open specification book · Prepare purchasing authorization (held) + "No selections are ready for purchasing authorization yet." | (none) | Record a change · Amendment · Add a change · Hours | (none) | (none) |

Empty slots collapse in a fixed order: tally, then tools, then More. Pre-work heads keep slots 0-2. An eyebrow returns only for time-bound context ("Respond by"), never to repeat the name.

**At 1440:** the act line is one row, "Bill 21 uninvoiced · Edit selections → · Add items · More ⌄", about 480px of a 1000px measure. Kody's US-46 objection was to a right-hand *column*. Here every act still reads from the left edge, directly under the state; two stacked rows become one, with no second track.

**At 390:** the chevron moves inline before the name (its target bleeds 12px into the gutter). State and tally wrap. The act line prints **only the lead and More**: two big thumb targets. The shelf opens in place at full measure, listing tools, then extras, then held acts. The rule: "on the phone, everything but the lead is under More."

**FF&E height at 1440:** 31 + 8 + 25 + 4 + 18 + 12 + 44 = **about 142px, against today's ~260px** (−45%). That includes the money line moving from the body into the tally. At 390 the head is about 200px.

## 3. Rail anatomy: "The Contents Page"

The model: **"the job's title page and contents. Click a line to go there."**

**At 1440 (200px), top to bottom:**
1. **Back:** "← Studio overview", sentence-case Inter 14 (R201), with a 44px target and the clay score on hover.
2. **Title page:** "Hartwell residence" in `.t-d3` 20/1.3 Playfair, wrapping, and always printed (this fixes the blank head). Then "The Hartwells" in `.t-body-sm` muted, left out when it is a placeholder. Then the StrataMark with "Ordering" in `.t-meta` 12; the mark stays inert and `aria-hidden`, and the word carries the meaning. Then a `--rule-mid`. About 96px, against today's 107px of nothing.
3. **Jump to… ⌘K:** a full-width 44px row, "Jump to…" in Inter 14 muted with "⌘K" in 12px mono at the right edge. No box and no fill, only a `--hairline-strong` underline, so it reads as an empty field. It opens ⌘K already scoped to this paper (US-19 D4). Seeing the key every time she looks teaches the shortcut without a tour.
4. **Contents:** each chapter is a row of at least 44px. The name is Inter 14 ink (up from 13) and the value is 12px mono muted (up from 11). A `--hairline` separates rows, so the list reads as a ruled contents page, a list of places. The current row keeps the 2px ink bracket and weight 500. On hover, the name takes `da-score-hover` (the same as Back), the pointer shows, and a 1px ghost bracket previews the target. Pieces becomes "FF&E selections", matching the head. The values change as she works; that is the live signal, with no dot.
   - **Rooms** print under FF&E selections while it is current or a room is held. Each rung is a 44px row indented 12px, Inter 14, with `aria-pressed`. A trailing "to top" in 12px mono appears on hover or focus. A held room shows in clay-ink 500 with "at top", and a "Show all rooms" rung follows it.
   - **"+N more" is deleted.** The rail scrolls instead; it is already `overflow-y-auto`.
   - A held room also prints "Living at top" in the FF&E tally, so cause and effect show in both places.
5. **Filed with this job:** follows the contents after 24px; the D-B52 gap is removed. The eyebrow is `.t-head` 12. Four 44px rows, each a 16px icon with an Inter 14 label: Drawing sets →, Specification book →, Design boards →, Project directory · 6. Doors that open a page carry "→" (the head's rule). The directory opens over the paper, so it has no arrow.
6. **Shortcuts:** a quiet 44px "Shortcuts ?" in `.t-body-sm` muted. It opens the sheet that holds `g` + letter and `t`.

**Labels:** 6 chapters + 4 rooms + 4 doors = 14 destinations. Back, Jump and Shortcuts are chrome (see §5).

**At 1180 (136px):** the same order. The title wraps; the household is hidden; the jump row reads "Jump ⌘K". There are no rungs (OD-14). FF&E prints "21 LINES · 4 ROOMS", and room-in-hand goes through ⌘K ("Living to top"). Door labels wrap.

**Below 1180:** the MobileBar's left button reads "Contents" (`.t-meta`) over the current chapter (`.t-body-sm`). It wraps and is never truncated. It opens the spine sheet, which has **the same blocks in the same order** at full width:
- "Put down · back to the Desk" becomes "← Studio overview".
- "Jump to…" has no keycap.
- Rooms always print, with "to top" always visible, because touch has no hover.
- Doors use the Direction C labels: Specification book, Design boards, Project directory. Project directory replaces "Call sheet", so there is one door, not two.
- Shortcuts is hidden on touch.

**How she learns it in one session:**
1. The title page tells her where she is.
2. The ruled rows with values read as contents.
3. One hover shows the underline. One click moves her: the bracket glides and the heading takes the focus ring.
4. Scrolling into FF&E unfolds the rooms, each labelled with its verb.
5. ⌘K is printed every time she looks.

The keyboard path is unchanged: one tab stop, then Arrow, Home and End.

## 4. Bolder alternatives

- **Head: "The Sentence Head."** The lead becomes the last words of the state sentence: "21 priced selections are not yet invoiced. **Bill 21 uninvoiced**". All tools go under one "Tools ⌄" shelf. Name, sentence and tally make the whole head, about 100px. The risk is that tools lose their visibility at a glance.
- **Rail: "Files first."** The doors become a 2×2 grid right under the title page (stacked at 1180). Each chapter's mono value is replaced by its elected lead in sentence case ("Chase the approval"), and pressing it jumps to that act and focuses it: a navigator shaped like a to-do list. It needs a ruling that this is not a dashboard (V19 Q1).

## 5. Rulings I would revise

- **D-B52:** remove the flex gap. On short screens it pushes the doors below the fold, against the spirit of R124 B1's "one action away".
- **R127 (clarification):** count ≤14 *destination* labels, with Back, Jump and Shortcuts as chrome. Otherwise the Jump row takes a full rail to 15.
- **R162 (applied, not revised):** Details becomes More everywhere.
- **US-46 / R203:** not revised. The Act Line stays left-stacked, with tools in one row rather than a column.
