# Memo — seat 2 · information architect / reductionist

**Charter:** what leaves the page.

---

## 1 · The argument

### The room says the same thing three times, and counts twice

At 1442 the composer renders the nine parts three times at once: as titles in a
260px rail (`parts-rail.tsx:329-340`), as a heading over one open editor
(`part-editor.tsx:113-115`), and as printed headings in a 280px-measure paper
(`agreement-composer.tsx:960-966`). None of the three is authoritative. A rename
typed in the rail (`parts-rail.tsx:247-292`) has to be reconciled by eye against
two other columns. That is the clunkiness Kody is naming, and it is not a
styling problem — it is one list rendered thrice.

The count is printed twice in the same wording: the RoomShell bar
(`agreement-composer.tsx:703`) and the readiness panel (`:1048-1050`). Worse, it
is a count of *parts carrying blockers* (`readiness.ts:548-553`), so the resting
plate shows `0 OF 9 PARTS NEED ATTENTION` sitting directly on top of two
blockers that no part owns — the fee floor and the missing client
(`shots/current/resting-390.png`, readiness band). A number that reads zero above
two unfinished things is worse than no number.

### The header spends 300px before a part is reachable

Excluding the sticky bar and the eyebrow, the header is ≈300 CSS px
(`current-state.md` §1) for: an eyebrow that classifies a document whose title
already classifies it; a title that is `document.title` and on Kody's production
draft prints an **email address** in Playfair 26 (`:732-734`); a subtitle that
restates the boundary the paper's own closing sentence carries; three acts, one
of which — `Saved` — is not an act but a state rendered as a filled tan control
with the native `disabled` attribute (`:756-762`); and a labelled client-account
block with its own helper sentence (`:765-797`) for a field touched once in the
agreement's life. The email then wraps to three lines inside the aside
(`kody-screenshot.png`, aside title region), which is the same defect twice.

The seven-facet room repeats this header verbatim after a Return — same eyebrow,
same subtitle shape, same client block, `Preview client copy` and `Saved`
(`shots/current/seven-facets-after-return-1440.png`). Reducing the header is one
edit that pays in two rooms.

### The preview is thin because it is the third copy, not because it is 320

Kody's instinct is right but the diagnosis can be sharpened. The aside is not a
preview that got squeezed; it is a *proof* forced to share a page with two other
renderings of its own contents. `service-agreement-preview.tsx:101` drops the
paper's `max-w-[720px]` in compact mode, so the paper is shown at 39% of the
measure it was designed for, and the only other way to see it is a 640px
`DocSheet` (`doc-sheet.tsx:377`) — also narrower than 720. **The room has no
full-measure route to the paper at all.** Both of Kody's alternatives (paper as
the page; builder as overlay) fix that; the reductionist's version of the fix is
simply: render the paper once, at its measure, and delete the other two.

Once one full-measure paper is on the page, `Preview client copy` has nothing
left to open, and the sheet, its second name (`Client copy preview`, `:974`) and
the card head `The client's copy · live` all leave with it.

### The acts are placed by chrome slot, not by consequence

Five acts, in four places. `Review & send` lives in the RoomShell slot
(`:705-716`) which `room-shell.tsx:155` renders `hidden min-[1180px]:block` —
**there is no way to open the send sheet at 1024 or 390 in the shipped room**
(`shots/README.md` flag 1; the capture lane had to resize a sheet opened at 1440,
`capture-log.json` records the two timeouts). `Preview`, `Return` and `Saved` sit
in the header. The client account sits below them. Nothing is placed where its
consequence lands. Every direction should place the five acts by weight: the
terminal send at the foot of the paper it sends, Save as its dated record, the
client account inline in a "Prepared for" line, the return act at the foot of
the outline, and Preview gone.

### The return act is the sharpest thing on the page and dressed as the mildest

