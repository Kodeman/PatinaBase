# US-47 direction: section head + left rail (synthesis of six lenses)

**Sources:**
- The brief: `brief/DESIGN-BRIEF.md`.
- The six lens reports in `reviews/`: interior-opus, ui-opus, ux-opus, interior-astra, ui-astra and ux-astra (Opus 5.5 ×3, GPT-6 Astra ×3, written independently).

This file is the content spine for the deck. Where this file and a lens report disagree, this file wins.

## 1. What all six seats agreed on (state it in the deck as "the panel agreed")

**The head**
1. **Collapse has the best seat and the least use.** It sits on the name line, so it outranks billing. All six move it.
2. **Lines are used for rank.** Lead and tools each take a full row (`region-head.tsx` `grid-cols-1`, `basis-full`), and the stack costs ~110px.
3. **Two grammars share one line.** The sentence and the counts are joined with " · ". The fix is to split them: one `.t-body` sentence, then a separate `.t-meta` 12px mono "tally" line.
4. **A held act is cut off from its reason.** The fix: the act and its reason read as one unit, and the reason is 14px `.t-body-sm` (not 11.5px).
5. **Disclosure escapes the head.** More and Details open a div below it. The fix: the disclosure opens **inside** the head, in flow, directly after its trigger, with no popover and no shadow.
6. **Every section builds its own head.**
   - Drop the eyebrows that repeat the name ("Project financial summary", "Care · project closeout").
   - Closeout loses its tinted box and StrataMark and gains Collapse.
   - Every section uses one anatomy: Name → State → Tally → Lead → Tools → More → Collapse. An empty slot collapses with no placeholder.
7. **R203 holds.** Nothing goes in a right-hand action column. Everything starts on one left edge.

**The rail**
1. **Name the job, always.** Show "Hartwell residence" in Playfair 20/26 (`.t-d3`), wrapping. Under it, the household at 14px muted (dropped only for placeholders), then the stage as 12px mono "ORDERING". This fixes the blank "PROJECT" block.
2. **The back link is an action**, so it is sentence case: "← Studio overview", Inter 14, 44px.
3. **Chapters must look pressable before hover.**
   - Rows are at least 44–48px; names are Inter 14 (up from 13).
   - Values are 12px mono muted (up from 11, which was below the floor).
   - Hover strengthens an underline or score, with no fill. The reading bracket stays.
4. **One name per section** across the head, the rail, the sheet and ⌘K. "Pieces" becomes "FF&E selections".
5. **D-B52 revised (all six):** the flex gap that pins the doors to the floor goes. The doors sit 24px after the chapters (or before them, in S-B).
6. **Surface the keyboard paths in plain text,** with no keycap boxes or badges: "Find anything ⌘K" and "Keyboard shortcuts ?".
7. **Defects found along the way:**
   - "+N more" room overflow is a count that VISION §6 bans; delete it.
   - Room rungs are 27px; make them 44px.
   - The MobileBar truncates "SECTION: PRO…", against SPEC A4.
   - Mobile labels drift ("Spec book", "Call sheet", "Put down · back to the Desk").
8. **Below 1180:**
   - The MobileBar left cell becomes a wrapping two-line launcher (current chapter plus its value).
   - The spine sheet repeats the desktop blocks in the same order.
   - The sheet uses Direction C labels.

## 2. Shared fixtures for every mockup (these extend brief §5)

