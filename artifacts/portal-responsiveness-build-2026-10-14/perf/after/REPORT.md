# US-34 perf gate (SQ-1002): integrated main against the F17 baseline

Measured on 2026-10-14 at main `2c9bc94ac`, which carries every US-34 build ticket and both F1 fix rounds
(SQ-1003, SQ-1008). The baseline is `../baseline/` (F17, SQ-966, base `19edde5`). Values are
**median [min–max]** in ms over 3 runs unless a unit is given. Medians use the lower middle value
(`stats.mjs`). This report gives measurements and gate verdicts; it does not recommend.

## Method (same as F17 unless noted)

- **Build**: `pnpm turbo run build --filter='@patina/designer-portal^...'`, then `next build --webpack`
  and `next start -p 3000`, run twice: once with the flags **OFF** and once with them **ON**.
- **Flags**: `NEXT_PUBLIC_FLAG_OVERRIDES` = the F17 walk set plus `optimistic-ink` and
  `loading-register`, both `false` (build A) or both `true` (build B). No PostHog flag was created.
  `useFeatureFlag` honours the override first; it is inlined at build time, hence two builds.
- **Data**: local Supabase only (`http://127.0.0.1:54321`, checked before every DB action). No reset:
  the ledger lacked only 00793, so 00791–00793 were re-applied from main's files (all
  `CREATE OR REPLACE` + grants). The F17 fixtures created and removed every write target.
- **Throttling and arrival**: 4x CPU, Fast 4G, 1440x900, headless Chromium, one browser at a time,
  `ARRIVAL` opt-in **on** (same as F17). Host load at run start: OFF 4.4–8.5, ON 5.2–14.8 (F17: 3.8–16).
- **Harness change (selectors only)**: F16 gave the tick one name plus `aria-pressed`
  (`coordination-work.tsx:204-205`). The F17 P6 selector for the done state (`Mark "X" not done`) never
  matched, so the first OFF capture's 3 P6 rows were errors. `baseline/harness/lab.mjs` P6 now matches
  either DOM: done = the old label **or** `Mark "X" done` with `aria-pressed="true"`; undone = `Mark "X"
  done` without it. The timing logic is unchanged. P6 was re-run with flags OFF (into `after/`), and the
  ON run used the fixed harness. **The P6 comparison therefore reads a different DOM signal for the same
  visible state**: today's checked stamp, not yesterday's label swap.
- **Extras** (flags OFF build): `bundle-budget.mjs` on the ANALYZE build (the analyzer only writes a
  report; it changes no chunk); `lab.mjs waterfall desk|doc` (`traces/`); `probe.mjs` request-kind
  tallies (`request-kinds.json`) and the SPA probe (`probe-spa.json`); `band-check.mjs` for the
  `saving…` band (`band-check.json`). There is also a supplementary **ARRIVAL=0** run of P1, P1hard, P2,
  P2hard, P3hard and P10 (`arrival-off/`), so the B3 budgets can be read without the US-14 arrival.

