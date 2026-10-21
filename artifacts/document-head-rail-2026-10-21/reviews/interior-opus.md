LENS:interior-opus

## 1. Root causes

1. **Lines are used for rank, so rank costs height.** The lead gets its own `basis-full` line and the tools get a second one (`region-head.tsx:316-344`). Each line is at least 44px. Collapse sits on the name line (`:305`), so it is the most prominent control of the lot (brief §2 row 2). A studio sorts its controls by importance; this head sorts them by stacking them. *Studio moment:* the Monday billing pass. Leah scans six jobs for "Bill N", and on every job her eye lands on "Collapse ↑" first.
2. **The head has no edge.** The status line glues counts onto a sentence with " · " (`:291-297`, `exceptions.slice(0, 2)` at `:163`). The body's money line (`pieces-overview.tsx:142`) and the More div (`ffe-section.tsx:2611`) print right under it as if they belonged to it. In a binder, a divider page ends where the schedule begins. Here nobody can say where the head stops (Kody's shot: the "$404 priced" line).
3. **A held act is printed as if it were live, then explained in a footnote.** "Prepare purchasing authorization" carries the same rule as the live tools. Its reason sits at 11.5px under the whole tools row (`:233`, off the §A3 scale). Closeout disables its act and gives no reason at all (brief §2). *Studio moment:* the new hire places her first order. She clicks the act, nothing happens, and she asks Leah.
4. **Every section hand-builds its head.** Eyebrows appear on some sections and not others. Closeout has a tinted box and a StrataMark and no Collapse. The record uses a toggle as its lead. Financials' "Details" opens content, not acts (brief §2 inventory). No two heads teach the same lesson.
5. **The rail prints like an index card, not like controls.** The project title is never printed (`doc-spine.tsx:124,197`, and the household is hidden for placeholder names). Chapter buttons have no resting score and no hover (`lens-ladder.tsx:467`). Values are 11px (`:89`). The back link is an action set in mono caps (`doc-spine.tsx:175`, which conflicts with R201/V18 Q9). Room-in-hand hides behind "+2 more" (`lens-ladder.tsx:523`). That is an overflow count, which VISION §6 bans; the US-46 money shot shows Pieces with *zero* rungs visible and only "+2 more". The doors are pushed to the floor by `mt-auto` (`:547`).

## 2. Head anatomy — "The Divider Page"

The head becomes a binder divider page: title, where we stand, the figures, then what you can do here on one line. Everything stays left-justified and reads in priority order. Nothing sits in a right-hand column, so R203 is answered: the acts read left to right on the left edge, directly under the status.

| # | Slot | Type |
|---|---|---|
| 1 | **Name** | `.t-d2` Playfair 26/1.2, 500, ink. Nothing else on this line |
| 2 | **State**: one sentence, one grammar | `.t-body` Inter 16/1.55, 400, ink |
| 3 | **Tally**: counts, arriving eyebrow facts, cross-references (inline act) | `.t-meta` DM Mono 12/1.5, 400, .08em, `--text-muted` |
| 4 | **Act row**, one 44px line in this order: lead · tools · More ⌄ · Collapse | Lead: Inter 15/500 primary two-score. Tools, More and Collapse: Inter 14/400 tertiary. 24px gaps. Collapse is always last and loses its "↑". "→" appears only on acts that leave the Document |
| 5 | **Held line**: the held act and its reason as one unit | One 44px box: the act label (14/400, `aria-disabled`, `--ink-subtle`, no score) + " — " + the reason at `.t-body-sm` 14/1.5 muted, linked by `aria-describedby` |

Spacing: slots 1–3 touch, with line-height only. There is 12px (half module) above the act row and 24px before the body. Eyebrows go: their arriving facts (version, respond-by, ready) move into the tally. An empty slot collapses. A held *lead* empties slot 4's lead position and drops to slot 5.

**More** opens a list anchored under the More control, inside the head's box. It has a 2px radius, a 1px `--hairline-strong` frame and a paper ground (not a new fill, no shadow). Rows are 44px. Esc and selection return focus to More. **Collapse** is the row's last word at every width. Financials' "Details" becomes **More**. Its act group goes in the list. The ladder and the explainer go back to the body, because they are content you read monthly, not controls.

