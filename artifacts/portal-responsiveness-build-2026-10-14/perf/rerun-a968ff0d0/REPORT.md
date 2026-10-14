# US-34 perf re-run (SQ-1014): gap-wave scenarios on main `a968ff0d0`, flags ON

Measured on 2026-10-14 at main `a968ff0d0f96fa4e1454f05c8f6fb426a53a120d`, which carries the gap wave
(SQ-1010 to SQ-1013) and SQ-1009. Only the scenarios the gap wave touched were run: P2, P3hard, P4, P5,
P6 and P10. Values are **median [min–max]** in ms over 3 runs. Medians use the lower middle value
(`../stats.mjs`). This report gives measurements and gate verdicts. It does not recommend.

## Method (same as SQ-1002's flags-ON run, `../after/REPORT.md` §Method)

- **Build**: `pnpm turbo run build --filter='@patina/designer-portal^...'`, then `next build --webpack`
  and `next start -p 3000`. Only the flags-ON build was made.
- **Flags**: SQ-1002's run files do not record the override string, so it was rebuilt from the set that
  report documents (the E1/F17 walk set plus the two US-34 flags). The exact value used:
  `one-voice:true,ask-the-paper:true,agreement-parts:true,agreement-library:true,client-invite-letter:true,arrival-arc:true,studio-workspaces:true,design-build:true,threshold:true,procurement-workspace-pilot:true,room-file:true,tester-notes:true,onboarding-teammate-persona:true,worktable:false,room-view-refined-path:false,field-line-trades:false,optimistic-ink:true,loading-register:true`.
  The parser (`use-feature-flag.ts` `parseFlagOverride`) does not depend on the order. The build output
  carried `loading-register:true` and `127.0.0.1:54321`. The env came from the process environment; no
  `.env.local` was written. No PostHog flag was created.
- **Data**: local Supabase only (`http://127.0.0.1:54321`, checked first). No reset, and no migration
  was applied: no migration changed between `2c9bc94ac` and `a968ff0d0`, and `desk_read`, `document_open`
  and `restore_product_image` were present. The P6 fixture was created and removed by
  `fixtures.mjs`. Afterwards, 0 fixture task rows remained.
- **Harness**: `artifacts/portal-responsiveness-2026-10-14/baseline/harness/lab.mjs` as on main. It
  includes SQ-1010's P6 settle-after-scroll, and it was not changed. Note that the ticket's path
  (`perf/baseline/harness/`) does not exist; the harness lives under the US-33 artifact tree. The run used
  `run-all.sh` with `SPECS="P2 3 1440;P3hard 3 1440;P4 3 1440;P5 3 1440;P6 3 1440;P10 3 1440"`.
  `STATE` came from `lab.mjs explore` and then `setup` (no welcome modal was shown).
- **Conditions**: 4x CPU, Fast 4G, 1440x900, headless Chromium, one browser at a time, `ARRIVAL` opt-in
  **on** (`arrivalOptIn: true` in every run file). There were 18 rows, 0 errors and 0 capped.
- **Quiet host**: no tsc, jest, next build or turbo ran during the runs. Only idle editor tsservers and a
  sibling site's `next-server` on :3011 were running. Host load at run start was **5.3–7.0** (P2 6.2–6.3,
  P3hard 5.4–5.6, P4 5.3–5.4, P5 6.4–7.0, P6 6.0–6.3, P10 5.5–5.9). SQ-1002 ON ran at 5.2–14.8, and F17
  at 3.8–16.
- **F4 extras**: throttled waterfalls (`lab.mjs waterfall doc` and `waterfall doc/<id>/pieces`) are in
  `traces/`, tallied by `../probe.mjs kinds`. The SPA probe is in `probe-spa.json` (`../probe.mjs spa`).
  A read-only URL probe recorded the full query of each `project_ffe_items` read. It lives in the board's
  verification dir, `SQ-1014/ffe-urls.json`. The pieces waterfall has no `usable` mark, because the
  harness has no `SEL` for the route, so it ran to the 40 s cap. Only its request kinds are used.

Files: `local-P*-1440.json` (run JSONs), `table.md` (`compare.mjs --table`), `compare-vs-sq1002-on.md`
(`compare.mjs rerun-a968ff0d0 after/flags-on`), `compare-vs-f17-baseline.md`
(`compare.mjs rerun-a968ff0d0 baseline`), `traces/`, `probe-spa.json`. Both compare files also list the
scenarios this re-run did not cover as `missing-in-run`.

## Results against SQ-1002 ON and F17

`requests` is every request in the window. `api` is the Supabase subset.