Files: `local-P*.json` (flags OFF, the pinned verifier's run), `flags-on/`, `arrival-off/`,
`compare-flags-off.md`, `compare-flags-on.md` and `compare-on-vs-off.md` (`compare.mjs <run> <baseline>`),
and `table-*.md` (`compare.mjs --table`). Note that the pinned verifier
(`compare.mjs baseline after`) passes `after` as the *baseline* argument, so its deltas read inverted.
Use `compare-flags-off.md` for the signed comparison.

## Headline (usable, ms)

| Scenario | F17 baseline | OFF | ON | ARRIVAL=0, OFF (SQ-952 no-arrival figure) |
|---|---|---|---|---|
| P1 sign-in → Desk | 23732 | 18664 | **4916** | 4226 (7153) |
| P1hard /desk | 8074 | **19170** | 4198 | 3509 (6974) |
| P2 Desk → Document | 19256 | 18797 | **4204** | 1304 (1464) |
| P2hard /doc/[id] | 8120 | **21212** | 6852 | 3679 (6773) |
| P3hard /pieces | 6125 | 3275 | 3401 | 3405 (6154) |
| P4 → People | 1156 | 1085 | 1075 | — (1136) |
| P5 → Library | 844 | 902 | 913 | — (862) |
| P10 Document → Desk | 16644 | 15887 | **910** | 702 (1415) |

- **Hard loads regressed with flags OFF, because the arrival now plays.** In F17, `arr-pre` held from
  about 3.3 s to 8.0 s and the arrival never played on a hard load. On main it plays (OFF: P1hard plays
  from 4.2 s and ends at 19.1 s; P2hard plays from 6.7 s and ends at 21.2 s), so `usable` waits for it to
  end. The load itself got faster: P1hard `content` 8074 → 5544 and depth 19 → 4. P2hard `content`
  8120 → 18548 because the Document's h1 is held during the run. With `ARRIVAL=0` the same build loads
  P1hard in 3509 and P2hard in 3679.
- **With `loading-register` ON (arrival C), the arrival is never the long pole**: `arr-on` never
  appears, and P1 (4.9 s), P2 (4.2 s) and P10 (0.9 s) are 4–18x faster than F17.
- **The React commit storm is gone**: P1hard 9597 → 68, P2hard 11298 → 151, P3hard 10371 → 62 commits.
- **Requests**: P1hard API 93 → 30, P2hard 147 → 103, P1 98 → 33. `auth/v1/user` is 0–1 on every
  scenario (F17: up to 21).

## Proving gates (plan §3)

Verdicts: **pass**, **FAIL** or **not-measurable** (n/m, meaning the lab cannot observe the gate; the
named ticket's own tests carry it). "As measured" uses the F17 marks: B1 is the first DOM mutation and B2
is the first visible `aria-busy`, skeleton, StrataSweep or "Picking up" mark.

### Fix now

| Id | Gate | Number | Verdict |
|---|---|---|---|
| F1 | `auth/v1/user` 16–21 → ≤2 per hard load | P1hard 16→**0**, P2hard 21→**1**, P3hard 17→**0** (OFF and ON) | **pass**. The A→B tests are jest (SQ-1003/1008): n/m here |
| F2 | Desk invocations 2 → 1 | Desk hard load: `document_state` 2→**0**, `desk_read` **1**; Supabase requests 95→30 | **pass** |
| F3 | 0 `document_state` after the click; P2 usable | after the click: `document_state` **0**, `document_open` 1. Hover fired **0** requests. P2 usable 19256→18797 (OFF), 1304 with ARRIVAL=0 (SQ-952 1464) | **pass as written**. The intent prefetch was not observed on a Playwright hover; the row is read once after the click via `document_open` |
| F4 | Document hard load: 1 `project_ffe_items`; P3 SPA: 0 | hard load 3→**2**; SPA Document→pieces (router.push) **1** | **FAIL** (2 and 1) |
| F5 | P6 refetches ≤3 | 27→**4** OFF (`project_tasks`, `document_open`, scoped `desk_read` (the N7 need), `get_project_workflow`); **3** ON (no `project_tasks`: the receipt merges) | **FAIL OFF by one (4)**, pass ON. The Desk test is n/m |
| F6 | send invalidates `docKeys.desk()` (unit test) | — | n/m |
| F7 | `immutable` on `/_next/static/*`; 304s 63 → 0 | `public/_headers` carries `public,max-age=31536000,immutable`; `next start` does not serve `_headers` and prod was not probed | n/m (file present) |
| F8 | no `crypto-browserify` chunk | `bundle-budget.mjs`: crypto modules **0**, chunks **0** | **pass** |
| F9 | `auth/signin` manifest design-system modules 84 → about 0 | **92** `.tsx` (106 entries) in `auth/signin/page_client-reference-manifest.js` | **FAIL** |
| F10 | lucide modules "in the tens", not 1,584 | **140** (S5 tripwire 200) | **FAIL as written** (140 > 99); 91% cut; within the S5 budget |
| F11 | PostHog properties, `portal_usable` | no PostHog in the lab | n/m |
| F12 | numbers in the next deploy report | no deploy | n/m |
| F13 | B2 ≤200 on P3hard, P4, P5; no blank 200 ms frame; `aria-busy` on the fallback | P3hard placeholder none→**760** (FCP 760: at first paint); P4 none→**368 [311–373]**; P5 641→**343 [333–351]** | P3hard **pass under PQ1**; P4 **FAIL** (368); P5 **FAIL** (343). Screens not captured |
| F14 | jest boundary tests | — | n/m |
| F15 | RTL per unit | — | n/m |
| F16 | visible change ≤100 ms, 3 of 3 | first change: P1 **39 [18–42]**, P6 tick **8 [5–8]** pass; P2 **218**, P4 **251**, P5 **250**, P10 **269** | P1 and P6 **pass**; the SPA navigations **FAIL as measured**. Their press state is CSS `:active`, which a DOM-mutation mark cannot see. 44 px: n/m |
| F17 | harness runs; P6 is a distribution | every scenario 3/3 in both builds, after the selector-only P6 fix above | **pass** |

### Next

| Id | Gate | Number | Verdict |
|---|---|---|---|
| N1 | `auth/v1/user` ≤2 everywhere (P2 SPA was 5) | P2 5→**1**; every scenario 0–1, OFF and ON | **pass** |
| N2 | jest | — | n/m |
| N3 | P6 value ≤100 ms, 3 of 3 (ON) | ON: tick **217 [214–217]**, untick **50 [48–54]**. OFF: 691 / 430. F17: 649 / 431 | **FAIL** on tick (217); untick passes. The forced-500 and RLS-row restores are n/m |
| N4 | row ≤100 ms (ON) | ON: confirmed `h3` row **315 [310–317]** (F17 638; OFF 672). `aria-busy` (ghost or "Adding…") at **91 [87–94]** ON, 87 OFF. One POST and 1 refetch | **n/m as written**: the F17 watch times the confirmed row, and the ghost has no separate mark. The confirmed row halves |
| N5 | lab P7: list changes in the same frame | P7 phase state **353** OFF / **334** ON (F17 548); refetches 30→**7** | n/m: no list-frame mark (numbers given) |
| N6 | per-action refetch counts | P6 27→4 (OFF) / 3 (ON); P7 30→7; P8 1→1; P9 5→5 | **pass** (reported; every count is the same or lower) |
| N7 | 0 Desk-shaped tables on a Document | Document hard load: `document_state` 2→**0**, `outbound_drafts` 1→**0**; 1 scoped `desk_read` (N7's need read, decision #9) | **pass** (the one scoped read is by design) |
| N8 | 24+1+N → 1; EXPLAIN ≤150 ms prod-shaped; RLS parity | Desk: one `desk_read` RPC, 95→30 requests | 1-read part **pass**; EXPLAIN and RLS n/m |
| N9 | jest over six branches | P2hard depth 25→8 | n/m |
| N10 | B2 on P2/P10 (≤200); CLS < 0.05 (ON) | placeholder P2 **290 [285–294]**, P10 **285 [282–313]**; CLS P1 0.0265, P1hard 0.0278, P2 0, P2hard 0.0075, P10 0.0166 | B2 **FAIL** (290, 285); CLS **pass** |
| N11 | the navigation rule | no rule mark in the lab | n/m |
| N12 | RTL; band check (below) | `saving…` clear at 1440 and 390; the offline line overprints | n/m (RTL); see the band check |
| N13 | middleware tests; prod `/desk` ≤60 ms | prod not probed | n/m |
| N14 | CLS < 0.05 on Library, boards, Pieces, Room | Library (P5) **0.0067**; Pieces (P3hard) **0.1811** (F17 0.1821); boards and Room not in the lab | Library **pass**; Pieces **FAIL** (0.18); the rest n/m |
| N15 | Undo restores; concurrent edit survives | not in the lab | n/m |

### S5 bundle budget (`scripts/bundle-budget.mjs`, flags OFF ANALYZE build): **passed**

`(document)/desk` 1255.1 KiB gzip (budget 1314.5 KiB, 62 chunks); `(document)/doc/[id]` 1574 KiB
(budget 1648.1 KiB, 70 chunks); `crypto-browserify` 0; lucide 140 of 200. No `.open-next` handler was
built, so the 30 MiB handler warning was not evaluated. Output: `bundle-budget.txt`.

## `saving…` band against the lens band's right slot (N12a carry-over)

`band-check.mjs` held the tick's PATCH for 6 s (`saving`) or went offline (`offline`). It measured the
text rects of `[data-saving-band]` and the visible `[data-lens-right-flush]`. On this fixture (Aspen Loft),
the right slot prints "INSTALL 23 NOVEMBER". Money prints there when a job has money; this fixture has none.
The 390 Document does not mount the fixture's work block, so the 390 rows press at 1440 and then resize
while the write is still pending. Screenshots are in the board's verification dir, `SQ-1002/band-*.png`.

| Viewport | State | Band text rect | Right-slot rect | Overlap |
|---|---|---|---|---|
| 1440 | `saving…` | x 1376–1422, y 20–34 | x 1012–1154, y 9–23 | **none** (222 px gap) |
| 1440 | offline line | x 1079–1422, y 20–34 | x 1012–1154, y 9–23 | **188 px²**: it overprints the slot's right end and line 2's "All open · 3", and is cut off by the right rail |
| 390 | `saving…` | x 326–372, y 20–34 | (the slot prints nothing at 390) | **none** |
| 390 | offline line | x 29–372, y 20–34 | — | no right-slot text, but it overprints line 2's "NEXT" lead |

Verdict: `saving…` does not cover the right-slot (money) text at 1440 or 390. The offline line
("Offline. Ticks and edits will save when you're back.") does collide at both widths.

## What was not done

- 390 lab runs and SHOTS screenshots (F17 skipped them too).
- Prod probes (F7 304s, N13, F12), PostHog (F11), EXPLAIN ANALYZE and RLS parity (N8). None is lab work.
- Re-running each ticket's jest/RTL gate. Those ran per ticket and in the integrator's combined gates.
- The ON build was not run through `bundle-budget.mjs`. The flags change which code runs, not what is
  bundled: both values are inlined into the same chunks.
