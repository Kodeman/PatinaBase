# US-33 — Designer portal responsiveness

**Date:** 2026-10-14 · **Story:** US-33 · **For:** Kody and the founding partners
**Status:** findings document built (SQ-961), not yet published. Adversarial review (SQ-962) and the fix-and-render pass (SQ-963) come next.

## The ask

The portal has started to feel sluggish. Page loads should show a loading indicator or skeletons, a click should make something happen at once, and engineers and designers together should find the code and infrastructure changes that remove the wait. The brief is in [`BRIEF.md`](BRIEF.md). It is a read-only review: nothing in `apps/`, `packages/`, `supabase/` or `infra/` changed.

## Evidence

- **Lab:** a production build against local Supabase, Playwright Chromium at 4× CPU and Fast 4G, three cold runs per scenario (P1–P10) at 1440 and 390 wide. See [`baseline/BASELINE.md`](baseline/BASELINE.md), [`baseline/data/`](baseline/data/) and [`baseline/harness/`](baseline/harness/).
- **Prod:** a read-only signed-in timing walk on app.patina.cloud (navigation only, a hidden tab, no writes), plus read-only PostHog queries.
- **Bundle:** per-route script weight and chunk anatomy in [`baseline/bundle.md`](baseline/bundle.md).
- **Code:** five discipline reviews in [`review/`](review/) and cited field patterns in [`review/r-patterns.md`](review/r-patterns.md). Every number cites a baseline file or a `file:line`.

## The thesis

A hard load spends about seven seconds in a fixed queue before the studio sees its work, and no screen says anything is happening while it waits. The two largest causes are sixteen serial `auth/v1/user` calls (about 2.7 s, made serial by the auth library's client lock) and about 1.6–1.9 MB of gzipped script (about 3 s). The Desk's whole read also runs on every Document and makes 24 of the 27 refetches after one tick.

## Recommendation

- **Fix now, no ruling needed:** F1 session-user store (−2.7 s per hard load); F8–F10 bundle cuts (−220 to −390 KB gzip per route); F7 immutable static assets (63 → 0 revalidations); F5 narrow the tick's invalidation (27 → 3 refetches); F13 + F16 shaped placeholders and press states. F17, the extended lab harness, goes first so every gate has a baseline.
- **Loading:** direction **Q, Quiet paper**, with arrival option C (the placeholder becomes the arrival).
- **Action feedback:** one quiet grammar, S0–S5. Something answers within 100 ms, a word appears only when a write is slow, and a send, a payment or a delete never shows as done before the server confirms it.
- **Said plainly:** B3 (usable ≤1.5 s) cannot hold on a cold hard load in the lab on any track. PQ1 proposes B3a (navigation ≤1.5 s p75) and B3b (hard load ≤3.5 s p75).

## The team

| Seat | Discipline | Model | Ticket | Output |
|---|---|---|---|---|
| 0 Brief | Orchestrator | Opus (orchestrating session) | — | `BRIEF.md` |
| 1 Baseline lab | Performance engineer | Opus 5.5, with Chrome | SQ-952 | `baseline/` |
| 2 E1 Data & writes | Frontend and data engineer | Opus 5.5 | SQ-953 | `review/e1-data-writes.md`, `baseline/data/e1-P6-*.json` |
| 3 E2 Page architecture | Frontend architect | Opus 5.5 | SQ-954 | `review/e2-page-architecture.md` |
| 4 E3 Edge & bundle | Infrastructure engineer | Opus 5.5 (rerouted from GPT-6 Luna, decision #1) | SQ-955 | `review/e3-infra-bundle.md` |
| 5 D1 Loading language | Interaction designer | Opus 5.5 | SQ-956 | `review/d1-loading.md`, `review/d1-sketches/` |
| 6 D2 Action feedback | Interaction designer | Opus 5.5 | SQ-957 | `review/d2-feedback.md`, `review/d2-sketches/` |
| 7 R Field patterns | Researcher, cited | Sonnet | SQ-958 | `review/r-patterns.md` |
| 8–9 Pairing and synthesis | Lead | Opus 5.5 | SQ-959 | `synthesis/pairings.md`, `synthesis/plan.md` |
| 10 Mockups | Interface build | Opus 5.5 | SQ-960 | `specimens/` |
| 11 Document | Builder | Opus 5.5 | SQ-961 | `doc/` |
| 12 Adversarial review | The other provider | GPT-6 Astra (planned) | SQ-962 | to come |
| 13 Fix pass and render check | Builder | Opus, headless Chrome (planned) | SQ-963 | to come |

## Files

| Path | What it is |
|---|---|
| `BRIEF.md` | The story contract, copied |
| `baseline/` | `BASELINE.md`, `bundle.md`, lab and prod data, traces, screens, harness |
| `review/` | E1, E2, E3, D1, D2 and R reviews, with D1/D2 sketches |
| `synthesis/pairings.md` | Every engineering × design pairing, mismatches M1–M18, open checks O1–O10 |
| `synthesis/plan.md` | Thesis, scorecard, three tracks with file paths, grammar, PQ1–PQ20, RJ1–RJ18 |
| `specimens/` | 65 mockup frames (Q and X skeletons, nav rule, action strips, waterfalls), `SPEC.md`, `check.mjs` |
| `doc/src/index.html` | The findings document's source |
| `doc/build.mjs` | Inlines specimen frames and screenshots into one file; checks copy rules and size |
| `doc/index.html` | The built single-file document (about 1.1 MB) |

## Owed rulings

- **Budgets:** ratify B1, B2 (read as "at first paint" on hard loads) and B4; split B3 into B3a and B3b (PQ1).
- **Decide first:** PQ1 (budgets), PQ2 (loading direction) and PQ3 (arrival) gate the loading register (N10); PQ9 gates optimistic ink (N3); PQ10 sets the flag rollout.
- **Then:** PQ4–PQ8 and PQ11–PQ20, each with a recommendation in `synthesis/plan.md` §6 and §7 of the document.
- Fix now waits on none of them.

## Rebuild

```bash
node artifacts/portal-responsiveness-2026-10-14/doc/build.mjs
```

The build reads `doc/src/index.html`, embeds the named specimen frames and baseline screenshots, and writes `doc/index.html`. It stops on a missing specimen, frame or screenshot, an incomplete specimen, "AI" or a gendered pronoun in the copy, a leftover `{{…}}` token, or an output over 16 MB.
