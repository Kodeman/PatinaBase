# Adversarial review (SQ-390) and fix log

**Reviewer:** an independent Opus executor that did not write the deck. Read-only review at main `4207b8e2d`.
**Result:** 4 major, 9 minor and 3 nit findings. All 11 priority code claims held, except where noted below.
- The checklist tallies recount correctly: 2/13/33 and 139/348.
- "Six of eight lanes unmodeled" holds.
- The next free migration is 00690.
- Deck checks pass: 1.09 MB, title present, dark tokens correct, no box-shadow, every requested state defined.

## Findings → fixes

| # | Sev | Finding | Fix applied |
|---|---|---|---|
| 1 | major | The deck says "residential" where it means "no agreement behind it". Executing a furnishings authorization writes `approved` (00425:723, 00475:1123, 00511, 00578). | Reworded everywhere to "a job with no agreement behind it". The direction now names every `approved` writer. |
| 2 | major | C-07 is under-scoped. `assign_po_number` is owner-scoped (00188:127-136) and runs as the sender. | C-07 now also widens `assign_po_number`. Size S → M, in both direction.md and the deck matrix. |
| 3 | major | The Phase 0/1 week totals fall below the sum of their own item sizes. | Phase 0 is now ~8–10 eng-weeks and Phase 1 ~12–16, in direction §8 and the roadmap slide. |
| 4 | major | C-02 refuse-send ships in Phase 0 before R-PB3 is ruled. | Phase 0 now warns on a missing ship-to. Refuse-send waits on R-PB3. Updated the direction §2 #6 call, C-02, the deck matrix and pin 17. |
| 5 | minor | B4 cited only 00162, but 00403:373 added `project_id`. | Evidence corrected. The item stays missing: there is no line link and no returned-quote record. |
| 6 | minor | Pin 27 named R3/R4 for the margin-vs-markup basis. Those rulings are the Blend and rounding. | Pin 27 now names R2, the entry frame. |
| 7 | minor | "V1 forbids" overstates an open ruling. | Changed to "V1 is open, so no Patina cut is shown until it is ruled". |
| 8 | minor | R9 "warn, never block" was treated as settled. | Now marked as R9's draft posture, pending Leah. |
| 9 | minor | The step-review replica had the wrong header and an invented item list. Pin 8 understated what the copy text contains. | The header now matches `index.tsx:760-780`: "Order Assistant · vendor", "N items · $ total", project, step. Item list removed. Pin 8 now lists what the copy text does and doesn't carry (`step-review.tsx:33-55`). |
| 10 | minor | "Another studio's address" is wrong: Middlewest is Leah's own studio. | Now reads "the same hardcoded address, 'Middlewest Studio · Madison WI' (Leah's own studio), for every studio". |
| 11 | minor | The ETA write is certain to fail, for the owner too. | Hedge removed: "fails for everyone, owner included". |
| 12 | minor | The PDF prints configured lines from the snapshot. | Blank-SKU claims are now scoped to unconfigured lines. |
| 13 | minor | There are 9 external source links (`<a class=cite>`) in addition to the fonts. | Kept on purpose. They are citation hyperlinks, not loaded resources. |
| 14 | nit | The PO number format is PO-1047. | `PO 10xx` → `PO-10xx` across all specimens and the deck. |
| 15 | nit | build.mjs wrote the file before checking its size. | The size check now runs before the write. |
| 16 | nit | §2 #10 cited 00697 for `studio_vendor_accounts`, but §7 says 00696. | Aligned to 00696. |

Rebuild: `node deck/build.mjs` exit 0, 1,146,596 bytes. All three specimens end with `<!-- specimen-complete -->`, with 0 `box-shadow` matches.
