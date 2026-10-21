LENS:ui-opus

## 1. Root causes

1. **The head has no slot grammar. Every element gets its own full-width row.** `region-head.tsx:243` is `grid-cols-1`. The lead (`:330`) and the tools (`:340`) are each `basis-full`, and every act carries a 44px box plus 10px of padding. Kody's FF&E shot stacks seven separate lines into about 260px. That is a pile, not one structure.
2. **Visual weight runs against frequency.** Collapse sits on the name's baseline (`:305`), the most-read spot on the page, yet it is the least-used control. The lead's double score and the tools' single oak score look almost the same in the screenshot. The "→" appears on one tool only. The squint test fails because nothing groups the controls.
3. **One line mixes two grammars, and the reasons are cut off from their acts.** The status joins a sentence to counts with " · " (`:291-298`). The body's money line (`pieces-overview.tsx:142`) reads as if it were part of the head. The held reason is 11.5px (`:233`) and prints under the *whole* tools row, so it is not under its own act.
4. **Disclosure escapes the head.** FF&E More opens a detached div after `RegionHead` (`ffe-section.tsx:2614`). Financials' Details does the same (`money-region.tsx:403`).
5. **The rail has no masthead and no affordances, and it breaks rules.** The identity block reserves 107px (`doc-spine.tsx:195`) but can print nothing, and its name line truncates (`:200`, against A4). Values are 11px (`lens-ladder.tsx:89`). Chapter buttons have focus styles only, with no hover (`:467`). Room rungs are 27px targets (`:505`, under 44). "+N more" (`:523`) is an overflow count, which VISION §6 bans. The doors sit stranded below a flex gap (screenshot: about 700px of empty rail stock).

## 2. Head anatomy: **"The Ledger Head"**

One component holds six slots, always in this order. An empty slot takes no height. The left edge carries the work. The right edge carries one structural control only.

| # | Slot | Spec |
|---|---|---|
| 0 | Eyebrow (optional) | `.t-head` 12/16, 500, .08em caps, `--text-muted`. Print it only when it adds meaning beyond the name. |
| 1 | Name line | h2 `.t-d2` Playfair 26/1.2 (31px), 500, `--ink`, `flex:1 1 auto; min-width:0`. **Collapse** sits at the far right of the same line: tertiary tier, Inter 14/400 `--ink-subtle`, resting oak rule, a 14px lucide `ChevronUp` after the label, 44px box, `flex:none`, baseline-aligned. |
| 2 | State | `.t-body` 16/1.55, `--ink`. **One sentence only.** No counts. 12px below the name line. |
| 3 | Figures (optional) | `.t-meta` DM Mono 12/18, sentence case, .08em, `--text-muted`. Counts and the head's money, joined by " · ", with each figure `nowrap`. Sits flush under the state as its caption. |
| 4 | Act line | One 44px line, 12px below. **Lead**: primary tier, Inter 15/500 `--ink`, double score, unfilled. Then a 24px gap, a 1×20px `--hairline-strong` vertical rule, another 24px gap, then the **tools**: Inter 14/400 `--ink-subtle`, single oak rule, 12px between boxes. Last comes the **disclosure**, "More" or "Details", in tool tier with a 12px `ChevronDown`. "→" goes only on an act that leaves this paper (an href). |
| 5 | Disclosure tray (when open) | **Inside the head**, directly under the act line. 1px `--hairline` top rule, 12px top padding, its items in tool tier. For Financials, Details holds its ladder, explainer and act group here. `aria-controls` points to the tray. |
| 6 | Held line (optional) | `.t-body-sm` 14/1.5. The held act's name in Inter 14/500 `--ink-subtle`, **unscored**, focusable, `aria-disabled`. Then an em space and the reason in 14/400 `--text-muted`, linked with `aria-describedby`. One line per held act. Held acts leave the act line, so the act line shows only acts you can press, and the act and its reason read as one unit at a size on the scale. |

