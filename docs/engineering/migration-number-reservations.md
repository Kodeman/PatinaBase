# Migration number reservations

This file is the single shared ledger for concurrent migration-numbering programs on
`supabase/migrations/`. Both Phase 2 (Cloudflare/media backfill) and Rendered Room v2
(scan pipeline) are running concurrently against the same `NNNNN_slug.sql` numbering
space — this file is how they avoid colliding. Edits to this file land via normal
PR-style commits, same as any other doc; there is no separate approval path.

Checked 2026-08-18/19, read-only, against Strata prod (`bkvcixdmuyejfzcijpdg`).

## Consumed numbers (NOT available to draw from)

`00489`–`00493` are **consumed on `main`** — all five have landed as files and none may
be reissued to another program:

| Number | File                                            | Landed state                      |
| ------ | ----------------------------------------------- | --------------------------------- |
| 00489  | `00489_media_registry_kernel.sql`               | on `main`; applied to **staging** |
| 00490  | `00490_scan_worker_roles.sql`                   | on `main`; applied to **staging** |
| 00491  | `00491_dispatch_scan_modal_cron.sql`            | on `main`; applied to **staging** |
| 00492  | `00492_room_file_version_monotonicity.sql`      | on `main`; applied to **staging** |
| 00493  | `00493_svc_shape_resolving_function_bodies.sql` | on `main`; applied to **prod**    |

`00510` is **in flight** as the post-00483 grant-repair hotfix (branch
`fix/post-00483-grant-gaps`) — treat it as taken, not free.

## Current state

- **Current `main` head file** (highest-numbered file under `supabase/migrations/` on
  this checkout of `main`, commit `0a24cfa7`): `00493_svc_shape_resolving_function_bodies.sql`.
- **Current applied prod head** (`mcp__Supabase__list_migrations` against
  `bkvcixdmuyejfzcijpdg`, read-only): highest applied version is also **00493** — but
  the prod ledger is **not contiguous** up to that number. See the gap below before
  treating "00493" as a clean floor.

### The 00487–00492 gap

Prod's applied migration list runs `... 00484, 00485, 00486, 00493` — 00487 through
00492 are **not applied to prod**, even though 00493 is:

