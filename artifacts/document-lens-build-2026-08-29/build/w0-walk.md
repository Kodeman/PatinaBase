# W0 walk — baseline for Wave 1

Shot with `build/w0-walk.mjs` against the dev server left running by W0-L3
(`http://localhost:3000`, main checkout, `NEXT_PUBLIC_FLAG_OVERRIDES` per
`build/e2e-baseline.md`), after the W0 seed (`scripts/the-document-lens-seed.sql`,
fixed and re-verified this wave) was applied to the local Supabase stack.
Signed in as `designer@patina.dev` via the same UI flow as `e2e/fixtures/auth.ts`;
`help-system.welcome-shown.first-project-walkthrough` pre-set; TanStack Query
devtools toggle hidden (`hideDevOverlays`, same technique as
`e2e/helpers/hide-dev-overlays.ts`). No render errors, no console errors other
than benign `net::ERR_NAME_NOT_RESOLVED` lines (external font/analytics host
lookups in the sandboxed dev environment — cosmetic, not app failures).

10 screenshots in `build/w0-walk/`.

## `/doc/…d5` — Aspen Loft, "the long paper"

### 1440×900

- **s0 (top)** — `w0-1440-s0-project.png`. Letterhead ("Aspen Loft — the
  long paper", "for Client User", Procurement · START Jun 10 · TARGET Oct
  24). The job ticket (8 rows, unfolded: Rooms, Pieces, Drawings, Spec,
  Boards, Money, Dates, People) confirms **5 rooms · 62 lines**, "58 of 62
  specified", "$17,500 owed you, 7 days". Below it, "Needs attention · in
  one place" lists 4 items including "1 piece delivered — awaiting
  inspection" (the damage/inspection thread) and "2 decisions overdue —
  oldest due Aug 23" (the **overdue approvals**). The right margin rail
  shows 2 `DECISION · OVERDUE` cards (Primary bedroom rug/nightstands,
  Living room reading-chair COM) + 1 `MONEY · SENT` card + "SETTLED · 4" —
  **7 margin items total**, matching the seed's margin-item count.
- **s2 (FF&E scrolled to top)** — `w0-1440-s2-project.png`. The Pieces
  region head ("THE JOB · PROJECT · PROCUREMENT & ORDERS 3 OF 5"), then
  "Primary Bedroom" room head ("6 OF 14 underway") with FF&E lines (Bed
  Frame, Nightstand, Dresser, Area Rug, Reading Chair, Bench, Table Lamp)
  each showing a thumbnail, vendor ("Studio Sourced"), status chip
  (QUOTED/APPROVED/IN TRANSIT/INSTALLED/SPECIFIED), and price — confirms the
  **62 FF&E lines with product-linked rows** render with full status/price
  detail.
- **s3 (foot)** — `w0-1440-s3-project.png`. Lands on the Money/authorization
  region's tail ("No authorizations recorded yet", "Draft a trade scope"),
  then "The accounts · this project" ($184,500 budget · $96,803 committed,
  studio-eyes-only), "Closing the book · 0 of 6 closed out", and the
  colophon-adjacent "Leah Hartwell · hands on the work: you" row. This is
  the deepest point `window.scrollTo(0, document.body.scrollHeight)` reaches
  — confirms the long paper's tail sections (accounts, closing-the-book)
  render, though it stops short of a distinct `doc-colophon.tsx` credit line
  if one prints past this point (not independently confirmed).

**Distinct rail text labels at 1440/s0**: the left "ON THIS PAPER" running
index lists **4** distinct section labels — **Client approvals, Schedule,
Pieces, Money** (each with its own subtext: "0 in the log", "Week 11", "62
pieces · 5 rooms", "$17,500 owed"). This is the count Wave 1 ("the rail
earns its column") should diff against once the rail's own column lands.
(If "rail" is meant to include the standing utility rows above/below the
nav list — "Project / Active · Week 11" and the "In hand" timer widget —
note those separately: they are not navigable section entries, so excluded
from the 4.)

### 1280×900

- **s0** — `w0-1280-s0-project.png`. Same content as 1440/s0. The spine
  compacts to a narrow icon column with word-wrapped labels ("Project
  ACTIVE · WEEK 11", "In hand", "<1m"), and the always-visible margin rail
  is replaced by an on-demand "MARGIN ←" tab pinned top-right — matches
  `quiet-responsive-shell.spec.ts`'s documented 1280 behavior ("uses the
  compact spine and an on-demand margin"). One visual snag: the bottom
  utility bar's "IN HAND TODAY 31 min" text overlaps the "Find anything ⌘K"
  search field at this width — pre-existing (not touched by this wave;
  `components/document/**` is frozen) but worth flagging for whoever owns
  that region next.
- **s2** — `w0-1280-s2-project.png`. Same FF&E content as 1440/s2. One row
  ("Reading Chair") renders with a shaded background and underlined title —
  looks like a lingering hover/focus style rather than seeded data; harmless
  for this walk (no click was issued), but noted in case it recurs.
- **s3** — `w0-1280-s3-project.png`. Same foot content as 1440/s3.

### 390×844

- **s0** — `w0-390-s0-project.png`. Letterhead and "Needs attention" render,
  but the **title clips** ("Aspen Loft — the lo…") rather than wrapping —
  pre-existing at this width, out of this wave's scope (frozen path). The
  job ticket's 8 rows are folded/hidden behind "UNFOLD" at this width (not
  forced open by this walk). Mobile bottom bar shows "IN THIS DOCUMENT ·
  Project" + primary action "INSPECT THE DELIVERY" + "MORE".
- **s2** — `w0-390-s2-project.png`. FF&E lines stack full-width with
  thumbnail, name, status chip, price (Wall Mirror, Bar Cabinet, Table
  Runner Set, Wine Rack, Buffet Lamp, Wall Sconce, Centerpiece Bowl, then
  "Primary Bedroom" room head) — confirms multi-room FF&E renders cleanly at
  this width.
- **s3** — `w0-390-s3-project.png`. Same foot content, single-column.

## `/doc/…d6` — pre-work doc

- **1440×900, s0** — `w0-1440-s0-prework.png`. "Aspen Loft — Guest Wing",
  "Proposal · AWAITING SIGNATURE", "$9,400 proposed". The pre-project ticket
  correctly shows the **empty pre-work state** ("No rooms yet", "No pieces
  yet", "Nothing filed", "Nothing specified yet", "No boards yet", "Nothing
  moving yet", "No dates yet", "No roster yet") — confirming d6 is a
  proposal-stage document with no FF&E schedule yet, distinct from d5. Below
  it: "Sent Aug 23 — not yet opened" / "Something on this job needs a
  decision" / "Client signature blocks Project activation" — matches the
  seed's "pre-work doc exists (sent, unopened)" check. No left-rail "ON THIS
  PAPER" nav list here (proposal stage has no sections yet) — only "Proposal
  / AWAITING SIGNATURE".

## Summary

All claimed seed content is visually confirmed: 5 rooms / 62 lines, the
8-row job ticket, the overdue approvals (2, surfaced both in "Needs
attention" and as margin cards), 7 margin items, and multi-room FF&E lines
with vendor/status/price. The damaged-piece thread shows as "1 piece
delivered — awaiting inspection" rather than a literal "damaged" stamp
visible in these particular states — not independently confirmed as a
distinct visual stamp component in this walk's screenshots (would need a
scroll to the specific line or the Console thread to see it rendered). No
render errors on any of the 10 captures.
