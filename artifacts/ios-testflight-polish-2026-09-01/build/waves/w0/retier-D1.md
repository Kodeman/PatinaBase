# First Flight · W0 — RETIER, ruling D1

Written by RETIER on 2026-09-02, after `build/rulings-2026-09-02.md` (D1 / D1a). Nothing in this file
authorises a production write; no code was touched. Two files changed:
`build/findings.json` (backed up first to `build/findings.json.bak2`) and `build/findings-by-lane.md`
(regenerated from `findings.json`). **`PROGRAM.md` is NOT edited here** — §8 lists exactly which of its
tables the closer must amend.

---

## 1. What D1 changes about the corpus

`house-first` is ON for every round-one tester (and D1a makes it the first-launch default), so the
**four-tab root — Today · Spaces · Pieces · Studio, the hoisted tour, the Studio tab — is the shipped
product**, and the single-stack Today root with its floating Companion dock is now only the PostHog
kill-switch fallback.

The whole audit was tiered on the opposite premise. Two mechanisms in the source decide almost every
row's root scope, and both are unambiguous in the code:

| Mechanism | Source | Consequence |
|---|---|---|
| The root is chosen once, at launch | `ContentView.swift:149` — `if coordinator.isHouseFirstRoot { HouseFirstRoot() } else { legacyMainContent }` | Two complete, separately-composed roots. `HouseFirstRoot` mounts four `NavigationStack`s under `PatinaTabBar` as a bottom `safeAreaInset`, and hosts `FirstLaunchTour` above all four. |
| The floating Companion **retires** on the four-tab root | `CompanionOverlay.swift` — `if coordinator.isHouseFirstRoot, !state.isExpanded { return .hidden }`, with the comment *"the bar's trailing slot IS the collapsed Companion, so the floating dock retires entirely — mark, caption, nudge pill and all"* | Every "the orb / dock / its caption overprints content" finding is a **flags-off-only** finding. The expanded Companion panel is still drawn on both roots, so panel findings stay `both`. |

## 2. Method

Every one of the **629** findings was given a `rootScope` from its own evidence (`title`, `where`,
`evidence`, `fix`, `codeNote`, `judgeNote`), read against the two mechanisms above:

- **`flags-on-only`** — the surface exists only under `house-first`: `PatinaTabBar`, the four tab roots
  as tab roots, `isTabRoot`-gated chrome, tab reselection, `HouseFirstRoot`'s mounted-tab ZStack.
- **`flags-off-only`** — the surface exists only with the flag off: the resting Companion orb / dock /
  its caption, `ContentView`'s `companionHearthReservation`, the Today root's own doors (the buried
  Spaces / Browse / Saved routes), the flags-off `.heroFrame` reset.
- **`both`** — an in-app surface that renders the same way under either root (auth, onboarding, quiz,
  money screens, rooms, messaging, notifications, the **expanded** Companion panel, the tour's own copy
  and chrome — `FirstLaunchTour` is hosted by *both* roots, only from different parents).
- **`n/a`** — not an in-app-root question at all: every `L0.x` lane row (build configuration, production
  backend, catalogue content, Sanity, App Store Connect, PostHog), `L2-G` (tests and gates), and the
  eleven rows whose surface is the **widget extension's own rendering** (it draws outside the app).

Then D1's re-tier rules were applied:

- `flags-on-only` **blocker/major on a day-one surface → T0/W1**; `flags-on-only` **minor → T1/W2**.
- `flags-off-only` **keeps its tier** and **moves to W2** unless it is a blocker.
- `both` / `n/a` — tier, wave and lane untouched.

**Lane is unchanged on every row.** The twelve moved rows all land in W2, where the collator's own W2
lane assignment already applied; none of them crosses an owned file set, so no lane needed re-deriving.

### rootScope census (all 629)

| rootScope | rows |
|---|---:|
| `both` | 520 |
| `n/a` | 81 |
| `flags-off-only` | 17 |
| `flags-on-only` | 11 |

---

## 3. The delta — twelve rows

Every row below carries `retieredBy: "D1 2026-09-02"` and a `retierNote` in `findings.json`.