| Scenario | Placeholder (B2): F17 → SQ-1002 ON → now | Usable: SQ-1002 ON → now | First change: SQ-1002 ON → now | CLS: SQ-1002 ON → now | Requests / api: SQ-1002 ON → now |
|---|---|---|---|---|---|
| P2 Desk → Document | 989 → 290 [285–294] → **281 [278–290]** | 4204 [4198–4249] → **4043 [4023–4055]** | 218 → **211 [210–216]** | 0 → **0** | 100 / 79 → **97 / 79** |
| P3hard /pieces | — → 764 [758–768] → **764 [759–764]** | 3401 [3217–3403] → **3812 [3775–3835]** | 836 → **836 [835–838]** | 0.1811 → **0.0084 [0.0065–0.0095]** | 111 / 31 → **131 / 31** |
| P4 → People | — → 370 [315–370] → **203 [199–224]** | 1075 [1065–1085] → **649 [641–682]** | 263 → **134 [124–140]** | 0 → **0** | 19 / 7 → **17 / 7** |
| P5 → Library | 641 → 347 [332–354] → **266 [252–270]** | 913 [892–927] → **470 [461–471]** | 253 → **191 [186–195]** | 0.0067 → **0.0067** | 35 / 14 → **30 / 14** |
| P5 search | 256 → 280 [251–286] → **264 [255–286]** | 479 [455–486] → **455 [447–464]** | 16 → **16 [16–17]** | 0.1429 → **0.1429** | 8 / 2 → **8 / 2** |
| P6 tick | — → 269 [259–277] → **113 [110–114]** | tickShowsState 217 [214–217] → **68 [67–70]** | 7 → **49 [47–51]** | 0.1578 → **0** | 12 / 7 → **4 / 4** (refetches 3 → 3) |
| P6 untick | — → 76 [68–78] → **53 [51–63]** | tickShowsState 50 [48–54] → **44 [40–54]** | 39 → **34 [31–40]** | 0 → **0** | 4 / 4 → **4 / 4** (refetches 3 → 3) |
| P10 Document → Desk | 275 → 285 [282–313] → **279 [276–285]** | 910 [894–913] → **885 [873–893]** | 258 → **253 [250–258]** | 0.0166 → **0.0166** | 44 / 7 → **44 / 7** |

Against F17, `usable` is P2 19256 → 4043, P3hard 6125 → 3812, P4 1156 → 649, P5 844 → 470 and
P10 16644 → 885. P6 tickShowsState is 649 → 68, and untick 431 → 44 (`compare-vs-f17-baseline.md`).

As measured, against SQ-1002 ON (`compare-vs-sq1002-on.md`: 12 metrics above SQ-1002's max):

- **P3hard** `content`/`usable` 3401 → 3812 (+411). Total requests 111 → 131 (+20, all outside
  Supabase: `api` stays 31). Depth 3 → 4. LCP and `noBusy` move with `usable`; DOM mutation batches
  78 → 85; long-task time 627 → 642 ms. Commit `39f065010` (SQ-1012) is in this range; its subject says
  Pieces holds its sheet until rooms, lines and placements answer.
- **P6 tick** `firstChange` 7 → 49. In SQ-1002's window, the lens-band pin from the scroll landed inside
  the tick's timer (SQ-1010). With the settle, the first mutation is the tick's own.
- Smaller items: P4 `reactCommits` 14 → 15, P5 `longTaskMs` 83 → 103, and P5 search `settled` 834 → 869.

## Gate verdicts (against SQ-1002 ON)

| Gate | SQ-1002 ON | Now | Verdict |
|---|---|---|---|
| B2 ≤200, P2 | 290 [285–294] | **281 [278–290]** | **FAIL** (see the note below) |
| B2 ≤200, P4 | 370 [315–370] | **203 [199–224]** | **FAIL** by 3 ms at the median; 1 of 3 runs ≤200 (199) |
| B2 ≤200, P5 | 347 [332–354] | **266 [252–270]** | **FAIL** |
| B2 ≤200, P10 | 285 [282–313] | **279 [276–285]** | **FAIL** |
| N3 P6 tick ≤100 | 217 [214–217] | **68 [67–70]** | **pass** (3 of 3) |
| N3 P6 untick ≤100 | 50 [48–54] | **44 [40–54]** | **pass** (3 of 3) |
| N14 Pieces (P3hard) CLS <0.05 | 0.1811 | **0.0084 [0.0065–0.0095]** | **pass** (3 of 3) |
| F4 `project_ffe_items` on P3hard | not measured on P3hard (Document hard load 2, SPA 1) | **2** on the P3hard load; Document hard load **2**; Document → pieces SPA **1** | **FAIL as written** (gate: 1 on a hard load, 0 on the SPA). The counts are unchanged from SQ-1002 |

- **P2 note (SQ-1013)**: P2 clicks `a[href="/doc/<DOC>"]` on the Desk, a row below the fold, as SQ-1013
  found. The harness was not changed, so 281 is the number as measured on that row.
- **F4 detail** (full queries in `SQ-1014/ffe-urls.json`): the two reads on `/doc/[id]/pieces` are
  different queries, both fired at the same moment. One is the full line list (`select=*,…`,
  `removed_at=is.null`). The other is the removed-lines list (`select=*`, `removed_at=not.is.null`,
  `order=removed_at.desc`). On `/doc/[id]` the two reads are the same full line list plus a narrow money
  select (`select=id,line_total_cents,trade_price_cents,unit_price_cents,quantity,status,project_room_id,item_type,currency`).
  So there is no duplicate of the same query on either load.

## What was not done

- Scenarios outside the gap wave: P1, P1hard, P2hard, P3, P7, P8 and P9. There was no flags-OFF build,
  no 390 runs and no screenshots.
- No harness change, no product change and no DB reset. `:3000` was stopped at the end, and nothing of
  this run is still listening.