`Return to the seven facets` is a `variant="secondary"` button between Preview
and Save that discards every part on the first press, with no confirm, no
consequence sentence and no undo (`:747-754` → `:637-648`). House sheet §A6
(`SPEC.md:379-395`) requires a sentence above every terminal act in every state
saying what it does *and does not* do — and here there is real content for that
sentence: the Services clause body projects into `proposal_service_terms.scope`
(`00575_agreement_parts.sql:2934-2939`), while the migration's own comment at
`:2933-2935` records that `flat`, `per_phase`, `percent_of_cost`, `draws` and
`allowances` "reach the money row not at all". So the Concept fee added at
fixture step 7 does not survive a Return, and today nothing on the page says so.
Its label is also the only string on the studio's face that says "facet", naming
a room the studio may never have opened; R24 fixes that the act exists, not what
it is called. I file a rename as an `AMENDMENT-ASK`.

### The send sheet promises a paper it has not read

`service-agreement-send-sheet.tsx:105-112` enumerates six fixed things — "the
services, rates, retainer policy, billing cadence, ceiling, and terms" —
regardless of composition. On the captured sheet it promises rates and a ceiling
while, 200px lower, `FINISH BEFORE SENDING` says the agreement names no fee and
has no client (`shots/current/review-and-send-sheet-1440.png`). And `Ready to
send · every contractual facet is present.` (`:153`) is a claim readiness cannot
support: readiness proves R4's floor was met (`rulings-2026-09-06.md:10`), not
that everything is present. Both sentences should be composed from the
client-visible parts actually there (R33, R21) — and there is then only one
sentence, not two, because §A6 wants the consequence sentence in *every* state,
which absorbs the ready line and the blocker head.

The sheet's consequence sentence also sits ~500px above the act it describes,
behind a bordered Recipient box that restates it, a bordered deposit box
announcing a part R21 says is unwritten, and the blockers. Three boxes and four
heads (`Send design agreement` / `Yes to the designer` / `Send for the client
signature` / `Recipient`) before the reader learns anything the composer did not
already tell them.

### What I would delete, in one list

The subtitle · the eyebrow (composer) · `Saved` as a control · the client-account
label + helper block (becomes inline) · one of the two counts · the compact
aside paper · `Preview client copy` and its sheet · the card head `The client's
copy · live` · `Body` as a field label · the Recipient box · the deposit box ·
the send sheet's eyebrow and one of its two heads · the `Ready to send` line ·
two placeholder strings. That is roughly a third of the strings on the two
surfaces, and none of them is a fact the studio needs.

*(≈1,140 words)*

---

## 2 · Findings

`ID | P | conf | surface | claim | evidence | proposed change` — then §6 mark.

