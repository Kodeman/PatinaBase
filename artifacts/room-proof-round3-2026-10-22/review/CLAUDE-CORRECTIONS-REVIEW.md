I read both screenshots and the code you pasted. I didn't run anything. I found no blocking errors. These are the issues that remain:

## Code

**1. Swapping the library reference on an existing line leaves old fields behind**: Medium severity, medium confidence.
- When `libraryFor` is set, `useLibrary` only replaces `maker`, `product`, `finish`, `material` and `lead`.
- The old `color`, `width`, `depth`, `height`, `category` and `notes` stay on the line, so it can end up describing two different products.
- Prices also stay. That fits "Pricing remains separate", but a priced line keeps its old cost with no warning.
- Approval is only reset when it was `'Approved'`. That may be on purpose.

**2. New library lines start at revision 2**: Low severity, high confidence.
- `addLine` sets `revision:1`, then `useLibrary` always runs `x.revision++`.
- So a brand-new line never shows revision 1.

**3. `useLibrary` can crash on a missing line**: Low severity, medium confidence.
- If `J.get(libraryFor)` returns nothing (for example, the line was deleted while the dialog was open), `x.stage` throws an error.
- There's no null check.

**4. Undo puts a deleted record back at the end of the list**: Low severity, high confidence.
- In `restoreUndo`, a restored deleted record is added with `list.push`, not at its old position.
- The finish schedule order can therefore change after undo.

**5. Undo still runs when nothing changed**: Low severity, high confidence.
- If `sealUndo` finds no changes, `ui.undo` still exists.
- Undo would then log "Paste selections undone, 0 records restored" and show a matching toast.
- In the paste flow you showed, this is unlikely.

**6. The Living room is never highlighted in the overview**: Low severity, high confidence.
- `room-current` is only set on the other rooms' rows. The Living room panel at the top never gets it.
- So returning from Living room highlights nothing. That may be fine if only "other" rooms need the highlight.

**7. Dead code and a grammar slip in the overview**: Low severity, high confidence.
- Because `r` is hardcoded to `'living'`, the `bedroom` image branch and the alternate alt text never run.
- `${lines.length} working lines` reads "1 working lines" when there's one line.

## Screenshots

**8. The skip link is showing in the phone capture**: Low–medium severity, high confidence.
- "Skip to the job" is visible with its focus outline and covers "Lake Mendota House" ("ake Mendota / ouse" is all that shows).
- Either the frame took focus when it loaded, or the link stays visible. Either way, the final capture shows the header covered.

**9. Faint text shows through the header**: Low severity, medium confidence.
- Desktop: at the top left, faint text reads roughly "▸ Unfold the lines and generator…" behind/over the header bar.
- Phone: similar faint text appears near the top of the frame.
- Likely cause is a see-through sticky header with scrolled content underneath. I can't confirm the cause from a static image.

**10. The reset toast covers table data**: Low severity, high confidence.
- In the desktop capture, "Fictional sample reset. Founder notes preserved." hides LR-06's unit cost, markup and margin cells.
- You may want to retake the shot after the toast clears.

**11. Number formatting is inconsistent**: Low severity, high confidence.
- The trade subtotal shows `$62,462` with no cents, while the client subtotal and other totals show cents (`$84,323.70`).
- LR-05 (released) shows markup as `35.0%`; the editable rows show `35.0` with no percent sign.

## Checked and consistent
- **Totals:** 62,462 × 1.35 = 84,323.70. Tax at 5.5% = 4,637.80, total 88,961.50, margin 25.9%.
- **Phone layout:** pricing shows as cards, and the totals are collapsed into a summary.
- **Back button:** the click handler replaces the reading URL with the selected room before pushing the new entry, and `popstate` keeps `ui.room` when closing. Going Back should return to the selected room.
- **Undo after paste:** it only touches lines and finishes, takes its "before" copy before any rows are added, and seals on the first save.
