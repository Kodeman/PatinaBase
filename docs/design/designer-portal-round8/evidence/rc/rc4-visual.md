# RC-4: visual evaluation against Room Proof 08, with phone parity

Ticket SQ-2237 (US-52 W6, WP-11). Run 2026-10-28 on `redesign/designer-portal-round8` at `5a0acd0e4`. Read-only: no file edits outside this folder, no DB writes, no fixture applied.

**Verdict: NOT visually matched. 2 high, 4 medium, 3 low defects; 1 surface not evaluated.** No horizontal page overflow at any width.

## How it was run

- **Renderer.** The preview checkout `/Users/kody/Code/patina-round8-preview` was moved (detached, read-only) to `5a0acd0e4`. Designer dev server on 3300 (`NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`, `designer-paper-round8:true` in process-env `NEXT_PUBLIC_FLAG_OVERRIDES`), pointed at local 54321 only. Signed in as the seeded local dev "Designer User" (Leah Hartwell workspace).
- **Reference.** The frozen `artifacts/room-proof-round8-2026-10-23/` served unchanged on 4178.
- **Widths.** Playwright Chromium at 1440, 1180, 768 and 390 (DPR 1). The Chrome window cannot go below roughly 1440 here, so the sweep used Playwright. Host `rc4.localhost` keeps this session's cookies apart from other agents on `localhost`.
- **Pairs.** `evidence/rc/visual/<surface>-<width>.jpg`: portal on the left, reference on the right, 20 files (studio top, studio jobs register, job cover, FF&E, closeout, at 4 widths). Raw PNGs and `audit.json` stay in the board verification dir `SQ-2237/shots`.
- **Data.** The local data has no F01 fixture, so the job paper was read on the seeded "Aspen Loft — the long paper" (62 FF&E lines, 5 rooms) and, for the sparse case, "Chen Residence". It is not the Lake Mendota specimen, so content differences below are tagged data when they follow from missing records, not renderer.
- **Measured (all four widths).** Root font 18px. Page `scrollWidth` equals viewport at every width on the studio, the job and the reference.

## Per-surface verdict

| Surface | 1440 / 1180 | 768 | 390 | Verdict |
|---|---|---|---|---|
| Studio masthead, commission spread | Wordmark, workspace line, nav and find match. Hero is a flat beige tile with the job name in serif, where the reference has a photograph. No "Studio" active tab. No "studio, in hand." headline or intro. | same | Primary nav (Library, People, Studio books, Correspondence) is gone from the header; only Hours / Help / Find remain. | Acceptable deviation for the photo (data: no cover image); **defect D5** for headline and nav |
| Jobs register | Row, initial plate, alert, stage columns present. | Matches | Matches | Matches |
| Next conversation | Present only as the empty "No inquiries waiting" state. | | | Data; not comparable |
| Job paper cover | Reference leads with kicker, serif title, italic tagline, three facts, then a photograph. Portal shows a title, a coloured rule stack, "for the client", mono START / TARGET fields and an empty-cover prompt card. | Card reflows full width | Stacks cleanly, no clip | **Defect D3** |
| Chapters 01–10 and contents margin | Margin lists only mounted chapters (01, 02, 04, 05, 06, 08, 09), as the contract requires; mono-caps status lines replace the reference's sentence-case descriptions. | Margin collapses to "SECTIONS" bar | "MORE" bar | Acceptable for missing 03 / 07 / 10 (conditional chapters); **defect D4** for caps |
| Schedule chapter | Mono-caps tags, boxed "ANCHORED · 17 AUGUST" chips and a timeline rail: legacy typography, not the sentence-case Inter of the reference. | Same | Row text is clipped at the right edge ("DUE 23 OCTOBE") | **Defect D6** |
| FF&E and purchase lens | Pieces & purchasing head, claim line, actions, room totals and per-line "Next: Prepare a PO" present. Room heads show mono "18 LINES · 1 PLACEHOLDER". | Matches | Reflows | Matches in structure; mono caps are D4 |
| Closeout | Legacy "Care · project closeout" tinted panel with a red mono "CLOSEOUT TASKS OUTSTANDING" box. The reference chapter 09 is "Acceptance & handoff" with an acceptance reading and a Service completion reading. | Same | Same | **Defect D2**; acceptance and completion readings not shown (see below) |
| Client `/acceptance` at 390 | Not rendered. | | | **Not evaluated** |

## Defects (worst first)

