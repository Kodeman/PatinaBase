# Seat 1 · The document-editor interaction designer

Fixture: the Okonkwo house. Middle West Studio, Madison · Dave Okonkwo ·
`dave@okonkwo.test` · Design services agreement · V1 · DRAFT · 10 September 2026.

---

## 1 · The argument

### The room's real defect is not the width of the preview

Kody says the preview is too thin. The thinness is a symptom. Open
`preview-sheet-1440.png`: the 640px sheet — the wide view, the one you take an
act to reach — clips at *Furnishings deposit*, while the 320px aside behind it
runs all the way to the signature blocks and the colophon. **The wide act shows
less of the paper than the narrow column it was meant to relieve.** Widening the
preview is not the fix, because width was never what was wrong.

What is wrong is that this room has no answer to *where am I*. The tradition my
seat is charged with — Docs, Pages, Notion, iA Writer, and the contract editors
that put blocks on the paper: Juro, Ironclad, PandaDoc — is built on one
invariant: **the thing you are editing is at the place it prints.** Selection is
not a state you have to be told about; it is a caret sitting inside a rendered
paragraph. Everything else in those products follows from that.

Today the current part is marked by exactly one thing: a title that is
`--color-charcoal` instead of `--color-mocha` (`parts-rail.tsx:302-306`). No
rule, no ground, no indent, no mark on the paper. In `kody-screenshot.png` the
selected *Services* row is, at a glance, its neighbours. Below 1180px it is
worse than weak — it is invisible. The grid collapses to a plain stack
(`agreement-composer.tsx:820`); `onSelect={setSelectedId}` (`:824`) neither
scrolls nor moves focus; the editor sits roughly 1,200px below the rail. In
`clause-editing-390.png` you can tap *Terms* and **nothing on screen changes at
all**. That is not a clunky interface. That is an interface with no feedback
loop.

The aside cannot close the loop either, because it never follows you. The card
is `sticky top-[82px]` with no max-height (`:961`); with nine parts it is taller
than the viewport, so it barely sticks, and it never scrolls to the part you are
editing. Write *Terms*, and the live paper shows you *Services*. Leah's step 3
— "check it on the paper without leaving the field" — succeeds for part one and
fails for parts two through nine.

### The save model is punitive, and "Saved" means more than it says

`persist()` calls `upsert_agreement_parts`, which is DELETE-then-INSERT, so
every part returns carrying a new uuid — the code says so at `:602-606`. The
editor is mounted `key={selected.id}` (`:862`). Therefore **every save unmounts
and remounts the editor you are typing in**: caret, selection, textarea resize
handle and scroll position all go. `reviewAndSend()` persists first when dirty
(`:652-656`), so opening the send sheet performs the same demolition behind the
sheet — and `DocSheet` restores focus to a trigger it validates with
`isConnected` (`doc-sheet.tsx:282-288`), which the re-keyed rail has just
disconnected. There is no autosave, no per-part save, no `beforeunload` guard,
and no undo anywhere in the agreement folder.

And "Saved" is not only "your parts are stored". A save runs
`_project_agreement_terms`, and the Services clause **is** the projection's
`scope` column (`00575_agreement_parts.sql:2934-2939`). The composer's own
comment at `:628-636` says the return act lands on a terms row "exactly as the
last projection left it" — which, after one save, is the row *your parts
overwrote*. So `Return to the seven facets` is offered as the way back and is
not one: it discards the parts and hands you seven facets you have already
edited through a side door, with no confirm, no consequence sentence, no undo.
The capture lane hit this live and recorded it as contamination
(`shots/README.md`, "Resting-state contamination"). A designer will hit it as a
lost afternoon.

For a designer, **"Saved" must mean three things at once and today means one**:
the parts are on the server; the client's copy now reads this way; and the
terms row behind the agreement has been rewritten. The shared treatment's
"Save is replaced by its dated record" (§A5 `SPEC.md:373-378`) is right, and it
is not enough on its own — the record line has to name the projection, or the
return act stops being honest.

### Seams, reorder, and the cost of placing one part

There is exactly one `+ Add a part`, at the foot of the rail
(`parts-rail.tsx:187`), and `addPart` appends at `parts.length + 1` (`:433-441`).
Leah's step 7 — the Concept fee, $2,400.00 — therefore lands after *Terms*. To
seat it beside *Ceiling* she needs four `Move up` trips, and each one lives
inside a `⋯` menu that `act()` closes (`:254-257`) **with no focus restoration**:
a keyboard user is dropped to `<body>` after every move and has to tab back in
four times. The end-stop moves take the native `disabled` (`:381`, `:388`), the
menu has no `role="menu"`, no Escape, no outside-click, no arrow keys. Removing
a part re-selects part one (`:418`), so removing the ninth throws you to the
top. Committing a rename unmounts the input (`:287`) and focus goes nowhere.

