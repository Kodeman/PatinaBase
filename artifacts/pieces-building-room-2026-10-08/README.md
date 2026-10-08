# Building a Job's Pieces: multi-model review and founder deck

**Date:** 8 October 2026 · **Story:** US-20
**Published deck:** https://claude.ai/artifact/VGACNn8fhzeV8TXo85Kr2W (private)

**The ask:** Leah sat down to enter the items for a real job ("Whole Home Renovation") and got lost. The parts exist: rooms, placeholders, tags and spec details. But every function shows at every step. In her words, *"It's only presenting you with the function that you need at each step that is missing."* (`TRANSCRIPT.md`). A team spanning Fable, Opus and Sol reviewed her capture. It recommends a course that makes building a job's pieces simpler, with mockups, for the founding team. Patina's design constraints were waived for this work; where a proposal departs from canon, the deck names the ruling it would need.

**Evidence:** Leah's first-person capture, which is the first on record for item entry, kept verbatim. Also code, and a local seeded walk against local Supabase only. No production data was used.

**Recommendation:** **Direction A, the Build room.** It is a purpose-built working room at `/doc/[id]/pieces` with the lenses Rough in · Spec · Price · Release. A line's stage is derived. The Document's Pieces region becomes the overview, one row per room ("beige is reading, white is working"). Two alternatives were drawn and rejected:
- B, lenses on the paper;
- C, room sheets with no lenses.

A fix-now track ships regardless of direction (`synthesis/direction.md` §4). It is split into unconditional bug fixes and two items gated on rulings: the stamp word waits on Q3, and the rough-$ field waits on Q7.

## Team

| Seat | Model | Ticket | Output |
|---|---|---|---|
| B0 Briefing | Sonnet | SQ-587 | `briefing/current-state.md` |
| B0 Walk | Sonnet | SQ-588 | `walk/WALK.md` + 23 screenshots, `walk/pieces_walk_dev.sql` |
| R1 Interaction and data model | Opus 5.5 | SQ-589 | `review/r1-opus.md` |
| R2 Product and studio workflow | Fable 5.1 | SQ-590 | `review/r2-fable.md` |
| R3 Heuristics, cognitive walkthrough and competitor patterns | GPT-6 Sol | SQ-592 | `review/r3-sol.md` (see the note below) |
| Synthesis | Fable 5.1 | SQ-593 | `synthesis/direction.md`, `specimens/SPEC.md` |
| Specimens A / B / C | Opus 5.5 | SQ-594 / 595 / 596 | `specimens/proposed-{a,b,c}-{1440,390}.html` |
| Deck | Opus 5.5 | SQ-597 | `deck/DECK.md`, `deck/src/index.html`, `deck/build.mjs` → `deck/index.html` |
| Adversarial review | GPT-6 Sol | SQ-598 | `review/adversarial.md` |
| Fix pass | Opus 5.5 | SQ-599 | `review/triage.md`, then specimens and deck revised |

**About the Sol seats.** R3 and the adversarial review each ran single-shot through the local model gateway, using model `claude-gpt-6-sol[1m]` (`tools/sol-single-shot.mjs`, prompts in `tools/`). The board refuses a cross-provider route on a Claude category, so neither ran as a board executor. Each file starts with a provenance header recording the model, the stop reason, the token usage and the image count.

## Files

- `TRANSCRIPT.md`: Leah's capture, verbatim. This is the primary evidence.
- `BRIEF.md`: the shared brief:
  - the ask and recon facts;
  - scenarios S1–S8 (rough in a room, one item in many rooms, placeholder to product, labor or per-unit lines, remove a mistake, move between rooms, where am I, paint and finish schedule);
  - the personas;
  - the evidence and voice rules.
- `briefing/current-state.md`: verified code facts with `file:line`, the life of a line, and prior art.
- `tools/`: `sol-single-shot.mjs` and the R3 and adversarial prompts
- `walk/`: the walk log, the screenshots, and the local-only seed. Steps 8–11 and the mobile walk are unconfirmed.
- `review/`: three independent reviews, the adversarial review and the triage.
- `synthesis/direction.md`:
  - the thesis;
  - where the reviewers agree and where they split;
  - Directions A, B and C;
  - the shared data-model delta D1–D19;
  - the fix-now track;
  - slices 0–5;
  - founder questions Q1–Q16;
  - asks for Leah.
