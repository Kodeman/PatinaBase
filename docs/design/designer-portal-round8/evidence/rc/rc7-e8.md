# RC-7 E8: visual, accessibility, zoom and performance (X04–X07)

US-52 Room Proof 08, step RC-7, lane E8. This lane raises X04–X07 from the R3b rating "weak" (`rc6-reviews/r3b-evidence-full.md` rows X04–X07). It uses live data, the round-8 flag and the F01 fixture, on an owned stack. It does not fix product code; it records defects.

**Run facts**

| Item                           | Value                                                                                                                                                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date                           | 2026-10-29                                                                                                                                                                                                                                                                      |
| Worktree / branch              | `/Users/kody/Code/patina-r8-rc7-e8`, branch `r8-rc7-e8`                                                                                                                                                                                                                         |
| Tip under test                 | `a1f375cbc` (the lane base, the merged RC-7 tip)                                                                                                                                                                                                                                |
| Owned stack                    | `project_id` `patina-rc7-e8`. Ports: API 64121, DB 64122, shadow 64120, pooler 64129. Started with `-x studio,mailpit,logflare,vector,edge-runtime,imgproxy,postgres-meta` and the 5 version pins. Marker `rc7_owned.stack = 'patina-rc7-e8'`. System id `7702166181275328554`. |
| Migration head on the owned DB | `00902` (828 migration rows)                                                                                                                                                                                                                                                    |
| pg_cron                        | `cron.launch_active_jobs = off`, set as `supabase_admin`                                                                                                                                                                                                                        |
| Designer dev                   | `PLAYWRIGHT_DESIGNER_PORT=3810`, started by `playwright.round8.config.ts`: live data mode, round-8 renderer flag, `next dev --webpack`. Machine: Apple M4 Pro, unthrottled localhost.                                                                                           |
| Browsers                       | `chromium` = Desktop Chrome 1440×900 at DPR 1. `webkit-iphone` = iPhone 14, 390×664 at DPR 3.                                                                                                                                                                                   |

**Result**

| ID  | Clause                                                     | Before (R3b) | Now                                                                                                                                                                                                                                                                   | Spec                    | Asserted                                                                                                                                                | Readback                                                                                                | Runs                                                              |
| --- | ---------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| X04 | Visual coherence against frozen round 8, desktop and phone | weak         | **covered** for the named surfaces: studio and photographic cover, job paper, cabinetry chapter, activated acceptance/care chapter. Books and the dense sheet were not re-compared.                                                                                   | `rc7-e8-visual.spec.ts` | Cover `<img>` decoded from a signed `project-ffe-working` URL; C4/C6 inactive notes = 0; E7 requests rendered = DB lifecycles; page overflow 0          | `facts.json` per browser: plate src, natural size, chapters, DB cabinetry/request rows                  | 2 chromium, 2 webkit-iphone: 3/3 passed each                      |
| X05 | WCAG 2.2 AA complete processes, screen reader              | weak         | **covered except the screen reader** (not verified; needs a person). Two keyboard-only processes complete in both engines. axe: 0 critical, 0 moderate, 0 minor; **serious color-contrast on 4 of 6 surfaces**. 1 focus defect.                                       | `rc7-e8-a11y.spec.ts`   | Every step reached by native Tab order and on screen; save persisted; Esc folds the unfold and returns focus to its door; refused submit writes nothing | DB `project_ffe_specs.finish` = typed value; `service_acceptance_condition_resolutions` count unchanged | 2 chromium, 2 webkit-iphone: 2 passed + 1 `fixme` (RC7-E8-1) each |
| X06 | Zoom, real content bounds, bounded and reachable scrolling | weak         | **covered at 1280 @ 200%** (0 clipped controls on all 5 surfaces). **390 @ 200% clips 6–7 controls** (RC7-E8-3).                                                                                                                                                      | `rc7-e8-zoom.spec.ts`   | Each surface opens at the zoomed viewport; page does not scroll sideways                                                                                | Per-control geometry and clipping ancestor; `rc7-e8-zoom-<browser>.json`                                | 2 chromium, 2 webkit-iphone: 6/6 passed each                      |
| X07 | Settled-scroll zero shift; load targets; request capture   | weak         | **Partly covered.** Settled-scroll CLS is **0** on studio and job (paced and flung). LCP is within 2.5 s. Request capture is repaired. **Job cold-load CLS is 1.16–1.17**, against a proposed ≤0.1 (RC7-E8-4). Interaction latency and percentiles were not measured. | `rc7-e8-perf.spec.ts`   | API requests captured > 0; context capture = Resource Timing (±max(3, 10%)); the scroll covers the whole document                                       | `rc7-e8-perf-<browser>.json`                                                                            | 2 chromium, 2 webkit-iphone: 2/2 passed each                      |