| ID | P | Conf | Surface | Claim | Evidence | Proposed change | §6 |
|---|---|---|---|---|---|---|---|
| IA-1 | P1 | high | composer page | The title is `document.title`, which on the production draft prints an email address as the paper's name in Playfair 26 — and the same string wraps to three lines inside the aside. | `agreement-composer.tsx:732-734`; `kody-screenshot.png` title band + aside title region | Title = the client's name, email as fallback; sidesteps the missing rename RPC entirely. | touches row 3 (the rename affordance never landed) |
| IA-2 | P2 | high | composer page | The subtitle restates the boundary the eyebrow and the paper's own closing sentence already carry — three scope statements before any work. | `:721-730`, `:735-740`; closing sentence in `shots/current/review-and-send-sheet-1440.png` paper foot | Cut the subtitle. | new |
| IA-3 | P1 | high | composer page · aside | The same count is printed twice in identical wording on one screen. | `:703` and `:1048-1050`; `current-state.md` §1, §5 | One count, in the readiness slot beside the fee sentence; the bar carries the room name and the send act only. | new |
| IA-4 | P1 | high | aside | The count can read `0 of 9` directly above two live blockers, because it counts parts carrying blockers and the fee-floor and client blockers belong to no part. | `readiness.ts:548-553` + comment `:541-547`; `shots/current/resting-390.png` readiness band | Replace the count with a sentence that counts *things to finish*, not parts. | touches row 2 (count moving with no sentence) |
| IA-5 | P2 | high | composer page | `Saved` is a state rendered as a filled control; it is an act-shaped thing that can never be pressed. | `:756-762` (`disabled` at `:759`); §A5 "taken" `SPEC.md:373-378`; §A13 `SPEC.md:582` | Remove the control; render the dated record in the `role="status"` slot already at `:799-806`. | touches row 8 (`disabled` attribute) |
| IA-6 | P2 | high | composer page | The client account takes ≈85px of header — mono label, full-width select, helper sentence — for a once-per-agreement field. | `:765-797`; `current-state.md` §1 band ≈163–247 | An inline act inside a "Prepared for {name}" line, `aria-disabled` with the owner reason as `aria-describedby`. | new |
| IA-7 | P2 | medium | composer page | The owner-refusal sentence is attached to a control disabled with the native attribute, so the reason is not reachable from the control. | `:767-783` (`disabled` prop), `:785-788`; §A5 `SPEC.md:336-361` | `aria-disabled` + `aria-describedby`; activating writes the reason to `role="status"`. | touches row 8 |
| IA-8 | P1 | high | aside | The paper is rendered at a ~280px measure, 39% of its own 720, purely because it shares a page with the builder. | `service-agreement-preview.tsx:101`; `:960-966`; `kody-screenshot.png` aside region | One paper, at its own measure. Kody's read is right; the cause is the third rendering. | new |
| IA-9 | P2 | high | composer page | The nine-item list is rendered three times simultaneously; a rename must be reconciled across three columns. | `parts-rail.tsx:329-340`; `part-editor.tsx:113-115`; `:960-966` | Never more than two renderings — an outline and the paper. | new |
| IA-10 | P2 | high | composer page | Below 1180px the paper is not rendered at all, and readiness falls to the page foot under an empty editor column. | `:960`; `shots/current/resting-390.png` | At 390 the paper is a route, not a hidden div; readiness rides above the parts. | new |
| IA-11 | P2 | medium | rail | Four of nine rail eyebrows wrap to two lines inside 260px, so the authority standing costs more height than the part's own name. | `current-state.md` §1 rail; `parts-rail.tsx:308-328`; `schedules/index.ts:67-71` | Move the standing off the rail row to where the money is; the rail carries name + attention. | new |
| IA-12 | P3 | medium | rail | `CREATES AUTHORITY` appears on six of nine rows, so it distinguishes nothing at rest. | `kody-screenshot.png` rail; `schedules/index.ts:52-65` | Mark the exception (`record only`), not the rule. | new |
| IA-13 | P2 | high | editor | The editor column is 524 wide holding a 508×172 textarea, then ≈560px of nothing. | `current-state.md` §1 middle column; `kody-screenshot.png` editor region | The editor is a state of a part, not a standing column. | new |
| IA-14 | P2 | medium | preview sheet | The act and the sheet name the same thing in reversed word order, and the sheet (640) is narrower than the paper (720). | `:744-746`, `:974`; `doc-sheet.tsx:377`; `service-agreement-preview.tsx:101` | One name, one route: "Read the whole paper", at 720. | new |
| IA-15 | P2 | high | preview sheet | Once one full-measure paper is on the page, this act opens a narrower copy of what is already visible. | same as IA-14 | Cut the act and the sheet in A and D; in B/C keep it once, renamed, at full measure. | new |
| IA-16 | P1 | high | return act | Discards every part on first press with no confirm, no consequence sentence, no undo — and sits between Preview and Save. | `:747-754` → `:637-648`; §A6 `SPEC.md:379-395` | Move to the foot of the outline; add the consequence sentence and a press-and-hold confirm (§F-G). | known row 7 (no confirm) · extends it to the missing sentence and the placement |
| IA-17 | P2 | high | return act | Its label is the only "facet" string on the studio's face and names a room the studio may never have opened. | `agreement-copy.ts:46`; R24 `rulings-2026-09-06.md:45`; brief §9 carve-out | `AMENDMENT-ASK:` rename to **"Take the parts apart"**. | new |
| IA-18 | P2 | high | seven-facet room | `composedElsewhere` repeats the act's label verbatim, so a rename is two strings; R24 requires the notice to name the act. | `agreement-copy.ts:54-55`; R24 `rulings:45` | Rename both in one edit; rides with IA-17's amendment. | new |
| IA-19 | P1 | high | return act | The return is not lossless and nothing says so: the Services body projects into `scope`, but `flat` / `per_phase` / `percent_of_cost` / `draws` / `allowances` reach the money row not at all — so the fixture's Concept fee is lost silently. | `00575_agreement_parts.sql:2934-2939` and comment `:2933-2935`; fixture §2 part 10 | The consequence sentence names what is kept and what is not. | new |
| IA-20 | P1 | high | send sheet | The consequence sentence enumerates six fixed things regardless of composition; on the captured sheet it promises rates and a ceiling above a blocker saying the agreement names no fee. | `service-agreement-send-sheet.tsx:105-112`; `shots/current/review-and-send-sheet-1440.png` | Compose from the client-visible parts present (R33, R21); never enumerate more than the paper carries. | known row 1 (N4) |
| IA-21 | P1 | high | send sheet | `Ready to send · every contractual facet is present.` is a claim readiness cannot make — it proves R4's floor, not completeness. | `:151-154`; R4 `rulings:10`; brief §9 | Delete the line; the composed consequence sentence carries every state (§A6). | known row 1 (N4) |
| IA-22 | P2 | high | send sheet | The consequence sentence sits ≈500px above the act it describes, behind three blocks. §A6 wants it directly above the terminal act. | `:105-112` vs `:203-209`; `SPEC.md:379-395`; `shots/current/review-and-send-sheet-390.png` | Move it directly above the act, in every state. | new |
| IA-23 | P2 | high | send sheet | The deposit box gives a bordered rectangle to a part R21 says is unwritten, and prints a default the paper does not print. | `:125-135`; fixture §2 part 6; §A10 `SPEC.md:506-508` | Fold into the composed sentence as one clause; a part with nothing set renders nothing. | touches row 1 ("de-duplicate the deposit note") |
| IA-24 | P2 | medium | send sheet | The Recipient box restates what the consequence sentence already says, and when empty prints `No client email linked` while the blockers separately print `Link a client with an email address.` | `:114-121`, `:119`; `shots/current/review-and-send-sheet-390.png` | Cut the box; recipient in the sentence, the blocker as the only refusal. | new |
| IA-25 | P2 | medium | send sheet | Three acts share one row, one of them a 12px underlined text button, one a terminal act carrying a bare verb. | `:187-211`; §A5 `SPEC.md:250-289` ("never a bare verb"), §A13 `SPEC.md:582` | One terminal act carrying the figure; `Send later` inline; the offline route moved off the row. | touches row 8 |
| IA-26 | P3 | medium | send sheet | Four heads before the first fact: sheet title, eyebrow, heading, then the sentence. | `:96`, `:99-101`, `:102-103` | Keep the sheet title; cut the eyebrow and the heading. | new |
| IA-27 | P3 | medium | send sheet | The optional note uses placeholder text, which the Do-not list forbids. | `:174`; §A13 `SPEC.md:585-588` | Move it under the label as a `.t-meta` line. | new |
| IA-28 | P3 | low | composer page | The client picker also uses placeholder text. | `:783`; §A13 | Same fix. | new |
| IA-29 | P2 | medium | composer page · send sheet | `Review & send` lives only in a slot hidden below 1180px, so the send sheet cannot be opened at 1024 or 390 in the shipped room. | `room-shell.tsx:155`; `:705-716`; `shots/README.md` flag 1; `capture-log.json` two timeouts | Every direction places the send act in the page — at the foot of the paper — not in the bar. | new |
| IA-30 | P2 | medium | rail | `+ Add a part` exists only at the foot of the rail, so placing the Concept fee is add-then-reorder. | `parts-rail.tsx:187`; fixture §3 step 7 | A seam act between parts (A/D), or an "insert after this part" row-menu item (B/C). | new |
| IA-31 | P3 | medium | rail | A six-item `⋯` menu on every row puts keyboard reorder two levels deep. | `parts-rail.tsx:374-408` | Promote Move up / Move down to the part head; the menu keeps Rename · Keep in the Library · Remove. | new |
| IA-32 | P2 | medium | editor | `Hidden from your client` is a checkbox above `Body` on every part when `design-build` is on — a part-level act living inside the text editor. | `part-editor.tsx:116-131`; `:869-884`; R39 `rulings:76` | Move it to the row menu with the other part-level acts; still "on a part". | touches rows 2 and 8 |
| IA-33 | P3 | medium | editor | `Body` labels a textarea whose part heading, one line above, already names it. | `part-editor.tsx:194-195` | Cut the label; the heading is the label (kept as `aria-label`). | new |
| IA-34 | P3 | low | composer page | `Pick a part on the left, or add one.` names a position that is false below 1180px, where the rail is above. | `:898-900`; `:820`; `shots/current/resting-390.png` | "Choose a part, or add one." — or the sentence disappears where nothing is unselected. | new |
| IA-35 | P3 | low | aside | The card head says `live`, a word the brief bans inside the paper, on the card that holds the paper. | `:962-964`; brief §9 | The head leaves with the card; a full-measure paper needs no label. | touches row 4 (same string, contrast) |
| IA-36 | P2 | high | composer page | ≈300px of header stand before the first part, excluding the bar and the eyebrow above the crop. | `current-state.md` §1; `kody-screenshot.png` | Header = client's name, the "Prepared for" line, the record. Acts move to their consequences. | new |
| IA-37 | P3 | medium | composer page | The eyebrow classifies a document whose title already classifies it. | `:721-730` vs `:732-734` | Cut here; keep the classifier where it is the only one. | new |
| IA-38 | P3 | low | send sheet | The sheet's chrome dismiss reads `Put back · Esc` while its own dismiss act reads `Send later` — two words for one exit. | `doc-sheet.tsx:183-190`; `:200-202`; `shots/current/review-and-send-sheet-390.png` | One word for leaving. | new |
| IA-39 | P2 | medium | composer page | No full-measure route to the paper exists anywhere in the room; the studio never sees what the homeowner sees. | `current-state.md` §2 ("No full-page proof route exists"); `preview.tsx:101`; `doc-sheet.tsx:377` | A full-measure route in every direction. | new |
| IA-40 | P3 | low | aside | Under turnkey the 320 column stacks four more regions above the paper it exists to show. | `:919-958` then `:960` | Those belong to the Money room's ledger; the paper column carries the paper. | new |
| IA-41 | P3 | low | composer page | Two counting vocabularies share one room title: `N of 9 parts need attention` and, after a Return, `6 of 7 facets written`. | `:703`; `service-agreement-drafting-room.tsx:343`; `shots/current/seven-facets-after-return-1440.png` bar | One counting sentence, in the parts vocabulary (R7/R138). | new |
| IA-42 | P3 | low | composer page | The three library acts stack as three separate ghost buttons at the rail foot at 390. | `parts-rail.tsx:187-196`; `save-as-template-action.tsx:130`; `shots/current/resting-390.png` | One "Add a part" act; Template and Library become choices inside it. | new |

