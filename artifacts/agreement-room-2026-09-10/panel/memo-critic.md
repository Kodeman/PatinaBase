# Seat 5 — the accessibility & system critic

*WCAG 2.2 AA is the floor. The house sheet is the system. Neither is currently
met in this room, and three of the four directions can meet both.*

---

## 1 · The argument

### The room is not clunky because it has three columns. It is clunky because nothing in it tells you anything happened.

Kody's word was "clunky", and the layout seats will answer the layout. My answer
is narrower and, I think, prior to theirs: **this room has no status channel at
all.** `agreement-composer.tsx` contains not one `aria-live` attribute. The
readiness section is a plain `<section aria-label="Agreement readiness">`
(`:1044-1050`). The count changes from `2 of 9` to `1 of 9`, the rail's
`needs attention` line disappears from a row, the fee-floor sentence clears —
and the page says nothing, to anyone, by any channel except a repaint 989px to
the right of where you are typing. Step 6 of Leah's script asks "does the count
move *with a sentence*?" The answer is no: it does not move with a sentence, and
for a screen-reader user it does not move at all (WCAG 4.1.3 Status Messages).

Worse, the two `role="status"` nodes that *do* exist are conditionally mounted —
`{saveNote && <p role="status">…}` (`:799-806`), `{clientNote && …}` (`:790-796`),
the editor's blockers (`part-editor.tsx:130-140`), the send sheet's result
(`service-agreement-send-sheet.tsx:181-187`). A live region inserted into the DOM
already carrying its text is not reliably announced by any major screen reader;
the region must be present and empty first. So "All agreement changes saved."
— the sentence that answers *did it save?*, the single most-asked question in
this room — is authored, rendered, and never heard.

That is one small fix (a permanent, empty `role="status"` at the room's root,
written by every state transition) and it is worth more than any column count.
**Every direction must carry it.** It also decides crux (iv): "readiness in
place" is not only a question of *where the count sits*, it is a question of
*what speaks when the count moves*.

### The gating acts are unreachable, unexplained, and 1.20:1.

House rule #8 is unambiguous — `aria-disabled`, never `disabled`, control stays
focusable, `aria-describedby` at the visible reason, activation moves focus to
the unmet input (`SPEC.md:336-361`). The room uses the native attribute in
eleven places, including all three acts that gate the work:
`agreement-composer.tsx:712` (Review & send), `:759` (Saved),
`service-agreement-send-sheet.tsx:205` (Send agreement →). §6 knows about three
of them. It does not know the two things that make this urgent.

First: the shared `Button` applies `disabled:opacity-50` (`button.tsx:29`) —
banned outright by §A5 ("Never `opacity: .5` on any state. Ever."). I computed
the result. Clay fill at 50% over the page ground is `#DFCEB6`; the label at 50%
is `#ECE2D4`; **the "Saved" label reads at 1.20:1 against its own button.** You
can see it in Kody's screenshot (the third act) and in
`review-and-send-sheet-390.png` (Send agreement →). Today that escapes 1.4.3 by
the SC's own disabled-control exception. **The moment we adopt the house rule and
make it `aria-disabled`, the exception evaporates and 1.20:1 becomes a live AA
failure.** §A5 already supplies the compliant answer — `--ink-faint` on `--rail`,
5.32:1, border kept so the act keeps its role. Any specimen that switches to
`aria-disabled` without also switching the pigment ships a regression.

Second, and this is the finding I most want on the record: **the house's
`aria-disabled` rule and the house's own sheet are in contradiction.**
`doc-sheet.tsx:80` filters `aria-disabled="true"` elements *out* of the focus
trap's focusable set. Put an `aria-disabled` Send inside the send sheet — exactly
what rule #8 demands — and Tab will never reach it. This binds every direction
(all four keep a send sheet) and it binds Direction B twice over. One of the two
has to give, and it should be `doc-sheet.tsx:80`. **AMENDMENT-ASK is not needed;
this is a defect, not a ruling.**