Seam affordances are the cheapest fix available and none of the four directions
should ship without them: a focusable seam between every pair of parts, so that
adding lands where you are and reorder never needs a menu.

### Money on paper

The retainer field is a controlled input with no transient text state.
`dollars(cents)` is `(cents/100).toString()` (`part-kinds.ts:367-368`) and
`toCents` strips and re-rounds on every keystroke (`:370-373`). Type the decimal
point and it is erased under your fingers; type a trailing zero and it vanishes.
`$5,000.05` **cannot be entered** in that field. And in
`money-part-fee-floor-1024.png` the field reads `5000`, while
`preview-sheet-1440.png` prints `$5,000`, while the fixture says `$5,000.00`.
One figure, three renderings, neither of them `.t-money`. Whatever direction is
chosen, the money field on the paper has to look like the money on the paper.

### Which direction the tradition points at

**D**, the galley. It is the only one of the four where selection, editing and
printing are the same place *and* the printed form of a part survives while you
edit it — the one thing Docs never takes away and A does. `facet-section.tsx`
already proves the mechanism this room needs: `bodyMounted = open || hasOpened`
with `hidden` / `inert` (`:50`, `:109-118`) keeps a closed editor mounted, which
is precisely what today's `key={selected.id}` remount does not do. D retires the
640px sheet rather than widening a view that already shows less than the aside.
Its cost is honest and singular: a per-part export from
`agreement-parts-body.tsx` that wraps rather than forks (R27 / R51).

**A** is D with a worse desktop. Replacing a part's rendered form with its
editor is the substitution the tradition avoids, and A then forks the model —
prose in place, money in the margin — so the designer must learn which of the
ten parts moves which way. At 390 A's margin collapses and its money editors
unfold full-width, which *is* D. **C** is cheap and leaves the split intact:
you still type in one column and read in another, and its stated precedent is
wrong — the seven-facet room does not use `facet-section.tsx` at all
(`service-agreement-drafting-room.tsx:750-776` is a flat always-open section).
**B** is last on my charter alone: it is the only direction that adds a mode,
the only one where the paper is invisible at 390 while you type, and readiness
has nowhere to stand when the drawer is shut. "The studio won't notice Patina"
(`VISION.md:50`) is not compatible with open → edit → close, nine times.

---

## 2 · Findings

`new` / `known` / `touches` assigned after reading §6.

