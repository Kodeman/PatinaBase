# Patina round 3: design review of the in-place FF&E job flow

**Scope.** I reviewed the six assigned files in bounded slices, using 10 tool calls. I have not seen the mockup itself, so these findings check the proposed structure against what the editor can do today.

**Limitations.**
- `spec-fields-pane.tsx` was read for lines 1–120 plus a grep of its field labels. Lines 121–150 were not read.
- The following slices were not read:
  - `price-table.tsx` 121–160
  - `rough-in-table.tsx` 121–160
  - `build-room-shell.tsx` 121–160
  - `release-lens.tsx` 121–160 (a grep was used instead)
  - `finishes-lens.tsx` 121–140
- I did not check source commit `ad9c06405` myself.

## Capability mapping

| Proposed element | What exists today | Fit |
|---|---|---|
| Running index, room scope, return-to-room | The shell keeps lens and room in the URL (`onNavigate`). ←, Esc or browser back returns to `/doc/[id]#pieces-room-<roomId>`. The rail lists rooms with counts. Besides real rooms it has Throughout, "Unassigned to a room", Removed (with its count) and "All project selections". | Strong |
| Five lenses on the same lines | Five lenses exist: Preliminary selections, Specifications, Pricing, Purchasing authorization, Finish schedule. Each one writes only its own fields and says what it does not edit. | Partial (see F1, F2) |
| Paste and keyboard entry | Preliminary selections (`rough-in-table.tsx`) has a paste preview and `/` library search. Keys: Enter adds the next line in the room, Tab moves across, ⌘↓ goes to the next room. Tab at the start of a name groups the line into the one above. Labor follows its piece. Phones get 56px cards. | Strong |
| Specs, COM/labor | The Spec lens has a right pane for one line. Its fields: What we need, Maker, Product, Image, Finish, Material, Color, Dimensions, Exact location, Notes, Rooms, Unit, Lead time, Labor, COM. No money appears there; Pricing owns it. | Strong |
| Pricing math and cost conflict | Pricing shows per-unit cost, markup, margin, unit client price, line total, retail and rough ~. Typing either markup or client price derives the other, and cost never moves. A cost change gets its own resolution row (F5). Approved figures show under figures that changed. Allowances print "Up to" and carry no markup. | Strong |
| Released-line protection | Released lines, lines on an order and Trade Scope lines take no edits; each prints its reason. A gated act is `aria-disabled` with the reason linked, never plain `disabled`. | Strong |
| Client-safe authorization preview | Covered by "Save draft & preview", the cross-room release ceremony and the draft/void handling (F4). | Mismatch (F4) |
| Finish print preview | The Finish schedule is one palette per room (SURFACE · PRODUCT · SHEEN · SWATCH) with a print act. It never touches lines. | Mismatch with "same lines" (F2) |

## Findings

**F1: A lens changes what you can edit, not only which fields show.** Severity: High. Confidence: High.
Each lens sentence names what it hands off to another lens. Spec says "Use Pricing for costs." Release says "Nothing here edits a spec or a price." Finishes says "Nothing here edits a line."

If the mockup simply shows or hides columns on one editable grid, it implies you can edit a price under Specifications. That breaks the editor's write ownership and the Q7 money rule.

Recommendation: keep the shared lines and switch lenses in place, but carry each lens's reading sentence. Also make any field owned by another lens visibly read-only, with a pointer to its lens. Example: Spec shows the dim rough ~ figure with a link to Pricing.

**F2: The Finish schedule is not a lens on the FF&E lines.** Severity: High. Confidence: High.
It reads and writes the room's single `project_palettes` row (00760): surface, product, sheen and swatch, saved whole.

There are two separate "finish" concepts:
- **Line finish:** a text field in the Spec pane.
- **Painter's finish schedule:** the per-room palette.

The proposal says "Five lenses change the fields shown on the same lines". Applied to Finishes, that would put sheen and swatch columns on sofas.

Recommendation: when the Finishes lens is active, swap the line table for the room's surface table and keep the same room scope. Say in the mockup that items are not shown here.

**F3: Purchasing authorization is cross-room, so room scope cannot act as a filter there.** Severity: High. Confidence: Medium-high.
The release table has a ROOM column and groups rows under room headings. READY FOR LEAH is a hand-back per room. The ceremony names the whole release set, labor included, and lists every Selected line it leaves out with the reason.

"Living room, 36 lines" is a correct scope for entry, Spec and Pricing. In Release it would hide part of the set being authorized.