**D1 (high). A send action overlaps text in the job's next-act band.** On the job paper the Next row reads "PROJECT · ASPEN LOFT — THE LONG PAPER / NEXT OVERDUE 9D · INV-2026-114". The black "Send reminder" button is laid over the end of the first line and hides "PAPER". It reproduces at 1440 and 768 (`job-cover-768.jpg`). At 390 the same button sits in the bottom bar, wraps to two lines ("Send / reminder") and shares the bar with "… MORE". A designer reads the label as part of the sentence and cannot tell the button is the consequence of the invoice, not a header. The label itself, "Send reminder", does keep consequence language.

**D2 (high). The Closeout chapter is not the round-8 Acceptance & handoff chapter.** The chapter is titled "Closeout" and renders the older care panel: a tinted box, mono caps "CARE · PROJECT CLOSEOUT", a red outstanding-tasks list, a "Close out project" button and a portfolio snapshot. There is no acceptance reading and no service completion reading ("Held" / "Final acceptance is still open", in the reference). On this job there is no activated acceptance request, so the absence of the acceptance reading may be correct under SQ-2294; the chapter title, panel style and missing "The job remains open" subtitle are not explained by that. A studio looking for who still has to accept will not find it here.

**D3 (medium). The cover does not read as a cover.** No kicker (type and job number), no "Prepared for", no tagline, no facts line. The title is paired with a vertical gold rule and three decorative bars. The empty-cover card ("The page opens on photographs of the pieces.") is large and sits right of a blank column at 1440 (`job-cover-1440.jpg`). Photograph absence is data; the missing kicker / facts are renderer.

**D4 (medium). The 12px floor is not met on the job paper.** Measured over `[data-paper-renderer]` text nodes (`audit.json`): at 1440 and 1180, 41 nodes at 11px, 6 at 11.5px and 2 at 10.5px; at 768 and 390, 31 at 11px and 3 at 11.5px. Examples: "Issued print history", the "NOV" schedule tick, "Care · project closeout", margin rows "WS-188 · Woodward & Sons" (10.5px), "Link a client first." (11.5px). The studio surface has none below 12px. Most of these are the uppercase mono labels that the token mapping says should rise to `.r8-small`.

**D5 (medium). Studio: headline and primary nav differ from the reference, and nav disappears at 390.** The reference has the heading "The studio, in hand." with an intro paragraph and a "Studio" tab marked current. The portal has a "Good morning, Leah" greeting and no Studio tab. At 390 the four primary rooms are no longer reachable from the header.

**D6 (medium). Clipped schedule row at 390.** In the Procurement & Orders phase the anchored row's "DUE 23 OCTOBER" is cut at the right edge, and the "SELECTION" rows truncate their titles with an ellipsis ("Primary bedroom — rug and…"). A user would read the due date as "23 OCTOBE" and not know the title.

**D7 (low). The sticky studio dock overlaps the page foot.** At 1440 the wordmark "PATINA / PROJECT FILE" at bottom left is partly covered by the "Resource library … Ledgers" dock, and "LEAH HARTW…" is truncated at the right. This belongs to the shell and not to the round-8 renderer.

**D8 (low). A dev overlay shows "2 Issues"** on every job paper load. Not investigated here (console not read); the cause may be dev-only.

**D9 (low). Question, not a verdict.** FF&E head reads "$105,088 priced · $111,603 released": released exceeds priced. This may be correct data; confirm it is not a roll-up error.

## Checks requested

- **Type scale on the 18px root.** Root is 18px at all widths. Studio text is at or above 12px throughout. Job paper fails the floor (D4).
- **Contrast.** Visual only: the muted mono labels (sage on cream, "NOTHING YET", "ANCHORED") and the red "OVERDUE 9D" read acceptably; no ratio was computed.
- **Scoped shadows.** No shadow was observed on the studio or the paper outside round-8 containers. Not measured numerically.
- **Terminal actions keep consequence language.** "Send reminder", "Close out project" and "Add a photograph for the cover" are verbs that state the consequence. "Close out project" does not say that it settles the project's records; consider that, as the reference words it as acceptance.

## Not evaluated

- **Acceptance and completion readings.** Needs an activated request; none exists on the shared local DB (`service_acceptance_requests` has 0 rows). RC-2 owns the live walk. Not mocked in this run.
- **Client `/acceptance` at 390.** The client portal has no dev-account sign-in and no acceptance request exists, so there is no authenticated state to render. From the source, `service-acceptance.tsx` is unstyled structural markup (`font-serif text-3xl` heading, bare `<ul>`), so it is probably not on the round-8 scale; a render is still owed.
- **Lake Mendota (F01) content.** Not applied. RC-3 owns that fixture.
- **Cabinetry CP-01 unfold, purchase lens interactions, the studio "next conversation" with data.** Not exercised (read-only, no interaction).
