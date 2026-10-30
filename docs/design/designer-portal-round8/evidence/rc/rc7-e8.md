# RC-7 E8: visual, accessibility, zoom and performance (X04–X07)

US-52 Room Proof 08, step RC-7, lane E8. This lane raises X04–X07 from the R3b rating "weak" (`rc6-reviews/r3b-evidence-full.md` rows X04–X07). It uses live data, the round-8 flag and the F01 fixture, on an owned stack. It does not fix product code; it records defects.

This is the hardened rerun (E8h). A cross-provider review found that the first E8 specs logged outcomes this doc claimed they asserted. Every claim below is now a Playwright assertion, or it is labelled "recorded". The run sits on the tip that carries FIX4 (`5386a159e`, focus restore and contrast tokens) and FIX5 (`74a324b26`, progressive chapter reveal).

**Run facts**

| Item                           | Value                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date                           | 2026-10-29                                                                                                                                                                                                                                                                                                                                                  |
| Worktree / branch              | `/Users/kody/Code/patina-r8-rc7-e8h`, branch `r8-rc7-e8h` (base `c6434e3dd`)                                                                                                                                                                                                                                                                                |
| Tip under test                 | Product code = `r8-evidence` `da63b2708` (with FIX4 and FIX5), merged at `b1511b4eb`. Specs = `c0f94e8cf`.                                                                                                                                                                                                                                                  |
| Owned stack                    | `project_id` `patina-rc7-e8h`. Ports: API 62621, DB 62622, shadow 62620, pooler 62629. Started with the 5 version pins and the unused services excluded. Marker `rc7_owned.stack` rows `patina-rc7-e8h` and `patina-rc7-e8` (the second because the activation fixture names the lane id). System id `7702253611498852394`. Readback taken before teardown. |
| Migration head on the owned DB | `00902` (827 `^00` migration rows)                                                                                                                                                                                                                                                                                                                          |
| pg_cron                        | `cron.launch_active_jobs = off`, set as `supabase_admin`                                                                                                                                                                                                                                                                                                    |
| Designer dev                   | `PLAYWRIGHT_DESIGNER_PORT=4210`, started by `playwright.round8.config.ts`: live data mode, round-8 renderer flag, `next dev --webpack`. Machine: Apple M4 Pro, unthrottled localhost.                                                                                                                                                                       |
| Browsers                       | `chromium` = Desktop Chrome 1440×900 at DPR 1. `webkit-iphone` = iPhone 14, 390×664 at DPR 3.                                                                                                                                                                                                                                                               |
| Data                           | `data-rc7-e8/`: perf JSON for both runs per engine, zoom and axe JSON from the final run, and `runs.txt` (every test line of every run).                                                                                                                                                                                                                    |

**Result**

| ID  | Clause                                                     | Before (R3b) | Now                                                                                                                                                                                                                                                                                                                                                       | Spec                    | Asserted                                                                                                                                                                                                                                                                                                                                                                                                     | Runs                                                                                       |
| --- | ---------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| X04 | Visual coherence against frozen round 8, desktop and phone | weak         | **covered for the named surfaces**: studio with its photographic cover, job paper, cabinetry chapter, activated acceptance/care chapter. Books and the dense sheet were not re-compared. The captures predate FIX4/FIX5 (see §2).                                                                                                                         | `rc7-e8-visual.spec.ts` | The cover `<img>` is visible and decoded, from a signed `project-ffe-working` URL that names the board. Page overflow = 0 on every surface. The C4/C6 inactive notes = 0 with C4/C6 active. The E7 rendered request lifecycles equal the DB readback, per request id.                                                                                                                                        | chromium 3/3 and webkit-iphone 3/3 passed, ×2                                              |
| X05 | WCAG 2.2 AA complete processes, screen reader              | weak         | **Covered for two keyboard paths plus axe (automated). Acceptance is limited to refusal/cancel. Screen reader not verified.** axe: 0 critical, and 0 serious other than color-contrast. Color-contrast remains on 2 of 6 surfaces (RC7-E8-2, `fixme`). RC7-E8-1 is fixed.                                                                                 | `rc7-e8-a11y.spec.ts`   | Every step is reached by native Tab order and shows `:focus-visible` with an outline or box-shadow ring. The focus is not entirely obscured (fewer than 5 of 5 sample points covered). Save persisted. Esc folds the unfold and returns focus to its door. A refused submit writes nothing. Cancel returns focus to "Resolve this condition". axe: critical = 0, and serious other than color-contrast = []. | 3 passed + 1 `fixme` (RC7-E8-2), in both engines, ×2                                       |
| X06 | Zoom, real content bounds, bounded and reachable scrolling | weak         | **Covered at 1280@200% via the viewport-halving proxy. Real browser/text zoom and 320-CSS-px reflow are not demonstrated.** 0 clipped controls on all 5 surfaces at 1280@200%. 390@200% clips 8–9 controls (RC7-E8-3, `fixme`).                                                                                                                           | `rc7-e8-zoom.spec.ts`   | At 1280@200%: clipped controls = [] and unreachable scroll containers = []. Reachability is judged by real Tab focus plus visibility, and the exclusion allowlist is empty. At both sizes, page overflow ≤ 1 px.                                                                                                                                                                                             | 6 passed + 1 `fixme` (RC7-E8-3), in both engines, ×2                                       |
| X07 | Settled-scroll zero shift; load targets; request capture   | weak         | **Partly covered.** Settled-scroll CLS = 0 is asserted on chromium; WebKit skips with a stated reason. LCP ≤ 2.5 s is asserted on chromium. Request capture is repaired. **Job cold-load CLS fails ≤ 0.1**: 0.04–0.11 on a first visit (RC7-E8-4) and 1.34–1.42 for a returning reader (RC7-E8-5). Interaction latency and percentiles were not measured. | `rc7-e8-perf.spec.ts`   | API requests > 0, and the context capture equals Resource Timing (±max(3, 10%)). Network settles within 30 s, or the test throws with the pending URLs. The studio cover rendered. LCP ≤ 2500 ms (chromium). The paced settled-scroll raw CLS sum = 0 over the whole document.                                                                                                                               | chromium 4 passed + 2 `fixme`; webkit-iphone 2 passed + 2 capability skips + 2 `fixme`; ×2 |