| Section | 1 Name | 2 State | 3 Tally | 4 Act row | More list | 5 Held line |
|---|---|---|---|---|---|---|
| FF&E | FF&E selections | 21 priced selections are not yet invoiced. | 1 ready · 20 released | **Bill 21 uninvoiced** · Edit selections → · Add items · More ⌄ · Collapse | Record a selection change · Open specification book | Prepare purchasing authorization — No selections are ready for purchasing authorization yet. |
| Client approvals | Client approvals | 3 awaiting decision · Anne Hartwell | (collapses) | **Chase the approval** · New approval · Collapse | (no More) | (none) |
| Project financials | Project financials | Client budget $48,000, $24,868 remaining. $23,132 authorized. | (collapses) | **Record the payment** · Draft an invoice · More ⌄ · Collapse | Record a change · Amendment · Add a change · Hours | (none) |
| Project closeout | Project closeout | Everything is settled — close the book when you're ready | (collapses) | Collapse (it gains one); **Close out project** leads once it is ready | (no More) | Close out project — {first unsettled item}, while held |
| The record | Project record | 4 complete | Client approvals · 2 awaiting publish → (inline act) | Open project record (this is the fold act, in Collapse's slot) | (no More) | (none) |

The body money line ("$404 priced · $23,132 released") stays in the body. It sits below the 24px break as the schedule's totals row, the way a spec book's FF&E schedule ends in totals. Closeout loses its tinted box and its StrataMark.

**1440:** as described above. The FF&E act row is about 830px against a 1000px measure, so it fits on one line.
**390:** slots 1–3 wrap. The lead takes a full 44px line. The tools fold into More, so the second line reads "More ⌄ · Collapse". More expands *in flow* under that line, still inside the head, never as a floating popover. The held line always prints. *Moment:* on site, the hire sees on her phone why she can't order yet.

**Height, FF&E at 1440:** 31 (name) + 25 (state) + 18 (tally) + 12 + 44 (acts) + 44 (held) ≈ **174px against ~260px (−33%)**. With no held act it is ≈130px.

## 3. Rail anatomy — "The Binder Spine"

A job binder has a spine label (whose job), tabs (the sections) and a front pocket (the drawings and the spec book). The rail should read the same way, and it should use the *same act grammar as the head*: anything pressable carries the oak resting score.

Blocks at 1440 (200px), top to bottom:
1. **← Studio overview.** A tertiary act in Inter 14/400, sentence case (Direction C label, R201).
2. **Spine label.** "Hartwell residence" in `.t-d3` Playfair 20, ink, wrapping and never truncating. Under it, "The Hartwells" at `.t-body-sm` 14 muted. The title always prints. If the household is a placeholder, only that line drops. Then the inert StrataMark with "Ordering · 4 of 6" in `.t-meta` 12. When a room is in hand, a line here reads "Living room in hand" in 14px clay-ink, followed by the act "Clear room focus". It becomes the job's context, the way you'd write "LIVING" on the binder during a walkthrough.
3. **Contents.** A `.t-head` 12 eyebrow; every designer reads "Contents" as "you can go there". Each chapter name is Inter 14/500 with the oak resting score (it darkens on hover and focus, per tertiary §A5). Each value is 12px DM Mono, not 11px ("3 AWAITING · 1 OVERDUE 7D"). Overdue is in the state ink, which orients and does not grade. The current chapter keeps the sliding ink bracket. On hover, an oak bracket previews the jump. One section name everywhere: "FF&E selections", "Project record", "Project schedule".
4. **Take a room in hand ⌄.** A tertiary act printed under FF&E selections *at rest*, not only when Pieces is current. It opens the full room list in place (Living, Primary bedroom, Dining, Study) as `aria-pressed` rungs. "+N more" is deleted. *Moment:* the install-day walkthrough: "let's do the dining room."
5. **Filed with this job.** The four doors (Drawing sets, Specification book, Design boards, Project directory · 6), 44px rows with 14px icons, placed *right after Contents* with a 24px break. The spec book is reached for weekly; it can't live under a gap.
6. **Foot** (the one flexible gap now sits above this block). "Find anything ⌘K" uses the bottom bar's exact label (R162). Under it, "Keyboard shortcuts ?". While focus is inside Contents, a 12px muted line appears: "↑ ↓ move · Enter opens". It teaches on use, with no badge and no keycap box.

At rest: 6 chapters + 1 room act + 4 doors + back + find + shortcuts = 14 labels (R127).

**1180 (136px, 112px measure):** same blocks. The name steps to `.t-d4` 17 and wraps. Values and door labels wrap. "Take a room in hand" opens its list in place (see §5). The shortcuts line drops; ⌘K stays.

**<1180:** the MobileBar's left cell becomes "Hartwell residence" (14/500, two lines, no ellipsis; today's shot shows "SECTION: PRO…", a truncation that breaks §A4) plus a "Contents" act. The spine sheet prints the same blocks in the same order: Studio overview (replacing "Put down · back to the Desk"), spine label, Contents, Take a room in hand, then Filed with this job with Direction C labels (Specification book, Design boards, Project directory; "Spec book" and "Call sheet" go). The keyboard foot is hidden on touch. MobileBar More keeps the four doors one action away (R124 B1).

## 4. Bolder alternatives

- **Head, "The Act Sentence":** name, then one consequence sentence with the lead as an §A5 *inline* act: "21 priced selections are not yet invoiced — bill 21 uninvoiced." Every tool, held act and Collapse go into one "FF&E selections ⌄" menu at the end of that sentence. The head is about 100px. Tools sit one press deeper, which suits a studio that lives on the lead.
- **Rail, "Room-first spine":** most residential spec books are organised by room, not by category. At 1440, a permanent "Rooms" list sits under Contents, and pressing a room takes it in hand across every section. The doors move to the top as the binder's front pocket. On 8+ room jobs the room block scrolls inside itself.

## 5. Rulings I would revise

- **D-B52:** move the rail's one flexible gap from above the doors to below them. Designers stop reading at that gap, and the doors die there.
- **R127 (room rungs only at 1440+):** allow the *on-demand* room list at 1180 and in the spine sheet. At rest the rail stays at ≤14 labels.
- Not a revision, but a conformance defect to add to brief §7: the rail's "+N more" (`lens-ladder.tsx:523`) is an overflow count, which VISION §6 / V18 Q1 bans.