---

## 3 · Required artifact — before / after inventory

Every string and every act on the composer page and the send sheet.
**after** is written direction-neutrally where the shared treatment already
settles it; where a direction decides, the cell says which.

### The composer page — header

| today (verbatim, path:line) | keep / cut / move / rewrite | after | reason |
|---|---|---|---|
| `The Contract Room · Design Agreement` — `agreement-composer.tsx:697-701` | keep | unchanged | The room's own name; the only classifier that survives IA-37. |
| `{n} of {parts.length} parts need attention` (bar) — `:703` | cut | — | Printed twice (IA-3); hidden at 390 anyway (`room-shell.tsx:147`). |
| `Review & send` — `:705-716` | move | terminal act at the foot of the paper, label carrying the figure | Unreachable below 1180 today (IA-29); §A5 terminal placement. |
| `Yes to the designer · professional services only` — `:721-730` | cut | — | The title already says design services (IA-37). |
| `{document.title}` → `j.enzenroth@gmail.com — design services agreement` — `:732-734` | rewrite | `Dave Okonkwo` (email as fallback) | An email is not a paper's name (IA-1); no rename RPC needed. |
| `Compose the parts this agreement is made of. Furnishings and purchasing stay outside it.` — `:735-740` | cut | — | Third statement of the same boundary (IA-2). |
| `Preview client copy` — `:744-746` | cut (A, D) / rewrite (B, C) | `Read the whole paper` | Opens a narrower copy of a visible paper (IA-15); one name (IA-14). |
| `Return to the seven facets` — `:747-754`, `agreement-copy.ts:46` | move + rewrite | `Take the parts apart`, at the foot of the outline | `AMENDMENT-ASK` (IA-17); R24 fixes the act, not the words. |
| `Save agreement` — `:756-762` | cut | — | Save is automatic in every direction; the record replaces the act (§A5 taken). |
| `Saved` — `:761` | cut | — | A state dressed as a control (IA-5). |
| `Client account` (label) — `:766` | cut | — | The value's own line names it (IA-6). |
| `Select or invite a client…` (placeholder) — `:783` | rewrite | `Prepared for **no one yet** — link a client` as an inline act | Placeholder text is on the Do-not list (IA-28). |
| `Only the agreement owner can change the client account.` — `:785-788` | keep + move | `aria-describedby` target under the inline act | The reason must be reachable from the control (IA-7). |
| `{clientNote}` (`role="status"`/`alert`) — `:790-796` | keep | unchanged | The only live report on the field. |
| `All agreement changes saved.` — `:621`, rendered `:799-806` | rewrite | `Saved 10 September 2026, 5:36 am` | §A5 taken / §A9: an act replaced by its dated record (IA-5). |
| `The agreement could not be returned to the seven facets.` — `:646` | rewrite | `The parts could not be taken apart. Nothing was removed.` | Rides IA-17; says what did *not* happen. |
| `This agreement has left the studio. Its parts are fixed as sent.` — `:807-817` | keep | unchanged | True, and the only sentence in that state. |
| `This is a design-build agreement, and it does not open for you yet…` — `:811-815` | keep | unchanged | Same. |