| ID | Sev | Conf | Surface | Claim | Evidence | Proposed change | §6 |
|---|---|---|---|---|---|---|---|
| ED-1 | P1 | high | rail | "Current" is a title colour swap and nothing else — no rule, ground, indent or mark on the paper. | `parts-rail.tsx:302-306`; `kody-screenshot.png`, rail band, Services vs Deliverables | Give the current part a left rule and a ground in the outline **and** a mark at its printed position. | new |
| ED-2 | P1 | high | composer page | Below 1180px selecting a row produces no visible change: the stack puts the editor ~1,200px below the rail and `onSelect` neither scrolls nor moves focus. | `agreement-composer.tsx:820`, `:824`; `clause-editing-390.png` | Selection must move the viewport or the editor to the selection; ideally they are the same object. | new |
| ED-3 | P2 | high | aside | The live paper never scrolls to the selected part; the card is `sticky` with no max-height, so at nine parts it is taller than the viewport. | `agreement-composer.tsx:961` | Scroll the paper to the current part, or put the editing on the paper. | new |
| ED-4 | P2 | medium | editor | The kind eyebrow and title are printed twice, 36px apart, and neither is the paper. | `part-editor.tsx:94`, `:113` vs `parts-rail.tsx:308`, `:329` | Print the part's name once, where it prints. | new |
| ED-5 | P1 | high | composer page | Every save remounts the editor — DELETE-then-INSERT mints new uuids and the editor is keyed on `selected.id` — so caret, selection and scroll are lost on Save. | `agreement-composer.tsx:602-606`, `:862` | Key the editor on `partKey`, not `id`. | new |
| ED-6 | P1 | high | composer page | `reviewAndSend()` persists first, so opening the send sheet performs ED-5 behind it, and DocSheet's focus restore targets a now-disconnected trigger. | `agreement-composer.tsx:652-656`; `doc-sheet.tsx:282-288` | Same fix as ED-5; assert focus return in the send-sheet spec. | new |
| ED-7 | P1 | high | composer page | No autosave, no per-part save, no unsaved-navigation guard, no undo. Removing a part is irreversible in session. | `agreement-composer.tsx:411-425`; no `beforeunload`/undo in the agreement folder | Save on blur per part, with an undo line in the `role="status"` slot for remove and reorder. | new |
| ED-8 | P1 | high | return act | A save projects the parts into `proposal_service_terms`; the return act lands on the terms row "as the last projection left it", i.e. the row your parts overwrote. It is not a way back. | `00575_agreement_parts.sql:2934-2939`; `agreement-composer.tsx:628-636`, `:637-648`; `shots/README.md` contamination note | Consequence sentence naming what the facets will read, plus a confirm; the sentence must say the facets are not the ones you left. | touches §6-7 (that row names only the missing confirm) |
| ED-9 | P2 | high | composer page | `Saved` is a native `disabled` button on a filled tan ground — the loudest act in the header is the one that does nothing. | `agreement-composer.tsx:759`; `kody-screenshot.png`, third act; house sheet #6, #8 | Replace the act with its dated record (§A5 `SPEC.md:373-378`). | known §6-8 |
| ED-10 | P2 | high | composer page | The only evidence of a save is cleared by the next keystroke, so nothing dated survives. | `agreement-composer.tsx:620`, `:362` | The record line persists and carries the date. | new |
| ED-11 | P3 | medium | composer page | `dirty` is one boolean over the whole array; a designer cannot tell which part is unsaved. | `agreement-composer.tsx:232` | Per-part saved state, once saving is per-part. | new |
| ED-12 | P1 | high | rail | One `+ Add a part`, at the foot; new parts append last. The Concept fee ($2,400.00) lands after Terms and costs four moves to seat. | `parts-rail.tsx:187`; `agreement-composer.tsx:433-441` | Seam acts between every pair of parts; a part added at a seam lands there. | new |
| ED-13 | P1 | high | rail | Each `Move up` closes the `⋯` menu with no focus restoration, dropping a keyboard user to `<body>` after every move. | `parts-rail.tsx:254-257`, `:380-391` | Restore focus to the moved row and announce the new position in `role="status"`. | new |
| ED-14 | P2 | high | rail | End-stop moves and `Kept in the Library` use the native `disabled`. | `parts-rail.tsx:381`, `:388`, `:394`; house sheet #8 | `aria-disabled` + `aria-describedby` at the visible reason. | touches §6-8 (same defect, controls that row does not name) |
| ED-15 | P2 | high | rail | The row menu has no `role="menu"`, no `aria-haspopup`, no Escape, no outside-click, no arrow keys. | `parts-rail.tsx:359-407` | Either a real menu or — better — retire it for seam acts. | new |
| ED-16 | P2 | medium | rail | The drag handle carries dnd-kit's listeners on a `<button>` with no visible keyboard-lift instruction, and takes `disabled` when read-only. | `parts-rail.tsx:270-279` | Name the keys in the handle's accessible name; `aria-disabled`. | touches §6-8 |
| ED-17 | P3 | medium | rail | Dragging state is expressed as `opacity: 0.6`. | `parts-rail.tsx:265`; house sheet #5 | Express the lift with a rule or a ground, not opacity. | new |
| ED-18 | P1 | high | rail | Removing a part re-selects part one; removing the ninth throws the designer to the top, unannounced. | `agreement-composer.tsx:418` | Select the neighbour, focus it, announce the removal with an undo. | new |
| ED-19 | P2 | high | rail | Rename commits on blur/Enter and the input unmounts; focus goes to `<body>`. | `parts-rail.tsx:287`, `:289` | Return focus to the row's title control. | new |
| ED-20 | P2 | medium | rail | A reorder moves nothing into focus and writes nothing into a status line; the count and the paper move silently. | `agreement-composer.tsx:424-430` | Announce "Billing cadence is now part 7 of 9". | new |
| ED-21 | P3 | low | composer page | An added part is selected but nothing scrolls its editor into view; at 1024/390 it is off-screen. | `agreement-composer.tsx:440` | Scroll the new part's seat into view and focus its first field. | new |
| ED-22 | P1 | high | editor | Money fields re-round every keystroke with no transient text state: a typed decimal point and a trailing zero are erased. `$5,000.05` cannot be typed into the Retainer. | `part-kinds.ts:367-368`, `:370-373`; `part-editor.tsx:507-513` | Hold the typed string locally; coerce on blur. | new |
| ED-23 | P2 | high | editor / preview | One figure, three renderings: the field shows `5000`, the paper prints `$5,000`, the fixture says `$5,000.00`. Neither is `.t-money`. | `money-part-fee-floor-1024.png` (Retainer · dollars); `preview-sheet-1440.png` (Retainer); house sheet #2 | Format the field as the paper prints it, in `.t-money`. | new |
| ED-24 | P2 | medium | editor | The rate card writes through `toCents`, which returns 0 for an emptied field, so a cleared role rate becomes `$0` rather than R21's unwritten. Only retainer and ceiling use `toCentsOrNull`. | `part-editor.tsx:414`; `part-kinds.ts:370-379`; R21 | Use `toCentsOrNull` for every money field. | touches §6-6 (the R21 / unset-part minor, from the other side) |
| ED-25 | P3 | medium | editor | The credit-rule chips are `aria-pressed` on a filled clay ground; §F-E gives a pressed chip a `--rail` ground and an `--ink-faint` border. | `part-editor.tsx:540-549`; `SPEC.md:311` | Adopt the amended chip. | new |
| ED-26 | P3 | high | editor | Placeholder text in the clause, list and rate-card fields. | `part-editor.tsx:200`, `:329`, `:341`, `:411`, `:424`; house sheet #5 | Labels and R21's "Not yet set", never placeholders. | new |
| ED-27 | P1 | high | preview sheet | At 1440 the 640px sheet shows **less** of the paper than the 320px aside behind it — the sheet clips at *Furnishings deposit*; the aside reaches the signature block and colophon. | `preview-sheet-1440.png` | The full paper needs a full-page route, not a wider overlay. | new |
| ED-28 | P1 | high | composer page | The live paper is `hidden min-[1180px]:block`, so at 1024 and 390 there is no paper at all; the occluding 640px sheet is the only route. | `agreement-composer.tsx:960`; `money-part-fee-floor-1024.png`, `clause-editing-390.png` | The paper must be reachable at every width without leaving the work. | new |
| ED-29 | P2 | high | preview sheet | The act is "Preview client copy"; the sheet's title is "Client copy preview". Two orderings of three words for one thing. | `agreement-composer.tsx:744`, `:975` | One name. | new |
| ED-30 | P3 | low | aside | The preview card is `rounded-[8px]`; house sheet #3 allows 2px and 3px. | `agreement-composer.tsx:961` | 2px. | new |
| ED-31 | P1 | high | composer page | `room-shell.tsx:155` hides the action slot below 1180px and Review & send lives only there — there is **no way to open the send sheet at 1024 or 390**. | `room-shell.tsx:155`; `agreement-composer.tsx:705-716`; `shots/README.md` flag 1 | Every direction must seat Review & send on the page, not in a slot that disappears. | new |
| ED-32 | P2 | medium | composer page | The attention count prints twice at 1440 and once below 1180; the two copies can be the room bar's and the aside's. | `agreement-composer.tsx:703`, `:1048-1050` | One count, in one place, at every width. | new |
| ED-33 | P2 | high | send sheet | Review & send and Send take the native `disabled`, and neither carries a consequence sentence in the unavailable state. | `agreement-composer.tsx:712`; `service-agreement-send-sheet.tsx:205`; house sheet #7, #8 | `aria-disabled` + the consequence sentence in every state. | known §6-8 |
| ED-34 | P2 | high | composer page | Three boxed acts of equal weight sit above the work; at 390 they stack into three full-width boxes before the client account. | `kody-screenshot.png` act row; `resting-390.png`; house sheet #6 | Scored words at their tiers; the terminal box only where money moves or paper is signed. | new |
| ED-35 | P3 | medium | composer page | The client account is asked as a full-width labelled block plus a helper sentence before any part can be written, though nothing needs it until the send. | `agreement-composer.tsx:764-797` | Inline act in the "Prepared for" line, as the shared treatment says. | new |
| ED-36 | P2 | high | seven-facet room | Direction C's premise is factually off: this room does not use `facet-section.tsx`. `AgreementFacet` is a flat, always-open section. The accordion precedent lives in `drafting-room.tsx`, `discovery-section.tsx`, `offer-facets.tsx`. | `service-agreement-drafting-room.tsx:750-776`; `drafting-room.tsx:479-662`; `offer-facets.tsx:100-181` | Correct C's brief before it is built or ranked on that basis. | new |
| ED-37 | P2 | high | (C, if built) | Adopting `facet-section.tsx` as it stands imports six house-sheet violations: `truncate`, the ✓ glyph, a 5px `rounded-full` dot, a green tint fill, `opacity-70` on a state, `rounded-[8px]`. | `facet-section.tsx:94`, `:79`, `:84`, `:75`, `:95`, `:54`; house sheet #3, #4, #5 | C must restyle the primitive, not reuse it. | new |
| ED-38 | P3 | high | (C / D) | Credit: `bodyMounted = open \|\| hasOpened` with `hidden`/`inert` keeps a closed editor mounted — the one thing today's remount does not do. | `facet-section.tsx:50`, `:109-118` | Adopt the mount discipline in whichever unfold is built. | new |
| ED-39 | P2 | medium | (C / D) | `FacetSection` does no focus management on toggle, and its main consumer's `setActiveFacet` cannot close the open section at all. | `facet-section.tsx:62-108`; `drafting-room.tsx:480` | The unfold must move focus into the body on open and back to the head on close. | new |
| ED-40 | P2 | high | (A) | R21 means an unwritten part prints nothing, so an in-place seam beside it has no anchor to sit against. A must invent an affordance the paper is not allowed to show. | R21; `agreement-copy.ts:38`; `directions.md` A | A's specimen must show the *Furnishings deposit* seam in its unwritten state. | new |
| ED-41 | P2 | medium | (A) | A runs two editing models on one page — prose in place, money in the margin — splitting the fixture's ten parts 6/4. | `directions.md` A; fixture §2 | Say which parts take which, and why a designer should have to know. | new |
| ED-42 | P2 | high | (B) | Readiness is four objects — a count, up to three document blockers, N notes, and a per-part blocker set — and only the first two have anywhere to stand on a closed paper. `blockersForPart` exists precisely because the rail's "needs attention" says nothing. | `readiness.ts:548`, `:558-565`, `:566-577`, `:580-584` | B must place all four when the drawer is shut, or say which it drops. | new |
| ED-43 | P2 | medium | (B) | B keeps today's rail + editor "essentially unchanged" at 480px, against today's 260 + 524. The rate card's `[minmax(0,1fr)_140px]` leaves the role name ~200px inside the drawer. | `directions.md` B; `part-editor.tsx:395` | Show *Principal / Designer / Assistant* at 480 before claiming the shape survives. | new |
| ED-44 | P1 | medium | (B) | Every edit becomes open → edit → close, and at 390 the paper is invisible while the drawer is open — today's ED-28 restated as a feature. Against "you won't notice Patina". | `directions.md` B, 390 schematic; `VISION.md:50` | If B is built, it must show the 13-step mode-switch count beside D's. | new |
| ED-45 | P2 | high | (D) | D's per-part read-only render needs an export `agreement-parts-body.tsx` does not currently have; R27/R51 forbid a fork, so this is D's one real precondition. | `.../commercial/agreement-parts-body.tsx`; R27, R51 | Add a per-part export from the same file; the specimen must render through it. | new |
| ED-46 | P2 | medium | (D) | A marginal note is not a consequence sentence; §A6 requires that sentence directly above the terminal act, so the fee-floor note and the send's sentence are two distinct objects. | `SPEC.md:379-395`; `directions.md` D | D must show both, in the same plate. | new |
| ED-47 | P3 | medium | (D) | D is the only direction that retires the 640px sheet rather than widening it — which ED-27 says is the right move. | `directions.md` D; `preview-sheet-1440.png` | Keep the retirement; name the replacement act. | new |
| ED-48 | P2 | medium | editor | The empty-editor sentence reads "Pick a part on the left, or add one" — false below 1180px, where the rail is above, not left. | `agreement-composer.tsx:898-900`; `resting-390.png` | Direction-neutral wording, or no empty state at all. | new |
| ED-49 | P3 | low | composer page | The room always opens with part one selected, so the empty-editor sentence is nearly unreachable and the designer is dropped into *Services* whether or not that is the work. | `agreement-composer.tsx:228`; `resting-390.png`, editor band | Open on the first part that needs attention, or on none. | new |
| ED-50 | P2 | low | return act | `Return to the seven facets` names a vocabulary R7 has retired everywhere else in this room. | `agreement-copy.ts:46`; R7 / R138; `directions.md` shared treatment 3 | **AMENDMENT-ASK:** rename to "Put the parts away" (or similar) and amend R24's label; R24 fixes that the act exists, not what it is called. | touches §6-7 |

