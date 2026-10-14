# US-34 ship record: designer portal responsiveness (built, NOT shipped)

Story US-34 builds the US-33 plan (`artifacts/portal-responsiveness-2026-10-14/synthesis/plan.md` §6).
Kody accepted every recommendation on 2026-10-14 ("Lets go with all your recommendations"), which ratified
PQ1–PQ20 and B1–B4 (V24). It is integrated on `main` and pushed. **Nothing is deployed.**

- Integrated range: `e0c3ad1a4..a968ff0d0` (code) plus this record`.
- Perf gate: `perf/after/REPORT.md` (SQ-1002, on `2c9bc94ac`), then the gap wave SQ-1010–1013.
- Re-run of the affected scenarios: `perf/rerun-a968ff0d0/REPORT.md` (SQ-1014). Quiet host, flags ON, ARRIVAL on. Usable times against F17: P2 19256 → 4043, P3hard 6125 → 3812, P4 1156 → 649, P5 844 → 470, P10 16644 → 885 ms. Tick 649 → 68, untick 431 → 44 ms. Pieces CLS 0.18 → 0.008.
  - Still over B2 (placeholder ≤200 ms): P4 203, P5 266, P2 281 (the harness clicks a row below the fold), P10 279 (Desk transition CPU).
  - Pieces usable went 3401 → 3812 ms because the sheet now waits for all three reads: a trade that buys no layout shift.
  - F4: the two `project_ffe_items` reads per load are different queries (live and removed lines, or lines and a money select), not duplicates..

## What ships, and how it is gated

| Area | Flag | What the studio feels |
|---|---|---|
| Session store, one auth read per load (F1/N1), middleware `getClaims` (N13) | none | Pages stop waiting on Auth: `auth/v1/user` 16–21 → 0–1 per hard load |
| Desk in one read: `desk_read` RPC (00791, N8). Document opens in one read: `document_open` (00792, N9) | none | The Desk takes 30 requests instead of 95. A Document's waterfall is 8 deep instead of 25 |
| crypto/lucide/design-system bundle cuts (F8–F10), image hints, immutable `_headers` (F7) | none | Less JS to parse; repeat visits stop revalidating static chunks |
| Press states, 44 px task rows, `aria-pressed`/`aria-busy` (F16). Shaped busy fallbacks (F13). Error boundaries (F14) | none | Every press answers at once. No blank route |
| Honesty: send and money mutations never retry and refuse offline (F15d–f, SQ-1001 #3). No background toasts. Inline failure lines (N12b) | none | Nothing is ever sent twice by a retry. A failure is said where it happened |
| Feedback grammar: `saving…` at 400 ms in the band's own line, offline line, unload guard (N12a, SQ-1012) | none | The studio sees when a write is slow or held, and never over money |
| Optimistic ink: tick, add task, rooms, phase advance, folio/swatch Undo (N2–N5, N15) | `optimistic-ink` | Ticks land in about 87 ms. Creates show a ghost row. Deletes have Undo |
| Loading register and arrival C on the Desk and Document, navigation ink rule at 300 ms (N10, N11) | `loading-register` | A paper-shaped sheet instead of a held page. The US-14 arrival no longer gates content |

**The two flags must turn on together.** With both off, a faster load lets the US-14 arrival play where it
used to hold, and hard loads regress (P1hard 8.1 → 19.2 s). With both on, P1 is 23.7 → 4.9 s, P2 19.3 → 4.2 s
and P10 16.6 → 0.9 s, and React commits drop from 9.6k to 68.

## Ship steps (each needs Kody's explicit "ship")

1. `supabase db push` for 00791 `desk_read`, 00792 `document_open` and 00793 `restore_product_image`
   (SECURITY INVOKER, `search_path ''`, `authenticated` only). This must come before the portal deploy,
   because the new portal calls all three.
2. `./infra/deploy-portal.sh designer`, with the Supabase trio exported from `apps/designer-portal/wrangler.jsonc`
   in the same shell.
3. Verify: `wrangler deployments list` (read the bottom row); `curl -I` a `/_next/static/*` asset and
   check for `immutable`; time `/desk` signed in.
4. Create the PostHog flags `optimistic-ink` and `loading-register` together, targeted at Leah's studio
   by **user id** (never email). Verify both resolve before widening.

Rollback: turn both flags off, which is safe but slow (see above), or roll the Worker back to the
previous deployment. The migrations are additive (new functions only).

## Known limits (accepted, not fixed)

- **Realtime token after a cross-portal refresh (SQ-1007 r3, F3 PARTIAL, MEDIUM).** When this tab refreshes
  its own session, supabase-js re-pins Realtime's manual token. Session-user suppresses same-subject
  notices, so if another portal refreshes the shared cookie, this tab's Realtime channel can keep a JWT
  that is about to expire until the tab's own refresh. Requests still use the fresh cookie. This is
  pre-US-34 supabase-js behaviour. RLS still decides access; it is not an authorization bypass.
- **Account switch (F1).** It took three fix rounds (SQ-1003, SQ-1008, SQ-1009). Accepted residuals: a
  `mutationFn` already in flight at the moment of the switch, and about 60 `mutateAsync`→capture sites
  not individually fenced.
- **Lens-band pin on the first scroll of a Document (SQ-1010 discovery).** It fires three reads
  (`project_ffe_placements`, `project_palettes`, `can_see_studio_margin`), causes CLS 0.158 and
  360–590 ms of long tasks at 4× CPU. A press during that window lags 218–416 ms. Not fixed; a candidate
  follow-up.
- **Pieces holds its skeleton until rooms, lines and placements all answer** (SQ-1012, CLS 0.18 → 0.009).
  The sheet appears all at once, slightly later.
- **SPA placeholder (B2 ≤200 ms):** People and Library were fixed in SQ-1013: the Studio drawer now prefetches its room doors. Lab interleaved A/B, register ON: P4 placeholder 344–362 → 200–239 ms; P5 332–347 → 256–298 ms; usable times roughly halved. Two causes need no code. (1) P2 is a harness artifact: the lab clicks a below-the-fold Desk row before viewport prefetch lands; an in-view row paints its placeholder at 69–122 ms. (2) P10 (Document → Desk) is CPU in the Desk transition render, quiet-host 182–198 ms. Smallest follow-up if wanted: have heavy room pages suspend on first client render so the prefetched `loading.tsx` commits first, or cut the Desk mount cost.
- Gates the lab cannot see: F16's SPA first change (the press is CSS `:active`); F9's signin manifest
  (92 is a count of references, not bytes); F10 lucide at 140 modules (a 91% cut, within the S5 budget);
  N4's ghost mark; N8 EXPLAIN on prod-shaped data; N13 prod middleware time; F11 RUM.

## Follow-ups owed (outside US-34)

- Invoice send is not idempotent and can email twice (outbound draft sends are safe).
- 36 `proxyToBackend` routes don't refresh the token themselves (N13 kept `/api` in the matcher).
- `changed_by` is not bound to `auth.uid()` on site-access cards (00625).
- The `@patina/design-system` vitest suite runs past 600 s, with Tooltip failures.
- F12 commit `5d57a801f` was made with `--no-verify`.
- The CI bundle-budget step is unproven until a PR runs it.
- Whole-tree `supabase test db` fails: 279 non-pgTAP files plus 2 llm failures.
- There is no prettier config, so the Luna executors churned formatting.
- PostHog identify also sends `display_name` and `role`.

## Gates run at integration

- `pnpm --filter @patina/supabase type-check && test && build`
- `pnpm --filter @patina/designer-portal type-check`
- `apps/designer-portal`: `pnpm exec jest --maxWorkers=3` (860 suites, 11974 tests at a968ff0d0)
- S5 bundle budget: `/desk` 1255 KiB gzip (budget 1314.5), `/doc/[id]` 1574 KiB (budget 1648.1)