### Two whole-portal facts every direction inherits.

`apps/designer-portal/src/app/layout.tsx:40` sets `maximumScale: 1`. iOS Safari
honours it. Pinch-zoom is off across the entire designer portal — a textbook
1.4.4 Resize Text failure, one line to fix, and the thing that makes the 390
conversation moot until it is fixed. §6 row 4 names "the viewport meta" in
passing with no line and no criterion; here it is.

And `--color-aged-oak: #8B7355` (`globals.css:13`) is **4.20:1 on the page
ground**, **4.49:1 on the aside card's white** (§6 row 4's 4.48), **3.51:1 on the
rail stock**. It carries the rail eyebrows at 10.5px, `needs attention` at
10.5px, the readiness count at 11px, and every `labelClass` label. None is large
text. §6 has this as one label on one card; it is the room's entire meta voice.
Then `room-shell.tsx:148-151` prints the same count in aged-oak at `opacity-70`
— **2.56:1** — and hides it below 640px. The pigment is fine as a rule and a
mark. It is not an ink. `--color-clay-ink` (5.61:1) already exists for exactly
this, and the token block says so in its own comment.

### What the shapes do to the keyboard.

Reorder is the crux the plan named, so: today the drag handle is a 15×16px
button (`parts-rail.tsx:270-278`) against the house's own 44px standard, proven
four files away at `room-shell.tsx:150` (`min-h-11 min-w-11`). dnd-kit's
`KeyboardSensor` is wired (`:107-109`) but `DndContext` passes no `accessibility`
prop (`:145-149`), so a screen-reader user hears the **default** announcement,
which names the item by id — and the id is a fresh uuid after every save, because
`upsert_agreement_parts` is DELETE-then-INSERT (`agreement-composer.tsx:601-626`).
"Picked up draggable item 9f3c1a2e-…". The `Move up` fallback is worse in a
different way: `act()` closes the menu, the menu unmounts, the list reorders, and
**focus falls to `<body>`** with nothing announced. Neither path works. Both are
cheap to fix, and the fix is identical in all four directions.

That is why I rank the **disclosure** shapes first. C and D both express "this
part is open" as a native `aria-expanded` on the part's own head — the one
open/closed model every screen reader already narrates, already proven in this
codebase by `facet-section.tsx`, with a reduced-motion-guarded fold already in
`globals.css:481-489`. D additionally puts the reason beside the thing it gates,
which is the geometric fix for the reason/act association that
`service-agreement-send-sheet.tsx:203-209` is missing.

A worries me most. "Selecting a part turns it into its editor on the paper" is
the shape that most tempts `contenteditable`, and `contenteditable` must not
appear: no reliable label association, browse-mode/forms-mode switching breaks
on it, undo is per-browser, and pasted markup would drift the body away from
R27's single contract. Seam acts between parts are the shape that most tempts
`group-hover` reveal (28 instances in `components/document/` — some correctly
paired with `group-focus-visible`, some not), which is 1.4.13 and 2.1.1. And
replacing a rendered part with an editor moves the reading position on every
selection, with no `scroll-margin` anywhere in the agreement folder (0 hits) and
a two-line sticky bar at 390 waiting to cover whatever lands under it (2.4.11).
A is *buildable* accessibly. It is the one where getting it wrong is easiest and
least visible.

**One thing the room already does right, which no direction should lose:**
`DocSheet` is a genuinely correct dialog — `role="dialog"`, `aria-modal`,
`aria-labelledby`, focus in on open, Escape, a wrapping trap, `inert` on
non-top layers, focus restored to the trigger, `motion-safe:` on its animation
(`doc-sheet.tsx:240-402`). It is the strongest asset in the room and the whole
mechanical case for B. Its one flaw is `:80`, and its one risk under B is that
the restore target — a rail row — is destroyed by the same uuid churn
(`:282-289` falls through to `fallbackFocusRef`, which B would have to supply).

---

## 2 · Findings