**Counts — 50 findings.**

- **P1 · 14** — ED-1, 2, 5, 6, 7, 8, 12, 13, 18, 22, 27, 28, 31, 44 (ED-44 is
  P1 against direction B alone).
- **P2 · 27** — ED-3, 4, 9, 10, 14, 15, 16, 19, 20, 23, 24, 25, 29, 32, 33, 34,
  36, 37, 39, 40, 41, 42, 43, 45, 46, 48, 50.
- **P3 · 9** — ED-11, 17, 21, 26, 30, 35, 38, 47, 49.
- Against §6: **new · 43** · **known · 2** (ED-9, ED-33 — both §6-8) ·
  **touches · 5** (ED-8 and ED-50 → §6-7; ED-14 and ED-16 → §6-8; ED-24 → §6-6).
- One `AMENDMENT-ASK`: **ED-50**, renaming the return act. Nothing else in this
  memo needs a ruling overturned.

---

## 3 · Required artifact — the Retainer, as a state machine, per direction

Fixture part 7. Resting value: unwritten. Target: **$5,000.00**, credited
against the first invoices, design work begins after the fully executed
agreement and retainer payment. The readiness transition to watch: **2 of 9 →
1 of 9 parts need attention**, which fires the moment a retainer amount is
written (`readiness.ts:548-553`).

