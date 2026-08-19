# Migration number reservations

This file is the single shared ledger for concurrent migration-numbering programs on
`supabase/migrations/`. Both Phase 2 (Cloudflare/media backfill) and Rendered Room v2
(scan pipeline) are running concurrently against the same `NNNNN_slug.sql` numbering
space — this file is how they avoid colliding. Edits to this file land via normal
PR-style commits, same as any other doc; there is no separate approval path.

Checked 2026-08-18/19, read-only, against Strata prod (`bkvcixdmuyejfzcijpdg`).

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
  svc_* function-body fix, independent of 00489–492) ahead of that push.
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

That note is now stale in one respect (00481–00486 **are** present on `main` as of this
census — they merged), but its core warning stands: 00489–00492 may still need
renumbering at whichever program's integration lands second.

## Reservations

| Band | Program |
| --- | --- |
| 00494–00497 | Phase 2 (Cloudflare/media backfill program — this workstream and its siblings) |
| 00498–00502 | Rendered Room v2 (scan pipeline) — **note:** this lane already has files at 00489–00492 authored under a different numbering rationale (see gap note above). Rendered Room v2 must explicitly confirm whether 00498–00502 is additive to 00489–00492 or a renumbering target for them before using this band, so the two don't end up double-booked. |
| 00503–00509 | Phase 3 |
| 00510 | **TAKEN** — `00510_post_00483_grant_and_scope_repairs.sql` (branch `fix/post-00483-grant-gaps`, 2026-08-18). Post-00483 hotfix: project-documents storage policy caller-binding, `assignment_scope` derivation in `engage_trade_scope` / `apply_scope_change`, anon write-grant narrowing on four public tables. Numbered ABOVE the three reserved bands deliberately so it shifts none of them; the 00494–00509 gap is intentional and stays reserved. |

No file in `supabase/migrations/` on `main`, and no commit in `git log --all`, currently
occupies any number in 00494–00509 — the three bands are collision-free as reserved.

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
   commit, PR/branch like any other doc change, but land the edit *before or with* the
   migration that depends on the new reservation, not after.

### Outstanding item for Rendered Room v2

Per the rule above, the Rendered Room v2 lane owning 00498–00502 should explicitly
confirm in this file (via a follow-up edit) whether:

- 00489–00492 stay as-is and 00498–00502 is purely for W2-onward work (splat/render
  export, additional crons), or
- 00489–00492 get renumbered into/after the 00498–00502 band at prod-push time to keep
  the applied-on-prod sequence contiguous with Phase 2's 00494–00497.

This census did not decide that question — it is Rendered Room v2's call, flagged here
so it isn't missed at integration time.
