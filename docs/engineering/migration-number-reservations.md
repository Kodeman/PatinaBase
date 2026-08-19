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

- `00487`/`00488` are reserved by the `phase1-close/staging-ready` program
  (PR #28, open, not yet merged to `main`/prod). They were authored, then
  recovered/renumbered onto a different branch per git history
  (`13a256f5 chore(db): recover + renumber deferred SD-hardening (00487/00488), regen legacy-grants`);
  no file at those numbers exists on `main` today.
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
| 00503–00509 | Phase 3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 00510       | **TAKEN** — `00510_post_00483_grant_and_scope_repairs.sql` (branch `fix/post-00483-grant-gaps`, 2026-08-18). Post-00483 hotfix: project-documents storage policy caller-binding, `assignment_scope` derivation in `engage_trade_scope` / `apply_scope_change`, anon write-grant narrowing on four public tables. Numbered ABOVE the three bands above deliberately so it shifts none of them; the 00494–00509 gap is intentional and stays reserved. **Applied to prod 2026-08-19** (surgical single-migration push). |

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