### Today (the baseline the four are measured against)

```
  RESTING ──────────────────────────────────────────────────────────────────
    Sees: rail row 7, "RETAINER · CREATES AUTHORITY / Retainer / NEEDS
          ATTENTION" (parts-rail.tsx:349-353). The paper in the 320 aside
          is scrolled to Services and does not move.
      │ click the row title  (or Tab ×~19 from the top, then Enter)
      ▼
  SELECTED ─────────────────────────────────────────────────────────────────
    Sees at 1440: the title turns charcoal. Nothing else changes in the rail.
    The middle column swaps to the Retainer editor.
    Sees at 1024 / 390: NOTHING. The editor is ~1,200px below the fold and
    the view does not move (ED-2). Selection is unobservable.
      │ click into "Retainer · dollars"
      ▼
  EDITING ──────────────────────────────────────────────────────────────────
    Sees: a 615px-wide field (at 1024) reading "5000" as it is typed. The
    decimal point cannot survive a keystroke (ED-22). The paper in the aside
    still shows Services. "Saved" flips to "Save agreement"; the save note
    is cleared (agreement-composer.tsx:362).
      │ readiness recomputes on the same keystroke
      ▼
  READY-ISH ────────────────────────────────────────────────────────────────
    Sees: "NEEDS ATTENTION" leaves rail row 7; the count in the aside AND in
    the room bar goes 2 of 9 → 1 of 9 (:703, :1048). No sentence says why
    (§6-2 / W3R3-03). Nothing is announced.
      │ scroll to the header · click "Save agreement"
      ▼
  SAVED ────────────────────────────────────────────────────────────────────
    Sees: the button turns to a filled tan "Saved" (disabled, ED-9), and a
    12px status line "All agreement changes saved."  The editor has been
    UNMOUNTED AND REMOUNTED (new uuid + key={selected.id}) — the caret is
    gone (ED-5). The next keystroke erases the status line. No date, ever.
    Unseen: the Services clause has just been written into
    proposal_service_terms.scope, and "Return to the seven facets" is now a
    door back to facets this save rewrote (ED-8).
```

