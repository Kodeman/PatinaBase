# US-46 plate walk (SQ-1536), local, main 77dc4b0c5

Env: local Supabase only (NEXT_PUBLIC_SUPABASE_URL = 127.0.0.1), designer@patina.dev, project "Aspen Loft Refresh" (/doc/b0000000-...-d1). Dev server run from an isolated clone of 77dc4b0c5 (no next build); stopped afterward. No work acts clicked (Collapse and More were not opened either).
Deck slides 08/10: UNVERIFIED. The artifact is not shared with this executor (Claude Docs read denied, req_011CgEZNeVx4yTyb5ddWwmPZ), so comparisons are against the ticket checklist only.

| Check | 1440 | 768 | 390 |
|---|---|---|---|
| No charcoal band or dock (paper) | pass | pass | pass (dock paper) |
| Exactly one filled shape per view | pass (Chase the approval only) | pass | pass (Chase only) |
| Plate is charcoal not green | pass (rgb 44,41,38 family, ink-dark) | pass | pass |
| Actions left-justified under state sentence | pass (FF&E, Money, Approvals, Schedule: actions x = heading x) | pass | pass |
| Collapse beside the name | pass (same row, ~20px right of heading) | pass | pass |
| No horizontal overflow | 0 | 0 | 0 (scrollWidth 390 = viewport) |
| Visible focus ring on plate | pass: 2px bronze ring (::after, rgb 124,94,48) around the plate, element 44px tall | pass | pass |

## Findings, worst first
1. 390 dock has no plate. The bottom dock shows "Message the client" as an underlined ink link and "... MORE"; the only filled shape is the sticky band act "Chase". If deck slide 10 shows a charcoal plate in the dock, the build does not match; confirm against the deck (not readable here). Seeded project has an overdue-decision band, so the dock act may simply be non-primary in this state.
2. At 390/768 the band act collapses to the short label "Chase" (1440: "Chase the approval") and the 390 band sentence becomes "OVERDUE 6D . DECISIONS". Intentional-looking, but "Chase" alone is less clear out of context.
3. At 1440 and 768 the band act stays pinned (sticky) above the FF&E/Money heads while scrolling, so FF&E and Money head screenshots include the band plate; still one filled shape.
4. Next.js dev "N" indicator overlaps the dock/footer at all widths (dev only, not product).
5. Desk at 1440: no filled shape; all acts are underlined links. Consistent with one-filled-shape.

## Files
shots/doc-{1440,768,390}-{band,approvals-head,schedule-head,ffe-head,money-head,plate-focus,plate-focus-zoom}.jpg, shots/doc-390-dock.jpg, shots/desk-1440.jpg, desk-1440-full.jpg (all sips -Z 1600). Measurements: result.json.
Region head used as "one other": Client approvals (also Project schedule).