The head ends with 24px of space before the body. The FF&E double rule is a *movement* marker, not a head slot. If it stays, it sits above slot 0 of whichever head opens the movement. Closeout's tinted box and StrataMark are dropped. Within the section the one fill stays out of the head. At 1440 it is the running band's plate.

**R203 answer:** every act stays stacked against the left edge. The right edge holds Collapse only. It sits in the same place on every section, like a folio, and it acts on the page, not on the work. So the eye still reads name, state, next act and tools down one edge.

| Slot | FF&E selections | Client approvals | Project financials | Project closeout | Project record |
|---|---|---|---|---|---|
| 0 Eyebrow | none | none | none (drop "Project financial summary", which repeats the name) | none (drop "Care · project closeout") | none |
| 1 Name / right | FF&E selections / Collapse | Client approvals / Collapse | Project financials / Collapse | Project closeout / **Collapse (added)** | Project record / Collapse |
| 2 State | 21 priced selections are not yet invoiced. | 3 awaiting decision. | Client budget $48,000, $24,868 remaining. $23,132 authorized. | Everything is settled — close the book when you're ready | 4 complete. |
| 3 Figures | 1 ready · 20 released · $404 priced · $23,132 released | Decision lead · Anne Hartwell | none | none | none |
| 4 Lead | Bill 21 uninvoiced | Chase the approval | Record the payment | Close out project | Open project record |
| 4 Tools | Edit selections →, Add items | New approval | Draft an invoice | none | Client approvals · 2 awaiting publish |
| 4 Disclosure | More ⌄ | none | Details ⌄ | none | none |
| 5 Tray | Record a selection change · Open specification book | none | ladder, explainer, Record a change / Amendment / Add a change / Hours | none | none |
| 6 Held | Prepare purchasing authorization: No selections are ready for purchasing authorization yet. | none | none | When not ready: Close out project, with a reason (new copy needed: *"Opens when every piece is closed out."*) | none |

The body stops printing the money line. Its figures now live in slot 3. Name drift is resolved with one string, the h2, on the head, the rail and the sheet: "FF&E selections" and "Project record". That is a founders' naming call.

**1440.** The FF&E act line measures about 140 + 49 + 105 + 70 + 60 + gaps, so about 470px, well inside the 1100 measure. **Height:** name 31 + 12 + state 25 + figures 18 + 12 + acts 44 + held 21 = **about 163px**, against today's ~260px (**−37%**). With the movement double rule kept, it is about 179px.