### The composer page — rail / outline

| today (verbatim, path:line) | keep / cut / move / rewrite | after | reason |
|---|---|---|---|
| `CLAUSE` / `LIST` / `ROLE RATES` / `CEILING` / `FURNISHINGS DEPOSIT` / `RETAINER` / `BILLING CADENCE` — `parts-rail.tsx:308-328` | cut from the outline | kind shown in the editor only | Four of nine wrap to two lines in 260 (IA-11). |
| ` · CREATES AUTHORITY` / ` · CREATES AUTHORITY · DEPOSIT ONLY` — `schedules/index.ts:67-71` | move | beside the money, in the editor / margin | Six of nine rows carry it, so it marks nothing (IA-12). |
| `record only` — `schedules/index.ts:69` | keep + move | same slot as above | The exception is the informative one (IA-12). |
| `This is recorded on the agreement. It does not create billing authority yet.` — `schedules/index.ts:75-76` | keep | unchanged, beside the money | The consequence of `record only`. |
| Part titles `Services ·` … `Terms ·` (+ `aria-label="Required"`) — `parts-rail.tsx:329-340` | keep | unchanged | The outline's only necessary content. |
| `needs attention` — `parts-rail.tsx:351` | keep | unchanged | The one attention mark that survives the count's removal. |
| `{DESIGN_BUILD_COPY.hiddenFromClient}` sub-label — `parts-rail.tsx:341-348` | keep | unchanged | R39's own mark. |
| `Rename` — `parts-rail.tsx:378` | keep | in the row menu | — |
| `Move up` / `Move down` — `parts-rail.tsx:384`, `:390` | move | promoted to the part head | Two levels deep on the keyboard path (IA-31). |
| `Keep in the Library` / `Kept in the Library` — `parts-rail.tsx:403` | keep | in the row menu | R7 vocabulary, already correct. |
| `Remove` — `parts-rail.tsx:404` | keep | in the row menu | — |
| `Rename {part.title}` (`aria-label`) — `parts-rail.tsx:284` | keep | unchanged | — |
| `+ Add a part` — `parts-rail.tsx:187` | keep + add placement | also at each seam (A/D) or as "insert after" (B/C) | Placing a part is add-then-reorder today (IA-30). |
| `Start from a template…` — `parts-rail.tsx:191` | move | a choice inside Add a part | Three ghost acts stack at 390 (IA-42). |
| `Save as template…` — `save-as-template-action.tsx:130` | move | the outline's foot, beside Take the parts apart | Same. |
| `This agreement has no parts yet.` — `parts-rail.tsx:180-181` | keep | unchanged | §A10 empty state, correctly one sentence. |