- **Section names:** "FF&E selections", "Client approvals", "Project financials", "Project closeout", "Project record". The rail's "The record" becomes "Project record"; founders' ruling R-4.
- **One disclosure word: "More".** Financials' "Details" becomes "More" (R162). Its More holds acts only: Record a change · Amendment · Add a change · Hours. The ladder and explainer move to the top of the Financials body. Founders' ruling R-3.
- **Closeout:** the default specimen is the **ready** state ("Everything is settled — close the book when you're ready"), with "Close out project" live as the lead. A second switcher state, "Closeout · held", shows the status "2 pieces still open" with the held reason "Opens when every piece is closed out." Mark it **copy to confirm** (founders' ruling R-6). Do not show "Everything is settled" next to a held act.
- **FF&E:** keep "1 ready · 20 released" verbatim. Note for the founders that "1 ready" sits beside "No selections are ready for purchasing authorization yet." and reads as a contradiction to a new hire (interior-astra). Wording ruling R-7. Don't reword it in the mockup.
- **Folded state (every direction):** the name, the state sentence and an explicit "Expand" control; the rest is hidden.
- **Pre-work heads** stay silent. They are out of scope.

## 3. Head directions

All three use the §1 anatomy. They differ on **how much is exposed and where Collapse lives**.

### H-A "The working divider": two rows, nothing hidden. Safe. (Astra seats' convergent proposal)

**Slots (left edge, top to bottom):**
1. **Name:** `.t-d2` Playfair 26/31, 500. Nothing beside it.
2. **State:** `.t-body` 16/1.55.
3. **Tally:** `.t-meta` 12/18 mono muted, on its own line.
4. **Lead:** primary tier, Inter 15/500, the double score, unfilled. It sits on its own 44px row. A held **lead** prints its 14px reason directly beneath it.
5. **Tools row:** tertiary/secondary Inter 14/400 with a single score, 24px gaps, in the order frequent tools · More ⌄ · **Collapse (last)**.
6. **In-head disclosure:** opens under the tools row, 12px inset, 1px left rule. A held **tool** moves into More, paired with its reason.

**Body money** ("$404 priced · $23,132 released") **stays in the body**, after a 24px break.

**The head ends with** 12px of space and a 1px `--hairline-strong` rule; the body starts 24px later.

**FF&E at 1440:** about **204px** (−22%).

**390:** the same order with full labels; tools wrap at 44px; More expands inline at full measure.

**Per section:**

| Section | Lead | Tools row | More |
|---|---|---|---|
| FF&E | Bill 21 uninvoiced | Edit selections → · Add items · More ⌄ · Collapse | Prepare purchasing authorization (held) + "No selections are ready for purchasing authorization yet." · Record a selection change · Open specification book |
| Client approvals | Chase the approval | New approval · Collapse | — |
| Project financials | Record the payment | Draft an invoice · More ⌄ · Collapse | Record a change · Amendment · Add a change · Hours |
| Project closeout | Close out project | Collapse | — |
| Project record | Open project record | Client approvals · 2 awaiting publish → · Collapse | — |

**Trade-off:** it is the most familiar (it reorders today's head rather than replacing it), but it is the tallest of the three, and Collapse still sits in the tools row.

### H-B "The act line": one bar. Recommended. (Opus seats' convergent proposal)

**Slots:**
- **Fold:** a 16px chevron in a 44×44 target. It hangs in the **left margin** at the name's cap height, in the same spot on every head (the outline-triangle model). Label "Fold FF&E selections" / "Unfold …", with aria-expanded.
- **Name:** `.t-d2`, nothing beside it.
- **State:** `.t-body`.
- **Tally:** `.t-meta`. The **body money line moves up into the tally**: "1 ready · 20 released · $404 priced · $23,132 released".
- **Act line:** one 44px row, in this order:
  1. the lead (15/500, double score);
  2. 24px gap, a 1×20px `--hairline-strong` vertical rule, 24px gap;
  3. the tools (14/400, single score, 12px between);
  4. More ⌄ last.
  "→" goes only on acts that leave the paper.
- **Held line:** a 14px `.t-body-sm` line under the act line. It holds the held act (unscored, focusable, aria-disabled) + " — " + its reason. One line per held act. The act line shows only acts you can press.
- **In-head More tray:** opens under the act line, between hairlines, with 44px rows.

**FF&E at 1440:** about **150–170px** (−35 to −42%).

**390:** the chevron moves inline before the name. The act line prints **only the lead and More**; everything else is in the More tray ("on the phone, everything but the lead is under More"). The held line still prints.

**Per section:**

| Section | Act line | Held line |
|---|---|---|
| FF&E | **Bill 21 uninvoiced** │ Edit selections → · Add items · More ⌄ | Prepare purchasing authorization — No selections are ready for purchasing authorization yet. |
| Client approvals | **Chase the approval** │ New approval | — |
| Project financials | **Record the payment** │ Draft an invoice · More ⌄ | — |
| Project closeout | **Close out project** | (held variant) Close out project — Opens when every piece is closed out. |
| Project record | **Open project record** │ Client approvals · 2 awaiting publish → | — |

**Trade-off:**
- It is the true "header bar" Kody asked for, with the biggest height saving and one place to look.
- The margin chevron is a new convention for Collapse; it must be taught by its label and focus ring.
- It costs a few px of left margin at 1180.

### H-C "One act, one drawer": a sentence and a drawer. Bold. (Convergent bold alternative from interior-opus, ux-opus and ux-astra)

**Slots:**
- **Name.**
- **State sentence**, ending in the elected lead as an inline act (A5 inline tier, 16px, double score): "21 priced selections are not yet invoiced — **Bill 21 uninvoiced**".
- **Tally.**
- **One control line:** "Tools ⌄ · Collapse". Every tool, the More items and the held acts with their reasons live inside the Tools drawer. The drawer is in the head, in flow, grouped with small `.t-meta` captions "Often", "Now and then" and "Not yet".

**FF&E at 1440:** about **110–120px** (−55%).

**390:** the same, with the drawer at full width.

**Per section:** the lead is folded into the sentence. Use the same leads as H-A and the same tools/More items, all inside the drawer.

**Trade-off:**
- It is the calmest head (best for "the studio won't notice Patina").
- Tools are one press deeper. Kody's "see the controls at a glance" test is weakest here.
- It touches R201's "lead is a separate act" pattern; name that ruling as revised.

**Considered, not drawn:** ui-opus's "Hanging head" (name and Collapse in a left margin column). It is another axis (layout, not exposure). Mention it in one line on the comparison slide.

## 4. Rail directions

All three include §1 rail items 1–8. They differ on **order and on how loudly the rail shows what it can do**.

### S-A "The contents page": today's order, made legible. Safe. (ux-opus, ui-opus, ui-astra, ux-astra)

**Blocks (1440, 200px wide, 16px padding):**
1. ← Studio overview.
2. **Title page:** Hartwell residence / The Hartwells / ORDERING, then a 1px `--ink` rule.
3. **"Find anything ⌘K":** a full-width 44px row. It has a hairline underline, like an empty field, with no box and no fill, and it opens ⌘K.
4. **Contents:** six chapter rows, each at least 48px.
   - A `--hairline` between rows.
   - Name in Inter 14 ink, value in 12px mono muted.
   - Hover: the name takes the oak score and a ghost bracket previews.
   - Current: the 2px ink bracket plus weight 500.
5. **Rooms (≥1440, only while FF&E is current or a room is held):** 44px rungs indented 12px, with a "to top" hint on hover. Held: "Living — in hand", aria-pressed. Pressing it again clears the room. No "+N more"; the rail scrolls instead.
6. **Filed with this job:** a 24px break, then the four 44px doors with 16px icons: Drawing sets →, Specification book →, Design boards →, Project directory · 6.
7. **Foot:** "Keyboard shortcuts ?".

**1180 (136px):** the title steps down to 17px and wraps; no rungs; "Find ⌘K".

**<1180:** MobileBar "Contents / FF&E selections · 21 lines" (wrapping), plus the spine sheet in the same order.

**Trade-off:** it is the least change and keeps R127 as is. It may still read as a list rather than a tool.

### S-B "The job binder": doors up front, rooms always offered. Recommended. (interior-opus, interior-astra, ux-astra)

**Blocks:**
1. ← Studio overview.
2. **Spine label:** Hartwell residence / The Hartwells / ORDERING.
3. **"Filed with this job" first,** as the binder's front pocket: the four doors as 44px rows right under the title.
4. **Contents:**
   - A `.t-head` "CONTENTS" eyebrow, with "Find ⌘K" right-aligned on the same line as a 44px button.
   - Chapter rows **with a resting oak score under each name** (the same "press me" grammar as every act in the portal). Values at 12px.
   - While focus is in the list, a teaching line appears: "↑ ↓ move · Enter opens".
5. **"Room in hand: All rooms ⌄":** a permanent, labelled chooser printed under FF&E selections **at rest**. It opens in place: All rooms, Living, Primary bedroom, Dining, Study. A helper line reads "Brings this room's items to the top of every list." Once chosen, it reads "Room in hand: Living", and a matching line appears in the spine label.
6. **Foot:** "Keyboard shortcuts ?". The flex space now sits above this.

**1180:** the same order. The room chooser is available on demand (it revises R127's 1440-only rungs).

**<1180:** MobileBar "Sections and files". The sheet uses the same order, so the doors sit one press inside the open sheet.

**Trade-off:**
- It directly answers "designers overlook functionality": the doors and the room focus are visible at rest.
- It revises D-B52 and R127 (the room treatment).
- The chooser is one more label (count it within 14).

### S-C "The working contents": a wider rail, chapters that say what's next. Bold. (ui-astra and ux-astra bold weight + ui-opus and ux-opus next-act contents)

**Width:** the rail widens to **240px at 1440** and 192px at 1180.

**Chapter rows:**
- Name in Playfair 17/22, 500.
- **Second line = that section's elected next act** in Inter 14, sentence case, e.g. "Bill 21 uninvoiced", "Chase the approval", "Record the payment". When there is none, the plain status prints ("Nothing waiting").
- Pressing the row jumps to the section and **focuses its lead act**.
- No fills, no badges.

**Doors:** a 2×2 grid of 44px tiles under the title (icon above the label, with hairline frames, not fills).

**Kept from the other directions:** the title page, Find ⌘K and the shortcuts foot.

**Rooms:** as in S-B.

**Trade-off:**
- The rail becomes the studio's working list, which is the strongest "draw attention" answer.
- It costs paper width.
- It risks reading as a dashboard or engagement surface. Name V19 Q1 and the VISION promise "the studio won't notice Patina".
- It revises R127 and the house-sheet A3 widths.
- Its leads duplicate the heads' leads (as text that jumps, not as a second button).

## 5. Recommendation (deck slide 14)

**H-B "The act line" + S-B "The job binder".** Reasons, from the evidence:
- **H-B** gives the largest height saving (~40%) and keeps one bar per section with fixed slots, so the glance test passes in every section. It keeps R203's left edge. The held line answers the new hire's "why can't I order?" moment (interior-opus) without hiding the act.
- **S-B** puts the four doors and room-in-hand in view at rest. These are exactly the capabilities Kody says designers overlook. It does this without fills, badges or extra width.
- **Fallback:** H-A + S-A if the founders want the smallest change to what Leah already knows.

## 6. Rulings asked of the founders (deck slide 16)

| ID | Ask | Default if unruled |
|---|---|---|
| R-1 | Which head direction: H-A, H-B or H-C | H-B |
| R-2 | Which rail direction: S-A, S-B or S-C | S-B |
| R-3 | "Details" becomes "More" everywhere; the Financials ladder and explainer move to the body | Yes |
| R-4 | Section names everywhere: "FF&E selections" (retire "Pieces") and "Project record" (retire "The record") | Yes |
| R-5 | D-B52: remove the flex gap that drops the doors to the floor (unanimous across all six seats) | Yes |
| R-6 | Closeout held-reason copy: "Opens when every piece is closed out." | Confirm the copy |
| R-7 | FF&E "1 ready" wording beside "No selections are ready for purchasing authorization yet." | Reword (separate ticket) |
| R-8 | Room in hand: allow the room chooser at 1180 and in the spine sheet (revises R127) | Only with S-B or S-C |
| R-9 | Body money line moves into the head tally (H-B, H-C) or stays in the body (H-A) | Follows R-1 |

## 7. Fix-regardless defects (deck slide 15)

These come from brief §7 plus the panel:
- The blank project name in the rail.
- Rail values at 11px, below the 12px floor.
- No hover state on chapter rows.
- The gated note at 11.5px.
- More/Details render outside the head.
- Section-name drift.
- Mobile label drift.
- Closeout's held act is disabled with no reason.
- Door comments promise an in-place panel that is never reached.
- **The "+N more" room overflow count** (VISION §6).
- **27px room rungs** (44px floor).
- **MobileBar truncates "SECTION: PRO…"** (SPEC A4).
- **The back link is an action set in mono caps** (R201).
- Evidence note: `us46-plate/shots/doc-390-ffe-head.jpg` actually shows Project schedule (caught by ui-astra and interior-astra).

## 8. Panel credits (deck slide 17)

| Seat | Opus 5.5 | GPT-6 Astra |
|---|---|---|
| Interior designer | "The Divider Page" / "The Binder Spine" | "The working divider" / "The job contents" |
| UI designer | "The Ledger Head" / "The Contents Rail" | "The Working Title" / "The Job Register" |
| UX designer | "The Act Line" / "The Contents Page" | "Name, state, next, tools" / "The job's contents and files" |

The tickets were SQ-1553 to SQ-1558. Mention the method in one line: independent seats, then a synthesis by the orchestrator. The deck itself was then reviewed by Astra.