**390.** Collapse keeps the right end of the name line ("Project financials" is about 230px plus Collapse's 95px, inside 350). A longer name wraps beside it, and nothing truncates. The state wraps. Figures break only at " · ". On the act line, the lead takes its own row and the separator is hidden. The tools `flex-wrap` with 12px gaps, and More stays last. The tray stacks its items at 44px each. FF&E comes to about 260px at 390, against about 400 today.

## 3. Rail anatomy: **"The Contents Rail"**

The rail reads as an editorial table of contents: a masthead, numbered entries and a filed-with list. It gains weight from type and rules, not from shadows, fills or badges. Ground stays `--rail` #E8E3DB. The right edge changes from the pearl border, which is invisible on rail stock, to 1px `--hairline-strong`.

**Blocks at 1440 (200px wide, 16px padding, 168px content):**
1. **Back:** "← Studio overview", Inter 14/400 `--ink-subtle`, 44px. It is an action, so it is sentence case; this retires the mono caps.
2. **Masthead:** the project title in `.t-d3` Playfair 20/1.3, 500, `--ink`, "Hartwell residence". It **always prints** and wraps rather than truncating. Below it, the household in `.t-body-sm` 14 `--text-muted`, "The Hartwells", hidden only for placeholders. Then the stage in `.t-head` 12 caps, "ORDERING". The inert StrataMark is removed from the rail. The block ends with the existing 1px `--ink` rule, then 12px. Height is about 96px, all of it useful.
3. **Contents heading:** a 44px row button. On the left, `.t-head` "CONTENTS". On the right, `.t-meta` "⌘K" in `--text-muted`, plain mono with no key-cap box. Pressing it opens the command bar. This surfaces the search-jump path where the jumping already happens.
4. **Chapter entries:** min 48px each, with a 1px `--hairline` between rows (a ledger reads as a list you can press). A 24px folio column holds `.t-meta` "01"–"06" in `--text-muted`. The name is Inter 14/1.5, 400, `--ink`. The value below it is `.t-meta` **12px**, sentence case, `--text-muted`: "3 awaiting · 1 overdue 7d". **Hover:** the name takes the tertiary oak score, the same "press me" language as every act in the portal, with `cursor:pointer`. **Current:** the existing 3px `--ink` reading bracket plus a 500 name. **Live:** the values are real state, and the bracket slides with scroll-spy. Focus uses `--focus-ring`.
5. **Rooms (1440, under FF&E selections, indented 24px):** a caption in `.t-meta` `--text-muted`, "Lift a room to the top". Each rung is 44px (fixing 27px), Inter 14/400 `--ink-subtle`, `aria-pressed`. **In hand:** a 2px `--ink` left bar, a 500 `--ink` label and a trailing `.t-meta` "in hand", so the state does not rest on colour alone. The caption then becomes the act "Clear room focus". "+N more" is replaced by the act "More rooms", which jumps to the FF&E room list. That is a label, not a count.
6. **Doors, directly after Contents** (24px gap, no flex gap): a `.t-head` heading, "FILED WITH THIS JOB". Each row is 44px: a 16px lucide icon (stroke 1.5, `--ink-subtle`), then a label in Inter 14/400 `--ink`, then "→" for pages. The rows are Drawing sets →, Specification book →, **Design boards** → and Project directory, with `.t-meta` "· 6" after it and no arrow, because it opens a sheet. The letterhead duplicate is dropped.
7. **Keyboard foot**, pinned with `margin-top:auto`, so the leftover space now sits above the foot, not above the doors. Two 44px rows in `.t-meta` 12 `--text-muted`: "⌘K Find or jump" and "? All shortcuts", which open the bar and the shortcuts sheet.

Labels: chapters (6) + rooms (≤4) + doors (4) = 14, within R127. Back, the headings and the foot are furniture, as today.

**1180 (136px wide, 12px padding):** the title drops to `.t-d4` 17/24 and wraps. The folio column is dropped, but the row hairlines stay. Values stay at 12px and wrap. No rungs (R127). Door labels wrap beside their icons. The foot shortens to "⌘K Find".

**Below 1180:** the **MobileBar** left cell becomes a two-line "Contents" button. Line one is the current chapter, Inter 14/500 ("FF&E selections"). Line two is its value in `.t-meta`. This replaces the truncated "SECTION: PRO…" seen in the 390 shot. The **spine sheet** repeats blocks 2, 3, 4 and 6 in the same order with 48px rows. On touch, "Find anything" replaces the ⌘K glyph. Labels are fixed: Specification book, Design boards and Project directory replace "Call sheet", and "Studio overview" replaces "Put down · back to the Desk". The doors also stay in MobileBar More, which keeps R124 B1's one action.

## 4. Bolder alternatives

- **Head: "Hanging head."** The name and Collapse hang in a 200px left margin column, editorial style, beside the opening 1px rule. State, figures, act line and held line run in the text column. The acts sit *left* of the body measure, which sharpens R203 rather than fighting it. FF&E would drop to about 120px. It costs measure at 1180 and folds back to the Ledger Head below 1180.
- **Rail: "Next-act contents."** Each chapter's second line becomes its elected lead as a pressable sentence ("Bill 21 uninvoiced") in place of the status value, so the rail is the studio's working list. No fill, no badges. The risk is that it nudges toward engagement and doubles the lead; test it against "the studio won't notice Patina".

## 5. Rulings to revise

- **D-B52** (the flex gap that drops the doors to the bottom): move the doors up under Contents and spend the gap above the keyboard foot. Today the gap hides the four doors that designers are missing.
- No others are revised. Collapse on the right answers R203 rather than revising it. "+N more", the 27px rungs and the truncation are defects against VISION §6, the 44px target rule and A4. They are not rulings.