| id | old tier/wave/lane | new tier/wave/lane | sev | reason |
|---|---|---|---|---|
| `A1-03` | T0 / W1 / L1-C | **T0 / W2** / L1-C | major | flags-off-only. Its own `codeNote` corrects the title: *"Real on the FLAG-OFF root only … house-first mounts PiecesTabRoot and the Pieces tab is on screen while Today is showing."* The shipped root has the door. |
| `A1-04` | T0 / W1 / L1-C | **T0 / W2** / L1-C | major | flags-off-only. `SavedDoorRow` draws `if isTabRoot` (`RecommendationsView.swift:115`) — true only on the house-first Pieces tab, so with the flag on the guest has a Saved door. |
| `A4-07` | T0 / W1 / L1-C | **T0 / W2** / L1-C | major | flags-off-only, and the title says so: *"the flag-off Today root has no door to Browse pieces or to design help."* Its own first remedy is *"target `house-first` for testers"* — which is what D1 does. **Residual, recorded for W2:** `HomeBlock` still has no designer-CTA case on either root (§7). |
| `A-88` | T0 / W1 / L1-C | **T0 / W2** / L1-C | major | flags-off-only. The resting orb it is about does not draw on the four-tab root, and the bar is mounted as a bottom `safeAreaInset`, which is the inset this row asks for. |
| `A-64` | T0 / W1 / L1-C | **T0 / W2** / L1-C | major | flags-off-only. Same mechanism as `A-88`: "Sign in to keep this on ever" is clipped by the resting orb, and there is no resting orb on the shipped root. |
| `C-03` | T0 / W1 / L1-C | **T0 / W2** / L1-C | major | flags-off-only, stated in its own fix: *"Note the flags-ON root has none of this because the orb becomes a tab."* |
| `C-28` | T0 / W1 / L1-C | **T0 / W2** / L1-C | major | flags-off-only. Room-detail occlusion by the resting orb over "Edit dimensions" / "Edit budget". |
| `C9-05` | T0 / W1 / L1-F | **T0 / W2** / L1-F | major | flags-off-only. `threadDetail` is pushed inside a tab stack on the shipped root and inherits the bar's `safeAreaInset`; the dock it is drawn under is `.hidden` there. |
| `A1-13` | T2 / W3 / L1-F | **T1 / W2** / L1-F | minor | flags-on-only, and the finding says it *"only bites once house-first is on"* — which is now day one. Bell-vs-APNs land the same screen on different tabs. |
| `B-52` | T2 / W3 / L1-C | **T1 / W2** / L1-C | minor | flags-on-only. Re-tapping the active tab does not scroll to top; there was no tab to re-tap before, and now there is one on every screen. |
| `C-34` | T2 / W3 / L1-C | **T1 / W2** / L1-C | minor | flags-on-only. Filed as "Flags-ON Studio tab" — the Invoice row clipped mid-line by the bar, plus the redundant "Your Studio" pill on a tab root. |
| `C2-11` | T2 / W3 / L1-F | **T1 / W2** / L1-F | minor | flags-on-only. `HouseFirstRoot`'s insert-only `mounted` set keeps Today alive, so the push primer can present over Spaces / Pieces / Studio. |

### Root-scoped rows that did **not** move, and why

| id | tier/wave/lane | rootScope | why unchanged |
|---|---|---|---|
| `B-27` | T0/W1/L1-C | flags-on-only | Already the tier D1 asks for. `ProfileView` passes a chrome title only `if isTabRoot`, so the pinned "Your Studio" capsule is a four-tab-root defect — and it is already T0/W1. |
| `B-28` | T0/W1/L1-C | flags-on-only | Already T0/W1. Shot `B/54` carries the four-tab bar (lane B walked with the flag on); the Pay button is occluded by the bar this round ships. |
| `C-32` | T1/W2/L1-D | flags-on-only | Minor → T1/W2, which is where it already sits. See §6 — this is the row whose severity most deserves Fable's second look. |
| `C-33`, `C6-39`, `C9-16`, `GAP5-22` | T2/W3, T2/W3, T2/W3, T1/W2 | flags-on-only | **polish.** D1's rule names blocker/major and minor; polish is unenumerated, so these are left where they are with `rootScope` recorded. `C-33` is called out in §6. |
| `A1-02`, `C9-03`, `C2-22`, `C-54`, `R-21`, `GAP1-01`, `GAP4-23`, `GAP5-10`, `GAP6-19` | all W2 | flags-off-only | Already out of W1; "move to W2" is a no-op. `rootScope` recorded so W2 can decide whether a kill-switch-only defect is worth the week. |

---

## 4. Totals before → after, by wave

"Before" is `findings.json.bak2` — i.e. the corpus with D12's twelve promotions and the four 2026-09-01
reconciliation closures already in it.

