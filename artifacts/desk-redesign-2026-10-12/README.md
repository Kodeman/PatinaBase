# US-26: the Desk, re-envisioned

A design and review proposal for the designer portal's Desk (`/desk`), written for the founders. It contains no product code, migrations or flags.

**Deck (private Artifact):** https://claude.ai/artifact/C3E1iqzt3sAhA3brMHWREf
- The source of the published deck is `deck/index.html`.
- It is a single self-contained file with 32 sheets and before/after mockups at 1440 and 390.
- The deck's ruling fields keep drafts in the reader's own browser only. Send rulings back by message.

## The ask

Kody, 12 October 2026, quoted verbatim in `BRIEF.md` §1:
1. Make the top bar concise, and drop the tips under the actions.
2. Stop the sections bleeding together.
3. Bring back the cards with little colour tags.
4. Make the Desk a true place to look at, and operate, the day from.

Kody's ask also asked for three directions.

## The three directions

All three directions bring back cards with a colour tag. They differ in what a card stands for and in what the tag means.

| | Card stands for | Tag means | Schema |
|---|---|---|---|
| **A, Restored and tightened** (recommended) | a job, holding today's lines | stage, as a 3 px left rule | none |
| **B, The day board** | one need | need class, as a corner tab, lit only while the need is yours | none |
| **C, Studio colours** | every live job | a studio-chosen job colour that follows the job onto the Document and Field | `projects.colour` |

**Fix-now track (F1–F8).** These fixes ship under any direction:
- drop the header tips;
- full-measure section edges;
- link the job name on every sheet line;
- an honest quiet state, with Waiting and Coming back always shown;
- each need shown once;
- Back keeps the scroll position;
- name a new inquiry after the person;
- the dock label wraps.

## Founder questions

Q1–Q4 choose the direction; the rest can follow the fix-now track. Each question has a recommended answer in `synthesis/direction.md` §7.

| # | Question | Recommended |
|---|---|---|
| Q1 | Reverse V18 Q1's "the Desk is monochrome"? | Yes, for orientation colour only. Every other Q1 guard stays. |
| Q2 | What should the tag mean? | Stage. Whose move stays in words. |
| Q3 | Reverse V18 Q7? | In part: an edge rule, never a plate. |
| Q4 | What does a card stand for? | A job, holding today's lines. |
| Q5 | `--card-edge` beyond claim cards? | Yes, for the Today cards. |
| Q6 | Does a settled line stay put, with no refill? | Yes, until the next morning. |
| Q7 | Header acts? | Keep both creates. The 390 short labels go to the labeling owner. |
| Q8 | May Leah read a teammate's acted state? | Yes, read-only. This needs its own RLS migration. |
| Q9 | Give Set aside a door? | Yes. |
| Q10 | Record payment as a sheet for one invoice? | Yes. |
| Q11 | Should Record an inquiry close onto the Desk? | Yes. |
| Q12 | Add `projects.colour`? | Not now. Park it as a side journey. |
| Q13 | Dark mode? | Document it only. |
| Q14 | May Desk colour ever mean urgency? | No. |
| Q15 | Should the close show what moved? | In place only, with no count, list or header. |

## The canon reopened

Kody's ask deliberately reverses the following rulings:
- V18 Q1 (monochrome) and Q7 (stage plates as ink words), both dated 10 October 2026;
- the house sheet at :1011 (the Desk do-not list), :54/:55 (card edges) and :592 (no pills, dots or badges).

Zero shadows stays in force. Each direction lists its exact reversals in `direction.md` §3 and on the canon sheet.

## The team

| Seat | Ticket | Model | Output |
|---|---|---|---|
| W1 Walk: today's Desk vs the old cards, M1–M8 timed | SQ-786 | Opus (visual evaluation) | `walk/WALK.md`, 37 screenshots |
| D1 UI designer | SQ-788 | Opus | `review/d1-ui.md`, `review/d1-sketches/` |
| D2 UX / information architecture | SQ-789 | Opus | `review/d2-ux.md` |
| D3 Heuristic critic | SQ-790 | GPT-6 Luna (other provider) | `review/d3-heuristics.md` |
| D4 Patterns in the field (web, cited) | SQ-787 | Sonnet | `review/d4-patterns.md` |
| D5 Studio seats (Leah and Jordan, simulated) | SQ-791 | Opus | `review/d5-seats.md` |
| Synthesis | SQ-792 | Opus | `synthesis/direction.md`, `specimens/SPEC.md`, `specimens/check.mjs` |
| Specimens A, B and C | SQ-793/794/795 | Opus | `specimens/proposed-{a,b,c}-{1440,390}.html` |
| Deck | SQ-796 | Opus | `deck/DECK.md`, `deck/src/index.html`, `deck/build.mjs` → `deck/index.html` |
| Adversarial review | SQ-797 | GPT-6 Luna (other provider) | `review/adversarial.md` |
| Triage | orchestrator | — | `review/triage.md` |
| Fix pass and render check | SQ-798 | Opus | `deck/_renders/` with `RENDER-CHECK.md` |

## Gates

- `node specimens/check.mjs`: all six specimens pass. It checks frame anchors, that there are no external fetches beyond Google Fonts, no box-shadow, no static 390 overflow, and no "AI".
- `node deck/build.mjs`: exits 0. It writes 4.48 MB, the rebuild is byte-identical, and the only URLs are Google Fonts.
- **Render check:** all 32 sheets pass at 1440 and 390, with no horizontal scroll, every mockup rendered, and no console errors. It ran in headless Chromium, because the Chrome extension cannot open `file://` or the deck's sandboxed srcdoc frames (see `deck/_renders/RENDER-CHECK.md`).

## Caveats

- **Estimated figures.** Click and second counts for the directions are estimates set against the walk's measured baseline. Marks at rest are measured on the specimens.
- **Simulated personas.** D5's personas are simulated. Nothing here is something a real studio said. `direction.md` §8 lists the validation asks for Leah's studio.
- **One rule still broken.** SPEC's 11:21 frames (x4, not shown in the deck) still move settled lines out of Today, against the revised Q6 rule (noted in `review/triage.md`).