### The composer page — editor

| today (verbatim, path:line) | keep / cut / move / rewrite | after | reason |
|---|---|---|---|
| Kind eyebrow — `part-editor.tsx:94-95` | keep | unchanged, now the only place the kind is named | Absorbs the rail's eyebrow (IA-11). |
| Part heading (Playfair italic 20) — `part-editor.tsx:113-115` | keep | unchanged | The editor's own subject; the third rendering leaves, not this one. |
| `Hidden from your client` — `part-editor.tsx:116-126` | move | the row menu | A part-level act inside the text editor (IA-32). |
| `{DESIGN_BUILD_COPY.hiddenFromClientHelp}` — `part-editor.tsx:127-131` | keep + move | with the act | — |
| `Body` — `part-editor.tsx:194-195`, `:608-609` | cut | — | The heading one line above already names it (IA-33). |
| `Pick a part on the left, or add one.` — `:898-900` | rewrite (B, C) / cut (A, D) | `Choose a part, or add one.` | "on the left" is false below 1180 (IA-34). |
| `History` strip head — `part-history-strip` (`:856`) | keep | unchanged | Draws nothing on an untouched part; already §A10-correct. |

### The composer page — aside / readiness / preview

| today (verbatim, path:line) | keep / cut / move / rewrite | after | reason |
|---|---|---|---|
| `{needAttention} of {total} parts need attention` — `:1048-1050` | rewrite | `Two things to finish before this can be sent.` | Reads `0 of 9` above two blockers (IA-4); one count, not two (IA-3). |
| `This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee.` — `readiness.ts:490` | keep + move | beside the seam where the fee would print (D) / above the paper (A, B, C) | It is the fee floor's sentence; it belongs where the fee is missing. |
| `This fee is hidden from your client, so it cannot bill.` — R33 | keep | unchanged | — |
| Notes list (11.5px italic) — `:1059-1064` | keep | at `.t-meta` 12px, never below 11 | §A3 floor. |
| `The client's copy · live` — `:962-964` | cut | — | Leaves with the card; `live` is banned in the paper (IA-35); 4.48:1 anyway (§6 row 4). |
| `Client copy preview` (sheet title) — `:974` | cut (A, D) / rewrite (B, C) | `The whole paper` | Second name for one thing (IA-14). |
| `Put back · Esc` — `doc-sheet.tsx:183-190` | keep | unchanged | The sheet chrome's own word; the duplicate is on the send sheet (IA-38). |

