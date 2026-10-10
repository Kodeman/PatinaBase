# Designer portal UI uplift: team review and founder deck

**Date:** 9 October 2026 · **Story:** US-24
**Published deck:** https://claude.ai/artifact/3my37QrgZrR2VcKn2Bxoae (private)

**The ask:** Kody asked for a team to review the designer portal's design elements and its overall UI and UX, and to propose a UI uplift with Patina's design rules set aside. The aim: designers still feel the calm, but can easily find the actionable moments in their projects. The result is an HTML presentation with mockups, for the founding partners to give their opinion. The review covered the whole portal; the uplift centres on the daily path, Desk → a project → acting on what needs you. The design canon was waived, and the deck names every ruling a direction would need. The studio promise (never optimised for engagement), "never AI", accessibility and honesty were not waived (`BRIEF.md` §2).

**Evidence:** code, and a seeded walk against local Supabase only (Leah's studio with 43 live jobs, plus a week-two hire). Scenarios S1–S8 were timed against today's portal. No production data was used. The persona seats (R5) are simulated and labelled so throughout. No words are attributed to Leah.

**Thesis:** *the portal is calm because it is uniform, not because it chooses, and because it never chooses, the moments that need the studio sink into the same quiet as everything else.* Today only S6, "what's next on this job", is found outright. A client's move on a live job, a landed deposit and closing out the day are not found at all (`walk/WALK.md` §3).

**Recommendation:** **Direction B, the Day Sheet.** One truthful need model underneath, read as a bounded list: at most five sentences of what needs you today, each with one act. The rest sit on their jobs below. "Waiting on" and "Not today" are remembered, and the day ends with "Nothing needs you tonight." It is built from the model up in slices 0–5 (`synthesis/direction.md` §4). The other two directions were drawn in full:
- **A, Quiet marks:** the same rooms, ranked by consequence, with one reserved "needs you" mark. It is the cheapest, but cannot answer S1 or S8.
- **C, The job workspace:** act inside the job from a stage-led workspace. It is the strongest on S6, but the most structural, and misses S1's under-10-second target.

**The strongest argument against B**, recorded in the deck: it is a cross-job ranked list, the "task manager" shape VISION §5 refuses. Q1 binds five structural guards to it: at most five lines, no overflow count, no dots or badges, no streak, never pushed.

A fix-now track of 19 items ships under any direction (`synthesis/direction.md` §5). Items 1–16 need no ruling; items 17–19 wait on Q3, Q4 and Q2.

## Team

Each seat worked alone from the brief, the briefing and the walk. The seats are models, routed by role across two model families. The adversarial review was run by the other provider from the builders.

| Seat | Model | Ticket | Output |
|---|---|---|---|
| Briefing | GPT-6 Luna | SQ-720 | `briefing/current-state.md` |
| Walk | Opus 5.5 (Chrome) | SQ-721 | `walk/WALK.md` + 56 screenshots, `walk/seed_uplift_walk.sql` |
| R1 Visual craft and system | Opus 5.5 | SQ-722 | `review/r1-visual.md` |
| R2 IA and actionable moments | Opus 5.5 | SQ-723 | `review/r2-ia-actionable.md` |
| R3 Heuristics and cognitive walkthrough | GPT-6 Luna | SQ-724 | `review/r3-heuristics.md` |
| R4 Patterns in the field (web, cited) | Sonnet 5.5 | SQ-725 | `review/r4-patterns.md` |
| R5 Studio seats (simulated Leah and hire) | Opus 5.5 | SQ-726 | `review/r5-studio-seats.md` |
| Synthesis | Opus 5.5 | SQ-727 | `synthesis/direction.md`, `specimens/SPEC.md`, `specimens/check.mjs` |
| Specimens A / B / C | Opus 5.5 | SQ-728 / 729 / 730 | `specimens/proposed-{a,b,c}-{1440,390}.html` |
| Deck | Opus 5.5 | SQ-731 | `deck/DECK.md`, `deck/src/index.html`, `deck/build.mjs` → `deck/index.html` |
| Adversarial review | GPT-6 Luna | SQ-732 | `review/adversarial.md` (3 × S2) |
| Fix pass | Opus 5.5 | SQ-733 | `review/triage.md`; synthesis, specimens and deck revised |
| Render check | Opus 5.5 (headless Chrome) | SQ-734 | `deck/_renders/RENDER-CHECK.md` + slide captures |
| Deck polish | Opus 5.5 | SQ-735 | render-check findings F1–F8 applied |

The orchestrator triaged the adversarial review and added one finding of its own, ORC-01: neutral pronouns for Leah, Jordan and Ines, since nobody's pronouns are stated. The rulings are in `review/triage.md`.

## Files

- `BRIEF.md`: the story contract (the ask, waived/not-waived, personas, S1–S8, the success test, evidence rules).
- `briefing/current-state.md`: the code map, where every actionable signal lives today, and the status of earlier portal-polish findings.
- `walk/`: the walk log with the S1–S8 baseline (clicks, seconds, marks at rest), the screenshots, and the local-only additive seed.
- `review/`: five independent reviews, the adversarial review and the triage.
- `synthesis/direction.md`:
  - the thesis;
  - agreements and splits;
  - Directions A, B and C, each scored on S1–S8;
  - the shared need-model delta N1–N8;
  - the recommendation and slices 0–5;
  - the fix-now track;
  - founder questions Q1–Q14;
  - asks for real studio validation.
- `specimens/`: `SPEC.md` (the frame contract and fixture), `check.mjs` (the gate) and six mockups. Each opens standalone, or shows one frame by hash, e.g. `proposed-b-1440.html#frame-b1`.
- `deck/`: `DECK.md` (the contract), `src/index.html`, `build.mjs`, and the built single-file `index.html` (27 slides). Rebuild from this folder with `node deck/build.mjs`. `_renders/` holds the render check.

## Owed: founder rulings

These are Q1–Q14 in `synthesis/direction.md` §6, each with a recommended answer and its "if declined" consequence. **Decide Q1–Q4 first**, because they gate slice 1 under any direction:
- Q1: is the five-line Day Sheet a "task manager"? The recommended answer is no, under five binding guards.
- Q2: may "mine" name a person?
- Q3: should the Desk rank by consequence?
- Q4: should events become needs, with The Post keeping letters only?

The rest:
- Q5: freshness as a time word, not a dot.
- Q6: "Not today" and automatic "waiting on".
- Q7: spend colour on need, not phase.
- Q8: one filled act per view.
- Q9: plain words.
- Q10: the hire's view of studio money. It needs a rule in slice 2, because today's Accounts shows revenue and A/R to every viewer.
- Q11: the hire's outward acts become drafts for Leah.
- Q12: park the end-of-day hand-back.
- Q13: C's structural moves, not now.
- Q14: no push.

## Owed: asks for the studio

These are in `synthesis/direction.md` §7. The main ones:
- Leah's own five things on a real Monday, before the model's ranking is shown;
- S1 timed by hand on Leah's real 16 jobs;
- the false all-clear test;
- Leah's words for the renames (Q9);
- the hire's S5/S6 timing and the "Leah sees this first" question;
- whether Leah wants a hire to see studio money (Q10).
