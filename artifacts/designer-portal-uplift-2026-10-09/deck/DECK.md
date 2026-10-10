# DECK.md: Designer Portal Uplift (US-24, SQ-731)

The founder deck for US-24. This file is the sheet-by-sheet contract that `src/index.html` implements. It is adapted from the US-20 deck (`artifacts/pieces-building-room-2026-10-08/deck/`).

## 0. Build and gates

- **Source:** `deck/src/index.html`.
  - It starts with `<title>` and carries no doctype, html, head or body tags.
  - It has one `<style>` and one `<script>`, both ASCII only.
  - The markup is readable UTF-8. The build turns every non-ASCII character in it into a numeric reference.
- **Build:** `node deck/build.mjs` (from the repo root or anywhere; paths resolve from the script) writes `deck/index.html`, one self-contained file. **`deck/index.html` is a build output and is not committed.**
  - `<img src="{{WALK:<file>.jpg}}">` is inlined from `walk/` once per file: the first use carries the base64 data URI, and every later use carries only `data-walk="<file>.jpg"`, which the deck's script fills from the first. A `{{WALK:…}}` token outside an img `src` fails the build.
  - `{{SPECIMEN_<X>_<W>}}` becomes the escaped specimen in an iframe `srcdoc`, with a bootstrap that:
    - turns the iframe's `name="frame-…"` into `#frame-…&nobar&nobefore`, so the specimen shows one frame and its "What changed and why" notes, without its own bar and without its own Today figure (the deck shows Today itself);
    - posts the content height to the deck, which sizes the frame to it.
  - The specimens' `src="../walk/…"` attributes are renamed to `data-walk-src` inside the srcdoc, so a hidden Today figure never fetches a file that does not sit next to the built deck.
- **Build failures:**
  - a missing specimen, or one whose last non-empty line is not `<!-- SPECIMEN COMPLETE -->`;
  - a token count other than the one below;
  - an iframe naming a frame its specimen lacks;
  - a missing walk file;
  - non-ASCII in script or style;
  - the word "AI" in visible copy (script and style stripped);
  - any `{{…}}` token left over;
  - output over 16 MB.
- **Specimen gate:** `node specimens/check.mjs`.
- **Pinned verifier:** `node specimens/check.mjs && node deck/build.mjs && test -s deck/index.html && ! grep -q '{{' deck/index.html` (paths under `artifacts/designer-portal-uplift-2026-10-09/`).
- **Token budget:**

  | Token | Uses | Frames |
  |---|---|---|
  | `SPECIMEN_A_1440` | 4 | a1, a3, a5, a7 |
  | `SPECIMEN_A_390` | 1 | a8 |
  | `SPECIMEN_B_1440` | 7 | b1–b7 |
  | `SPECIMEN_B_390` | 2 | b8, b10 |
  | `SPECIMEN_C_1440` | 3 | c1, c5, c7 |
  | `SPECIMEN_C_390` | 1 | c9 |

  Ten walk screenshots, 21 uses, each screenshot's bytes inlined once.

## 1. Shell

- **Stock:** colour tokens on `:root`; dark mode under `prefers-color-scheme: dark` (guarded by `:root:not([data-theme="light"])`) and under `:root[data-theme="dark"]`. The specimen frames stay light in both, because they are drawings of the light portal.
- **Standing head:** each sheet has a `.shead` band holding the running number (`NN / 27`), the chapter, and the source it rests on.
- **Keys:**
  - ← → (and j / k) move between sheets;
  - ↓ ↑, PgDn / PgUp and Space step down or up within a tall sheet, then to the next sheet;
  - Home and End go to the first and last sheet;
  - keys are left alone while focus sits in something that uses them (a scroller, a frame, a field), and Space is left alone on a button or link.
- **Pager:** a fixed foot with Previous, the counter (`NN / 27 · label`) and Next, visible at every width. Previous is disabled on the first sheet, Next on the last.
- **Scroll:** sheets snap; a sheet taller than the window gets `.tall` and stops snapping so it can be read through. A deep link (`#s-questions`) is held while frames above it settle, until the reader scrolls, taps or presses a key. In-deck links (`See B →`) move the deck.
- **Today screenshots:** every inlined walk screenshot opens full size. The script wraps each in a button (click, Enter or Space) with a small "Click to enlarge" line under it, and one shared `<dialog>` shows the same image at its own size with its alt text and file name. Esc, a click anywhere on it, or Close shuts it, and focus returns to the screenshot. Sheet 4 notes once that the small "N" badge on the screenshots is the development build's indicator.
- **Frames:** each `figure.spec` carries `data-w` (1440 or 390) and `data-h` (updated from the posted height). The frame is drawn at its native width and scaled to its column. At 390 a 1440 frame carries a narrow note: "A 1440 frame, scaled to fit. Open the deck on a wider screen to read it."
- **Print:** light tokens, no pager, one sheet per page. Chrome prints a transformed or zoomed mockup frame blank or offset, and a lazy frame or image that never loaded prints blank, so:
  - every lazy frame and image is switched to eager 1.5 s after load (and again on `beforeprint`);
  - `@page` is `1560px × 1760px` with 20px margins, wide enough for a 1440 frame at full size and tall enough for a whole one; the print dialog's fit-to-page shrinks it to paper;
  - frames print unscaled.
- **Widths:** checked at 1440 × 900 and 390 × 844, with no horizontal scroll at either.

## 2. Sheets