- `specimens/`: `SPEC.md` (the contract and fixture: Leah's real job), `check.mjs` (the gate) and six mockups. Each opens standalone, or shows one frame by hash, e.g. `#frame-a3`.
- `deck/`: `DECK.md` (the contract), `src/index.html`, `build.mjs`, and the built single-file `index.html`. Rebuild from this folder with `node deck/build.mjs`.

## Owed: founder rulings

These are Q1–Q16 in `synthesis/direction.md` §6, each with the synthesis's recommended answer. Slice 1 waits on Q4 and Q5; slice 2 waits on Q1, Q2, Q8 and Q14; slice 3 on Q7 and Q13. Q1 and Q4 carry fallback branches in case they are declined.

- Q1 a lens head on a working sheet, but not on the paper (VISION §6, V7)
- Q2 a third stock, white "drafting" (V9 P5)
- Q3 derived stage words on the stamp
- Q4 one line in several rooms, via a placements join
- Q5 labor as a line attached to its piece, not only Trade Scope
- Q6 whether the spec book survives as its own route
- Q7 who sees money in Rough in
- Q8 reopening DECISIONS I25, drag between rooms
- Q9 a group heading inside a room
- Q10 the paint and finish schedule, in minimally and last
- Q11 merge catalog duplicates, never hard-delete
- Q12 filling an allowance after signing
- Q13 `READY FOR LEAH` hand-back
- Q14 the Document's Pieces region becomes room overview rows
- Q15 the reading of "the studio won't notice Patina"
- Q16 who may change a client price on an active job (today `00692` allows only vendor and trade price after activation)

## Adversarial review

GPT-6 Sol reported 26 findings (`review/adversarial.md`). Its closing count is wrong; the true count is 3 S1 · 13 S2 · 9 S3 · 1 S4. The orchestrator accepted all 26 and rejected or skipped none. The Opus fix pass (SQ-599) applied every one; `review/triage.md` has one row per finding. The rulings that changed the design:
- **Stages:** ROUGHED is dropped. A placeholder means no product, whatever its rough price (ADV-4).
- **Release:** the act names the whole authorization set, labor included: 7 lines · $30,760 (ADV-5).
- **Multi-room lines:** client selections and the authorization snapshot move ahead of Release, and Order refuses a multi-room line until slice 4 (ADV-6, ADV-7).
- **Client price:** read-only on an active job; it changes through Record a change (ADV-8, D19, Q16).
- **`READY FOR LEAH`:** an internal hand-back fact (D18), never a client disposition (ADV-9).
- **Rough $:** an internal planning figure. `Make it an allowance` is the only act that creates a client ceiling (ADV-15).
- **Coverage:** each scenario reads as illustrated, the slice at which it passes, or verified. None is verified yet (ADV-11, 12, 21).
- **Mockups:** labelled as interaction illustrations. S1 timing and keyboard, touch and screen-reader acceptance need a working prototype (ADV-13, 25).
- **Deck mechanics:** deep links land on the right sheet and hold there, and the pager sits in its own strip. At 390 the deck shows the 390 mockups (ADV-18 to 20).

The 104 renders (26 sheets × 1440/390 × light/dark) all passed: each deep link landed on its sheet, with no overlap, no horizontal overflow and no page errors.

## Owed: Leah

Owed from Leah (synthesis §7):
- time her entering the four Living Room lines by hand, in the Direction A mockup and in today's product;
- her own words for placeholder, rough price and the four passes;
- the oak floor's quantity, per room or total;
- labor's unit;
- who may remove a line or merge a duplicate;
- which duplicate she couldn't delete;
- one real elevation or SketchUp export;
- whether the painter's schedule belongs in Patina at all;
- who is closest to the first-hire seat, for the S1–S8 walk.
