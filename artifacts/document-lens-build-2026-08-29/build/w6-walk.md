# W6 — the design lead's final walk · `document-lens/integration` @ `975fdf6b7` · 2026-08-30

Own instance of the ship candidate's production standalone on **:3024** (`node .next/standalone/apps/designer-portal/server.js`, local Supabase env, `DATA_MODE=live`, pilot flag; `/desk` 307, CSS chunk 200; killed after). Seed 19/19. Script `scratchpad/w6-walk.mjs` → `w6-walk/w6-measurements.json` + **22 shots** (`w6-<w>-<state>-<paper>.png`, dpr 1): `…d5` 1440/1280/390 × s0/s2/s3/foot, the standing sheet ×3, the 390 Margin sheet, reduce at s2, `…d6` 1440 s0/s2 + 390 s0, `…d7` 1440 + 390 s0. Fresh contexts, storage cleared, sampled at `data-lens-resolved` ∧ `data-lens-settled` ∧ network idle.

## Verdict — **SHIP.**

Fix list (wiring-sized, phase C): **one item** — F1 below. Nothing else differs from the ratified design beyond signed deviations.

**Kody's first look on prod, in order:** (1) open the long paper at 1440 — the letterhead, then **one 56px band** and the first head at ~360px; scroll once and watch line 2 name the worst standing thing **with its act** and `+N MORE`; (2) press **Money** on the ladder — the head lands under the band; press **Fold ↑**, reload — **`CLOSED BY YOU`**; (3) on the phone — the name wraps to two lines, line 2 prints the short form (`OVERDUE 7D · INV-2026-114 SEND`), **More → Margin · 7 → CAPTURE A NOTE**; (4) turn on Reduce Motion — nothing moves, the same words print; (5) open a proposal — `CLIENT USER · PROPOSAL` on line 1, `Scope & engagement · Core · stage 03`, nothing between the band and the first head.

## L-1 … L-11 — `…d5`, 1440 / 1280 / 390 × s0 / s2 / s3 / foot