| Wave | before | after | Δ |
|---|---:|---:|---:|
| **W0** Unblock | 34 | **34** | — |
| **W1** First five minutes / daily surfaces | 141 | **133** | −8 |
| **W2** Build 2, first tester week | 349 | **361** | +12 |
| **W3** After round one | 101 | **97** | −4 |
| **closed** (reconciliation 2026-09-01) | 4 | **4** | — |
| **Total** | 629 | **629** | — |

By severity inside the moved waves:

| Wave | before | after |
|---|---|---|
| **W1** | blocker 12 · major 125 · minor 4 · polish 0 | blocker 12 · **major 117** · minor 4 · polish 0 |
| **W2** | blocker 0 · major 121 · minor 188 · polish 40 | blocker 0 · **major 129** · **minor 192** · polish 40 |
| **W3** | blocker 0 · major 5 · minor 45 · polish 51 | blocker 0 · major 5 · **minor 41** · polish 51 |

Tier census: **T0 163 (unchanged)** · T1 361 → **365** · T2 98 → **94** · cut 3 · closed 4.
Eight T0 rows now sit in W2 — that is D1 as written ("flags-off-only rows keep their tier but move to
W2"), and it is deliberate: they are T0-severity defects on a root no tester will open unless the kill
switch is pulled.

## 5. Totals before → after, by lane

**No lane's overall total changed** — every move is a wave move inside the lane that already owned the
row. Only two lanes move rows at all:

| Lane · wave | before | after |
|---|---:|---:|
| W1 · **L1-C** | 35 | **28** |
| W1 · **L1-F** | 16 | **15** |
| W2 · **L1-C** | 114 | **123** |
| W2 · **L1-F** | 24 | **27** |
| W3 · **L1-C** | 35 | **33** |
| W3 · **L1-F** | 13 | **11** |

Lane totals, unchanged: L0.1 31 · L0.2 10 · L0.3 6 · L0.4 6 · L0.5 6 · L0.6 1 · L1-A 79 · L1-B 90 ·
**L1-C 184** · L1-D 78 · L1-E 74 · **L1-F 53** · L2-G 7 = 625 scheduled + 4 closed = 629.

---

## 6. Three things this pass deliberately did not change — Fable's call

1. **Severity.** D1's rule re-tiers; it does not re-score. One row's severity was demoted *explicitly
   because of the flag*, and that reason is now false:
   **`C-33`** — the judge wrote *"Down from minor: … and the flags-off build 1 has no tab bar at all."*
   Under D1 there is a tab bar on every launch, so `C-33` is arguably minor → T1/W2. It is left at
   T2/W3/polish here; one word from Fable moves it.
   **`C-32`** ("text-only tab bar, colour-only selection, uneven widths, an unlabeled fifth item") is a
   *minor* describing the app's **primary navigation on day one**. Its tier is correct under the rule as
   written; its severity is the one worth arguing.
2. **`testerVisible`.** Six flags-on-only rows were flipped to `testerVisible: false` by judges whose
   stated reason was the flag being off — `A1-13`, `B-52`, `C-32`, `C2-11`, `C6-39`, `C9-16`. All six are
   tester-visible on the shipped root. The field is untouched here (it feeds the corpus statistics in
   `findings-by-lane.md`), and is listed so the closer or W2 can correct it in one pass.
3. **`A4-12`** (L0.6, W0/T0/major — *"PostHog flags house-first / direct-orders / house-widget never
   targeted"*). Its premise is answered by **D1a**, which moves the fix into L0.1's `FeatureFlags`
   default table rather than PostHog targeting. It is `rootScope: n/a` and stays W0/T0/L0.6 — but its
   `fix` text ("target the round-one testers in PostHog") is now only half the story, and L0.6's brief
   should say so.

## 7. Two evidence notes the wave should carry

1. **The corpus barely observed the root it is now shipping.** The brief for this pass assumed
   `GAP2 / GAP3 / GAP4 / GAP6 / GAP7` walked with `-PatinaFlags`. The ledgers say otherwise — verbatim
   launch lines: `GAP1`, `GAP2`, `GAP3`, `GAP6` launched `… cloud.patina.app -DeploymentTarget local`
   with **no** flags argument; `GAP7` used `-DeploymentTarget local -PatinaFlags house-widget`
   (`house-first` still off); `C`, `A`, `P`, `R` were flags-off (`R.md:4` says so explicitly:
   *"no flags → house-first OFF"*). **`B` is the only walk of the four-tab root**
   (`B.md:3-4`: `-DeploymentTarget local -PatinaFlags house-first,direct-orders,house-widget`), plus a
   handful of `GAP5` rows on iPad. So the shipped root has one walker's coverage out of thirteen lanes,
   and no `describe_screen` pass at all on `SpacesTabRoot` / `PiecesTabRoot` beyond B's. **W1's walkers
   launch without `-PatinaFlags` per D1a and will be the first real look at it** — expect new findings,
   and treat a thin four-tab section in the ledgers as a coverage gap, not a clean bill.
2. **`A4-07`'s residual.** Only the "Browse pieces" half of `A4-07` is answered by the Pieces tab.
   `HomeBlock` (`TodayExperience.swift:196-211`) still has **no designer-CTA case** on either root, so
   "no door to design help *on Today*" survives D1. It rides to W2 with the row; L1-C should read the
   note before deciding the fix is free.

---

## 8. What the closer must amend in `PROGRAM.md` (I did not touch it)

**W1 lane tables whose counts changed — the required list:**

| PROGRAM.md line | now reads | must read | rows to strike from the table |
|---|---|---|---|
| §3 W1 · L1-C, line **2122** | `**Findings it closes (W1 · 35 — 29 T0 + 6 promoted from W2 by D12, marked ⇧D12).**` | `(W1 · 28 — 22 T0 + 6 promoted …)` | `A1-03`, `A1-04`, `A4-07`, `A-88`, `A-64`, `C-03`, `C-28` |
| §3 W1 · L1-C, line **2124** | `_count: 35 · blocker 3 · major 32 · minor 0 · polish 0_` | `_count: 28 · blocker 3 · major 25 · minor 0 · polish 0_` | — |
| §3 W1 · L1-F, line **2514** | `**Findings it closes (T0 · W1 · 16).**` | `(T0 · W1 · 15)` | `C9-05` |
| §3 W1 · L1-F, line **2516** | `_count: 16 · blocker 0 · major 16 · minor 0 · polish 0_` | `_count: 15 · blocker 0 · major 15 · minor 0 · polish 0_` | — |

The other four W1 lane tables (L1-A 27, L1-B 27, L1-D 18, L1-E 18) are unchanged.

**Carried with them, for the same edit pass:**

- §3 W1 heading (line **1782**) — "141 findings" → **133**; the sentence under it, "129 T0 rows plus the
  12 T1 rows **D12** promotes", becomes **121 T0 rows plus the 12**.
- §5 W2 heading (line **2946**) — "**349 findings**" → **361**; the capacity paragraph under it
  (line **2950**) reads "**W2 has a stated capacity, and it is not 349**" → **361**, and its per-lane
  load line "**L1-C 114** (83 S · 26 M · 5 L) … L1-F 24" → **L1-C 123 (89 S · 29 M · 5 L) … L1-F 27**
  (the nine arrivals are 6×S + 3×M — `A4-07`, `A-88` and `C-03` are the M's).
- §5 W2 lane tables — line **3165** `_count: 114 · blocker 0 · major 50 · minor 55 · polish 9_` →
  `_count: 123 · blocker 0 · major 57 · minor 57 · polish 9_`; line **3397**
  `_count: 24 · blocker 0 · major 4 · minor 16 · polish 4_` →
  `_count: 27 · blocker 0 · major 5 · minor 18 · polish 4_`. The rows to add are the eight that left W1
  plus `A1-13`, `B-52`, `C-34`, `C2-11`.
- §5 W3 heading (line **3441**) — "101 findings" → **97**. W3 in PROGRAM.md is a **by-area rollup**, not
  per-lane tables, and `assemble.py` generates it from `findings.json` — re-running the script picks the
  four departures up without hand-editing (`accessibility` and `notifications` are the areas that move).
- §1's audit-in-numbers tier table — line **215** `| **T1** … 4 | 129 | 188 | 40 | **361** |` →
  `4 | 129 | 192 | 40 | **365**`; line **216** `| **T2** … 0 | 5 | 45 | 48 | **98** |` →
  `0 | 5 | 41 | 48 | **94**`. **T0 (line 214) stays 163** — D1 moved no row into or out of T0.
- §2's G5 wording is unaffected, but **G5a's surfaces are now reached through the bar** — Today,
  decisions, the designer seat and the Record are tab-stack screens on the shipped root, and `C4-12`
  (no `.refreshable` on any of the four tab roots; `rootScope: both`; still W1/T0/L1-B) is the row that
  proves G5a either way.

`build/findings-by-lane.md` was regenerated from `findings.json` and now carries the current wave and
tier columns for the first time; its header box records all three post-cut changes (D12, the four
closures, this D1 pass). Its tables are the verbatim source `assemble.py` lifts, so the closer can
re-run `assemble.py` instead of hand-editing, provided the prose parts are updated to match.
