# RESUME — The Document, "The Smart Lens" proposal (designer portal)

Mockup Artifact: https://claude.ai/code/artifact/65b060ad-0c98-4163-afb5-37d4f7c2b2af (favicon 🔭, title "The Vandersteen Lens", label v3-fast-first-paint) — 603 KB single file, scroll-driven, three frames.

Deck Artifact: https://claude.ai/code/artifact/932d66c0-4c9e-4ccc-b757-f498fa07d316 (favicon 🔍, title "The Smart Lens", label v1-proposal) — 3.23 MB, 15 sections, 13 fragments + 13 shots.

## The ask (verbatim, from `source/plan.md`'s Context paragraph)

> Kody (2026-08-28): the Document is close to feeling right after the Life Review (R126, live on prod as Worker 9c0c2cdd). What still fails: the **spine** is cluttered and under-used as navigation; the **header** holds great information but eats most of the viewport when open; **sections** are crammed into each other; the **margin** is cramped for what it carries. Ask (verbatim in every brief): a team of UI/UX designers with Patina engineering and interior-design teams designs the Document so it holds the needed information and actions while feeling uncluttered and peaceful — animation, content that appears when needed and yields space when not in frame; the document as a **smart lens always adjusting focus** as the designer moves. Deliverable: the **strongest single proposal** as an HTML document, plus a **high-fidelity mockup** showing how the team will accomplish it.

## Rulings taken (Kody, at plan time)

- **Canon latitude: clean sheet.** `docs/design/the-document/DECISIONS.md` (last id R126) is context, not constraint. Amendments are never priced or penalised — the canon-context refuter only *labels* what a move amends, for the record. Four hard no-gos stand: **NG1** D1 one document at a time (no split view / tabs / peek-hold / persistent global nav); **NG2** D4 shadow budget — one `--elevation-sheet` token at three sites, zero other shadows (computed-style sweep); **NG3** no Thumb Index; **NG4** the R126 visual register is the floor (40px Playfair letterhead, 24px region heads, scale 40/24/18/15/14, mono 11px floor, three rule weights, paper `#FCFAF6` / rail `#E8E3DB` / desk `#FAF7F2`, filled stamps, stage tab plates, hover wash, 48px thumbs) — built on, never restyled; "typography goes no further." THE STUDIO desk block untouched.
- **Team: full house** (~40 seats named in the plan; ~70 total agent calls once the workflow-run seat counts below are added up) — U1–U5 lenses, P1–P4 personas on T1–T16, engineering seat E1, three refuters, two rival Opus authors, four critics, two judges, a merge author, mockup builder + adversarial prober, deck authors, fact-check + visual QA. Fable orchestrates, reviews every gate, publishes; never executes.
- One proposal, two Artifacts (deck + a separate scroll-driven clickable mockup) — same pattern as the Life Review (`f333f3f1…` / `bf781dba…`).

## Phase table

| Phase | What | Status / run id |
|---|---|---|
| W0 | Scaffold + kit port; instruments/brief/mechanics/rubric/SPEC | done — gate `SMOKE=1 node mock/deck-parts/build.mjs` exit 0, PARTS 17 |
| W1 | Steward boot · capture (scroll series) · measure-layout · code anatomy · canon digest · interactive probe | done — steward PID 64461 (killed at end of W2b); rich = Chen Residence `de922823-d1b9-491a-8ad5-99e8e4f013c5` (3 FF&E lines, 0 rooms), prework = Aspen Loft proposal `b0000000-0000-0000-0000-000000000002`; 38 shots verified; header stack 111.7% of viewport at 1440/s0; spine ink 54.9% rich / 13.9% prework; gaps {6,29,56}px; ticket fold = 283px hard jump; region fold drops focus to body; CLS 0.13 |
| W2a | Panel U1–U5 + P1–P4 + E1 → disk-based collator | done — `wf_d874ad55-a70`; 10/10 seats; 231 raw → 164 collated |
| W2b | Refuters V1 code-truth · V2 repro · V3 canon-context → scribe | done — `wf_993e7e72-da4`; 152 survivors / 12 dropped / 0 blocked |
| W3a | Planks → two rival authors → four critics | done — `wf_8a8e0d97-c97`; 14 planks; X "the spine is the lens" vs Y "the paper is the lens"; 4 critics |
| W3b | Two revisers → two judges → merge author | done — `wf_51bc2ef9-a0a`; J1 favoured Y, J2 favoured X; merge author ruled: 56px DECLARED band + X's value-carrying ladder rail → `source/proposal.md` (11 mechanics L-1…L-11, six waves) + `roads-not-taken.md` |
| W4a | kit-extend → mockup builder → shooter + host-sim → adversarial prober | done — `wf_bb3f82dc-038` |
| W4b | builder v2 → reshoot → probe 2 → fragment cutter | done — `wf_ec459b4e-9c0` (+ RF-01…05 from the orchestrator; 1280 rail fix; perf fix) |
| — | Fable publishes the mockup Artifact (favicon 🔭) | done |
| W5a | 8 part authors → build + qa-run → fact-check + visual QA | done — `wf_c0e26a25-790` |
| W5b | part fixers → rebuild (loop) | done — round 1 `wf_96bc81b6-dd9`, round 2 `wf_4c145077-bd7`, round 3 `wf_b0f364a5-cb2`, round 4 direct (outside the script) — see `research/62-deck-revision-log.md`: `height:auto` on `.ev-fig__shot img`, box−img = 24px at 1440/390, QA clean, deck published |
| — | Fable publishes the deck Artifact (favicon 🔍) | done |
| Close | RESUME + pathspec commit + memory | this pass |

Full plan (waves, seats, gates, mechanisms, contracts, risks): `source/plan.md`.

## Agent census

≈70 agent calls: ~25 direct calls (steward boot/capture/measure/anatomy/canon/probe in W1; the mockup builder/shooter/prober lineage in W4a/W4b; the Round-4 direct deck fix) + ~45 calls across 11 Workflow runs (`wf_d874ad55-a70`, `wf_993e7e72-da4`, `wf_8a8e0d97-c97`, `wf_51bc2ef9-a0a`, `wf_bb3f82dc-038`, `wf_ec459b4e-9c0`, `wf_c0e26a25-790`, `wf_96bc81b6-dd9`, `wf_4c145077-bd7`, `wf_b0f364a5-cb2`, plus the disk-based collator pass inside W2a).

## OWED (Kody)

- A ruling on the proposal → the next `R###` entry after R126 in `docs/design/the-document/DECISIONS.md`.
- The signed-in walk of the mockup.
- Nothing is built; no product code changed.
- Open items carried forward (all pre-existing, not regressions of this program): F24 desk 390 overflow, aged-oak 3.51:1 contrast, reduced-motion 39 offenders, I114, T2/T4.

## How to resume

```bash
cd /Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28

# rebuild the deck (needs dangerouslyDisableSandbox — build.mjs shells out to sips)
SMOKE=1 node mock/deck-parts/build.mjs
node mock/deck-parts/qa-run.cjs

# regenerate the mockup
cd mock/final && node build-index.mjs

# mockup probes
node review-clickthrough.mjs
node host-sim.mjs
node perf-stream.mjs
```

## Workflow scripts (corrected — the previous RESUME listed the wrong names)

`source/workflows/w2a-panel.js` · `w2b-verify.js` · `w3a-drafts.js` · `w3b-judge.js` · `w4a-mock.js` · `w4b-mock-fix.js` · `w5a-deck.js` · `w5b-deck-fix.js`