## 1. Lane fixtures (owned stack only)

- **`rc7-e8-activation-fixture.sql`** turns on C2, C4 and C6.
  - It sets `server_capabilities.scope_editions = true`.
  - It grants the C2, C4 and C6 RPCs to `authenticated`, and `stamp_service_acceptance_paper_hash` to `service_role`.
  - It refuses unless all of these hold:
    - `owned_port` and `owned_system_id` are both given;
    - the host is loopback;
    - `PORT = owned_port`, and the port is not 54321 or 54322;
    - the `pg_control_system()` id matches;
    - the `rc7_owned.stack` marker has a `patina-rc7-e8` row.
- **E7's `rc7-e7-fixtures/mixed-fixture.sql`** was loaded once, with the same guard values. It provides the "E7 household job" (`7b820780-…` on this stack):
  - C4 request 1 Returned;
  - C4 request 2 Accepted with conditions;
  - a C6 completion "Completed with conditions", with the open condition "Keep the oak floor";
  - a GC cabinetry fulfilment `pkg.cabinets` (2 units, planned).

  Each record comes from its RPC, run as its real actor.

- **The F01 cover** is now set up inside each spec that needs it: visual and perf. Both call `applyCover()` in `e2e/round8/rc7-e8-cover.ts`, which does this in order:
  1. it runs `rc7OwnedStackSql()` as the guard, before any write;
  2. it uploads the reference's own cover, `artifacts/room-proof-round8-2026-10-23/assets/room.png`, to `project-ffe-working/<job>/boards/<board>/room.png`;
  3. it applies `rc7-e8-cover-fixture.sql`, behind the same guard, to add one active project board whose `cover_image_url` is that key. That is the only bare key `guard_proposal_board_media_reference` accepts for a project board;
  4. it asserts that the board reads back with that key.

  The studio then signs the cover through the product path: `use-commission-plates` → `signProjectWorkingBoardRow`. `expectCoverRendered()` asserts four things: the plate `<img>` is visible, it decoded (`complete` and `naturalWidth > 0`), its `currentSrc` is a signed `project-ffe-working` URL, and that URL names the board.

- **The zoom spec** files one issued print per run, using `file_plan_prints` and then `create_plan_issue`, as the F01 designer through `psqlAsUserRow`. Its `beforeAll` now runs `rc7OwnedStackSql()` before the storage upload and the RPCs. The sheet number is unique per run.

## 2. X04 visual (method of `rc4-visual.md` / `rc4b-visual-reeval.md`)

The portal and the reference were each captured at the same viewport, and I looked at both. Captures are under `visual-rc7/`:

- `<browser>-<surface>.jpg` is the portal;
- `<browser>-ref-<surface>.jpg` is the reference;
- `<browser>-facts.json` holds the DOM facts.

**Which tip the captures show.** The committed `.jpg` captures come from the first E8 run, at `a1f375cbc`, before FIX4 and FIX5. The hardened runs re-asserted the facts in the table above at the FIX4/FIX5 tip, and their `*-facts.json` are committed. The images were overwritten during each run and then restored, to keep the docs history small. So the composition ratings below rest on pre-FIX4/FIX5 pixels. FIX4 darkens some text tokens. FIX5 holds chapters at opacity 0 until they are revealed, and every chapter is revealed by the time a capture is taken.

Element captures hide fixed and sticky overlays outside the target. Full-page captures paint the fixed dock mid-page; that is a capture artifact.

