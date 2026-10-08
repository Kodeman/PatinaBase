# DECK.md: Building a Job's Pieces (US-20, SQ-597)

The founder deck for US-20. This file is the sheet-by-sheet contract that `src/index.html` implements.

## 0. Build and gates

- **Source:** `deck/src/index.html`.
  - It starts with `<title>` and carries no doctype, html, head or body tags.
  - It has one `<style>` and one `<script>`, both ASCII only.
  - The markup is readable UTF-8. The build turns every non-ASCII character in it into a numeric reference.
- **Build:** `node deck/build.mjs` (run from the US-20 artifact root) writes `deck/index.html`, one self-contained file.
  - `{{WALK:<file>.jpg}}` becomes a base64 data URI read from `walk/`.
  - `{{SPECIMEN_<X>_<W>}}` becomes the escaped specimen in an iframe `srcdoc`, with a bootstrap that:
    - turns the iframe's `name="frame-…"` into `#frame-…&nobar`, so the specimen shows one frame and its "What changed" notes;
    - posts the content height to the deck.
- **Build failures:**
  - a specimen whose last non-empty line is not `<!-- SPECIMEN COMPLETE -->`;
  - a token count other than the one below;
  - an iframe naming a frame its specimen lacks;
  - a missing walk file;
  - non-ASCII in script or style;
  - any `{{…}}` token left over;
  - output over 16 MB.
- **Specimen gate:** `node specimens/check.mjs` checks each of the six specimens:
  - it exists;
  - it ends with the sentinel;
  - it carries every frame id in the SPEC.md section 1 table.
- **Pinned verifier:** `node specimens/check.mjs && node deck/build.mjs`.
- **Token budget:**

  | Token | Uses | Frames |
  |---|---|---|
  | `SPECIMEN_A_1440` | 11 | a1–a11 |
  | `SPECIMEN_A_390` | 8 | a12–a15 on sheet 16, and again as the narrow-only twins of a1, a2, a4 and a8 (sheets 10, 11, 13, 15) |
  | `SPECIMEN_B_1440` | 3 | b2, b3, b7 |
  | `SPECIMEN_B_390` | 1 | b13 |
  | `SPECIMEN_C_1440` | 3 | c2, c3, c9 |
  | `SPECIMEN_C_390` | 1 | c13 |

## 1. Shell

- **Stock:** the SPEC.md section 2.1 tokens, pasted byte for byte, light and dark. Dark comes from `prefers-color-scheme` and from `:root[data-theme]`.
  - Every sheet is on the white drafting stock (`--sheet`).
  - Sheet 02 alone is on the beige reading stock (`--paper`). "Beige is reading, white is working."
- **Standing head:** each sheet has a `.shead` band holding:
  - the running number (`NN / 26`);
  - the chapter (1–12);
  - the source it rests on.

  It echoes the Build room's head, so the deck itself answers "where am I".
- **Keys:**
  - ↓, PgDn and Space step down, within a tall sheet first.
  - ↑ and PgUp step up.
  - → and j go to the next sheet; ← and k to the previous one.
  - Home and End go to the first and last sheet.
  - Keys stay with any focused control, iframe or scrolling box.
- **Pager:** a fixed pager (↑ ↓ and "NN / 26 · label") on desktop, in its own 50px strip under the deck (`--pager-h`), so it never covers a sheet; hidden at 760px and below, where the strip collapses to 0.
- **Deep links:** `#s-<id>` deep-links are held while frames above them settle, until the reader scrolls, taps or presses a key. After that, any frame height change or resize keeps the reader at the same point of the same sheet.
- **Narrow frames:** at 760px and below, a1, a2, a4, a8, b2 and c2 give way to their 390 twins (`wide-only` / `narrow-only`); every other desktop frame carries a "desktop frame" note.
- **Snapping:** `scroll-snap-type: y proximity`. Sheets taller than the viewport get `.tall` and stop snapping.
- **Phone layout:** no horizontal scroll at 390.
  - Tables marked `.stackable` stack into labelled rows.
  - Specimen frames scale to the column.
  - SVG diagrams scale by viewBox.
- **Accessibility:**
  - a skip link;
  - headings take focus on paging;
  - every walk image and SVG has alt text or title/desc;
  - the coverage marks carry a word in every cell;
  - reduced-motion and forced-colors rules.

## 2. Sheets