### A · The paper is the page, edited in place

```
  RESTING
    Sees: on the 760 paper, at the retainer's own printed position, the
    heading "Retainer" and beneath it "Not yet set" (R21's constant). In the
    200 outline: "Retainer / needs attention". In the 208 right margin:
    nothing (rule #9 — a region with nothing to say renders nothing).
      │ click the printed part  ·  or Tab to it  ·  or ↓ from the part above
      ▼
  SELECTED
    Sees: the part takes a left rule at the paper's edge and the outline row
    takes the same rule — one mark, two places. The right margin lights with
    the retainer's structured form (rate-card-class parts edit in the margin,
    prose edits in place — A's fork, ED-41). The paper does not reflow.
      │ Enter, or click the margin's amount field
      ▼
  EDITING
    Sees: the caret in the margin's "Retainer · dollars" field, .t-money,
    showing "$5,000.00" as it is typed. The printed part beside it still
    reads "Not yet set" until the field settles — the paper and the field are
    both on screen, 36px apart. Esc returns to SELECTED.
      │ blur, or Tab out of the margin form
      ▼
  WRITTEN  (the readiness transition)
    Sees: the printed part now reads "$5,000.00 / Credited against the first
    invoices." at its own position. The outline row's "needs attention" goes.
    The count band above the paper reads "1 of 9 need attention · names no
    fee". A status line says "Retainer written. 1 of 9 parts still need
    attention." Focus stays in the margin.
      │ automatic, on blur (A's save model: save-on-blur, per part)
      ▼
  SAVED
    Sees: in the margin's record slot, "Saved 10 September 2026 · 4:12 PM",
    replacing the act (§A5 taken). No button. Nothing remounts, because the
    save is scoped to one part. The seam below the part still offers
    "+ Add a part"; Tab reaches it.
```