| Surface                                                                                                       | Desktop 1440                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Phone 390                                                                                                                                                                            | Rating                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Studio: photographic cover (`studio-top`, `studio-full` vs `ref-studio-top`)                                  | The board photograph sits where the reference puts it: the left column, 804×529, beside "Needs your attention". The caption is a white plate at the lower left of the photo, "F01 Fictional Full-Service House · board cover", as in the reference. **Asserted:** `img` is signed (`/storage/v1/object/sign/project-ffe-working/…/e8e80000-…`), decoded at 1536×1024, `alt=""` with a figcaption. It is the LCP element on chromium.                                                                                                                                                                                                              | **Asserted:** decoded and signed, box 354×295. The head, the hours/find band and the one-time coach note push it below the first screen; the reference shows it on the first screen. | **match** (photograph, place, caption). **Deviations:** (a) the intro sits under the h1, not in the right column (already ruled acceptable in RC-4b); (b) the one-time Desk coach note adds about 170 px above the plate; (c) "Open the job paper" is an underlined text link, where the reference has a moss button.                                                                                                                                                                    |
| Job paper: top and full (`job-top`, `job-full` vs `ref-job-top`, `ref-index-top`)                             | Chapter order: brief, design, approvals, schedule, ffe, financials, closeout, record. The cover is the empty "Add a photograph for the cover" card: the job cover is a separate data source, and F01 has none. **Asserted:** overflow 0.                                                                                                                                                                                                                                                                                                                                                                                                          | Same order. **Asserted:** overflow 0.                                                                                                                                                | **deviation, data-bound** (no job cover photo in F01). Otherwise as RC-4b.                                                                                                                                                                                                                                                                                                                                                                                                               |
| Cabinetry chapter (E7, `job-e7-cabinetry` vs `ref-job-cabinetry`)                                             | Reads the GC fulfilment `pkg.cabinets`, 2 units, planned, as a single-column register: "No package record for this key", "No package issue is recorded", "These acts are not active yet" (the C5 instruction acts). The reference has a 2-column plate with an elevation drawing and "Unfold the build package". **Asserted:** DB cabinetry count = 1.                                                                                                                                                                                                                                                                                            | Stacks cleanly. **Asserted:** overflow 0.                                                                                                                                            | **deviation, partly data-bound.** No owned fixture has an issued package or a drawing, so the plate and elevation cannot appear. The register type is sans and small, where the reference uses the display serif.                                                                                                                                                                                                                                                                        |
| Acceptance / care chapter, C4/C6 active (E7, `job-e7-closeout` vs `ref-job-closeout`; F01 `job-f01-closeout`) | Every state renders: request 2 Closed · Accepted with conditions, with signers and the replaced partner; request 1 Returned, with its reason; studio service "Completed with conditions" with "Revoke this completion"; the client condition "Keep the oak floor · Open" with "Resolve this condition"; care references for edition 1. **Asserted:** the rendered `{request id: data-lifecycle}` map equals the DB `json_object_agg(id, lifecycle)` (2 requests, both `closed`). On F01, `[data-studio-service-inactive]` = 0 and `[data-service-acceptance-inactive]` = 0, and the copy reads "No agreed scope edition is active for this job…". | Stacks cleanly. **Asserted:** overflow 0.                                                                                                                                            | **deviation (hierarchy and type).** The reference's "Acceptance & handoff" is a bordered card with a display-serif lead ("Final acceptance is still open."), signer lines, and a right column "Service completion — Held". The portal uses small sans headings and no card, behind the legacy tan "Project closeout" panel. The chapter label "Closeout" is deliberate (`ROUND8_PAPER_ORDER`). The RC-4 D2 gap (acceptance and completion readings absent) is **closed** when activated. |

No X04 item is a defect: every difference is either a composition deviation or a data limit.

## 3. X05 keyboard and axe

**Keyboard-only processes.** Every step uses native Tab order. WebKit needs `Alt+Tab` to reach links. Presses are paced at 150 ms, because the lens opens a quiet stop only after the focus-driven scroll settles (`use-lens-density.ts`, L-9).

1. **Studio → job → FF&E unfold → save → close → studio** (line "F01 Living Room selection 07").
   - Tab counts, chromium / webkit-iphone. They are identical across runs.

     | Step                                 | chromium | webkit-iphone                                             |
     | ------------------------------------ | -------- | --------------------------------------------------------- |
     | Studio → "Open the job paper"        | 14       | 14                                                        |
     | Job → Living Room disclosure         | 7        | 42 (the phone paper opens the FF&E stop on arrival at it) |
     | → "Edit room selections"             | 38       | 38                                                        |
     | → Specifications lens (Shift+Tab)    | 5        | 5                                                         |
     | → line                               | 14       | 14                                                        |
     | → Finish                             | 36       | 6                                                         |
     | Finish → line (Shift+Tab)            | 36       | 36                                                        |
     | Door → job-head "Studio" (Shift+Tab) | 81       | 79                                                        |

   - Enter saved. **Asserted:** the DB readback of `project_ffe_specs.finish` equals the typed value.
   - Esc inside the filled Finish field holds the unfold. That is by design: `escapeIsHeld`, `build-room-shell.tsx:186–206`.
   - From the line button, Esc folds the unfold and focus returns to the "Edit room selections" door.
   - The studio arrives, and the value still reads back.

2. **Acceptance chapter (E7, C4/C6 active).**
   - "Resolve this condition" is reached in 78 Tabs (chromium) or 76 (webkit). Enter opens the form `Resolve: Keep the oak floor`.
   - Tab reaches "How it was resolved", then "Record the resolution". Enter is refused with the alert "…choose one reference", and **the resolutions count is asserted unchanged**.
   - Tab → Cancel → Enter closes the form. **Focus returns to "Resolve this condition"** in both engines. RC7-E8-1 is fixed by FIX4 and is now a normal test.
   - Acceptance itself (an accepted resolution, a sent request) is not walked by keyboard; only refusal and cancel are.