- `00487`/`00488` were reserved by the `phase1-close/staging-ready` program
  (PR #28) for the deferred SD-hardening tranche, per git history
  (`13a256f5 chore(db): recover + renumber deferred SD-hardening (00487/00488), regen legacy-grants`).
  **That reservation is released:** the tranche has since been renumbered to
  **00511–00513** (see the reservations table). `00487`/`00488` are now permanently
  skipped — never applied anywhere, and not to be reissued.
- `00489`–`00492` **do exist as files on `main`**
  (`00489_media_registry_kernel.sql`, `00490_scan_worker_roles.sql`,
  `00491_dispatch_scan_modal_cron.sql`, `00492_room_file_version_monotonicity.sql`) —
  they are Rendered Room v2's W0/W1 foundations. Per memory and the file's own header
  comment, this program has proven these on **staging** (`vuesoyhfrjabfxbrzekd`) but has
  not yet pushed them to **prod**; `00493` was applied to prod directly (a targeted
  svc\_\* function-body fix, independent of 00489–492) ahead of that push.
- Net effect: prod's real applied floor for "everything before Phase 2 starts" is
  **00486**, not 00493. Phase 2 migrations must not assume 00487–00492 are live on
  prod when they land — check `list_migrations` again immediately before every push,
  per the discipline rules below.

The `00489` file header already documents its own renumbering exposure:

> Numbering note: 00481–00486 exist only on branch `phase1-close/staging-ready`
> (PR #28, still open) and are NOT present in this worktree's migration history.
> 00487/00488 are reserved by that same program. 00489 is this program's floor...
> At merge/integration this file may need renumbering per patina-db-migrations step 8
> if 00481–00488 land first.

That note is now stale in two respects: 00481–00486 **are** present on `main` as of this
census (they merged), and the renumbering exposure it warns about has since been closed —
the Rendered Room v2 lane has confirmed 00489–00492 keep their numbers (see "Resolved"
below). What still stands is the applied-state warning: these four are on `main` but not
yet on prod.

## Reservations

| Band        | Program                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00494–00497 | Phase 2 (Cloudflare/media backfill program — this workstream and its siblings). **00494/00495 now DRAWN** — see below. 00496/00497 remain free for this lane.                                                                                                                                                                                                                                                                                                                                                         |
| 00498–00502 | Rendered Room v2 (scan pipeline) — **confirmed by that lane** as this program's _future_ draws, purely additive to its already-consumed 00489–00492. Those four are **not** renumbered into this band. **00498–00501 are now DRAWN; 00502 is the band's last free number** — see below.                                                                                                                                                                                                                                |
| ~~00503–00509~~ 00514–00520 | Phase 3 (capture enrichment). The original 00503–00509 reservation is **superseded** — by the time C-A1 (execution ledger + outbox + atomic claim + result-recording) landed, the file-numbering head had advanced past that band (00510–00513 consumed by the post-00483 hotfix and the SD-hardening tranche below), so Phase 3 re-drew above the new head per discipline rule 2. **00514/00515 now DRAWN** — see below. 00516–00520 remain free for the rest of Phase 3 (dispatcher/reconciler cron, any further RPCs).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 00510       | **TAKEN** — `00510_post_00483_grant_and_scope_repairs.sql` (branch `fix/post-00483-grant-gaps`, 2026-08-18). Post-00483 hotfix: project-documents storage policy caller-binding, `assignment_scope` derivation in `engage_trade_scope` / `apply_scope_change`, anon write-grant narrowing on four public tables. Numbered ABOVE the three bands above deliberately so it shifts none of them; the 00494–00509 gap is intentional and stays reserved. **Applied to prod 2026-08-19** (surgical single-migration push). |
| 00511–00513 | **TAKEN** — the SD-hardening (canonical studio authority) tranche. Renumbered off its provisional 00487/00488/00489 after Phase 1 landed and 00489–00493/00498–00499/00510 were consumed. **SPLIT 2026-08-19 (Kody):** 00511+00513 land on `followon/sd-hardening-v3`; **00512 is parked** on `followon/sd-caller-hardening-00512` (reserved-parked, not landing). The 00512 gap in the applied sequence is intentional — **00513 is NOT renumbered down.** Scope register: `docs/follow-ups/sd-hardening-w7-followon.md`; parked charter: `docs/follow-ups/sd-caller-hardening-00512-followon.md`. NOT applied to staging or prod. |
| 00521       | **TAKEN, recorded retroactively** — `00521_svc_media_shape_reconciliation.sql` (branch `feat/svc-media-shape-reconcile`, `ca2b0641b`, 2026-08-24 15:05, pushed to `origin`). Unfreezes the media deploy against prod's Prisma-shaped `svc_media`. This row was added by the Field Companion census: the lane landed the number without an accompanying reservation edit (discipline rule 5), and the next lane's census failed because of it. |
| 00530–00535 | Field Companion (`docs/design/field-companion/`). **Confirmed clear 2026-08-24 by both live lanes** — cloudflare-phases Phase 2 stays at or below `00529`, and Phase 3 holds `00514–00520`. **SYMBOLIC RESERVATION ONLY: nothing is minted until Kody approves the build**, and each address is claimed at that file's landing after re-checking this file AND `supabase migration list` against Strata (rules 1–2, and the file-based push invariant in `docs/ops/strata-staging.md`). Six scheduled migrations: the W1 routing migration (wave 1), the visit/suggestion migration (wave 3), the margin migration + the time-entry migration + the punch back-reference migration (wave 4), and wave 6A's server-transcript migration. Wave 6B's `field_note_drafts` migration draws its number at its own landing, OUTSIDE this band, because 6B is unscheduled. |

### Drawn from 00511–00513 (SD-hardening tranche)

| Number | File                                              | Landed state                                            |
| ------ | ------------------------------------------------- | ------------------------------------------------------- |
| 00511  | `00511_public_sd_hardening.sql`                   | landing branch `followon/sd-hardening-v3`; local replay only |
| 00512  | `00512_public_sd_caller_hardening.sql`            | **PARKED** on `followon/sd-caller-hardening-00512`; removed from the landing branch; reserved-parked (do not reissue) |
| 00513  | `00513_invoice_numbering_studio_uniqueness.sql`   | landing branch `followon/sd-hardening-v3`; local replay only; **keeps its number** (00512 gap intentional) |

These carry the provisional numbers 00487/00488/00489 in older documents and in the
`13a256f5` / `01d411ea` / `0096eb8d` commit history. The tranche's own internal
identifiers (`_00487_profile`, `pg_temp._00488_references_routine`, exception strings,
contract-test helper names) were normalized to the new numbers in the same renumber, so
`00487`/`00488` no longer appear anywhere in the tranche's files. Nothing else in the
repo referenced them: the remaining `00489` hits belong to `00489_media_registry_kernel.sql`,
which keeps its number.

### Drawn from 00514–00520 (Phase 3 capture enrichment, C-A1)

| Number | File                                     | Landed state                                                    |
| ------ | ---------------------------------------- | ---------------------------------------------------------------- |
| 00514  | `00514_capture_enrichment_ledger.sql`    | branch `feat/capture-enrichment-ledger`; local replay only, NOT applied to staging or prod |
| 00515  | `00515_capture_enrichment_rpcs.sql`      | branch `feat/capture-enrichment-ledger`; local replay only, NOT applied to staging or prod |
| 00516  | `00516_capture_producer_idempotency.sql` | branch `feat/capture-producer-idempotency` (sibling worktree); **`CREATE OR REPLACE FUNCTION commit_field_capture` from its 00235 body plus an `enqueue_capture_enrichment(...)` call**, and `GRANT EXECUTE ON enqueue_capture_enrichment TO authenticated`. NOT applied to staging or prod. ⚠ Shared object — see the Field Companion band below |

00514 adds `public.capture_enrichment_runs` (the orthogonal execution ledger
for AI capture enrichment — target type/id, content revision, status,
suggestions/provenance) and `public.capture_enrichment_outbox` (the
transactional-outbox table for `CaptureEnrichmentMessageV1`,
`packages/types/src/capture-enrichment.ts`). Deliberately does not touch or
unify `proposal_captures` (00130) / `field_captures` (00233) — those two
intake ledgers keep their own lifecycle/RLS. RLS on `capture_enrichment_runs`
dispatches visibility on `target_type` via an `EXISTS` against the target's
own table (deferring to that table's RLS), fail-closed (`ELSE false`) on any
unrecognized `target_type`.

00515 adds the three RPCs that operate the ledger, all `SECURITY DEFINER`,
`service_role`-only: `enqueue_capture_enrichment` (idempotent on
`(target_type, target_id, content_revision)`, writes the run + outbox row in
one transaction), `claim_capture_enrichment_run` (atomic claim returning a
discriminated outcome — `claimed` / `ignore_duplicate` / `ignore_stale` /
`ignore_terminal`), and `record_capture_enrichment_result` (writes
suggestions/status; never mutates `proposal_captures`; may prefill an
allowlisted, currently-empty TEXT column on `field_captures` but never
overwrites a non-empty one — the never-overwrite rule enforced in SQL). 00517–00520 remain free for the rest of Phase 3 (pg_cron outbox reconciler, any
additional RPCs the Cloudflare Queue consumer needs).

### Drawn from 00530–00535 (Field Companion)

| Number | File | Landed state |
| ------ | ---- | ------------ |
| —      | `005NN_field_capture_notes_and_routing.sql` | **NOT YET DRAWN.** Wave 1; branch `feat/field-companion-w1` when it lands |

Nothing in this band has been minted. The band is reserved symbolically so the
two neighbouring lanes can plan around it; every address is claimed at the
landing of the file that needs it, after re-checking this file and
`supabase migration list`.

The wave-1 migration adds the note/audio lane to `field_captures`
(`capture_kind`, `voice_audio_segments`, `voice_audio_purged_at`,
`audio_retention`, `transcript_source`, `note_setting`), the provenance GIN
index carried unbuilt since R112/R113, restates all five 00233 policies
`TO authenticated` (they default to PUBLIC today), and replaces
`commit_field_capture` so its **inbox** branch persists
`project_id`/`project_room_id`/`shelf` — today only the library branch does
(`00235:205-217` vs `:255-264`), so every note-shaped capture arrives with no
project column. It introduces **no new `status` value**:
`field_captures_org_inbox_select` keys on `status = 'inbox'`
(`00233:175-188`), so a terminal status would silently revoke studio read.

⚠ **`commit_field_capture` is a SHARED object with two live authors.**
Phase 3's branch-authored `00516` replaces the same function. Whichever
migration lands second **silently reverts the other** — no error, no failed
migration. Per ruling FC-R18 the wave-1 replacement is authored from
**00516's** body, with 00516 a hard prerequisite named in the migration
header. Lineage: **00235 → 00516 → 005NN**.

### Drawn from 00494–00497

| Number | File                             | Landed state                                                        |
| ------ | -------------------------------- | ------------------------------------------------------------------- |
| 00494  | `00494_media_registry.sql`       | branch `feat/phase2-media-registry`; NOT applied to staging or prod |
| 00495  | `00495_media_upload_intents.sql` | branch `feat/phase2-media-registry`; NOT applied to staging or prod |

00494 is B-W2: `public.media_registry`, a general-purpose Phase 2 media
registry, deliberately separate from `public.media_objects` (00489, Rendered
Room v2's scan-scoped kernel) — no shared table, function, or trigger. Subject-
arm RLS (project / product, fail-closed on anything else), forward-only
lifecycle trigger, write-once identity on `register_media_entry`.

00495 is B-W2's upload-intent ledger, `public.media_upload_intents`, feeding
00494's registry. Its RPCs are named `create_media_upload_intent_v2` /
`confirm_media_upload_intent_v2` — the `_v2` suffix exists ONLY to dodge the
bare `create_media_upload_intent` / `confirm_media_upload` names 00498/00499
already took against `media_objects`; the two RPC pairs are otherwise
unrelated (different table, different registry).

### Drawn from 00498–00502

| Number | File                                                  | Landed state                                                         |
| ------ | ----------------------------------------------------- | -------------------------------------------------------------------- |
| 00498  | `00498_media_upload_intent_and_scan_version_lock.sql` | branch `w3a/media-upload-intent`; applied to **staging**, NOT prod   |
| 00499  | `00499_upload_interface_hardening.sql`                | branch `w3a/upload-intent-hardening`; NOT applied to staging or prod |
| 00500  | `00500_upload_kind_split.sql`                         | branch `feat/upload-kind-split`; NOT applied to staging or prod — **staging apply is ON HOLD**: a peer session is repairing staging's migration ledger, this migration awaits that repair's post-repair push path |
| 00501  | `00501_upload_intent_quota_and_reaper.sql`            | branch `w4/upload-intent-quota-and-reaper`; NOT applied to staging or prod — awaiting merge, then the file-based staging push procedure |

00498 carries W3-A: `create_media_upload_intent` / `confirm_media_upload` (the
Phase-2 upload interface's registry side), the `caller_can_access_room_scan`
visibility mirror they bind through, and the per-scan `pg_advisory_xact_lock` on
BOTH the `room_files` insert path (a BEFORE INSERT trigger) and
`scan_worker_update_room_file` — closing the insert-side residual 00492
documented and deferred to W3. It replaces `scan_worker_update_room_file`, so the
lineage for that function is now **00490 → 00492 → 00498**; a later program
redefining it must graft onto 00498's body, not 00492's.

00499 is **W3-A's review closure**, drawn immediately after 00498: one shared
`is_originals_bucket` pattern (replacing the bare regex 00498 inlined, which
00499 would otherwise have had to duplicate), an originals-bucket pin and an
etag shape bound on `confirm_media_upload`, a now-mandatory R2-observed checksum
(the `put_condition` provenance value is retired — see
`infra/edge-api-worker/OPERATIONS.md` "What the R2 probe established"), and two
new refusals on `register_media_object`: the `scan_originals/` prefix (P0414)
and un-storing a `verified` or upload-interface row (P0415). It replaces
`create_media_upload_intent`, `confirm_media_upload`, and
`register_media_object`, so those functions' lineages are now
**00498 → 00499** and **00489 → 00499** respectively; a later program redefining
any of them must graft onto 00499's body.

00500 splits the upload-intent interface's `bundleArchive` (the Patina client's
whole-bundle zip) from Field's `keyframesArchive` (keyframes.tar) as two distinct
entries in `create_media_upload_intent`'s `c_kinds` allowlist — both share the
legacy Supabase Storage `bundle` folder / `scan_bundle_url` column, a collision
that does not follow into the registry-keyed interface (the kind name is a key
segment) and that dies at cutover. It replaces `create_media_upload_intent`
again, so that function's lineage is now **00498 → 00499 → 00500**; a later
program redefining it must graft onto 00500's body. Mirrored in
`infra/edge-api-worker/src/media-uploads.ts` and the Patina client's
`MediaUploadIntentClient`/`ScanUploadShadowLeg` in the same lane.

00501 closes security-review finding 11 (no quota, no per-scan slot cap, no
reclamation of orphaned upload intents) on the upload-intent interface: a
24-concurrently-pending-per-scan cap on `create_media_upload_intent` (P0416,
Worker maps to 429), a new terminal `expired` lifecycle_state (forward-only
like `deleted`; `mark_media_object_state` refuses to leave it), and
`expire_stale_upload_intents(p_ttl default 48h)` — a SECURITY DEFINER reaper,
scheduled daily via pg_cron (`expire-stale-upload-intents-daily`, direct RPC
call, no edge function), that transitions stale `pending` upload-interface
rows (identified by 00499's `provenance ->> 'source' = 'media_upload_intent'`
discriminator — pipeline-registered rows are never touched) to `expired`.
`public.expired_upload_originals` is a documented, ungranted-to-any-request-
role seam view for a FUTURE R2 orphan-object cleanup job (deletion itself is
out of scope — needs the write credential). It replaces
`create_media_upload_intent` again (lineage now **00498 → 00499 → 00500 →
00501**) and `mark_media_object_state` (lineage now **00489 → 00501**);
`confirm_media_upload` is UNCHANGED — its existing "lifecycle_state <>
'pending'" branch already answers a confirm on an expired row with P0413
(state mismatch), proven by conformance test 18b rather than merely argued.
**00502 is the band's last free number.**

Apart from 00498, 00499, 00500, and 00501, no file in `supabase/migrations/` on `main`,
and no commit in `git log --all`, currently occupies any number in 00494–00509 — the
three bands are collision-free as reserved.

## Discipline rules

1. **Renumber at landing, not at authoring.** Pick a number when you are about to
   merge/push, not when you start writing the migration — another program may have
   landed in your band in the meantime.
2. **Re-check the head before every land.** Query `list_migrations` (or
   `supabase migration list` against the linked project) immediately before applying —
   do not trust a number you reserved earlier in the session. The 00487–00492 gap above
   is a live example of why: the file-numbering on `main` and the applied state on prod
   can disagree.
3. **Pinned-tree prod pushes.** Apply migrations from a clean, pinned checkout — never
   from a worktree with uncommitted or cherry-picked changes — so what you tested is
   exactly what lands.
4. **This file is the single source of truth for band ownership.** If a program needs
   more numbers than its band holds, or needs to renumber across a band boundary, that
   change is proposed as an edit to this file, not decided unilaterally in a migration's
   header comment.
5. **Edits land via normal commits.** No separate sign-off process — conventional
   commit, PR/branch like any other doc change, but land the edit _before or with_ the
   migration that depends on the new reservation, not after.

### Resolved: Rendered Room v2's banding

The question this census left open — whether 00489–00492 stay put or get renumbered into
the 00498–00502 band — has been **answered by the Rendered Room v2 lane**: 00489–00492
stay exactly as numbered, and 00498–00502 is purely for W2-onward work (splat/render
export, additional crons). The two are additive, not alternatives.

Consequence for other programs: the applied-on-prod sequence will **not** be contiguous
(00489–00492 land on prod only when that lane pushes them), so keep following discipline
rule 2 — re-check `list_migrations` immediately before every land rather than inferring a
floor from the file numbering.