*A's risk at this part:* the money form lives in the margin at 1440 and
full-width beneath the part at 390, so the retainer has two homes and the
designer learns both.

### B · Builder as overlay

```
  RESTING
    Sees: the full-width 720–760 paper. "Retainer / Not yet set" printed in
    place. Above the paper: "Edit the parts · 2 of 9 need attention · names
    no fee". No selection exists — the paper is not selectable.
      │ click "Edit the parts"  (the ONLY door)
      ▼
  DRAWER OPEN → SELECTED
    Sees: a 480 drawer at the left; the paper is pushed right and stays
    visible at 1440. Inside the drawer, today's rail. Focus lands on the
    drawer panel (doc-sheet.tsx:267-269). The retainer is rail row 7 —
    the designer must find it again inside the drawer, having just read it
    on the paper.
    At 390: the paper is GONE. Full-screen sheet, "← Back to the paper".
      │ click the rail row, or ↓ to it
      ▼
  EDITING
    Sees: the drawer's right half — a rail at ~200 and an editor at ~260 —
    holding the retainer amount, activation policy and credit rule. At 480
    the rate-card sibling's [1fr 140px] grid leaves ~200px for a role name
    (ED-43). At 1440 the paper behind updates as the amount is typed —
    B's central proof.
      │ readiness recomputes
      ▼
  WRITTEN
    Sees: the paper behind the drawer prints "$5,000.00". The count is in
    the drawer's head — it has no home on the closed paper unless B invents
    one (ED-42). Nothing announces the transition.
      │ Esc, or "Close"
      ▼
  DRAWER CLOSED → SAVED
    Sees: the paper full-width, the retainer printed. Focus returns to
    "Edit the parts" (doc-sheet.tsx:282-288) — NOT to the retainer, unless B
    seats a per-part door on the paper. The dated record sits above the
    paper, not beside the part it records.
    ⚠ If a save ran while the drawer was open, the trigger's isConnected
      check fails and focus falls back to the panel (ED-6).
```

*B's cost at this part:* two mode switches (open, close) and a re-find inside
the drawer, for one four-digit number.

### C · Two panes, right-sized

```
  RESTING
    Sees, in the 580 accordion: "▸ Retainer   needs attn" — a closed head.
    In the 720 paper beside it: "Retainer / Not yet set". Two objects, two
    columns, no line drawn between them.
      │ click the head, or Enter on it
      ▼
  OPEN (= SELECTED, = EDITING — C fuses all three)
    Sees: the head takes aria-expanded=true and the body unfolds beneath it,
    pushing the seven heads below it down the column. Every other section
    closes (the consumer's one-open, drafting-room.tsx:480 — which today
    cannot close the open one at all, ED-39). The body holds today's
    RetainerEditor at ~540 usable. The paper does not scroll to the retainer.
      │ click into the amount field
      ▼
  EDITING
    Sees: "$5,000.00" in the field. The paper beside it prints "$5,000.00"
    at the retainer's position — visible only if the designer has scrolled
    the right column there independently. The two columns do not track.
      │ readiness recomputes
      ▼
  WRITTEN
    Sees: "needs attn" leaves the head. The count at the head of the left
    column goes 2 of 9 → 1 of 9. The head's own status word changes.
      │ click the next head, or Save
      ▼
  SAVED / CLOSED
    Sees: the body stays MOUNTED behind hidden/inert (facet-section.tsx:50)
    — the transient text of a half-typed amount survives, which is C's one
    genuine advance on today (ED-38). Focus is not managed on close (ED-39):
    it must be returned to the head.
    The dated record sits at the head of the column, not at the part.
```

*C's cost at this part:* the paper is still a second place, and the retainer's
printed form and its field never share a horizontal line.

### D · The galley — proof above, pencil beneath