| L | 1440 | 1280 | 390 | verdict |
|---|---|---|---|---|
| L-1 the sentence turns | line 2 at s0/s2/s3/foot: `Invoice INV-2026-114 · $17,500 overdue — oldest due Aug 23 — send a reminder` `SEND REMINDER` `+10 MORE`, form `long`, 15px, y 26.19 in every cell; the worst item does not change across the walk on this seed (one item outranks all), so the turn is exercised by the `aria-live` stop announcement (`Now at Schedule …` / `Now at Pieces …` read inside line 2 at s2/s3) | same | short form **`OVERDUE 7D · INV-2026-114` `SEND` `+10 MORE`** at every offset | seen |
| L-2 the window travels | `[data-lens-window]` top 225→265→319→508.66, h 40/54/54/40 | 234→290→344→548.7 | no rail (bar carries `AT <STOP>`: `AT CLIENT APPROVALS` → `AT SCHEDULE` → `AT PIECES` → `AT THE RECORD`) | seen |
| L-3 a segment changes register | yielded segment = `schedule` at s2, `ffe` at s3, none at s0/foot (`data-region-head-in-frame`) | same | n/a | seen |
| L-4 a region ahead opens | s0 map `approvals` full · `schedule` full · **`ffe` quiet (1909)** · `money` quiet (2045) · `care` quiet · `record` quiet; s2 `ffe` full (top 1012 ≤ 1140), `money` quiet (6817); s3 `money` quiet (5871) | identical | s0 `approvals` full only, `schedule` quiet (1268 > 1084); s2 all through `record` full (a phone frame + fling opens the rest) | seen — D-B16 exactly |
| L-5 never taken back | foot: all six `data-passed` + full, real heights; `window.find('Client approvals')` true | same | same | seen (D-B33: `content-visibility` retired; nothing hidden) |
| L-6 the rail head yields at s0 | `data-letterhead-in-frame` true at s0, false at s2/s3/foot; head prints household · arc · `PROCUREMENT & ORDERS` · `3 OF 5` (phrase muted at s0 per RF-02/W3 walk) | same | bar prints the household at every offset | seen |
| L-7 she folds a region | Money `Fold ↑` → seam `Money · NO BUDGET YET · $0 AUTHORIZED · CLOSED BY YOU · UNFOLD ↓`; reload → `CLOSED BY YOU` persists | same | (fold reachable; not re-pressed at 390) | seen |
| L-8 the pen goes down | `data-lens-state` `editing` on a paper field (W4 review §5; freeze boundary ruled) — not re-driven here | — | — | seen at W4 |
| L-9 the lens settles | `data-lens-settled="true"` at every sample; `lensState` rest → reading; 390 `mobile` | same | `mobile` | seen |
| L-10 the press lands | ladder `Money` → head top **77.55** at +2.5 s, focus on `Money`, region full (W4's stationary poll read 71.55 — the smooth scroll was still moving at my read; within the 4px gate on the stationary read) | 77.55 | (sections sheet; W2/W3 walks) | seen · measurement note |
| L-11 the standing sheet | `+10 MORE` → `Standing · 11`: **9 rows + `INPUT NEEDED · 2`**, first row `PAST DUE · Invoice INV-2026-114 … SEND REMINDER`; Escape → focus back on `+10 MORE` | same | same (shot `w6-390-sheet-project`) | seen |

## The eleven reduced-motion forms (1440, `…d5`, s0 + s2)

Under `prefers-reduced-motion: reduce`: **0 running animations** at s0 and s2 (no-preference: exactly 1 — the `doc-breath`, 3s); `doc-breath` duration **0s**; visible-word sets **310/310** at s0 and **512/512** at s2 — identical to no-preference. Each mechanic's printed form stands: L-1 the new sentence lands flat · L-2 the bracket jumps · L-3 the value is absent/present at settle · L-4 the body is present at settle · L-5 nothing · L-6 absent/present at settle · L-7 the seam paints on the first frame · L-8 flat tint (W4) · L-9 arithmetic · L-10 instant landing · L-11 the sheet appears in place. Shot `w6-1440-s2-reduce-project`.

## Every acceptance number

| number | gate | measured | verdict |
|---|---|---|---|
| SC1 first `[data-region-head]` at 1440/s0 | ≤ 405 | **359.06** (1280: 359.06; `…d7` 359.06; `…d6` 330.06) | seen (proposal's 298 assumed no ledger row — superseded by D-B26/W3-R7) |
| SC2 band bottom at scrollY 400 | ≤ 108 | **56** at 1440/1280/390 | seen |
| band 56 in every cell | 56 | **56** in all 12 `…d5` cells + `…d6` ×3 + `…d7` ×2 | seen |
| landing clear | 72 | **72** everywhere (laid-out probe) | seen |
| gap block-to-block | 24 | root-to-root 24 · 24 · 24 between adjacent stops (approvals→schedule 290.88 and care→record 114.5 contain the schedule frame / kickoff + account bands — 24 block-to-block per W3-fix B7) | seen |
| rail labels | ≤ 14 | **13** at 1440 and 1280 on `…d5`; `…d6` 7 (≤ 9) | seen |
| letterhead 1440 | ≤ 205 | `…d5` **191.06** · `…d7` 191.06 · `…d6` 190.06 | seen |
| letterhead 390 | ≤ 265 one-line · ≤ 300 two-line | `…d7` **254.17** (one line) · `…d5` **288.72** (two lines, 32px, no clip) · `…d6` 268.97 (two lines) | seen |
| first head 390 gross | ≤ 435 · ≤ 470 | `…d7` **422.17** · `…d5` **456.72** · `…d6` 408.97 | seen |
| D-B16 map at s0 | 1440 approvals+schedule; 390 approvals | as gated, at 1440, 1280 and 390 | seen |
| D-B31 fling s0→s3 | blank frames 0 | **0 / 73 frames** at all three widths | seen |
| D-B34 paper CLS | 0 | **0** paper, **0** chrome, 30-step settled scroll, all widths | seen |
| D-B37 rail still | 0 segment resizes | **0** steps with a segment change | seen |
| D-B38 line 2 still | one y | **{26.19}** at rest and pinned, all widths | seen |
| D-B46 cold load | quiet until resolved, then the map | fresh contexts, cleared storage: the map above at first sample after `resolved` | seen |
| D-B47 bar inset | spb = max(72, bar) | bar **93.39**, `--doc-mobile-bar-height: 93px`, `scroll-padding-bottom: 93px` | seen |
| six quiet heads (W4-R1) | status · sr-only · one leader | `schedule` **`Install Sep 20 · 3 weeks out`**, `record` **`4 complete`** read verbatim; `care` **`0 of 6 closed out`** + its sr-only verified in the W4 fix-3 countersign; `ffe` / `money` print via the same `lens-quiet-status.ts` (`N lines · N rooms · N damaged`, the money pair) — my probe read their eyebrows (`1 open damage claim · 4 unspecified`, `The money · one region`), not the status line | seen (three verbatim, three by the shared derivation) |
| Margin sheet 390 | `Margin · 7 · 2 overdue`, groups, 7 rows, `CAPTURE A NOTE` → `ABOUT THE WHOLE JOB` | `Margin · 7` · `2 OVERDUE` · `CAPTURE A NOTE` · `THE WHOLE JOB · 4` · `BESIDE PIECES · 3` · **7 rows**; composer `Note to the margin`, placeholder `Note to the margin…`, focused, **`ABOUT THE WHOLE JOB`**, `Save` / `Discard` | seen |
| pre-work regions + line 1 | order, strings, no ordinal | `…d6`: band → **`proposal`** (nothing between) → `scope` `Core · stage 03` → `vision` `Not written yet` → `investment` `$9,400` → `record` `3 complete`; line 1 s0 `$9,400`, s2 **`CLIENT USER · PROPOSAL` · `SENT AUG 23 · $9,400`**; line 2 `Sent Aug 23 — not yet opened FOLLOW UP +1 MORE`; rail head `PROPOSAL` one line; 390 same, bar `AT THE PROPOSAL · MARK SIGNED` | seen |
| `CLOSED BY YOU` | printed, persists | seen at 1440 and 1280, survives reload | seen |
| hover-only acts | 0 | **0** in every cell | seen |
| console errors of a Wave-N class | 0 | none name a Wave-N file: `ERR_NAME_NOT_RESOLVED` (PostHog/Sanity DNS, sandbox), the first-context `Failed to fetch` / `Not authenticated` race (pre-existing, W3 walk), one **403** resource on `…d5` at 1440/1280 (not at 390) — not attributable by its message; the W6 lane names the resource | seen (one to name) |

## Differs

1. **F1 · `…d7` at 390 prints line 2 as `CONFLICT · TWO` `RESOLVE`** (`w6-390-s0-oneline.png`) — the short form of `Two installs collide — week of Sep 21 · RESOLVE THE SCHEDULE`: `shortSubject` fell to the sentence's first word for a schedule-conflict need. **Ruling (W6-R1 §1):** the subject is the item's object — for a schedule conflict, the week: **`CONFLICT · SEP 21` `RESOLVE`** (`<STATE> · <SUBJECT>`, no day-count). Wiring-sized: one branch per need kind in `shortSubject` (`schedule_conflict` → the week's `Mon D`); jest twin adds the `…d7` shape. **Phase C.**
2. **`Fold ↑` prints beside the leader at quiet** on `ffe` / `schedule` / `money` (two visible controls, W4-R1 said one leader). **Signed deviation (W6-R1 §2):** the fold control is L-7's own voice and must stay reachable on a quiet region; it is not one of the region's acts. `care` and `record` print one act, as they have no fold.
3. **L-10 landing 77.55 at my +2.5 s read** vs 72 — the W4 walker's stationary poll read 71.55 in both motion registers; a measurement-timing note, not a defect.
4. **SC1 359 vs the proposal's 298** — inside the ≤ 405 gate; the ledger row and the vitals were priced in at W3 (D-B26, W3-R7). Ruled.
5. **One 403 resource** on `…d5` loads at ≥1180 — to be named by the W6 lane (not a Wave-N file by the evidence here).

## Rulings written here (W6-R1, mirrored in `reconciliation.md`)
§1 the short-form subject per need kind (F1); §2 `Fold ↑` at quiet is a signed deviation.
