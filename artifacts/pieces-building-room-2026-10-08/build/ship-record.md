# US-21 ship record (T-63, SQ-669)

Shipped 2026-10-09, 08:35Z–08:47Z, from main `4ab5529ea` (= `pieces/build-room`), in an isolated worktree.

**Authorization.** Kody asked in session to "deliver and ship the entirety of this to productions" as one release. The orchestrator relayed it as the ship go (SQ-669, 08:23Z), and the ship chain follows CONTRACT §6. US-19 (00727–00728, flags `ask-the-paper` and `one-voice`) went out in the same release.

Evidence logs: `~/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-669/`.

## 1. Preflight

| Check | Result |
|---|---|
| `git diff --stat .claude/settings.json` | empty |
| Probe 1: `project_palettes` with two palettes in one room (stops the ship) | **0 rows** |
| Probe 2: `proposal_palettes` with two palettes in one room (informational) | 0 rows |
| Probe 3: allowance FF&E lines on invoice lines with a null price (informational) | 0. With a null **or $0** price: 1, already present. 00764 guards only new writes. |
| Strata ledger before push | head `00726`, plus `20260910152111` |
| `migration list --linked` | 30 local-only rows: 00727–00737, 00742–00745 and 00750–00764. No remote-only rows. |

## 2. `db push`

- **Dry run.** `supabase db push --linked --include-all --dry-run` planned exactly the 30 files, in order: `00727_maker_eta_request_drafts.sql` and `00728_maker_follow_up_drafts.sql` first, then 00729–00737, 00742–00745 and 00750–00764. No `00738`–`00741` and no `00746`–`00749`.
- **Push.** `supabase db push --linked --include-all --yes` ran from 08:35:29Z to 08:35:35Z, exited 0, and applied all 30.

Verified on Strata afterwards:

- The ledger has 30 rows in 00727–00764.
- **US-19 objects.**
  - The `procurement_drafts` kind CHECK includes `maker_eta_request` and `maker_follow_up`.
  - `procurement_drafts.ffe_item_id` exists.
  - Index `procurement_drafts_one_open_maker_note` exists.
- **US-21 objects.**
  - `project_ffe_items` has `unit`, `rough_cents`, `line_kind`, `link_kind`, `removed_disposition` and `line_group_id`.
  - `parent_ffe_item_id is not null and link_kind is null` returns 0.
  - The six new tables exist: `project_ffe_placements`, `project_ffe_placement_events`, `project_room_handbacks`, `project_line_groups`, `project_ffe_allowance_fills` and `project_ffe_placement_receipts`.
  - `project_palettes_one_per_room` exists.
  - `trg_ffe_unfilled_allowance_invoice_line` exists.
  - `project_palettes` has two policies: `Inherit project access for palettes` (SELECT, authenticated) and `project_palettes_studio_rw`. There is no client write.

**CLI note.** Homebrew `supabase` 2.120.0 hangs with no output on every `--linked` command, just after it reads the profile. The likely cause is a keychain prompt for the upgraded binary. Every Strata command here used the package-local CLI, `packages/supabase/node_modules/.bin/supabase` 2.77.0, which answers in about 3 s.

## 3. Edge functions

| Function | Version | verify_jwt | Updated |
|---|---|---|---|
| `po-send` | v56 | true | 08:36Z |
| `spec-book-render` | v24 | true | 08:36Z |
| `spec-pdf` | v44 | true | 08:36Z |
| `fulfillment-po` | v25 | false (unchanged) | 08:36Z |

Each was deployed with `supabase functions deploy <name> --project-ref bkvcixdmuyejfzcijpdg --use-api`, and each exited 0.

Changed `_shared` files: `pdf-text.ts`, `po-pdf.ts`, `spec-pdf.ts` and `fulfillment-po-pdf.ts`. Grepping `supabase/functions` for their importers outside tests finds only these four functions.

## 4. Portals

For each portal, `deploy-portal.sh <portal>` ran from a node wrapper. The wrapper exported `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_SUPABASE_STORAGE_KEY` from that app's `wrangler.jsonc` vars into the script's environment, plus `SUPABASE_ORIGIN_RUNTIME` for designer. `SUPABASE_SERVICE_ROLE_KEY` is not a var. It is a Worker secret, and the designer Worker lists it.

| Worker | Before (rollback target) | Live now (bottom row, 100%) | Created |
|---|---|---|---|
| `patina-designer-portal` | `dd2658b8-36dd-4eeb-a421-40c76fb0c66d` (2026-10-07) | `e6041847-2292-4ad2-b5ba-af414868d5f7` | 08:39:54Z |
| `patina-client-portal` | `6f41b63e-13d4-42b4-a0b5-b88355def9e5` (2026-09-16) | `7816fedf-9b4a-42b6-a29e-72e40fd216c5` | 08:41:41Z |
| `patina-admin-portal` | `c32a8f0e-0ac4-401c-92d0-1a21cdb49a8b` (2026-09-23) | `a322e3af-6453-470a-b746-33b0d5cace22` | 08:43:52Z |