```
  RESTING
    Sees, at its own position in the 720 galley, the real body component's
    read-only render of part 7: "Retainer" and, beneath it, "Not yet set"
    (R21). At the right of the part head, a fold caret "▸". In the 240
    outline: "Retainer / needs attn". In the 240 right margin, beside this
    seam: nothing yet.
      │ click the part head, ▸, or Enter on the focused head; ↑ ↓ walk heads
      ▼
  SELECTED
    Sees: the head takes a rule and the outline row takes the same rule.
    The caret is still ▸. The part is the reading position; nothing has
    moved. This state is skippable — Enter goes straight to EDITING.
      │ Enter  (or a second click)
      ▼
  EDITING  (unfolded)
    Sees: ▸ becomes ▾ and the retainer's existing editor unfolds DIRECTLY
    BENEATH its own printed form — "Retainer / Not yet set" stays on screen,
    above the field, unchanged. The parts above it do not move (D's crux).
    Focus lands in "Retainer · dollars", .t-money, showing "$5,000.00" as it
    is typed. Exactly one part is unfolded; opening another folds this one,
    and the body stays mounted (facet-section.tsx:50) so a half-typed amount
    survives. Esc folds and returns focus to the head.
      │ readiness recomputes on the keystroke that completes the amount
      ▼
  WRITTEN  (the readiness transition)
    Sees, in this order, all on one screen:
      · the printed form above the field changes from "Not yet set" to
        "$5,000.00 / Credited against the first invoices. / Design work
        begins after the fully executed agreement and retainer payment."
      · "needs attn" leaves the outline row.
      · the room bar's count goes "2 of 9 need attention" → "1 of 9".
      · the right margin, beside this seam, prints the sentence that
        explains the move — and, beside the Role rates seam above,
        still carries "This agreement names no fee. Add a rate card, a
        flat fee, or a per-phase fee."
      · a role="status" line says "Retainer written. 1 of 9 parts still
        need attention."
      │ blur the field  (D's save model: save on blur, per part)
      ▼
  SAVED
    Sees: beneath the unfolded editor, in the slot the act would have taken,
    "Saved 10 September 2026 · 4:12 PM" (§A5 taken). No Save button anywhere
    on the page. Nothing remounts — the save is scoped to this part, so the
    caret survives if the designer returns to the field.
      │ Esc, or click the head
      ▼
  FOLDED  (back to RESTING, written)
    Sees: ▾ becomes ▸; the editor folds; the printed form remains, now
    reading $5,000.00. Focus returns to the head. The seam below it offers
    "+ Add a part", reachable with one Tab — which is where the Concept fee
    ($2,400.00) would be laid, at the seam, not at the foot of a rail.
```

---

## 4 · Ranking A–D, one sentence each

1. **D · The galley** — the only direction where the part's printed form
   *survives* while you edit it, where selection is the reading position, and
   where the seam that adds a part is the seam where it lands; its one real cost
   is a per-part export from `agreement-parts-body.tsx` (ED-45), which is
   precisely the R27-honouring wrap rather than a fork.
2. **A · Edited in place** — the purest reading of "the document is the page",
   but it takes the printed part away at the moment you edit it and then forks
   the model prose-in-place / money-in-margin (ED-41), and at 390 it collapses
   into D anyway.
3. **C · Two panes** — cheap, honest about being cheap, and it brings the one
   mechanism this room most needs (a mount-preserving unfold, ED-38); but it
   leaves the split between where you type and where it prints exactly where it
   is, and its stated precedent is not this room's (ED-36).
4. **B · Builder as overlay** — it answers Kody's literal question and inherits
   a focus-restoring sheet primitive, but it is the only direction that *adds* a
   mode, the only one where the paper is invisible at 390 while you type
   (ED-44), and readiness has nowhere to stand when the drawer is shut (ED-42).

---

## 5 · What the specimen must show to change my mind

**To move B above C or A.** One plate at 1440, drawer open, showing the
retainer amount `$5,000.00` typed inside a 480 drawer *and* printed on the paper
behind it in the same frame — with the count and the fee-floor sentence both
legible on the closed-drawer plate beside it. If B can seat all four readiness
objects on a closed paper (ED-42) and put a per-part door on the paper so that
closing returns focus to the retainer rather than to "Edit the parts", B stops
being a mode and becomes an editor. I do not think it can, but that plate would
settle it.

**To move A above D.** One plate showing the *Furnishings deposit* seam in its
unwritten state (R21: it prints nothing) with a reachable "+ Add a part" beside
it, and a second plate showing the rate card's three roles edited in the 208
right margin at 1440 without dropping below the 11px floor or truncating
(ED-40, house sheet #2, #4). If A can hold a seam against a part that prints
nothing, its in-place substitution stops being a liability.

**To move D down.** A plate where unfolding the retainer's editor shifts the
reading position of *Ceiling* above it by even one 24px module — or a per-part
render that turns out to require a second copy of `agreement-parts-body.tsx`
rather than an export from it. Either would make D the expensive direction
instead of the correct one.

**Common to all three built specimens.** The Concept fee, $2,400.00, added at a
seam and landing at that seam — never at the foot of a list — with the keyboard
alone, and a `role="status"` line naming where it landed. And one plate of the
retainer field mid-keystroke showing `$5,000.05` intact (ED-22). If a direction
cannot hold a decimal point, none of the rest of it matters.