### The send sheet

| today (verbatim, path:line) | keep / cut / move / rewrite | after | reason |
|---|---|---|---|
| `Send design agreement` / `Send design-build agreement` — `:96` | keep | unchanged | The sheet's only head that survives IA-26. |
| `Yes to the designer` / `{DESIGN_BUILD_PAPER_COPY.documentLabel}` — `:99-101` | cut | — | Third classifier on a sheet the reader opened deliberately (IA-26). |
| `Send for the client signature` — `:102-103` | cut | — | Restates the sheet title (IA-26). |
| `{recipientName} receives` / `The client receives` `the services, rates, retainer policy, billing cadence, ceiling, and terms.` `Their signature preserves consent; the agreement still awaits the studio countersignature before work is authorized.` — `:105-112` | rewrite + move | Composed from the client-visible parts present, directly above the act, in every state: *"Dave Okonkwo receives ten parts, including the role rates, the $24,000.00 ceiling, the $5,000.00 retainer and the Concept fee of $2,400.00. His signature preserves consent; nothing is billed and no work is authorized until the studio countersigns."* | N4; over-promises on a composition that lacks them (IA-20); §A6 placement (IA-22). |
| turnkey arm: `the price, the schedule of values, the draw schedule, the allowances, who is doing the work, and the terms.` — `:108` | rewrite | composed the same way from the turnkey parts | Same fixed enumeration, same defect. |
| `Recipient` — `:115-117` | cut | — | Restates the composed sentence (IA-24). |
| `{recipientEmail}` / `No client email linked` — `:118-120` | cut | the blocker is the only refusal | Two strings for one absence (IA-24). |
| `Furnishings deposit` — `:127-129` | cut | — | A bordered box for an R21-unwritten part (IA-23). |
| `No furnishings deposit set — authorizations will default to 50%.` — `:132` | rewrite | one clause inside the composed sentence, only when a deposit is set | §A10: nothing to say → render nothing (IA-23). |
| `Furnishings deposit · {percent}% on each authorization` — `:133` | rewrite | same clause | Same. |
| `{readiness.notes}` — `:138-146` | keep | unchanged | The caution, W3R2-17. |
| `Ready to send · every contractual facet is present.` — `:153` | cut | — | Readiness proves R4's floor, not completeness; last "facet" on the studio's face (IA-21). |
| `Finish before sending` — `:158` | keep | unchanged | The one head worth keeping, above the blockers. |
| `{readiness.blockers}` — `:160-164` | keep | unchanged | — |
| `A note to the client · optional` — `:168-169` | keep | unchanged | — |
| `A short personal note to accompany the agreement.` (placeholder) — `:174` | move | a `.t-meta` line under the label | No placeholder text (IA-27). |
| `Agreement sent and email delivery confirmed.` / `Agreement sent. Email delivery is still being confirmed.` — `:79-80` | keep | unchanged, in `role="status"` | §F-M. |
| `The agreement could not be sent.` — `:87` | keep | unchanged | — |
| `Record a signature received outside Patina` — `:189-195` | move | off the act row, to the sheet foot under its own rule | Three acts in one row, one of them 12px underlined (IA-25). |
| `Send later` — `:200-202` | rewrite | `Not yet` | `Send later` implies a scheduled send; and `Put back · Esc` already sits above (IA-38). |
| `Send agreement →` — `:203-209` (`disabled` at `:205`) | rewrite | `Send the agreement · $24,000.00 ceiling`, `aria-disabled` with the blocker as its reason | §A5: never a bare verb on a terminal act; §A13: never `disabled` (IA-25). |