**Admin.** Admin shipped because SQ-710 changed its catalog delete routes to return 409. Manufacturer was not redeployed.

**Chunk checks.**

- The script's chunk gate passed for all three portals.
- My own grep of `.open-next/assets/_next/static/chunks` found 0 placeholder-Supabase chunks in each portal. The Strata URL literal appears in 4 designer, 6 client and 1 admin chunk.
- `/api/version` returns 200 on app, client and admin.
- The live chunk `/_next/static/chunks/app/(document)/doc/[id]/page-ef936ebad8dce875.js` returns 200 and contains `Work the pieces`.

## 5. Flags (PostHog project 326191)

Neither flag existed before this ship. Both were created through Kody's signed-in PostHog browser session, with a POST to `/api/projects/326191/feature_flags/`, not the UI chip input. Each is active, with one group, `properties: []` and `rollout_percentage: 100`. There is no property filter, and targeting never uses email.

`ask-the-paper` was created first, then `one-voice`.

| Flag | id | `/flags?v=2`, studio user `74056c2a…` | `/flags?v=2`, random uuid |
|---|---|---|---|
| `ask-the-paper` | 946104 | `enabled=true`, `condition_match` | `enabled=true`, `condition_match` |
| `one-voice` | 946105 | `enabled=true`, `condition_match` | `enabled=true`, `condition_match` |

The probes used a real Chrome user agent, and each response reported `errorsWhileComputingFlags=false`.

**Rollback:** set the flag to inactive, which takes effect at once. The Build room has no flag.

## 6. Post-deploy probes

The signed-in probes ran in Kody's Chrome as `kody@middlewest.studio` (Middle West Studio). They were read-only, on the job "Kuehn Whole Home Renovation" (`6dbe6814…`), at desktop width.

| Probe | Result |
|---|---|
| Activation with room items (orchestrator) | **Pass.** A `DO` block raised at its end, so everything rolled back, and a later check found 0 rows left. Inside it, one of Kody's own proposals with one scope-room item and one item with no room was accepted and activated through `activate_proposal_as_project`. The lines came out as `Probe Sofa: room: Probe Living` and `Probe Rug: unassigned`. There was no "non-room assignment cannot carry a room" error. |
| (a) Pieces region | **Pass.** It shows `7 lines · 3 rooms` and `5 placeholders · 1 specced · 1 ready · nothing released`, with `WORK THE PIECES →` and `RECORD A CHANGE`. When unfolded, it lists the room rows: Kitchen, Living Room, Sun Room, Throughout and Not in a room yet. There is no folio preamble, no "Build the FF&E schedule" and no `SPEC THE N UNSPECIFIED`. The letterhead reads `5 placeholders`. |
| (b) `WORK THE PIECES →` | **Pass.** It opens `/doc/<id>/pieces?lens=rough` on white stock, with the lens tabs ROUGH IN, SPEC, PRICE, RELEASE and FINISHES, plus a rooms rail and room tables. `IN HAND TODAY 1 min` keeps counting. Screenshot: `verification/SQ-669/b-rough-lens.jpg`. |
| (c) Enter, remove, UNDO | **Not run.** It needs writes, and the only signed-in session is a real studio's account. CONTRACT §6 forbids this on a studio's job. Per story log #27, a scratch project cannot be deleted. |
| (d) Esc | **Pass.** It lands on `/doc/<id>#project-ffe`, the Pieces region of the overview. I entered from the whole-job act, so the anchor is not a room row. |
| (e) Spec book back to `#line-<id>` | **Not run.** Owed to the walk. |
| (f) Client page room breakdown | **Not run.** Owed to the walk. |
| (g) PO preview for a labor line | **Not run.** Owed to the walk. |
| (h) US-19 band | **Pass.** It shows the `PROJECT · KUEHN WHOLE HOME RENOVATION` eyebrow, line 2 `NEXT — 5 placeholders. FILL THE 5 PLACEHOLDERS`, and `Standing · 4`. |
| (i) A sent proposal's band | **Not run.** Owed to the walk. |
| (j) Order cell and ack acts at 390 | **Not run.** Owed to the walk. |
| (k) Record a change at the Pieces head | **Partial.** At 1440 the Pieces head has one `RECORD A CHANGE`; the other one on the page belongs to Money. The 390 check is owed. |
| (l) Band count against the overview's placeholder count | **Pass.** The band's Next reads `5 placeholders`, and the overview's Pieces line reads `5 placeholders`. |
| (m) Held maker note | **Not run.** It is record-only and owed to the walk. |

## 7–8. Docs and after

- **Docs.** T-62 landed V15 and I25 on the branch before the push. The Sanity query in §6 step 7 was not run here.
- **Owed.** The S1–S8 signed-in prod walk on Leah's job, at 1440 and 390, together with the probes not run above.
- **Codebase map.** It is stale after integration, and refreshing it is the orchestrator's job.
