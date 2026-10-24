# Bundle measurement, Wave 1 exit (G5)

Captured on round-8 head `0c82213f7` on 2026-10-24, with the same commands as `bundle-baseline.md`:

```
pnpm exec turbo run build --filter=@patina/designer-portal^... \
  && ANALYZE=true pnpm --filter @patina/designer-portal analyze \
  && node scripts/bundle-budget.mjs apps/designer-portal/.next
```

The baseline was captured at `0fabcadf2`, the round-8 preparation tip, before any renderer code existed. Budgets are unchanged.

## Route totals: eager first load, gzip

| Route       |  Baseline |    Wave 1 |          Δ |    Budget | Result                                                     |
| ----------- | --------: | --------: | ---------: | --------: | ---------------------------------------------------------- |
| `/desk`     | 1,349,791 | 1,352,793 | **+3,002** | 1,346,026 | Over by 6,767 (3,765 of that was already over at baseline) |
| `/doc/[id]` | 1,687,406 | 1,691,970 | **+4,564** | 1,687,684 | Over by 4,286 (baseline had 278 bytes of headroom)         |

Tripwires: lucide 142 of 200. `crypto-browserify`: 0 modules and 0 chunks.

`bundle-budget.mjs` exits 1. Wave 1 adds eager bytes to the legacy path on both routes. On `/doc/[id]`, that addition alone pushes the route over budget.

## Round-8 lazy chunks

Module-to-chunk mapping comes from `analyze.html` chartData. Sizes are `gzipSync` of the emitted file.

| Chunk                     | Contents                                                                                                               |   Gzip | In `/doc` manifest | In `/desk` manifest |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -----: | ------------------ | ------------------- |
| `static/chunks/4125.*.js` | `round8-paper-frame.tsx` plus 7 concatenated modules (contents-margin, unfold-instrument, …)                           | 11,609 | no                 | no                  |
| `static/chunks/8041.*.js` | `round8-desk.tsx` plus 6 concatenated modules (studio-masthead, attention-list, commission-spread, …) and `round8.css` |  5,911 | no                 | no                  |

The route totals above **exclude** both lazy chunks. A flag-on first visit pays the route total plus about 11.6 KB on `/doc` and about 5.9 KB on `/desk`.

## Eager round-8 code on the legacy path

`doc/[id]/page.tsx:4` statically imports `Round8DocumentState` from `frame/round8-states.tsx`. That module therefore ships in the `/doc` page chunk to every reader, flag off included. The other eager growth comes from the frame extraction, the renderer latch, return-hold/departure and the margin-layout changes. It has not yet been broken down per module.

## Disposition

- Wave 1 exit required G5 to be **measured** for both paths, and it is.
- The `/doc` regression past budget is not accepted silently.

## Repair (SQ-1968, merged at `caa8dcfc4`)

**Changes**

- `Round8DocumentState` loads lazily.
- A single minimal eager fallback, `frame/round8-document-loading.tsx`, paints the pending-renderer loading DOM. The lazy states reuse it.
- The Desk return reader moves out of `paper-origin` into `desk-return.ts`.

**Measured** (executor capture `2ce5eba1`, same commands)

| Route       | Before repair | After repair | Remaining Wave 1 growth vs baseline |    Budget | Result                                    |
| ----------- | ------------: | -----------: | ----------------------------------: | --------: | ----------------------------------------- |
| `/desk`     |     1,353,015 |    1,352,304 |                            ≈ +2,500 | 1,346,026 | still over (inherited −3,765 plus Wave 1) |
| `/doc/[id]` |     1,692,207 |    1,691,899 |                            ≈ +4,200 | 1,687,684 | still over by 4,215                       |

The "before repair" figures are the executor's rebuild of the same base. They differ from the orchestrator's build above by about 230 B of build-to-build noise.

**Accepted for Wave 1** (orchestrator decision, 2026-10-24)

The remaining growth is shared behaviour that legacy readers also execute:

- the renderer latch (~1.7 KB parsed);
- the extracted legacy frames;
- explicit Studio return restoration;
- the reviewed departure/focus safety fixes (SQ-1832 R1–R4).

Reshaping those to recover about 4 KB on a 1.69 MB route was judged a worse trade than the risk of regressing them.

**Gate from here** (`g5-ratchet.mjs`)

- No round-8-only module may ship in an eager route chunk. The single exception is the loading fallback.
- Eager totals may not exceed the ratchet: `/desk` 1,352,604 and `/doc` 1,692,199.
- `bundle-budget.mjs` and its budgets are unchanged, and it still exits 1.

**Owed to Kody before WP-11** (explicit, not silent)

- Accept the `/doc` overage of about 4.2 KB from Wave 1 shared seams and raise that budget, or fund further trimming.
- Rule on the inherited `/desk` overage, which was −3,765 at baseline and is also present on main.