Today = the walk's local studio, Friday 9 October (43 live jobs). Proposed = the illustrative Hartwell Studio fixture, Monday 12 October (16 live jobs), labelled "Illustrative fixture · not a real studio" on every frame. Every Proposed click or second figure is an estimate (est.) from `synthesis/direction.md` §3.

| # | id | Label | Content | Rests on |
|---|---|---|---|---|
| 01 | `s-cover` | Cover | "Calm, and findable." Lede, B recommended, 14 questions; how to read Today / Proposed / est. / keys | US-24 brief |
| 02 | `s-ask` | The ask | Kody's ask, verbatim; scope, directions, mockups; waived (the design canon, with any departure naming the ruling it needs) and not waived (the promise, the words, accessibility, honesty) | US-24 brief §1, §2 |
| 03 | `s-team` | Who reviewed | The panel as a table of seats: role, model family, output; the reviewers worked apart; no real-person quotes | `review/`, SQ-720 to SQ-731 |
| 04 | `s-walk` | What a designer sees today | Walk screenshots: Desk and Document at 1440 and 390; marks at rest | walk §1, §3 |
| 05 | `s-baseline` | The S1–S8 baseline | The eight scenarios with today's verdict and time | walk §3 |
| 06 | `s-found` | What the panel found | Headline findings with ids (A1…, R1-…, R2-…) | direction.md §1, §2 |
| 07 | `s-principle` | The principle | Calm and findable; the marks-at-rest measure | brief §5, walk §1 |
| 08 | `s-directions` | Three directions | One shared need model (N1–N8); A, B, C side by side; B marked Recommended; a key glossing N1–N8, S1-severity and Pulses | direction.md §3 |
| 09 | `s-a` | A · Quiet marks | Concept; what changes per surface; model used | direction.md §3 A |
| 10 | `s-a-desk` | A · The Desk | Today `desk-fold-1440` vs frame a1; Today `desk-fold-390` vs a8 | S1, S7 |
| 11 | `s-a-act` | A · Acting on it | Today `s3-step3…` vs a3; Today `doc-holloway-fold-1440` vs a5 | S3, S6 |
| 12 | `s-a-score` | A · Scores, risks, canon | Today `s8-step1-desk-bottom` vs a7; S1–S8 scores; risks; canon rulings | direction.md §3 A |
| 13 | `s-b` | B · The Day Sheet | Concept; what changes per surface; model used | direction.md §3 B |
| 14 | `s-b-desk` | B · The Desk | Today `desk-fold-1440` vs b1; Today `desk-fold-390` vs b8 | S1, S7 |
| 15 | `s-b-moves` | B · A client moved, a maker went quiet | Today `s2-step5-linden-doc` vs b2; Today `s3-step3…` vs b3 | S2, S3 |
| 16 | `s-b-money` | B · Money | Today `s2-step6-pell-court-doc` vs b4; Today `doc-holloway-fold-390` vs b10 | S4 |
| 17 | `s-b-job` | B · The job and the hire | Today `doc-holloway-fold-1440` vs b5; Today `s5-step1-hire-desk` vs b6 | S6, S5 |
| 18 | `s-b-score` | B · Scores, risks, canon | b7; S1–S8 scores; risks; canon rulings | direction.md §3 B |
| 19 | `s-c` | C · The job workspace | Concept; what changes per surface; model used | direction.md §3 C |
| 20 | `s-c-desk` | C · The Desk as lanes | Today `desk-fold-1440` vs c1 | S1, S7 |
| 21 | `s-c-job` | C · The workspace | Today `doc-holloway-fold-1440` vs c5; Today `s6-step1-holloway-next-band-390` vs c9 | S6 |
| 22 | `s-c-score` | C · Scores, risks, canon | c7; S1–S8 scores; risks; canon rulings | direction.md §3 C |
| 23 | `s-compare` | Side by side | S1–S8 for Today, A, B, C; marks at rest; what to learn; build size; hardest ruling | walk §3, direction.md §3 |
| 24 | `s-rec` | The recommendation | B, why, and the strongest argument against it | direction.md §4 |
| 25 | `s-fixnow` | The fix-now track | The fixes that ship under any direction | direction.md §5 |
| 26 | `s-questions` | Founder questions | Q1–Q14 with recommended answers; Q1–Q4 before anything is built; a note that bracketed codes point to earlier rulings in direction.md §6 | direction.md §6 |
| 27 | `s-next` | Next steps and asks for Leah | Slices; what to ask Leah | direction.md §4, §7 |

## 3. Cut, and why

- **Frames not shown:** a2, a4, a6, a9, a10, a11; b9, b11; c2, c3, c4, c6, c8, c10, c11. B, the recommendation, gets every 1440 frame and two phone frames. A and C each get the Desk landing, the in-job next step and their S8 frame, plus the frames that show where they differ most from B (A's quiet-maker chase; C's workspace on the phone). Every cut frame is still in its specimen, which can be opened on its own.
- **The specimens' own Today figures** are hidden (`&nobefore`), because each deck sheet already pairs the walk screenshot with the proposal.
- **The specimens' frame bars** are hidden (`&nobar`); the deck's pager is the only navigation.

## 4. Voice

- Calm and editorial. Plain sentences, numbers with their unit, ids in brackets.
- Never the word "AI"; the product's intelligence is Designer-Taught Intelligence. The build fails on the word in visible copy.
- No quotes attributed to real people. Simulated seats are labelled as simulations.
- Every number traces to `walk/WALK.md` (Today) or `synthesis/direction.md` (Proposed, marked est.). Nothing is presented as user-tested.
- Hartwell Studio is an illustrative fixture and says so on every frame.