---

## 4 · Ranking A–D, one sentence each

1. **A · The paper is the page** — it deletes the most: one whole rendering of
   the nine parts, the editor column, the compact aside and the preview sheet,
   leaving an outline and a paper, which is exactly the reduction Kody asked for.
2. **D · The galley** — nearly A's deletions plus a home for the fee-floor
   sentence at the seam where the fee would print, but it re-spends the saving on
   a third column of marginal notes.
3. **B · Builder as overlay** — the resting page is the most reduced page in the
   set and Kody's hunch deserves to be seen, but nothing is actually *removed*:
   every string alive today survives inside a 480px drawer, and readiness is
   homeless the moment the drawer closes.
4. **C · Two panes** — the honest floor: it kills the 280px measure and one
   column, and leaves the header, the five misplaced acts and the send sheet
   exactly as clunky as they are today.

---

## 5 · What the specimen must show to change my mind

- **A → down:** the rate card's three role rows at `.t-money` 15px inside the
  208px right margin at 1440, and inside whatever the margin becomes at 1024,
  with no truncation (§A4) and no shadow separating the editing state from the
  paper. If that margin cannot hold Principal / Designer / Assistant, A's money
  editing falls back to something D already does better, and I swap 1 and 2.
- **B → up:** the closed state showing readiness and the fee-floor sentence in a
  home that is *not* a restored aside, plus the paper visibly updating behind an
  open drawer at 1440. If B can show that its drawer *shrinks* — that the rail's
  eyebrows, the `Body` label and the `⋯` menu are gone inside it, not merely
  relocated — then Kody's hunch is a reduction and not a move, and it goes to 1.
- **C → up:** the accordion head carrying `Role rates` + `needs attention` at
  580 minus its own indent with no wrap and no truncation, *and* a header that
  has actually shed the subtitle, `Saved` and the client block. C only earns a
  higher rank by proving the shared treatment does the reduction, in which case
  the columns barely matter.
- **Any direction → disqualified:** a specimen where the nine parts are rendered
  three times again, or where the count appears twice, or where `Review & send`
  is reachable only above 1180.