## 1. Lane fixtures (owned stack only)

- **`rc7-e8-activation-fixture.sql`** turns on C2, C4 and C6.
  - It sets `server_capabilities.scope_editions = true`.
  - It grants the C2, C4 and C6 RPCs to `authenticated`, and `stamp_service_acceptance_paper_hash` to `service_role`.
  - It refuses unless all of these hold:
    - `owned_port` and `owned_system_id` are both given;
    - the host is loopback;
    - `PORT = owned_port`, and the port is not 54321 or 54322;
    - the `pg_control_system()` id matches;
    - the `rc7_owned.stack` marker names `patina-rc7-e8`.
  - Both refusals were exercised. A wrong system id gave `rc7-e8 activation refused: not the owned rc7-e8 stack`. A missing port was also refused.
  - Applied readback: `{"scope_editions" : true, "c4_create" : true, "c6_complete" : true}`.
- **E7's `rc7-e7-fixtures/mixed-fixture.sql`** was then loaded once, with the same guard values. It provides the "E7 household job" (`42ef0dac-…`):
  - C4 request 1 Returned;
  - C4 request 2 Accepted with conditions;
  - a C6 completion "Completed with conditions", with the open condition "Keep the oak floor";
  - a GC cabinetry fulfilment `pkg.cabinets` (2 units, planned).

  Each record comes from its RPC, run as its real actor.

- **`rc7-e8-cover-fixture.sql`** adds one active project board on F01. It runs after `rc7OwnedStackSql()`.
  - Its `cover_image_url` is `<job>/boards/<board>/room.png`. That is the only bare key that `guard_proposal_board_media_reference` accepts for a project board.
  - The spec uploads the reference's own cover, `artifacts/room-proof-round8-2026-10-23/assets/room.png`, to that key in `project-ffe-working`.
  - The studio therefore signs it through the product path: `use-commission-plates` → `signProjectWorkingBoardRow`.
- The zoom spec files one issued print per run, using `file_plan_prints` and then `create_plan_issue`, as the F01 designer through `psqlAsUserRow`. The sheet number is unique per run.

## 2. X04 visual (method of `rc4-visual.md` / `rc4b-visual-reeval.md`)

The portal and the reference were each captured at the same viewport, and I looked at both. Captures are under `visual-rc7/`:

- `<browser>-<surface>.jpg` is the portal;
- `<browser>-ref-<surface>.jpg` is the reference;
- `<browser>-facts.json` holds the DOM facts.

Element captures hide fixed and sticky overlays outside the target. Full-page captures paint the fixed dock mid-page; that is a capture artifact.

