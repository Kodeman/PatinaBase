# US-34 pre-fix baseline (F17, SQ-966)

The numbers every US-34 fix is measured against. Captured on the unchanged tree at base
`19edde5f26452edfe5bddb60196150bd785b40d0`, before any wave-1 fix landed.

## Method

- **Build**: `pnpm turbo run build --filter='@patina/designer-portal^...'`, then
  `next build --webpack` and `next start -p 3000` in `apps/designer-portal`. Production build, not dev.
- **Data**: local Supabase (CLI stack, :54321/:54322) with the repo seeds, plus
  `artifacts/designer-portal-uplift-2026-10-09/walk/seed_uplift_walk_v2.sql` (Leah's studio, 20 projects).
  No request reaches Strata or `*.patina.cloud`; the only outside origin is the public Sanity help CDN
  (`kv3qrinl.apicdn.sanity.io`, read-only help docs on the desk and People).
- **Flags**: `NEXT_PUBLIC_FLAG_OVERRIDES` set to the E1 walk set (`WALK.md` lines 9–12): one-voice,
  ask-the-paper, agreement-parts, agreement-library, client-invite-letter, arrival-arc, studio-workspaces,
  design-build, threshold, procurement-workspace-pilot, room-file, tester-notes,
  onboarding-teammate-persona on; worktable, room-view-refined-path, field-line-trades off.
- **Throttling**: CDP 4x CPU plus the Chrome DevTools "Fast 4G" preset (165 ms, 1.0125 MB/s down,
  168.75 kB/s up), 1440 x 900, Playwright headless Chromium, one browser at a time.
- **Runs**: 3 per scenario: P1–P10 plus the three hard loads (P1hard, P2hard, P3hard).
  `sh harness/run-all.sh` with `OUT` pointing here. Medians are the lower middle value.
- **Host load**: every row records `hostLoad`, the host's 1-minute load average when the run starts.
  CDP throttling multiplies whatever CPU the host leaves free, so a contended host inflates every
  CPU-bound mark. It is recorded, not gated.

## What the harness measures (new in F17)

| Field | Meaning |
|---|---|
| `authUser` | Requests to `/auth/v1/user` inside the window |
| `reactCommits` | React commits, counted by a DevTools global hook installed before React loads. Counts only, no durations |
| `cls`, `layoutShifts` | Layout-shift sum (no recent input) and count |
| `arrivalStart` / `arrivalPlayStart` / `arrivalEnd` / `arrivalPlayed` | First `arr-pre`/`arr-on`/`[data-arrival-held]`; first `arr-on` (the arrival itself); when none remain; whether `arr-on` was ever seen |
| `writeStart`, `writeEnd` | The first write request matching the scenario's table |
| `refetchesAfterWrite` | API reads that start after the write ends (auth and edge functions excluded) |
| `tickShowsState`, `phaseShowsState`, `pendingShown`, `roomShown`, `sendingShown` | When the write's visible state appears, timed from the click by a DOM watch on every mutation batch |
| `externalRequests` | Origins outside localhost |

## Write scenarios and their fixtures

All writes go to local fixtures that `harness/fixtures.mjs` creates before each run and removes after it.
It refuses any database URL that is not local.

- **P6**: tick and untick of a fixture task in "The work" on Aspen (`…c0d1`), the same control E1 timed.
- **P7**: advance a phase. Aspen's phases cannot advance (a blocker, then "multiple live main phases"),
  so P7 uses Marrow & Vale (`b0000000-…-0000000000d4`): phase "Procurement & Orders" to
  "Millwork & Fabrication". Both phases are snapshotted and restored after every run.
- **P8**: add a room "SQ-966 perf room" under Pieces; deleted after every run.
- **P9**: edit a fixture draft's body in the outbound review panel and press Send, timed up to "Sending".
  Every `/functions/v1/` request is aborted in the browser, and teardown asserts the draft was never
  claimed or sent. The send never completes, so P9 times the optimistic state only.

## Gate result

`node artifacts/portal-responsiveness-build-2026-10-14/perf/check-baseline.mjs`: **PASSED, 53 checks.**
P6 tick-shows-state 648 / 649 / 649 ms (median 649, gate band 579–789 from E1's 748 [579–789]).
Refetches after the write 27 / 27 / 27 (gate band 27–29). Host load at run start was 3.8–16.

An earlier capture on the same build, with the host at load 230 on 14 cores (sibling type-checks), put
the P6 median at 820 ms with the same 27 refetches. The band was not changed. The host was quieted, the
capture was repeated once, and that capture is the one kept here. See the SQ-966 thread.

## Results (medians [min–max], ms from the input; 3 runs each)

Regenerate with `node compare.mjs --table baseline`. Compare a later run with
`node compare.mjs <runDir>` (`--json`, `--strict`).

| Scenario | n | firstChange | placeholder | usable | settled | apiRequests | authUser | reactCommits | cls | arrivalStart | arrivalPlayStart | arrivalEnd | writeEnd | refetchesAfterWrite | visible state |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P1-1440 | 3 | 26 [25–34] | 2466 [2447–2498] | 23732 [23725–23827] | 23916 [23889–24006] | 98 | 18 | 3685 [3247–3690] | 0.0652 [0.0651–0.0652] | 3380 [3355–3416] | 8785 [8780–8873] | 23709 [23703–23797] | — | — | — |
| P10-1440 | 3 | 254 [240–259] | 275 [261–283] | 16644 [16633–16710] | 16820 [16812–16882] | 31 | 1 | 23 | 0 | 254 [241–260] | 1696 [1683–1745] | 16623 [16611–16677] | — | — | — |
| P1hard-1440 | 3 | 821 [816–880] | 691 [681–745] | 8074 [8072–8085] | 8801 [8797–8807] | 93 | 16 | 9597 [9204–10093] | 0.3879 [0.3879–0.388] | 3233 [3220–3236] | — | 8026 [8024–8026] | — | — | — |
| P2-1440 | 3 | 209 [209–210] | 989 [987–1015] | 19256 [19247–19337] | 19444 [19410–19505] | 83 | 5 | 110 [107–110] | 0.0319 | 977 [976–1001] | 4710 [4693–4787] | 19229 [19210–19302] | — | — | — |
| P2hard-1440 | 3 | 827 [826–828] | 726 [714–727] | 8120 [8100–8162] | 10638 [10613–10640] | 147 | 21 | 11298 [10990–11394] | 0.1093 | 3519 [3490–3522] | — | 8077 [8069–8088] | — | — | — |
| P3-1440 | 3 (3 capped) | 37 [34–40] | — | — | 40176 [40173–40188] | 8 [8–9] | 1 | 16 [16–17] | 0 | — | — | — | — | — | — |
| P3hard-1440 | 3 | 833 [831–834] | — | 6125 [6119–6146] | 7630 [7617–7679] | 72 | 17 | 10371 [10326–10658] | 0.1821 | — | — | — | — | — | — |
| P4-1440 | 3 | 251 [246–255] | — | 1156 [1139–1171] | 1692 [1670–1701] | 9 | 1 | 12 [11–12] | 0 | — | — | — | — | — | — |
| P5-1440 | 3 | 242 [239–243] | 641 [629–649] | 844 [838–849] | 1560 [1548–1571] | 14 | 0 | 12 | 0.0067 | — | — | — | — | — | — |
| P5-1440:search | 3 | 15 [15–17] | 256 [250–259] | 457 [452–460] | 797 [797–800] | 2 | 0 | 3 | 0.1429 | — | — | — | — | — | — |
| P6-1440:tick | 3 | 8 [8–9] | — | — | 1317 [1316–1319] | 31 | 0 | 12 [12–13] | 0.1514 | — | — | — | 415 [412–415] | 27 | tickShowsState 649 [648–649] |
| P6-1440:untick | 3 | 241 [232–243] | — | — | 1107 [1101–1113] | 28 | 0 | 6 | 0 | — | — | — | 209 [201–215] | 27 | tickShowsState 431 [425–433] |
| P7-1440 | 3 | 34 [26–35] | 103 [90–203] | — | 1270 [1254–1385] | 31 | 0 | 13 [11–13] | 0 [0–0.0002] | — | — | — | 276 [269–383] | 30 | phaseShowsState 548 [541–637] |
| P8-1440 | 3 | 38 [38–42] | — | — | 1052 [1038–1054] | 3 | 0 | 6 | 0.0121 | — | — | — | 426 [413–426] | 1 | roomShown 638 [626–644] |
| P9-1440 | 3 | 30 [30–32] | 65 [53–77] | — | 1626 [1615–1630] | 7 | 0 | 10 | 0.0112 | — | — | — | 230 [230–235] | 5 | sendingShown 46 [45–47] |

P3 is capped in every run, as it was in SQ-952: the rail "Pieces" click scrolls inside the Document
and never routes to `/pieces`, so there is no content mark.

## Findings for the fix waves

- **The arrival never played in SQ-952 or E1.** `lib/arrival/gate.ts:22` declines under
  `navigator.webdriver` unless the tab carries the e2e opt-in (`pl-arrive-e2e`). This harness sets the
  opt-in by default. Each run file records it as `arrivalOptIn`, and `ARRIVAL=0` reproduces SQ-952.
  Compare runs only against a baseline captured with the same setting. With the arrival on, under
  throttling:
  - P1, sign-in to the Desk: held from 3.4 s, plays from 8.8 s, ends 23.7 s. `usable` is 23.7 s
    (SQ-952 without the arrival: 7.2 s).
  - P2, Desk to Document (SPA): plays from 4.7 s, ends 19.2 s. `usable` is 19.3 s (SQ-952: 1.5 s).
    `gate.ts:28` says "a Document arrives on every open", so this is on every Document open.
  - P10, Document to Desk (SPA), fresh tab: `usable` is 16.6 s (SQ-952: 1.4 s). A designer who has
    already seen the Desk this visit skips it (`desk-shown`), so P10 overstates the repeat case.
  - Hard loads (P1hard, P2hard): `arr-pre` holds from about 3.3 s to 8.0 s and the arrival never
    plays. `usable` sits on `arrivalEnd` (8.07 s against SQ-952's 6.97 s and 6.77 s).
- **React commit storm on throttled hard loads.** P1hard, P2hard and P3hard commit 9.2k–11.4k times.
  P1 commits 3.2k–3.7k, against about 110 for the P2 SPA open. An unthrottled probe of the same hard
  load (not in this data) committed about 120 times, so the storm grows with CPU starvation. The cause
  was not investigated; it belongs to S1.
- **P6 untick** shows its state at 431 ms (E1: 456–470), with the same 27 refetches as the tick.
