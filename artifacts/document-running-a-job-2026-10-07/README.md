# Running a Job: wayfinding review and founder deck

**Date:** 7 October 2026 · **Story:** US-18
**Published deck:** https://claude.ai/artifact/QbLjzcftMCQARxXuZC4VRo (private)

**The ask:** designers get lost running a job in The Document. They don't know which actions are available or which one is suggested next. Three reviewers on three models reviewed the whole flow. Their findings were synthesised into three directions with mockups, and presented to the founding team for input.

**Evidence:** code plus a local seeded walk, signed in as Leah Hartwell, against local Supabase. No production data was used.

## Team

| Seat | Model | Ticket | Output |
|---|---|---|---|
| B0 Briefing | Sonnet | SQ-471 | `briefing/current-state.md`, `briefing/prior-art-delta.md` |
| B0 Walk | Sonnet | SQ-472 | `walk/WALK.md` + 34 screenshots (7 stages, 5 scenarios) |
| R1 Interaction and IA audit | Opus 5.5 | SQ-473 | `review/r1-opus.md` |
| R2 Product and vision review | Fable 5.1 | SQ-474 | `review/r2-fable.md` |
| R3 Heuristics and cognitive walkthrough | GPT-6 Sol | SQ-475 | `review/r3-sol.md` (see the note below) |
| Synthesis | Opus 5.5 (orchestrator) | — | `synthesis/direction.md` |
| Specimens A / B / C | Opus 5.5 | SQ-476 / 477 / 478 | `specimens/proposed-{a,b,c}-{1440,390}.html` |
| Deck | Opus 5.5 | SQ-479 | `deck/src/index.html`, `deck/build.mjs` → `deck/index.html` |
| Adversarial review | GPT-6 Sol | — | `review/adversarial.md` |

**About R3 and the adversarial review.** Both were produced single-shot through the local model gateway, using model `claude-gpt-6-sol[1m]`. The board's cross-provider dispatch for R3 failed, so the gateway was called directly. Each file starts with a provenance header that records the model, the token usage and the image count.

## Files

- `BRIEF.md`: the shared brief (the ask, canon, prior art, scenarios, personas, output conventions)
- `briefing/`: the per-stage action inventory, 13 cross-device contradictions, and what August (R124–R127) promised versus what is live
- `walk/`: the walk log and screenshots
- `review/`: the three independent reviews and the adversarial review
- `synthesis/direction.md`:
  - the thesis
  - where the three reviewers agree and where they split
  - Directions A (One Voice), B (Whose Move) and C (Ask the Paper)
  - the slices
  - the founder questions
  - asks for Leah
- `specimens/`: `SPEC.md` (the build contract), `check.mjs` (the gate) and six mockup files. Each file opens standalone, or shows a single frame by hash, e.g. `#frame-a1`.
- `deck/`: `DECK.md` (the contract), `src/index.html`, `build.mjs`, and the built `index.html` (`node deck/build.mjs`)

## Owed: founder rulings

These are Q1–Q10 in `synthesis/direction.md` §6. Decide Q1, Q2 and Q8 first.
1. the stage word, R127 L-6
2. Next and Standing, OD-11/L-11
3. ranking by kind, W3-R1
4. stage vocabulary, I114
5. the gloss on "absence is silence", V9 §5
6. the first open, L-11
7. VISION §4, read for the first hire (offered for discussion)
8. the five scenarios as the acceptance gate
9. whether B's first-open list is a task list
10. whether the stage mark is a progress bar under V11

## Adversarial review

GPT-6 Sol reported 52 findings (`review/adversarial.md`). The synthesis was revised in place. A fix pass (SQ-480) applied the accepted specimen and deck findings. Rejected as false positives: ADV-35 ($14,500 is in today's screenshot) and ADV-36 ("The Scans" and "Client" are in today's screenshots). Skipped: ADV-22 (today's Desk chips are kept), ADV-51 and ADV-52.

## Owed: Leah

Owed from Leah (synthesis §7):
- a first hire walks the five scenarios
- the studio's own words for "change", for the stages, for "late" and for "whose move"
- how often each scenario happens
- how held jobs are handled