| Surface                                                                                                       | Desktop 1440                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Phone 390                                                                                                                                                               | Rating                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Studio: photographic cover (`studio-top`, `studio-full` vs `ref-studio-top`)                                  | The board photograph sits where the reference puts it: the left column, about 804×529, beside "Needs your attention". The caption is a white plate at the lower left of the photo, "F01 Fictional Full-Service House · board cover", as in the reference. `img` is signed (`/storage/v1/object/sign/project-ffe-working/`), natural 1536×1024, `alt=""` with a figcaption.                                                                                      | Decoded and signed (box 354×295). The head, the hours/find band and the one-time coach note push it below the first screen; the reference shows it on the first screen. | **match** (photograph, place, caption). **Deviations:** (a) the intro sits under the h1, not in the right column (already ruled acceptable in RC-4b); (b) the one-time Desk coach note adds about 170 px above the plate; (c) "Open the job paper" is an underlined text link, where the reference has a moss button.                                                                                                                                                                   |
| Job paper: top and full (`job-top`, `job-full` vs `ref-job-top`, `ref-index-top`)                             | Chapter order: brief, design, approvals, schedule, ffe, financials, closeout, record. The cover is the empty "Add a photograph for the cover" card: the job cover is a separate data source, and F01 has none. Overflow 0.                                                                                                                                                                                                                                      | Same order; overflow 0.                                                                                                                                                 | **deviation, data-bound** (no job cover photo in F01). Otherwise as RC-4b.                                                                                                                                                                                                                                                                                                                                                                                                              |
| Cabinetry chapter (E7, `job-e7-cabinetry` vs `ref-job-cabinetry`)                                             | Reads the GC fulfilment `pkg.cabinets`, 2 units, planned, as a single-column register: "No package record for this key", "No package issue is recorded", "These acts are not active yet" (the C5 instruction acts). The reference has a 2-column plate with an elevation drawing and "Unfold the build package".                                                                                                                                                | Stacks cleanly; overflow 0.                                                                                                                                             | **deviation, partly data-bound.** No owned fixture has an issued package or a drawing, so the plate and elevation cannot appear. The register type is sans and small where the reference uses the display serif.                                                                                                                                                                                                                                                                        |
| Acceptance / care chapter, C4/C6 active (E7, `job-e7-closeout` vs `ref-job-closeout`; F01 `job-f01-closeout`) | Every state renders: request 2 Closed · Accepted with conditions, with signers and the replaced partner; request 1 Returned, with its reason; studio service "Completed with conditions" with "Revoke this completion"; the client condition "Keep the oak floor · Open" with "Resolve this condition"; care references for edition 1. On F01 with C4/C6 active, the inactive notes are 0 and the copy reads "No agreed scope edition is active for this job…". | Stacks cleanly; overflow 0.                                                                                                                                             | **deviation (hierarchy and type).** The reference's "Acceptance & handoff" is a bordered card with a display-serif lead ("Final acceptance is still open."), signer lines and a right column "Service completion — Held". The portal uses small sans headings and no card, behind the legacy tan "Project closeout" panel. The chapter label "Closeout" is deliberate (`ROUND8_PAPER_ORDER`). The RC-4 D2 gap (acceptance and completion readings absent) is **closed** when activated. |

No X04 item is a defect: every difference is either a composition deviation or a data limit.

## 3. X05 keyboard and axe

**Keyboard-only processes.** Every step uses native Tab order. WebKit needs `Alt+Tab` to reach links. Presses are paced at 150 ms: the lens opens a quiet stop only after the focus-driven scroll settles (`use-lens-density.ts`, L-9).

1. **Studio → job → FF&E unfold → save → close → studio** (line "F01 Living Room selection 07").
   - Tab counts, chromium / webkit-iphone:

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

   - Enter saved; DB readback `project_ffe_specs.finish` = the typed value.
   - Esc inside the filled Finish field holds the unfold. That is by design: `escapeIsHeld`, `build-room-shell.tsx:186–206`.
   - From the line button, Esc folds the unfold and focus returns to the "Edit room selections" door.
   - The studio arrives, and the value still reads back.

2. **Acceptance chapter (E7, C4/C6 active).**
   - "Resolve this condition" is reached in 76–78 tabs. Enter opens the form `Resolve: Keep the oak floor`.
   - Tab reaches "How it was resolved" and then "Record the resolution". Enter is refused with the alert "…choose one reference", and the resolutions count is unchanged.
   - Tab → Cancel → Enter closes the form, but **focus lands on `<body>`** in both engines (RC7-E8-1). A `test.fixme` names it.

**Focus indicators** (computed style on each focused control):

- Controls show a 2px outline `rgb(124, 94, 48)`.
- The textarea shows its 1px accent ring.
- One step is partly obscured: after Shift+Tab from Finish back to the line, **3 of 5 sample points on the line button are covered by the sticky `header[data-job-head]`** (chromium). It is not entirely hidden, so WCAG 2.4.11 (AA) is met and 2.4.12 (AAA) is not. Severity low; observation O-1.

