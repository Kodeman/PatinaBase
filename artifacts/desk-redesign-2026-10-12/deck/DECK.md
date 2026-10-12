# DECK.md: The Desk, re-envisioned (US-26, SQ-796)

This is the sheet-by-sheet script for the US-26 founder deck. `src/index.html` implements it. The machinery (the build, the pager, the frames and the lightbox) is adapted from the US-24 deck, `artifacts/designer-portal-uplift-2026-10-09/deck/`.

## 0. Build and gates

- **Source:** `deck/src/index.html`.
  - It starts with `<title>` and carries no doctype, html, head or body tags.
  - It has one `<style>` and one `<script>`, both ASCII only.
  - Its markup is readable UTF-8; the build turns each non-ASCII character into a numeric reference.
- **Build:** `node artifacts/desk-redesign-2026-10-12/deck/build.mjs` writes `deck/index.html`, one self-contained file. Paths resolve from the script, so it runs from anywhere.
  - **Screenshots.** `<img src="{{WALK:<file>.jpg|.png}}">` is inlined from `walk/` once per file. The first use carries the base64 data URI, and every later use carries only `data-walk`, which the deck's script fills in.
  - **Specimens.** `{{SPECIMEN_<X>_<W>}}` becomes the escaped specimen in an iframe `srcdoc`, with a bootstrap that does two things:
    - it turns the iframe's `name="frame-…"` into `#frame-…&nobar&nobefore`, so the specimen shows one frame with its pins, without its own bar and without its own pairing line (the deck prints Today itself);
    - it posts the content height to the deck, which sizes the frame to fit.
  - **Marks.** The at-rest captions of a1, b1 and c1 carried the synthesis estimate of marks at rest. The build swaps each for the count measured on the specimen (§2), so the deck never prints two different counts. Each estimate must be found exactly once.
  - **Stops.** The build exits 1, with a named reason, when:
    - an input is missing;
    - a specimen lacks its `<!-- SPECIMEN COMPLETE -->` sentinel;
    - a token count or frame name is wrong;
    - the copy says "AI";
    - the CSS draws a `box-shadow`;
    - a token is left in the output;
    - the output names any http(s) host other than Google Fonts;
    - the output is over 16 MB.
- **Gate (ticket):** the build exits 0, and `grep -cE "https?://" deck/index.html` finds only Google Fonts URLs. The build prints the host tally.
- **Uses per specimen:**
  - each 1440 file is used 6 times: frames x1, x2, x3, x5, x6 and x7;
  - each 390 file is used 5 times: frames x8, x9, x10, x11 and x12.
  - x4 (M7) and x13 (390 dark) stay in the specimens; the deck does not show them.

## 1. Rules for every sheet

- **Paper and ink.** The page uses the reading paper and inks. The specimen frames keep their own paper in both themes. **There are no shadows.** The copy never says "AI".
- **Labels.** Every proposed frame is labelled **Proposed**, and every walk screenshot **Today**. Click and second figures are "est.". Marks at rest for the directions are "measured on the specimen".
- **People.** Leah and Jordan appear by name, or as "the principal" and "the hire". **D5's seats are simulated**, and the deck says so wherever it quotes them.
- **Fixture.** Hartwell Studio is illustrative, not a real studio.
- **Keys.**
  - ← → or j / k move between sheets.
  - ↓ ↑ read down a tall sheet.
  - Home and End go to the first and last sheet.
  - Previous and Next sit in the foot.
- **Widths.**
  - At 390 everything stacks within a 16 px gutter.
  - A 1440 frame scales to fit, with a note to open the deck wider.
  - Tables become labelled stacks.

## 2. Marks at rest, measured (orchestrator addendum 1)

One counter is used for all six frames: `verification/SQ-796/marks.cjs`, Playwright 1.58.2 on headless Chromium. It follows WALK §0's definition:
- **Where it counts:** the first viewport of the frame's Desk (`.desk` inside the frame's canvas, 1440 × 900 or 390 × 844), excluding the dock and the pins.
- **Text:** every element that holds its own text.
- **Controls:** every control.
- **Colour marks:** every element whose own text, fill or drawn border has HSL saturation above 0.25. The paper stocks (lightness above 0.9) are ground and are not counted.
- **Edges:** every element with a drawn border.

`capture.js` is not in the repo, so the counter is an approximation, but it reproduces SQ-793's a1 count exactly (41 · 19 · 13 · 11).

| Frame | Text | Controls | Colour | Edges | Graded colour | Total |
|---|---|---|---|---|---|---|
| Today, 1440 (WALK §3) | 45 | 18 | 9 | 12 | — | 84 |
| **a1**, 1440 | 41 | 19 | 13 | 11 | 1 | 84 |
| **b1**, 1440 | 67 | 20 | 7 | 18 | 6 | 112 |
| **c1**, 1440 | 67 | 25 | 15 | 17 | 1 | 124 |
| Today, 390 (WALK §3) | 25 | 9 | 4 | 8 | — | 46 |
| **a8**, 390 | 29 | 14 | 9 | 6 | 1 | 58 |
| **b8**, 390 | 32 | 14 | 6 | 7 | 5 | 59 |
| **c8**, 390 | 42 | 19 | 9 | 10 | 1 | 80 |