Recommendation: in Release, show every room. The selected room should only anchor and highlight its heading.

**F4: The "local client-safe authorization preview" must not misrepresent the real action.** Severity: High. Confidence: High.
Today, "Save draft & preview" calls `create_furnishings_authorization_from_schedule`, which saves a real draft. The preview is of that saved draft, and sending is a separate act inside the preview sheet. While a draft exists, the lens offers only Preview and "Void authorization draft"; it does not offer a new release. With no client linked, it prints "Link a client to this job before releasing." and nothing is drafted.

Recommendation:
- Label the mockup's preview explicitly as a simulation.
- Show the consequence sentence before the save button.
- Include the draft-exists state, the no-client state and the excluded-lines list.
- Show no Send button, or one marked out of scope.

**F5: Show the cost conflict in its real form.** Severity: Medium. Confidence: High.
Today it is a full-width row under the line: "*Name*: cost changed from $A to $B." Two choices follow, each showing its outcome:
- "Keep client price", followed by the price and the markup that results.
- "Keep markup", followed by the held markup and the client price that results.

Cost is never a choice. If the mockup shows a modal, a warning icon, or a third option like "change cost", it misrepresents the server's resolution (`FfeCostChangeResolution`). The hairline and muted approved figure for changes since approval also need to appear. They are separate from the conflict row.

**F6: The width budget fights "full useful width".** Severity: High. Confidence: Medium.
Pricing has 10 columns. The source notes the table gets about 790px at 1440 with the elevation pane open. A large room image on the left, the job column and a running index in the right margin leave Pricing too little room.

Recommendation: when Pieces unfolds, the room image should recede to a strip or thumbnail, and the index should collapse to a narrow tick rail. Restore both on return. Mock Pricing at 1440 with real column widths, and also at 390, where the editor stacks rows into cards.

**F7: In-place unfolding must keep URL state and the return anchor.** Severity: Medium. Confidence: High.
The current shell routes ←, Esc and back to `#pieces-room-<roomId>`. It does not take Esc while a menu, dialog, toast or a field with text holds it.

An in-place unfold could quietly lose this: back would leave the job, or Esc would collapse in the middle of an edit. The mockup should show the URL and the selected line surviving a lens switch, and Esc collapsing the editor back to the room heading.

**F8: Protection and gating are explained in words.** Severity: Medium. Confidence: High.
Released, on-order and Trade Scope lines print their reason; Pricing shows the server's refusal sentence verbatim. Gated acts are `aria-disabled` with linked reasons. A padlock alone is not enough. Show at least one released line in Pricing (figures printed, not inputs) and one gated menu item with its reason.

**F9: Non-room places and the no-money seat belong in the index.** Severity: Medium. Confidence: High.
- **Index:** it should carry Throughout, Unassigned, Removed (with its count) and All project selections, not only room names. Removed selections are excluded from authorization until they are restored in Preliminary selections.
- **No-money seat:** for a seat that cannot see money, Pricing is absent, not grayed out. One no-money frame would confirm that the five-lens strip shrinks to four.

## Nuances not to lose

- Cost never moves from a pricing edit. Margin and line total only print. Cells commit on blur or Enter, and Esc reverts.
- An allowance is a line-total ceiling with no markup, printed as "Up to".
- Retail is a reference column. Any price above retail is flagged (`aboveRetail`).
- Labor sits under its piece. It is never grouped alone, and it has its own cost and price writers.
- FOR THE CLIENT (Candidate · Selected · Alternate) is a triage write and does not change the line's room. Placeholders print "—".
- READY FOR LEAH records a hand-back and writes nothing else.
- Budget-checkpoint refusals point to the Working budget. They are not fixed in this lens.
- Sending happens only in the preview sheet, never in the ceremony.

## Where we agree, and the change I recommend

**We agree on:**
- One continuous job with chapters, and non-FF&E chapters shown as layout studies.
- Pieces unfolding in place, with no photo-pin navigation.
- Line density sized to tens of lines per room.
- Lens switching on a persistent selection.
- No sends, signing or production actions.

All of this fits what the editor can do.

**Recommended change:** treat the "lenses" as three kinds, not five column sets:
- **Same lines, different editable fields:** Preliminary selections, Specifications, Pricing.
- **Same lines, across all rooms:** Purchasing authorization (F3).
- **A different object in the same room:** Finish schedule (F2).

Alongside that:
- Collapse the image and index when Pieces unfolds (F6).
- Label the authorization preview as a simulation of "Save draft & preview", and include its draft-exists and no-client states (F4).