**axe** (axe-core 4.11.1 from the repo's existing `axe-playwright` install; tags wcag2a/2aa/21a/21aa/22aa; no dependency added):

| Surface                                | Critical | Serious           | Moderate | Minor | Identical in           |
| -------------------------------------- | -------- | ----------------- | -------- | ----- | ---------------------- |
| Studio                                 | 0        | 0                 | 0        | 0     | both engines, all runs |
| Job paper (F01)                        | 0        | 8 color-contrast  | 0        | 0     | both engines, all runs |
| FF&E unfold, Specifications, line open | 0        | 18 color-contrast | 0        | 0     | both engines, all runs |
| Job paper (E7, acceptance active)      | 0        | 1 color-contrast  | 0        | 0     | both engines, all runs |
| Acceptance/care chapter (E7)           | 0        | 0                 | 0        | 0     | both engines, all runs |
| Resolve-condition form open            | 0        | 6 color-contrast  | 0        | 0     | both engines, all runs |

The contrast pairs are RC7-E8-2.

## 4. X06 zoom

**Method.** This is the approach of the existing zoom probes, **not CSS `zoom`**: the CSS viewport is halved and the device scale factor doubled, which is what a 200% page zoom does to layout.

- 1280 @ 200% = 640×360 CSS at DSF 2.
- 390 @ 200% = 195×422 CSS at DSF 2.

The probe walks every visible focusable control under the surface root. It records a control as clipped if it is outside the viewport horizontally, or if it is 1–98% visible inside an `overflow: hidden/clip` ancestor. It also records horizontal scroll containers and the fixed/sticky share of the viewport height.

| Surface                                                | 1280 @ 200%                                                                                                               | 390 @ 200%                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Whole job paper (long content), 49–50 controls mounted | 0 clipped; page overflow 0; chrome 48% of height                                                                          | **5 clipped**: `a[data-action-key="press-add-cover-photo"]` (x 37–257 of 195), `a[data-action-key="open-project-drawings"]` (18–204), `button[data-action-key="ffe-lead-spec"]` (18–197), `button[data-action-key="close-project"]` (174–308), `button[data-action-key="complete-studio-service"]` (18–204). Page overflow 0, because `body` has `overflow-x-hidden` (`globals.css:1746`). Chrome 52%. |
| FF&E Specifications, line open (66 controls)           | 0 clipped; no scroll containers                                                                                           | chromium: `select[aria-label="unit"]` (135–197) clipped. Both engines: the line `section` scrolls sideways (179/159 and 172/150) and has focusable content.                                                                                                                                                                                                                                            |
| FF&E rough lens (178 controls)                         | 0 clipped. At 640 CSS px the lens renders its phone list (the `phone` branch of `rough-in-table.tsx`), not the `<table>`. | 0 clipped                                                                                                                                                                                                                                                                                                                                                                                              |
| Issued print history                                   | 0 clipped                                                                                                                 | 0 clipped                                                                                                                                                                                                                                                                                                                                                                                              |
| Drawing/evidence viewer (dialog)                       | 0 clipped                                                                                                                 | `button[data-action-key="close-plan-print-viewer"]` "Back to the document" (18–199) loses 4 px                                                                                                                                                                                                                                                                                                         |

The 1280 @ 200% chrome share (sticky job head plus dock = 48% of a 360 px viewport) is recorded as observation O-2; it is not a defect. Captures: `visual-rc7/<browser>-zoom-<size>-<surface>.jpg`. The PDF pixels inside the viewer are blank in headless browsers; the viewer frame and its controls were checked, the drawing render was not.

## 5. X07 performance

**Profile:** Apple M4 Pro, unthrottled localhost, `next dev --webpack` (dev bundles), F01 (80 lines, 3 rooms) plus the cover board. This is **not** the representative profile ACCEPTANCE.md X07 asks WP-00 to agree, so the numbers are raw.

**Method.**

- Warm compile, then `about:blank`, then a cold navigation with the init-script observers.
- Wait for arrival-ready, network idle and 1 s.
- LCP is the last `largest-contentful-paint` entry.
- Load CLS is the plain sum of `layout-shift` entries without recent input, before any scroll.
- Then two scrolls through the whole document, each from a settled top with the sum reset:
  - **paced**: 240 px steps, each settled by the lens (`helpers/lens.ts` `settle`), inside `LENS_LOOKAHEAD_PX = 288`. This is the contract pace of `e2e/document/lens-cls.spec.ts`.
  - **flung**: 90%-of-viewport jumps about 170 ms apart.
- The document height is re-read every step, because the paper grows as stops open (job: 6,702 → 10,756 px).

| Reading                                                        | Studio chromium                                         | Job chromium                         | Studio webkit-iphone                         | Job webkit-iphone  |
| -------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------ | -------------------------------------------- | ------------------ |
| LCP (target ≤2.5 s)                                            | 1,028 / 1,020 ms (plate `span.aspect-[1.52]`)           | 1,836 / 1,860 ms (phase-name button) | 1,102 / 1,075 ms                             | 2,212 / 2,172 ms   |
| Load CLS before scroll (target ≤0.1)                           | 0.064 / 0.083                                           | **1.168 / 1.156**                    | not available (WebKit has no `layout-shift`) | not available      |
| Settled-scroll CLS, paced (contract = 0)                       | 0 (8 steps) / 0                                         | **0** (45 steps) / 0                 | not available                                | not available      |
| Settled-scroll CLS, flung                                      | 0 / 0                                                   | 0 (14 steps) / 0                     | not available                                | not available      |
| Requests, cold load: total / Supabase API / dev server / other | 70 / 33 / 27 / 10 Sanity (11 failed: Sanity CDN plus 1) | 225 / 194 / 31 / 0 (1 failed)        | 71 / 33 / 28 / 10 Sanity                     | 226 / 194 / 32 / 0 |
| Of which `rpc/get_project_ffe_readiness`                       | 0                                                       | **80** (one per line)                | 0                                            | 80                 |
| Nodes                                                          | 571–572                                                 | 1,012                                | —                                            | —                  |

Each cell gives run 1 / run 2.

- **Settled-scroll zero shift holds** in all four chromium readings, paced and flung. During development, one earlier version of the scroll (810 px jumps, height read once, no lens settle) recorded a single 0.1567 shift. Its sources were `section[data-studio-service]`, `section[data-service-acceptance]` and `section#record`, in the activated closeout. It did not recur in 4 later runs of either method. It is listed under Not verified, not as a defect.
- **Load CLS on the job is 1.16–1.17.** Sources: `section#schedule`, `section#financials`, `section#closeout` and `div[data-section-file-drop]`, moving at 1.37–1.85 s while bodies resolve. None of the entries landed under an arrival class (`arr-pre/on/press` was absent when each entry was delivered), so they were not veiled. This is RC7-E8-4. `lens-cls.spec.ts:33–36` already calls initial-load layout "pre-existing … never gated". Against the proposed X07 target it fails.
- **The 80 readiness RPCs** are the per-line readiness path. The batch transport `get_project_ffe_readiness_batch` is deliberately inactive (00880; noted in `rc6-final-tip-matrix.md`). They scale with lines: 2,000 lines means 2,000 calls. This is recorded as observation O-3, because it is known and by design.
- **Interaction latency (≤200 ms) was not measured** in this lane.
- **Bundle budgets** were not re-run: G5 records them as passing, and a production build would collide with the running dev server's `.next`.

**Request capture (R3b "broken in recorded scale run").**

- On this stack the BrowserContext listener and a Page listener each counted **33 / 194** API requests, equal to Resource Timing. So the Page listener itself is not broken.
- In the recorded SQ-2355 `g4-round8/chromium-80.json`:
  - `network` is `[]`, `readinessPeak` is `{}` and `fetchedUniqueLines` is 0;
  - its Resource Timing shows 203 requests to `127.0.0.1:57321`.
- `scale-profile.spec.ts` filters every event by exact origin `new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin` (`:17`, `:35`, `:53`). The `request` handler matched nothing at all.
- The most likely cause is a host-spelling mismatch (`localhost` vs `127.0.0.1`) between the runner's env and the URL the dev server inlined. Confidence medium: the run did not log its env.
- `rc7-e8-perf.spec.ts` matches on host and port under both spellings, and asserts that its count agrees with Resource Timing. `scale-profile.spec.ts` was not edited (shared spec).

## 6. Commands (verbatim) and results

All runs used:

```bash
cd /Users/kody/Code/patina-r8-rc7-e8/apps/designer-portal
source <scratch>/e8.env   # 64121/64122 trio, PLAYWRIGHT_DESIGNER_PORT=3810, RC7_OWNED_STACK
PLAYWRIGHT_OUTPUT_DIR=<scratch>/<run> pnpm exec playwright test -c playwright.round8.config.ts \
  e2e/round8/rc7-e8-visual.spec.ts e2e/round8/rc7-e8-a11y.spec.ts e2e/round8/rc7-e8-zoom.spec.ts e2e/round8/rc7-e8-perf.spec.ts \
  --project=<chromium|webkit-iphone> --workers=1
```

| Run             | Result                                                                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| chromium 1      | 13 passed, 1 skipped (`fixme` RC7-E8-1), 3.6 m. The focus-cover probe then sampled only the centre; it was widened to 5 points before run 2. |
| chromium 2      | 13 passed, 1 skipped, 3.5 m                                                                                                                  |
| webkit-iphone 1 | 13 passed, 1 skipped, 4.3 m                                                                                                                  |
| webkit-iphone 2 | 13 passed, 1 skipped, 4.3 m                                                                                                                  |

`vm_stat` free memory before each run was 6.9–10.3 GB, and `df` showed 290 GiB free.

**Harness fix during development.** The first two WebKit keyboard runs timed out at 5 minutes. The cause was in my spec: `tabTo` checked focus with `locator.evaluate`, which auto-waits for the element. On the phone, the FF&E stop is quiet when the page arrives, so the Living Room toggle did not exist and the check blocked. The check is now bounded to 500 ms, with a 150 s deadline and a focus-trail log. This was a harness defect, not a product one.

## 7. Defects

**RC7-E8-1: Cancel on the resolve-condition form drops keyboard focus to `<body>`.**

- **Severity:** medium (WCAG 2.4.3 focus order; the keyboard user is thrown to the top of the document). **Confidence:** high; reproduced in both engines in all 4 runs (`[rc7-e8 cancel focus] … body`).
- **Repro:** E7 job, closeout chapter → "Resolve this condition" → Tab to Cancel → Enter.
- **Root cause:** `apps/designer-portal/src/components/document/service-completion/studio-service-section.tsx`.
  - `:438–457`: `OpenCondition` swaps the form for the button with `onDone={() => setOpened(false)}`.
  - `:500`: Cancel calls `onDone`.
  - The focused form unmounts, and the re-mounted "Resolve this condition" button is never focused.
  - The revoke form (`:304–345`) uses the same open/close pattern. That one is unverified.
- **Proposed fix:** keep a ref to the "Resolve this condition" action and focus it in an effect when `opened` goes from true to false. Apply the same to revoke.

**RC7-E8-2: Text contrast below 4.5:1 on paper surfaces (axe serious).**

- **Severity:** medium (1.4.3 AA). **Confidence:** high; identical counts in both engines and all runs.
- **Pairs:**
  - `--color-aged-oak` `#8b7355` on `#faf7f2` = **4.19:1** for future-phase names at 19.8 px regular. Source: `schedule/phase-section.tsx:98` (`future: 'text-[1.1rem] … text-[var(--color-aged-oak)]'`). It is also the ghost add-line placeholder (`schedule/ghost-add-line.tsx:226`).
  - Sage `#7e8f76` on `#fbf9f5` = **3.28:1** at 12 px.
  - Aged-oak on `#fbf9f5` = 4.26:1 at 12 px.
  - Aged-oak on `#f0eae1` = **3.75:1** for the 12 px `.mb-1` labels in the closeout portfolio snapshot.
  - Terracotta-ink `#9c5340` on `#ede4db` = 4.48:1 for "Closeout tasks outstanding" at 11 px (`care-band.tsx:488–489`).
- **Counts:** 8 nodes on the F01 job, 18 with the Specifications sheet open, 1 on E7, 6 with the resolve form open.
- **Proposed fix:** a darker text token for aged-oak and sage on paper, at ≥4.5:1 (or use the existing ink token), at those sites.

**RC7-E8-3: At 390 @ 200% (195 CSS px) seven controls run past the right edge and are hidden, not reflowed.**

- **Severity:** low. 195 CSS px is below the WCAG 1.4.10 floor of 320, and 1280 @ 200% has 0 clips. **Confidence:** high; same selectors in both engines and runs.
- **Repro and selectors:** see §4. Worst is `close-project`: only 21 of its 134 px are visible.
- **Root cause:** action buttons keep their intrinsic `nowrap` width inside fixed-gutter rows. `body { overflow-x: hidden }` (`globals.css:1746`) hides the overflow, so `scrollWidth` reports 0.
- **Proposed fix:** let `DocumentAction` labels wrap, or stack the action rows below about 240 px.

**RC7-E8-4: Job paper cold-load CLS 1.16–1.17 (chromium), against the proposed ≤0.1.**

- **Severity:** medium against the proposed target; no settled-scroll impact. **Confidence:** high for the measurement; medium for whether the target applies until WP-00 agrees a profile.
- **Repro:** cold `/doc/<F01>` at 1440×900.
- **Root cause:** chapters mount into a skeleton, and their bodies resolve at different times. Entries name `section#schedule`, `#financials`, `#closeout` and `[data-section-file-drop]`, moving at 1.37–1.85 s, not veiled. See `use-lens-density.ts:46–53` (the ~2,600 px skeleton) and `lens-cls.spec.ts:33–36` (load CLS printed, never gated).
- **Proposed fix:** reserve region heights (as the quiet reserve already does) for the brief, design and approvals bodies on first paint, or keep the arrival veil until the paper resolves.

**Observations, not defects**

- **O-1:** a focused line button is 3/5 covered by the sticky job head after Shift+Tab (2.4.12 AAA).
- **O-2:** fixed and sticky chrome take 48–52% of the height at 200% zoom.
- **O-3:** 80 per-line readiness RPCs while the batch transport stays inactive.

## 8. Not verified

- **The screen-reader pass.** It needs a human (VoiceOver / NVDA).
- **Reduced motion and non-drag alternatives.** This lane did not re-test them; earlier specs cover them.
- **X04 for books and the dense sheet.** They were not re-compared with the reference.
- **The cabinetry plate with an issued package and elevation drawing.** No owned fixture has one.
- **The drawing pixels in the viewer.** Headless browsers render no PDF.
- **X07 interaction latency (≤200 ms) and percentiles.** No representative profile is agreed (WP-00). WebKit has no CLS; it lacks the `layout-shift` entry type.
- **Bundle budgets.** They were not re-run here; G5 passes.
- **The single 0.1567 scroll shift seen once in development.** It was not reproduced.
- **The root cause of the recorded scale-run capture failure.** It is inferred, not reproduced.

## 9. Gate

- `pnpm --filter @patina/designer-portal type-check`: exit 0. The app tsconfig excludes `*.spec.ts`, so the 4 lane specs were also checked: `tsc -p <temp tsconfig extending apps/designer-portal/tsconfig.json, include e2e/round8/rc7-e8-*.spec.ts>` gave exit 0 and 0 errors. The temp file was removed.
- `pnpm --filter @patina/designer-portal lint`: exit 0, **0 errors** (250 pre-existing warnings). The lint config ignores `e2e/`; `eslint e2e/round8/rc7-e8-*.spec.ts` reports only "File ignored".

## 10. Teardown

- `supabase stop --workdir <scratch>/e8stack.xq7k --no-backup` → `{"project_id_filter":"patina-rc7-e8","backup":false,"message":"Stopped supabase local development setup."}`.
- `lsof -ti :3810 | xargs kill`. Afterwards `lsof -iTCP -sTCP:LISTEN -nP | grep ':641[0-9][0-9]'` → none, and `lsof -iTCP:3810 -sTCP:LISTEN` → none.
- `docker ps` and `docker volume ls` show 0 entries for `patina-rc7-e8`.
- The dev server's rewrite of `apps/designer-portal/next-env.d.ts` was restored with `git checkout --`.
- Ports 54321/54322, Strata, PostHog and production were never touched.