| # | id | Chapter | Content | Sources |
|---|---|---|---|---|
| 01 | `s-ask` | 1 The ask | Title, date, reviewers; Kody's ask as quoted in BRIEF; the answer in three lines (Build room · floor first · twelve fixes); S1–S8 | BRIEF.md, direction.md §1 |
| 02 | `s-quotes` | 2 Leah, in her own words | Three columns of verbatim quotes: how she works · where it broke · what she asked for, each with its TRANSCRIPT line | TRANSCRIPT.md :11 :18 :33 :39 :41 :49 :55 :57 :59 :61 |
| 03 | `s-walk` | 3 Today, walked | Step table 1–12 + 390 with verdicts and counts (3/3/2/2 clicks, 954/937/923/944 ms); honesty line, 8 of 12 trustworthy; two screenshots (sheet open, after four lines) | WALK.md |
| 04 | `s-walk-2` | 3 Today, walked | Gallery: steps 3, 7, 5, 4, 8, plus the full project in a scroll box; R3 quote | walk/*.jpg, r3-sol.md R3-2 |
| 05 | `s-diagnosis` | 4 The diagnosis | Leah :57; the thesis "right about the second half, wrong about the first"; three paragraphs; hero 30+; action-count bar chart (1, 2, 3, 3, 8, 11, 13, 17; one series, highlight on the sheet she likes) | current-state.md §3, direction.md §1 |
| 06 | `s-line-life` | 4 The diagnosis | SVG line life: today (status chain + five axes, the stamp reads only status → SPECIFIED) vs proposed (PLACEHOLDER → ROUGHED → SPECCED → READY → RELEASED → goods words; lens vs stage) | current-state.md §2, direction.md §2, D1 |
| 07 | `s-built` | 5 Built underneath | R1 and R2 quotes; table of ten built-but-unused RPCs, hooks and columns; the four asks with nothing under them | current-state.md §1–2, R1 F30, R2 F2 |
| 08 | `s-directions` | 6 Three directions | A/B/C cards (A marked Recommended); coverage matrix S1–S8 plus a job-wide pass row | direction.md §3 |
| 09 | `s-a-idea` | 6 A | The Build room idea; the modes table (overview, head, four lenses) | direction.md §3 A |
| 10 | `s-a-overview` | 6 A | today step2-after-4 + notes; frame a1 | |
| 11 | `s-a-rough` | 6 A | today step2-sheet-open + notes; frame a2 | |
| 12 | `s-a-where` | 6 A | frame a3 (Release lens, whole job) | |
| 13 | `s-a-spec` | 6 A | today step4b + notes; frame a4. today project-full + notes; frame a5 | |
| 14 | `s-a-fill` | 6 A | today step8a + notes; frame a6. today step7a + notes; frame a7 | |
| 15 | `s-a-remove` | 6 A | today step5b + notes; frames a8, a9, a10 | |
| 16 | `s-a-phone` | 6 A | frame a11 (Finishes); today pieces-list-390 beside frames a12–a15 | |
| 17 | `s-a-cost` | 6 A | S1–S8 answers; cost (Large, slice durations); risks; canon it breaks | direction.md §3 A |
| 18 | `s-b` | 6 B | Idea, S/cost/risks/canon; frames b2, b3, b7, b13 | direction.md §3 B |
| 19 | `s-c` | 6 C | Idea, S/cost/risks/canon; frames c2, c3, c9, c13 | direction.md §3 C |
| 20 | `s-course` | 7 Recommended course | Floor → room; three steps; why A over B and C; what stays as she likes it | direction.md §1, §5, A14 |
| 21 | `s-fixnow` | 7 Fix-now track | The twelve items with code citations, plus "do not wire DeleteProductDialog" | direction.md §4 |
| 22 | `s-delta` | 8 Data-model delta | SVG placement model (four rows today → one line, four placements, quantity = sum, primary kept); D1–D17 table | direction.md §3.4 |
| 23 | `s-slices` | 9 Slices | Slices 0–5 with size, contents and rulings needed; why this order; acceptance | direction.md §5 |
| 24 | `s-questions` | 10 Founder questions | Q1–Q15 cards with the recommended answer; Q1–Q4 marked "decide first" | direction.md §6 |
| 25 | `s-leah` | 11 Asks for Leah | Nine asks with what and why | direction.md §7 |
| 26 | `s-made` | 12 Team and provenance | Seats, models, tickets SQ-587 … SQ-598; the two single-shot gateway seats (R3, adversarial) and why; the evidence boundary | orchestrator brief |

## 3. Cut, and why

- **B and C frames not shown:**
  - B: b1, b4–b6, b8–b11, b12, b14, b15.
  - C: c1, c4–c8, c10, c11, c12, c14, c15.

  Direction A gets the room. B and C each show their rough in, where am I, and one distinctive state, plus one phone frame. Every frame stays in its specimen file.
- **Walk screenshots not inlined:**
  - step1-pieces, step1-project, step4a/c/d, step5a, step6a/b, step7b, step8b, step9a/b, step10a, step11a.

  They are cited by name on sheet 03. `step6b` (1440×7547) is replaced by `project-1440-full`, which shows the same four rows.
- **The R1/R2/R3 finding tables** are cited by id (F2, F30, R3-2, A14), not reproduced.

## 4. Voice

- Leah's words are quoted, never paraphrased into her mouth.
- Every figure carries its source.
- Banned words: "AI", "algorithm", "engine", "powered by", "curated", "luxury", "bespoke", "elevated", "disrupt", "seamless", "unlock", "empower", "Pledge", and the tagline.
- No box-shadow, no text-overflow, no emoji.