- **Graded** counts every colour mark that says how urgent something is: B's lit tabs and each direction's terracotta overdue clause.
- **What the sheets say.** The measured counts do not change which direction is calmest. A has the fewest marks in total, and B has the fewest colour marks, though most of them grade. The sheets also say plainly that A's colour count at the fold (13) is above the estimate (9) and close to C's (15).
- **direction.md §3** has the measured row and note. The Calm scores stay the synthesis's.

## 3. Sheets

| # | Id | Label | Arc | Content |
|---|---|---|---|---|
| 01 | `s-cover` | Cover | — | Title, one-line thesis, the recommendation, and how to read the deck (Today, Proposed, est., measured, keys) |
| 02 | `s-ask` | Kody's ask | 1 | Kody's words verbatim (BRIEF §1). His screenshot `kody-desk-2026-10-12.png`. His three objections. What is waived and what still binds (BRIEF §6) |
| 03 | `s-today` | The Desk today | 2 | Header crop at 1440 and the header at 390; Leah's fold at 1440. WALK §1a and §1b, then the seven findings, worst first (WALK §5) |
| 04 | `s-moments` | M1–M8 today | 2 | WALK §3: clicks, scroll and est. seconds for every moment at 1440 and 390, and today's marks at rest. Old cards: what they did well and badly (WALK §4) |
| 05 | `s-team` | What the team found | 3 | The six seats (W1, D1–D5), each with its brief and headline finding, D5 marked simulated. Then where they agree, G1–G8 (direction.md §2) |
| 06 | `s-principle` | The principle | 4 | The thesis. Three rules: each thing once; each unit its own edge; colour orients. The split rulings (direction.md §2) |
| 07 | `s-three` | Three directions | 5 | A, B and C side by side in one line each: the card, the tag, the act, the header. A is marked recommended |
| 08 | `s-a` | A · Restored and tightened | 5 | In one line, the card anatomy, the layout at both widths |
| 09 | `s-a-rest` | A · At rest | 5 | Today vs a1 at 1440; Today vs a8 at 390 (M1) |
| 10 | `s-a-act` | A · Acting | 5 | a2 and a3 against Today m4 and Leah's Mine fold; a9 and a10 at 390 (M4, M3) |
| 11 | `s-a-hire` | A · The hire, and 5:50 pm | 5 | a5 / a11 against Jordan's fold (M5); a6 / a12 against Jordan's quiet fold (M8) |
| 12 | `s-a-tag` | A · Tag and header | 5 | The tag system table, the header at both widths, and a7 dark against the dark probe |
| 13 | `s-a-score` | A · Scores | 5 | M1–M8 est. against today; Calm / Operable / Glanceable with the measured marks; data needs, risks, build size |
| 14–19 | `s-b…` | B · The day board | 5 | As 08–13 for B (b1–b3, b5–b12; b2 / b9 show acting inside the card) |
| 20–25 | `s-c…` | C · Studio colours | 5 | As 08–13 for C, with C's six proposed tokens on the tag sheet |
| 26 | `s-compare` | Side by side | 6 | direction.md §3's side-by-side table, plus the measured marks at both widths and the plain sentence on calm |
| 27 | `s-rec` | The recommendation | 7 | A, why, why not B, why not C, and the strongest argument against A |
| 28 | `s-canon` | The canon each reverses | 8 | Every BRIEF §6 item (V18 Q1's five clauses, V18 Q7's two clauses, R143 D3 / D5–D7 and D10, house sheet :1011, :54–57, :592 and :168, and the new-hex rule) by A, B and C, in words |
| 29 | `s-fixnow` | Fix-now | 9 | F1–F8: defect, where, fix, source |
| 30 | `s-slices` | Slices | 10 | Slices 0–4 plus the doc-only slice, and what B and C would change |
| 31 | `s-questions` | Founder questions | 11 | Q1–Q14: each with the question, the recommended answer, what follows if declined, and a ruling field. Q1–Q4 are marked "decide first". The field keeps a draft in this browser only |
| 32 | `s-asks` | What only the studio can tell us | 11 | direction.md §8, the five asks for real studio validation; where the files live |

## 4. Today pairings (SPEC §2.1)

| Proposed frame | Today screenshot |
|---|---|
| x1 | `today-leah-studio-fold-1440.jpg` |
| x2 | `m4-holloway-reminder-1440.jpg` |
| x3 | `today-leah-mine-fold-1440.jpg` |
| x5 | `today-jordan-mine-fold-1440.jpg` |
| x6 | `today-jordan-quiet-fold-1440.jpg` |
| x7 | `today-leah-dark-probe-fold-1440.jpg` |
| x8 | `today-leah-studio-fold-390.jpg` |
| x9 | `m4-holloway-reminder-390.jpg` |
| x10 | `today-leah-mine-fold-390.jpg` |
| x11 | `today-jordan-mine-fold-390.jpg` |
| x12 | `today-jordan-quiet-fold-390.jpg` |