Every finding, unfiltered. `path:line` verified against the working tree,
10 September 2026. Contrast ratios computed from the token hexes in
`globals.css` by the WCAG 2.x relative-luminance formula.

| ID | P | conf | surface | claim | evidence | proposed change | §6 |
|---|---|---|---|---|---|---|---|
| AX-1 | P1 | high | aside · rail | No `aria-live` exists anywhere in the composer. The readiness count, the rail's `needs attention` marks and the fee-floor sentence all change silently. WCAG 4.1.3. | `agreement-composer.tsx:1044-1050`; grep `aria-live` in that file = 0 hits | Every direction mounts one permanent, initially-empty `role="status" aria-live="polite"` at the room root; every readiness transition writes one sentence into it. | **new** |
| AX-2 | P1 | high | composer · editor · send sheet | The four `role="status"` nodes are conditionally mounted, so the region arrives already carrying its text and is not announced. "All agreement changes saved." is authored and never heard. WCAG 4.1.3. | `agreement-composer.tsx:799-806`, `:790-796`; `part-editor.tsx:130-140`; `service-agreement-send-sheet.tsx:181-187` | Render the status node always; change only its text content. Never swap `role` on a live node (`:792` toggles status↔alert). | **new** |
| AX-3 | P1 | high | all | Native `disabled` on eleven controls including the three gating acts — not focusable, no `aria-describedby` at the reason. House rule #8 / §A5. | `agreement-composer.tsx:712`, `:759`, `:775`, `:841`; `service-agreement-send-sheet.tsx:205`; `part-editor.tsx:120`; `parts-rail.tsx:273, 381, 387, 394, 427`; `SPEC.md:336-361`, gate `:582` | `aria-disabled` + `aria-describedby` + activation moves focus to the unmet input and writes the reason to the status line. | **known** — §6 row 8, which names 4 of the 11 |
| AX-4 | P1 | high | header · send sheet | `disabled:opacity-50` in the shared Button. The "Saved" label computes **1.20:1** against its own fill (clay@50% `#DFCEB6` / label@50% `#ECE2D4`). §A5 bans `opacity:.5` outright. Exempt from 1.4.3 today only by the disabled-control exception — which the AX-3 fix removes. | `button.tsx:29`; `SPEC.md:354`; `kody-screenshot.png` third act; `shots/current/review-and-send-sheet-390.png` | Adopt §A5's unavailable-terminal: `--ink-faint` on `--rail` (5.32:1), border kept. Fix in the same change as AX-3, never after. | **touches** §6 row 8 — the ratio and the exception-collapse are new |
| AX-5 | P1 | high | rail · aside · editor | `--color-aged-oak #8B7355` is **4.20:1** on `--color-off-white`, **4.49:1** on the aside card's white, **3.51:1** on `--doc-rail-stock`. It carries the whole meta voice at 10.5–11px. WCAG 1.4.3. | `globals.css:13`; sites `parts-rail.tsx:308-310`, `:349-352`, `:364`; `agreement-composer.tsx:86-87`, `:962-964`, `:1048-1050` | Retire aged-oak as an ink; use `--color-clay-ink` (5.61:1), which the token block already reserves for exactly this. | **touches** §6 row 4 — one site there, six here |
| AX-6 | P1 | high | room bar | The RoomShell readiness count is aged-oak at `opacity-70` → **2.56:1** — and `hidden … sm:inline`, so it vanishes below 640px. WCAG 1.4.3. | `room-shell.tsx:148-151` | Drop the opacity, take `--color-clay-ink`, and keep the count at every width. | **touches** §6 row 4 |
| AX-7 | P1 | high | whole portal | `maximumScale: 1` blocks pinch-zoom on iOS Safari across the designer portal. WCAG 1.4.4 Resize Text. | `apps/designer-portal/src/app/layout.tsx:37-41` | Delete `maximumScale`. Until it goes, no 390 claim in this program is testable on a real phone. | **known** — §6 row 4's "with the viewport meta", now with a line and a criterion |
| AX-8 | P1 | high | room bar · composer | Review & send has no trigger below 1180px: the RoomShell action slot is `hidden min-[1180px]:block` and the composer body offers only Preview and Return. Functionality lost at 320–400px equivalent. WCAG 1.4.10 Reflow. | `room-shell.tsx:155`; `agreement-composer.tsx:743-761`; `shots/README.md` note 1 | Every direction places Review & send in the page, not the bar. This is crux (v)'s hard constraint, not a preference. | **new** |
| AX-9 | P1 | high | return act | `Return to the seven facets` discards a composed legal instrument on first press — no confirm, no consequence sentence, no undo — and at 390 it is the second control on the page. WCAG 3.3.4 Error Prevention (Legal, Financial, Data); §A6. | `agreement-composer.tsx:747-754` → `:637-648`; `shots/current/money-part-fee-floor-390.png` act stack | Consequence sentence above it in every state + a confirm step; demote it out of the top act row. The shared treatment's item 3, seconded on an AA criterion. | **known** — §6 row 7 |
| AX-10 | P1 | medium | send sheet · preview sheet · drawer | The house's `aria-disabled` rule and the house's own sheet contradict each other: `DocSheet`'s trap filters `aria-disabled="true"` out of its focusable set, so a rule-#8-compliant Send inside a sheet is unreachable by Tab. | `doc-sheet.tsx:80` vs `SPEC.md:356-357` | Stop filtering `aria-disabled` in `getFocusableElements`; keep filtering `:disabled`. A defect, not a ruling — no amendment needed. | **new** |
| AX-11 | P1 | medium | all | Zero `forced-colors` support in the designer portal (0 hits in `apps/designer-portal/src`), against §A11's mandated block. The rail's selected state is carried by hue alone — charcoal vs mocha — which collapses in forced colours and is a 1.4.1 question for everyone. | grep `forced-colors` = 0; `parts-rail.tsx:302-306`; `SPEC.md:521-529` | Ship §A11's block in every specimen, and carry selection in a rule or a word as well as a hue. | **new** |
| AX-12 | P1 | medium | rail | Keyboard reorder destroys focus and announces nothing: `act()` closes the menu, the menu unmounts, the list reorders, focus falls to `<body>`. Same on rename commit. WCAG 2.4.3 + 4.1.3. | `parts-rail.tsx:379-392`, `:247-252`, `:283-295` | After a move, return focus to the moved row's own control and write "Billing cadence moved to position 7 of 9" into the status line. | **new** |
| AX-13 | P2 | high | rail | `DndContext` passes no `accessibility` prop, so dnd-kit's default announcements name the item by **id** — a fresh uuid after every save, because the RPC is DELETE-then-INSERT. | `parts-rail.tsx:145-149`, `:105-110`; `agreement-composer.tsx:601-626` | Pass `accessibility={{ announcements }}` naming the part title and its new position. | **new** |
| AX-14 | P2 | high | rail | The `⋯` row menu is not a menu: `aria-expanded` with no `aria-haspopup`, no `role="menu"`/`menuitem`, no Escape, no outside-click dismiss, no focus move in, no focus return. WCAG 4.1.2. | `parts-rail.tsx:358-366`, `:367-410` | Either a real menu pattern or — better for every direction — retire the popup and put Move up / Move down / Remove on the part head as visible acts. | **new** |
| AX-15 | P2 | high | rail | The Required middle dot uses `aria-label="Required"` on a bare `<span>`; ARIA 1.2 prohibits `aria-label` on `generic`, so the meaning is not exposed — and a dot alone is 1.4.1. WCAG 1.3.1. | `parts-rail.tsx:331-338` | Print the word, or use a `<span role="img" aria-label="Required">`. | **new** |
| AX-16 | P2 | high | rail → editor | Selecting a row moves no focus, sets no `aria-controls`, and announces nothing; the editor 524px away silently swaps. WCAG 4.1.3, 1.3.1. | `parts-rail.tsx:299-306`; `agreement-composer.tsx:857-861` | The disclosure shapes (C, D) dissolve this by construction. For A and B, move focus into the opened editor and name it. | **new** |
| AX-17 | P2 | medium | rail · editor | Targets below the house's own 44px: reorder handle ≈15×16 (`px-1`, 12px mono), row menu ≈26×18, the bare native visibility checkbox ≈13×13. `room-shell.tsx:150` proves the house number is `min-h-11 min-w-11`. WCAG 2.5.5 (AAA) fails; 2.5.8 (AA, 24px) survives only on the spacing exception, which `gap-2` makes fragile. | `parts-rail.tsx:270-278`, `:359-366`; `part-editor.tsx:116-126`; `room-shell.tsx:150` | 44×44 minimum on every act in every specimen, padding invisible where the mark must stay small. | **new** |
| AX-18 | P2 | medium | editor · paper | No `contenteditable` exists today and none may be introduced: no reliable label association, browse/forms-mode switching breaks on it, undo is per-browser, and pasted markup would drift the body from R27's single contract. Directions A and D are where it will be proposed. | `part-editor.tsx:146` (every editor is a real `<textarea>`/`<input>`); R27 (`rulings-2026-09-06.md:48`) | A and D mount a real form control on the paper. State it as a build constraint, not a preference. | **new** |
| AX-19 | P2 | medium | all | Scroll anchoring is unhandled: no `scroll-margin`, no `scrollIntoView` anywhere under `.../agreement/` (0 hits), against a `sticky top-0` bar that wraps to two lines at 390. Tab to a control near a section top and it lands under the bar. WCAG 2.4.11 Focus Not Obscured (Minimum). | grep in `.../drafting/agreement/` = 0; `room-shell.tsx:122`; `shots/current/money-part-fee-floor-390.png` (bar over the client-account row — note full-page capture places sticky elements at capture scroll, so the plate is indicative, the CSS is the proof) | `scroll-margin-top` equal to the bar's height at each width, on every part head and every editor. D's unfold is the load-bearing case. | **new** |
| AX-20 | P2 | medium | seams · part heads | Hover-only seam acts would fail 1.4.13 and 2.1.1. The portal has 28 `group-hover` uses in `components/document/`; some pair `group-focus-visible` (`margin-note.tsx:257`, `margin-rail.tsx:304`), some are hover-only opacity (`household-chip.tsx:50`). A's "+ Add a part at the seams" and D's fold arrows are the temptation. | those four lines | Every seam act is persistent or revealed by hover **and** focus; the specimen gate greps for `group-hover` unpaired with `group-focus-visible`. | **new** |
| AX-21 | P2 | medium | rail | Drag state is carried by `opacity: 0.6` and dnd-kit's `transition` is applied with no reduced-motion guard. §A11 mandates the guard; §A5 bans opacity as a state. (2.3.3 is AAA, so this is a house failure before an SC one.) | `parts-rail.tsx:264-265`; `SPEC.md:512-520` | Carry drag state in a rule or a ground; wrap the transition in `motion-safe:`. | **new** |
| AX-22 | P2 | medium | aside | The count reads "0 of 9 parts need attention" directly above two blockers, because `partsNeedingAttention` excludes the client-account blocker by design. On screen the count and its own list contradict each other. | `readiness.ts:541-553`; `shots/current/money-part-fee-floor-390.png` bottom band | One sentence, not a count over a list: "Two things to finish before you can send." Lands on crux (iv). | **touches** §6 row 2 (W3R3-03 — the count moving without a sentence) |
| AX-23 | P2 | low | page | The count is printed twice (`:703`, `:1048-1050`) and the agreement body twice (editor + the compact aside render at `:965`). A screen-reader user browsing the page hears the paper twice with no signal which is authoritative. 1.3.1 adjacent. | those lines | One count, one paper. B and D do this by construction; A and C must choose. | **touches** §6 row 6 (two body renderers) — this is a third duplication, inside one page |
| AX-24 | P3 | medium | header | `StrataSweep` is a spinner with `role="status" aria-label="Loading"`, mounted on Save and on Return. House rule #5 forbids a spinner; §A5 says swap the label text and put `aria-busy` on the **wrapper** — `button.tsx:147` puts it on the control. Reduced motion is correctly handled at `globals.css:548-551`. | `strata-sweep.tsx:43-44`; `button.tsx:147`; `agreement-composer.tsx:749`, `:758`; `SPEC.md:362-372` | Label swap + status line. No specimen renders a sweep. | **new** |
| AX-25 | P3 | high | send sheet | "Finish before sending" and its reasons are on screen but not programmatically tied to the Send act — no `aria-describedby`, and the act is not focusable. WCAG 3.3.1 / 3.3.3. | `service-agreement-send-sheet.tsx:155-166` vs `:203-209` | `aria-describedby` from the act to the reason list, in the same change as AX-3. | **touches** §6 row 8 |
| AX-26 | P3 | medium | composer · sheets | Heading order: one `<h1>` (`:733`), the editor's `<h2>` (`part-editor.tsx:113`), and in a sheet **two** `h2`s — DocSheet's `sr-only` title plus the sheet's own visible heading. The rail (`<nav aria-label>`) and readiness (`<section aria-label>`) carry no heading at all. Gate §A13 requires h1→h2→h3 in order, exactly one h1. | `doc-sheet.tsx:392-399`; `service-agreement-send-sheet.tsx:102-103`; `SPEC.md:571-588` | Real headings on the rail and readiness; one heading per sheet. | **new** |
| AX-27 | P3 | medium | aside | The aside card is `rounded-[8px]`; §A4 permits 2px/3px only (50% for the mark dot). Not accessibility — the system, which is also my seat. | `agreement-composer.tsx:961`; `SPEC.md:153-162` | 3px, or no box at all (rule #9 — a region with nothing to say renders nothing). | **new** |
| AX-28 | P2 | medium | editor | At 390 the "Estimate · ROM estimate" control overlaps the "Hidden from your client" label — two interactive strings on top of each other. WCAG 1.4.10 Reflow. It is also drawn as a pill (rule #5). | `shots/current/money-part-fee-floor-390.png`, retainer editor band | Fix in whichever direction inherits the money editors; every direction inherits them. | **new** |
| AX-29 | P2 | low | header | `Save agreement` → `Saved` changes the accessible name of a control that does not move. §A5's "taken" pattern removes the act and renders the record instead. WCAG 4.1.2. | `agreement-composer.tsx:756-762`; `SPEC.md:373-378` | The shared treatment's item 1 already proposes exactly this; I second it on a criterion, not a taste. | **touches** §6 row 8 |

**Count.** 29 findings — 12 P1, 13 P2, 4 P3. New 22 · known 3 · touches 6 (AX-3 and AX-7 are known; AX-9 is known).

No finding in this memo requires a ruling to be overturned, so there is **no
`AMENDMENT-ASK` from this seat.** AX-10 reads like one and is not: `doc-sheet.tsx:80`
contradicts `SPEC.md:356-357`, and the code is what is wrong.

---

## 3 · Ranking A–D, one sentence each

1. **D · The galley** — a per-part disclosure with `aria-expanded` on the part
   head is the one open/closed model every screen reader already narrates, one
   focus context replaces three, the house already owns a reduced-motion-guarded
   fold (`globals.css:481-489`), and putting the marginal note beside the seam
   where the fee prints is the geometric fix for the reason/act association that
   AX-25 is missing — with scroll anchoring (AX-19) as its one real risk, which
   is measurable rather than arguable.
2. **C · Two panes, right-sized** — the same disclosure model as D and the only
   one already proven in this codebase (`facet-section.tsx`'s "exactly one
   open"), so it carries the fewest new accessibility risks of the four; it also
   carries the fewest gains, and leaves the count and the paper in different
   places, which is where AX-1 and AX-22 live.
3. **B · Builder as overlay** — mechanically it inherits the strongest asset in
   the room, a genuinely correct dialog (`doc-sheet.tsx:240-402`), but it turns
   every edit into open→edit→close, it is where AX-10 bites hardest, and its
   focus-restore target is a rail row that the save's uuid churn destroys
   (`:282-289` → `fallbackFocusRef`, which B must supply and today nothing does).
4. **A · Edit in place** — the highest ambition and the highest risk: it is the
   shape that most tempts `contenteditable` (AX-18) and hover-revealed seam acts
   (AX-20), it moves the reading position on every selection into an unguarded
   sticky bar (AX-19), and at 1024 its margin editor has nowhere to go —
   buildable accessibly, but the one where getting it wrong is easiest and least
   visible.

---

## 4 · What the specimen must show to change my mind

**To move A above C or D**, one plate, keyboard-only, no pointer: focus enters a
rate-card part on the paper, the three role rates are typed into real
`<input>`s with visible labels and 44px targets, the seam "+ Add a part" above
it is reachable by Tab without any hover, focus never scrolls under the sticky
bar, and the DOM shows no `contenteditable`. If A can show that at 390 as well
as 1440, its risk profile is my ranking's only objection and I withdraw it.

**To move B above D**, show the paper visibly updating behind the open drawer at
1440 *and* show what focus does after a save-inside-the-drawer: the rail row that
opened it no longer exists, so name the `fallbackFocusRef` target and prove Tab
lands somewhere sensible on close. Show an `aria-disabled` Send inside the sheet
reached by Tab — which means shipping the `doc-sheet.tsx:80` fix as part of the
specimen, not as a promise.

**To keep D first**, it only has to show one thing: unfolding a money editor
beneath its own printed part does not move the part above it by a single pixel,
with a screen-reader transcript for the sequence *Tab to Role rates → Enter →
type $185 → Tab → the status line says the ceiling is now required*.

**What would demote all four:** a specimen with a state switcher where the
readiness state changes and the status line stays empty. AX-1 is the finding I
will not trade against any layout.

---

## 5 · Required artifact — the a11y acceptance list

Twenty checks the specimen gate runs against a static HTML specimen with an
§A12 state switcher. Each is mechanical: a grep, a keyboard sequence, a computed
ratio, or a DOM assertion. A specimen passes only on 20/20. Checks 1–4 extend
§A13's existing gate table; 5–20 are this seat's.

| # | Check | Exact test | Pass condition |
|---|---|---|---|
| 1 | No native `disabled` on any act | `grep -nE '<(button\|input\|a)[^>]*\sdisabled' specimen.html` | 0 matches. Gating acts carry `aria-disabled="true"` instead. |
| 2 | No `opacity: .5` state | `grep -nE 'opacity:\s*\.?0?\.5\|opacity-50' specimen.html` | 0 matches. |
| 3 | No shadow, no truncation, no spinner | `grep -nE 'box-shadow\|text-overflow\|@keyframes spin\|animate-spin' specimen.html` | 0 matches (`--elevation-sheet` unused). |
| 4 | One `h1`, headings in order | DOM: collect `h1..h6` in document order; assert exactly one `h1` and no level skipped forwards | true in every switcher state. |
| 5 | **A permanent status line exists** | DOM at load, before any interaction: `document.querySelectorAll('[role="status"],[aria-live]')` | ≥1 node present, `textContent.trim() === ''`, and it is **not** inside a conditionally rendered block. |
| 6 | **Readiness speaks** | Switch state Resting → Retainer set (or press the specimen's readiness affordance); poll the check-5 node | Its text changes to a full sentence naming what cleared and what remains, within one frame of the state change. |
| 7 | **Every `aria-disabled` act is focusable and explained** | For each `[aria-disabled="true"]`: assert `tabIndex >= 0` or it is a natively focusable element without `disabled`; assert `aria-describedby` resolves to a non-empty, visible node | true for all. |
| 8 | **Activating a held act does not silently fail** | Focus each `[aria-disabled="true"]` act, press Enter | The check-5 status node receives the reason text **and** `document.activeElement` moves to the unmet input. |
| 9 | **Held terminal contrast** | Computed style of `.act--terminal[aria-disabled="true"]`: ratio(color, background-color) | ≥ 4.5:1. (§A5's `--ink-faint` on `--rail` gives 5.32:1; clay@50% gives 1.20:1 and fails.) |
| 10 | **No aged-oak used as an ink** | `grep -n 'aged-oak\|#8B7355\|--oak' specimen.html` and, for each hit, assert it styles `border-color`/`background`, never `color` | 0 hits on a `color` declaration. Text meta takes `--clay-ink` (5.61:1). |
| 11 | **Every text/ground pair clears AA** | Walk every element with visible text; compute ratio(effective color, nearest painted background), accounting for inherited `opacity` | ≥ 4.5:1 for text < 18.66px or non-bold < 24px; ≥ 3:1 otherwise. No exemptions claimed for `aria-disabled` controls. |
| 12 | **No pinch-zoom block** | `grep -n 'maximum-scale\|user-scalable' specimen.html` | 0 matches (the specimen must not reproduce `layout.tsx:40`). |
| 13 | **Reflow at 390 keeps every act** | Render at 390×844; assert `document.documentElement.scrollWidth <= clientWidth`; then collect the accessible names of all enabled acts at 1440 and at 390 | The 390 set is not a proper subset of the 1440 set — specifically, an act named `/review|send/i` is present at 390. (Today's room fails: `room-shell.tsx:155`.) |
| 14 | **Keyboard reorder works and speaks** | Tab to the part head for `Billing cadence`; press the specimen's move-up affordance twice | The part moves twice; `document.activeElement` is still that part's own control after each move; the check-5 node names the part and its new position each time. |
| 15 | **Reorder needs no pointer and no drag** | With pointer events disabled (`document.body.style.pointerEvents='none'`), repeat check 14 | Passes identically. |
| 16 | **No `contenteditable`** | `grep -n 'contenteditable' specimen.html` | 0 matches. Every edited field is `<input>`, `<textarea>` or `<select>` with a programmatic label. |
| 17 | **No hover-only act** | `grep -nE 'group-hover|:hover' specimen.html`, and for each rule that changes `opacity`, `visibility` or `display` on an interactive descendant, assert a paired `:focus-within`/`group-focus-visible` rule exists | Every hover-revealed act has a focus-revealed twin (1.4.13, 2.1.1). |
| 18 | **Unfolding does not shift the reading position** | Record `getBoundingClientRect().top` of the part **above** the target; press the target's part head to unfold; re-read | Δ = 0px. (D's crux; A's and C's too.) |
| 19 | **Focus is never obscured** | Tab through every act at 390 and at 1440; after each Tab, assert `document.activeElement`'s rect is fully inside the viewport and not intersected by any `position: sticky`/`fixed` element | true for all (2.4.11). Requires `scroll-margin-top` ≥ the sticky bar's height. |
| 20 | **Reduced motion and forced colours** | (a) `grep -n 'prefers-reduced-motion' specimen.html` → §A11's block present verbatim. (b) `grep -n 'forced-colors' specimen.html` → §A11's block present. (c) Render with `forced-colors: active` emulated and switch to the "part selected" state | (a) and (b) present; (c) the selected part is still identifiable without hue — by a rule, a word, or a border (1.4.1, §A11's "state lives in the word and the rule, never in a hue alone"). |

**Two switcher-specific notes.** The §A12 strip's own buttons take `aria-pressed`
(`SPEC.md:567-569`); the specimen's *content* disclosures take `aria-expanded`
and must not take `aria-pressed` (§A5 amended §F-E) — check 4's DOM walk should
assert no element carries both. And the strip is `role="region"` outside the
mocked page, so checks 11, 13 and 19 scope to the page root, not the document.