**Focus indicators.** These are asserted on every focused control in both engines.

- Controls show a 2px outline, `rgb(124, 94, 48)`.
- The textarea shows a box-shadow ring, `rgb(196, 165, 123)`.
- Obscuring is measured at 5 sample points against `elementFromPoint`. The test fails if all 5 are covered (2.4.11 AA).
- One step is partly obscured. After Shift+Tab from Finish back to the line, **3 of 5 points on the line button are covered by the sticky `header[data-job-head]`** (chromium). It is not entirely hidden, so 2.4.11 (AA) is met and 2.4.12 (AAA) is not. This is annotated in the test and kept as observation O-1.

**axe** (axe-core 4.11.1 from the repo's existing `axe-playwright` install; tags wcag2a/2aa/21a/21aa/22aa; no dependency added). The test asserts 0 critical, and that no serious rule other than color-contrast fires. Color-contrast = 0 is the separate `fixme` RC7-E8-2.

| Surface                                | Critical | Serious          | Moderate | Minor | First E8 run (pre-FIX4) |
| -------------------------------------- | -------- | ---------------- | -------- | ----- | ----------------------- |
| Studio                                 | 0        | 0                | 0        | 0     | 0                       |
| Job paper (F01)                        | 0        | 0                | 0        | 0     | 8 color-contrast        |
| FF&E unfold, Specifications, line open | 0        | 4 color-contrast | 0        | 0     | 18 color-contrast       |
| Job paper (E7, acceptance active)      | 0        | 1 color-contrast | 0        | 0     | 1 color-contrast        |
| Acceptance/care chapter (E7)           | 0        | 0                | 0        | 0     | 0                       |
| Resolve-condition form open            | 0        | 0                | 0        | 0     | 6 color-contrast        |

The counts are identical in both engines and all 4 runs (`data-rc7-e8/a11y-*.json`). The remaining pairs are RC7-E8-2.

## 4. X06 zoom

**Method.** This follows the approach of the existing zoom probes. It is **not CSS `zoom`**, and not a real browser zoom or text-only zoom. The CSS viewport is halved and the device scale factor doubled, which is what a 200% page zoom does to layout.

- 1280@200% = 640×360 CSS at DSF 2.
- 390@200% = 195×422 CSS at DSF 2. That is below the WCAG 1.4.10 reflow floor of 320 CSS px, and 320 px itself was not tested.

The probe has two parts.

- **Tab walk.** It focuses the surface root, then presses Tab (Alt+Tab on WebKit), paced at 150 ms, until focus leaves the root, the walk cycles, or it ends. It judges each focused element after the focus-driven scroll, retrying up to 3 × 300 ms.
- **Judgement.** A control fails if it is not rendered visible, has no box, lies outside the viewport horizontally, or lies outside it vertically while focused. It also fails if less than 98% of it is visible inside a clipping ancestor, with the containing block modelled for `fixed` and `absolute` controls. Disabled and `[inert]` controls are excluded. A control the walk never reaches is judged by its static geometry and marked "(never reached by Tab)".

A horizontal scroll container counts as keyboard-reachable if Tab reached it, or if every descendant Tab reached was fully visible. Nothing counts as intentionally hidden by default: the named allowlist `INTENTIONALLY_HIDDEN` is empty.

| Surface                          | 1280@200% (asserted: 0 clipped, 0 unreachable scroll containers)                                                                                     | 390@200% (recorded; `fixme` RC7-E8-3)                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Whole job paper (long content)   | 48 controls, 71 reached by Tab; 0 clipped; overflow 0; chrome 48% of height                                                                          | 47 controls, 70 reached by Tab. **7 clipped, both engines:** `press-add-cover-photo` (x 37–257 of 195), `open-project-drawings` (18–204), `ffe-lead-spec` (18–197), `work-the-pieces` (18–217), `release-for-authorization` (18–250), the "Bedroom⌄" disclosure `button` (96–197), `working-budget-sync` (37–206). Overflow 0, because `body` has `overflow-x-hidden` (`globals.css:1746`). Chrome 52%. |
| FF&E Specifications, line open   | 66 controls, all reached; 0 clipped; no scroll containers                                                                                            | chromium: `select[aria-label="unit"]` (135–197) is clipped, and the line `section` scrolls sideways (179/159) and is **not** keyboard-reachable. webkit-iphone: 0 clipped; the section scrolls (172/150) and is reachable.                                                                                                                                                                              |
| FF&E rough lens                  | 178 controls, all reached; 0 clipped. At 640 CSS px the lens renders its phone list (the `phone` branch of `rough-in-table.tsx`), not the `<table>`. | 178/178; 0 clipped                                                                                                                                                                                                                                                                                                                                                                                      |
| Issued print history             | 2/2; 0 clipped                                                                                                                                       | 2/2; 0 clipped                                                                                                                                                                                                                                                                                                                                                                                          |
| Drawing/evidence viewer (dialog) | 1 control (2 Tab stops); 0 clipped                                                                                                                   | `close-plan-print-viewer` "← Back to the document" (18–199) loses 4 px, both engines                                                                                                                                                                                                                                                                                                                    |

The 390@200% clip set differs from the first E8 run at `a1f375cbc`, where it was 5 to 7 controls including `close-project` and `complete-studio-service`. The tip changed in between. The 1280@200% chrome share (sticky job head plus dock = 48% of a 360 px viewport) is recorded as observation O-2; it is not a defect. The PDF pixels inside the viewer are blank in headless browsers. The viewer frame and its controls were checked; the drawing render was not.

## 5. X07 performance

**Profile:** Apple M4 Pro, unthrottled localhost, `next dev --webpack` (dev bundles), F01 (80 lines, 3 rooms) plus the cover board. This is **not** the representative profile that ACCEPTANCE.md X07 asks WP-00 to agree, so the numbers are raw.

**Method.**

- **Settle.** The spec tracks in-flight requests, ignoring `eventsource`. It waits until none are in flight for 1 s. If that has not happened by 30 s, it throws with the pending URLs. The timeout is never swallowed.
- **Cold load.** The spec first visits the route to warm the compile, then `about:blank`, then makes a cold navigation with the init-script observers. Because the reader has visited before, the measured job load is a **returning reader's** (see RC7-E8-5). The `fixme` RC7-E8-4 measures a first visit instead (`warm: false`).
- LCP is the last `largest-contentful-paint` entry.
- Load CLS is the raw sum of `layout-shift` entries without recent input, before any scroll.
- **Scrolls.** There are two scrolls through the whole document, each from a settled top with the sum reset:
  - **paced** (asserted = 0 as a raw sum, not rounded): 240 px steps, each settled by the lens (`helpers/lens.ts` `settle`), inside `LENS_LOOKAHEAD_PX = 288`. This is the contract pace of `e2e/document/lens-cls.spec.ts`.
  - **flung** (recorded): 90%-of-viewport jumps about 170 ms apart.
- The document height is re-read every step, because the paper grows as stops open (job: 6,702–9,496 → 10,756 px).
- WebKit has no `layout-shift` entry type. Its CLS tests skip with that reason, and its LCP is recorded but not asserted.

| Reading                                                        | Studio chromium                                         | Job chromium                                   | Studio webkit-iphone                         | Job webkit-iphone           |
| -------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------- | --------------------------- |
| LCP (asserted ≤ 2.5 s on chromium)                             | 1,292 / 1,184 ms (the cover `img`)                      | 1,828 / 2,068 ms (phase-name button)           | 3,655 / 1,145 ms (recorded; `p` in the head) | 2,411 / 1,567 ms (recorded) |
| Load CLS before scroll (recorded)                              | 0.004 / 0.120                                           | **1.421 / 1.343** (returning reader, RC7-E8-5) | not available                                | not available               |
| Job load CLS, first visit (`fixme` RC7-E8-4)                   | —                                                       | **0.04–0.11** (diagnostic runs; see §7)        | —                                            | not available               |
| Settled-scroll CLS, paced (asserted = 0)                       | 0 (8 steps) / 0                                         | **0** (45 steps) / 0                           | skipped (no `layout-shift`)                  | skipped                     |
| Settled-scroll CLS, flung (recorded)                           | 0 (3 steps) / 0                                         | 0 (14 steps) / 0                               | not available                                | not available               |
| Requests, cold load: total / Supabase API / dev server / other | 73 / 36 / 27 / 10 Sanity (11 failed: Sanity CDN plus 1) | 233 / 202 / 31 / 0 (1 failed)                  | 74 / 36 / 28 / 10 Sanity (10 failed)         | 228 / 196 / 32 / 0          |
| Of which `rpc/get_project_ffe_readiness`                       | 0                                                       | **80** (one per line)                          | 0                                            | 80                          |
| Nodes                                                          | 571–573                                                 | 1,399–1,400                                    | 573                                          | 1,013                       |

Each cell gives run 1 / run 2 (`data-rc7-e8/perf-<engine>-run<n>.json`).

- **Settled-scroll zero shift holds** in all four chromium readings, paced and flung.
- **Studio load CLS of 0.120 in run 2** came from `div[data-studio-spread]` and a text block at 0.85–1.12 s. It is recorded, not asserted; no clause gates studio load CLS.
- **WebKit studio LCP of 3,655 ms in run 1** fell to 1,145 ms in run 2. Run 1 was the first WebKit navigation after the compile. It is recorded, not asserted.
- **The 80 readiness RPCs** are the per-line readiness path. The batch transport `get_project_ffe_readiness_batch` is deliberately inactive (00880; noted in `rc6-final-tip-matrix.md`). The calls scale with lines: 2,000 lines means 2,000 calls. This is observation O-3, because it is known and by design.
- **Interaction latency (≤200 ms) was not measured** in this lane.
- **Bundle budgets** were not re-run. G5 records them as passing, and a production build would collide with the running dev server's `.next`.

**Request capture (R3b "broken in recorded scale run").**

- On this stack, the BrowserContext listener counted 36 / 202 API requests, equal to Resource Timing. This is asserted in every run.
- In the recorded SQ-2355 `g4-round8/chromium-80.json`:
  - `network` is `[]`, `readinessPeak` is `{}` and `fetchedUniqueLines` is 0;
  - its Resource Timing shows 203 requests to `127.0.0.1:57321`.
- `scale-profile.spec.ts` filters every event by the exact origin `new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin` (`:17`, `:35`, `:53`), and its `request` handler matched nothing at all.
- The most likely cause is a host-spelling mismatch (`localhost` vs `127.0.0.1`) between the runner's env and the URL the dev server inlined. Confidence is medium: that run did not log its env.
- `rc7-e8-perf.spec.ts` matches on host and port under both spellings. `scale-profile.spec.ts` was not edited (shared spec).

## 6. Commands (verbatim) and results

All runs used:

```bash
cd /Users/kody/Code/patina-r8-rc7-e8h/apps/designer-portal
source <scratchpad>/e8h.env   # 62621/62622 trio from `supabase status -o env`, PLAYWRIGHT_DESIGNER_PORT=4210, RC7_OWNED_STACK=patina-rc7-e8h
PLAYWRIGHT_OUTPUT_DIR=<scratchpad>/e8h-runs/<project>-<run> pnpm exec playwright test -c playwright.round8.config.ts \
  e2e/round8/rc7-e8-visual.spec.ts e2e/round8/rc7-e8-a11y.spec.ts e2e/round8/rc7-e8-zoom.spec.ts e2e/round8/rc7-e8-perf.spec.ts \
  --project=<chromium|webkit-iphone> --workers=1
```

Before each run, the wrapper waited for `vm_stat` free memory ≥ 500 MB. Free memory was 4.1–16 GB at each start, and `df` showed 260–270 GiB free. Every test line of every run is in `data-rc7-e8/runs.txt`.

| Run                | Result                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| chromium 1         | 16 passed, 4 skipped (`fixme` RC7-E8-2, -3, -4, -5), 0 failed, 6.1 m                                                |
| chromium 2         | 16 passed, 4 skipped, 0 failed, 6.3 m                                                                               |
| chromium a11y 1, 2 | 3 passed, 1 skipped (RC7-E8-2), 0 failed, 2.2 m each. These re-ran the a11y spec after the E8-1 setup change (O-4). |
| webkit-iphone 1    | 14 passed, 6 skipped (the 4 `fixme`s, plus 2 settled-scroll CLS capability skips), 0 failed, 7.8 m                  |
| webkit-iphone 2    | 14 passed, 6 skipped, 0 failed, 7.0 m                                                                               |

**Failures before the final runs, and what was done about each.** None of these loosened an assertion.

- **chromium 0 (just after the flips).** RC7-E8-2 failed on its residual nodes, and RC7-E8-4 failed at 1.47. The cause was the returning-reader landing, and it was split out as RC7-E8-5. Both stay `fixme`.
- **chromium 0b.** RC7-E8-4 failed on a first visit at 0.110. It stays a `fixme` as a residual.
- **webkit-iphone 0a and 0b.** The flipped RC7-E8-1 failed in setup: the job paper showed "This document could not be loaded". The setup now arrives through the studio and `about:blank`, like the passing cancel test (O-4). The product fix was already working: the cancel test logged focus on "Resolve this condition".

## 7. Defects

**RC7-E8-1: Cancel on the resolve-condition form dropped keyboard focus to `<body>`. FIXED by FIX4 `5386a159e`.**

- **Verified:** the RC7-E8-1 test now asserts focus on "Resolve this condition" after Cancel, and it passes in both engines in all runs. The acceptance test's cancel step logs the same.
- **Not verified:** the same pattern on the revoke form.

**RC7-E8-2: Text contrast below 4.5:1 (axe serious). RESIDUAL after FIX4; `test.fixme`.**

- **Severity:** medium (1.4.3 AA). **Confidence:** high; identical in both engines and all runs.
- **Remaining pairs:**
  - `--color-aged-oak` `#8b7355` on `#faf7f2` = **4.19:1**, 1 node on the E7 job paper. This is the 11 px month tick in `schedule/schedule-glance-strip.tsx:68`.
  - Aged-oak on `#fcfaf7` = 4.3:1 ×3, and on `#f3f0eb` = 3.94:1 ×1. These are 4 nodes seen with the FF&E Specifications line opened by keyboard: the Working budget heading, Authorizations heading, GuidedEmptyState “Start with” label, and AccountBand “Studio eyes only” loading label. They are not four spec-pane labels.
- **Coverage gap in the `fixme` itself:** it opens the Specifications line by URL. In chromium 0, that surface reported 0 nodes, while the keyboard-opened line reports 4. When the fixme is flipped, its surface must be opened the way the keyboard path opens it.
- **Proposed fix at RC-7:** use the darker FIX4 token on the named small labels.

**RC7-E8-3: At 390@200% (195 CSS px), 8–9 controls run past the right edge and are hidden, not reflowed. `test.fixme`.**

- **Severity:** low. 195 CSS px is below the WCAG 1.4.10 floor of 320, and 1280@200% has 0 clips. **Confidence:** high; the same selectors appear in both engines and both runs.
- **Repro and selectors:** see §4. Six of the seven job-paper clips are `DocumentAction`s.
- **Root cause:** `src/components/document/document-action.tsx:73`. `BASE_CLASS` carries `shrink-0`, so an action keeps its intrinsic width inside a row (`flex`) layout. The wrapping variant `WRAP_BASE_CLASS` (`:74`, which swaps in `min-w-0`) is opt-in through `wrap` (`:288`). The call sites in `press-band.tsx:202`, `design-chapter.tsx:304` and `derived-budget-grid.tsx:244` do not pass it, and the FF&E actions (`ffe-section.tsx`) were not traced. The terminal variant is `whitespace-nowrap` (`:85`). `body { overflow-x: hidden }` (`globals.css:1746`) hides the overflow, so `scrollWidth` reports 0.
- **Proposed fix:** pass `wrap` at those call sites, or make the row stack below about 240 px.

**RC7-E8-4: Job paper cold-load CLS on a first visit is 0.04–0.11 (chromium), against the proposed ≤ 0.1. RESIDUAL after FIX5 `74a324b26`; `test.fixme`.**

- **Severity:** low to medium. FIX5 brought it down from 1.16–1.17, and it sits at the target's edge. **Confidence:** high for the measurement. Readings: 0.110 (chromium 0b), 0.050 and 0.098 (diagnostic), and 0.04 in FIX5's own measurement. Whether the target applies is medium confidence until WP-00 agrees a profile.
- **Root cause:** the round-8 cover is never held. `revealStep` in `use-chapter-reveal.ts` gates the chapters below the cover only on the cover's loading register. So the cover's late growth (77–234 px at 1.7–2.3 s) pushes the already-shown brief and kickoff band down. A further 0.034 shift comes from the nav outside the paper.
- **Proposed fix:** reserve the cover's aspect box before its image resolves, or hold the reveal on the image's decode.

**RC7-E8-5 (new): Job paper cold-load CLS for a returning reader is 1.34–1.42 (chromium). `test.fixme`.**

- **Severity:** medium against the proposed ≤ 0.1; no settled-scroll impact. **Confidence:** high; both final runs, and pinned by a stack trace in the diagnostic run.
- **Repro:** visit `/doc/<F01>`, leave, and cold-load it again at 1440×900.
- **Root cause:** the returning-reader landing at `src/app/(document)/doc/[id]/page.tsx:1744` (`afterArrival`) calls `scrollIntoRevealed` on the active section at about 1.1 s. That marks every chapter above the section `data-paper-shown` (`use-chapter-reveal.ts:59–63`) before their bodies resolve. The entries name `section#schedule`, `#financials`, `#closeout` and `div[data-section-file-drop]`, moving at 1.5–2.1 s, not veiled. This bypasses FIX5's progressive reveal.
- **Proposed fix:** have the landing wait for the chapters above it to settle, or reveal them with reserved heights.

**Observations, not defects**

- **O-1:** a focused line button is 3/5 covered by the sticky job head after Shift+Tab (2.4.12 AAA). It is annotated in the test.
- **O-2:** fixed and sticky chrome take 48–52% of the height at 200% zoom.
- **O-3:** 80 per-line readiness RPCs while the batch transport stays inactive.
- **O-4:** in WebKit, `signInAs` followed by a direct `goto /doc/<job>` can show "This document could not be loaded. The read failed", with `TypeError: Load failed` on the in-flight studio queries. Arriving through the studio and `about:blank` first avoids it. Not root-caused; it may be a harness artifact of aborting a load mid-navigation.

## 8. Not verified

- **The screen-reader pass.** It needs a human (VoiceOver / NVDA).
- **Keyboard acceptance beyond refusal and cancel**: recording a resolution, sending a request, revoking.
- **Real browser zoom, text-only zoom, and 320-CSS-px reflow.** Only the viewport-halving proxy was run.
- **X04 composition at the FIX4/FIX5 tip.** The facts were re-asserted, but the images were not re-compared (§2).
- **Reduced motion and non-drag alternatives.** This lane did not re-test them; earlier specs cover them.
- **X04 for books and the dense sheet.** They were not re-compared with the reference.
- **The cabinetry plate with an issued package and elevation drawing.** No owned fixture has one.
- **The drawing pixels in the viewer.** Headless browsers render no PDF.
- **X07 interaction latency (≤200 ms) and percentiles.** No representative profile is agreed (WP-00).
- **WebKit CLS and WebKit LCP gating.** WebKit lacks the `layout-shift` entry type, and its LCP is recorded only.
- **Bundle budgets.** They were not re-run here; G5 passes.
- **The root cause of the recorded scale-run capture failure.** It is inferred, not reproduced.
- **O-4's root cause.**

## 9. Gate

- `pnpm --filter @patina/designer-portal type-check`: exit 0. The app tsconfig excludes `*.spec.ts`, so the lane specs were also checked with `tsc -p <temp tsconfig extending apps/designer-portal/tsconfig.json, composite/incremental off, include e2e/round8/rc7-e8-*.ts>`. That gave exit 0 and 0 errors, and the temp file was removed.
- `pnpm --filter @patina/designer-portal lint`: exit 0, **0 errors** (250 pre-existing warnings). The lint config ignores `e2e/`, so `eslint --no-ignore e2e/round8/rc7-e8-*.ts` was run as well: exit 0, no output.

## 10. Teardown

- `supabase stop --workdir <scratchpad>/e8h-stack.obYS --no-backup`.
- `lsof -ti :4210 | xargs kill`.
- Afterwards, `lsof -iTCP -sTCP:LISTEN -nP | grep ':626'` returned nothing, and `lsof -iTCP:4210 -sTCP:LISTEN` returned nothing.
- `docker ps` and `docker volume ls` show 0 entries for `patina-rc7-e8h`.
- After each run, the dev server's rewrite of `apps/designer-portal/next-env.d.ts` and the run's overwrite of the `visual-rc7/*.jpg` captures were restored with `git checkout --`. Only `visual-rc7/*-facts.json` is committed from these runs.
- Ports 54321/54322, Strata, PostHog and production were never touched.

## 11. RC8-FIX13 post-review follow-up (2026-10-30)

This section supersedes the **residual** status of RC7-E8-2 and RC7-E8-4 above; the RC-7 observations and run history remain historical. The two initial FIX13 commits are `7035f0043` (contrast) and `e828ed666` (cold-load reservation). After cross-provider review, the loading reservation was narrowed to the PressBand: `press-band.tsx` renders a decorative band-sized placeholder while the editions query loads, then collapses on an error or missing result. `paper/round8.css` no longer reserves 254 px on every cover plate. Proposal and brief renders have no PressBand or blank plate-wide reservation. Render tests cover the loading/error transition and those two paper stages.

The five RC7-E8-2 residual nodes are the four named FF&E-open labels corrected in §7 and the E7 schedule month tick. Render tests now assert the actual nodes' quiet-ink classes: Working budget, Authorizations, “Start with,” both AccountBand states (“Studio eyes only” while loading and “Studio only” when loaded), and a glance month tick. The token test now says “commercial headings,” not “FF&E line labels.” Two equivalent 11 px mono uppercase eyebrows in `proposal-watch.tsx:109,226` also use quiet ink. `account-band.tsx:216` is instead an ordinary quoted hold note, not that eyebrow; its contrast was not adjudicated here. The quiet-ink swaps apply to **both renderers**, as `globals.css:16–17` already sanctions quiet ink for small copy; no round-8-only contrast override was added.

Before each RC7-E8-2 axe check, the spec waits for a shown paper child and the resolved lens, and checks the affected labels are rendered and visible. It opens the FF&E line by keyboard. Axe color-contrast violations were **0** on all six surfaces in both runs per engine. The numbers below are **incomplete** color-contrast nodes, which axe could not decide, not passing nodes; those require manual review. Columns are studio / F01 job / FF&E Specifications open / E7 job / E7 acceptance-care / resolve form.

| Browser run | Browser matrix | Axe incomplete by surface | First-visit job CLS | First-visit job LCP |
| --- | --- | --- | ---: | ---: |
| chromium 1 | 9 passed, 1 skipped, 0 failed | 1 / 5 / 8 / 5 / 0 / 0 | 0.0385 | 1796 ms |
| chromium 2 | 9 passed, 1 skipped, 0 failed | 1 / 5 / 8 / 5 / 0 / 0 | 0.0385 | 1732 ms |
| webkit-iphone 1 | 6 passed, 4 skipped, 0 failed | 0 / 4 / 7 / 3 / 0 / 0 | unavailable | 1610 ms |
| webkit-iphone 2 | 6 passed, 4 skipped, 0 failed | 0 / 4 / 7 / 3 / 0 / 0 | unavailable | 1494 ms |

Each run used `playwright.round8.config.ts`, `rc7-e8-a11y.spec.ts` and `rc7-e8-perf.spec.ts`, `--workers=1`, live mode, the guarded FIX13-owned stack (API 61621, DB 61622) and designer port 3416. Chromium first-visit CLS clears the proposed ≤0.1 target twice; its initial blanket-reservation readings were 0.0491 twice. WebKit does not expose `layout-shift`, so its CLS cases skip and the table does **not** claim zero. LCP is recorded, not a regression conclusion: RC-7 has no comparable **pre-fix first-visit** LCP baseline. RC7-E8-5 returning-reader CLS remains a skipped, separate defect; this lane did not edit its landing flow. Screen-reader and manual review of axe-incomplete nodes remain unverified.

Follow-up gate: designer portal `type-check` exited 0; `lint` exited 0 (0 errors, 250 warnings); focused Jest `--runTestsByPath` passed **10/10 suites, 206/206 tests**. The changed E8 a11y spec also passed a standalone TypeScript check and `eslint --no-ignore` with exit 0. After the four browser runs, `supabase stop --workdir <FIX13 scratch stack> --no-backup` completed; designer 3416 and block-616 listeners were absent, FIX13 containers and volumes were absent, and its browser mutex was released. The generated `next-env.d.ts` rewrite was restored. No shared-stack reset, Strata deployment, or push occurred.
