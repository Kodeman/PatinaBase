# Lane A2 — Concept render backend (PP-7) — implementation report

**Worktree** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-a2`
**Branch** `portal-polish/a2` (cut from `origin/main` @ `02eb0a95f`)
**Commits** `a5e1c1899` (migration) · `3dadf9c8d` (hook + derive)
**Gates** all green. **Blockers** none.

> The branch `portal-polish/a2` already existed at `origin/main`'s tip when I
> arrived, so the worktree was attached to it (`git worktree add … portal-polish/a2`)
> rather than created with `-b`. Same commit either way.

---

## 1. What shipped

| File | State |
|---|---|
| `supabase/migrations/00580_room_concept_render.sql` | new, 357 lines |
| `supabase/tests/rls/room_concept_render_test.sql` | new, 467 lines |
| `supabase/seed/00-legacy-grants.sql` | regenerated, +12 |
| `packages/supabase/src/database.types.ts` | regenerated, +12 |
| `packages/supabase/src/hooks/use-room-concept-render.ts` | new, 109 lines |
| `packages/supabase/src/hooks/__tests__/use-room-concept-render.test.ts` | new, 162 lines |
| `packages/supabase/src/hooks/index.ts` | +13 (barrel) |
| `apps/client-portal/src/lib/threshold/derive.ts` | +38 |
| `apps/client-portal/src/lib/threshold/__tests__/derive.test.ts` | +82 |

No other file was touched. `supabase/seed/*` fixtures were **not** extended — the
SQL test sets the four columns inside its own transaction and rolls back, so the
seed carries no render and Wave 2 sees a house with none until a studio uploads
one.

## 2. The migration number

```
$ ls supabase/migrations | tail -3
00578_design_build_kind.sql
00579_trade_agreements.sql
_pending
```

Head was **00579**. `00580` was free; no parallel program had taken it. (`_pending`
is a directory holding `00106_drop_client_messages.sql`, not a migration.)

## 3. The RPC body — provenance and diff

```
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*get_client_project_threshold" \
    supabase/migrations/*.sql | sort | tail -1
supabase/migrations/00578_design_build_kind.sql
```

(The full set is `00565_the_client_page.sql` and `00578_design_build_kind.sql`;
00578 is the winner, exactly as the brief said.) The body was extracted from
`00578:3451-3618` and grafted verbatim. The diff of old body against new body,
whole:

```diff
--- old-rpc.sql   (00578:3451-3618)
+++ new-rpc.sql   (00580)
@@ -47,6 +47,10 @@
         'assignmentScope', item.assignment_scope,
         'roomId', item.project_room_id,
         'roomName', COALESCE(room.name, authorization_item.room_name),
+        'conceptRenderUrl', room.concept_render_url,
+        'conceptRenderCaption', room.concept_render_caption,
+        'conceptRenderUploadedAt', room.concept_render_uploaded_at,
+        'conceptRenderUploadedBy', room.concept_render_uploaded_by,
         'quantity', authorization_item.quantity,
         'clientUnitPriceCents', authorization_item.client_unit_price_cents,
         'clientLineTotalCents', authorization_item.client_line_total_cents,
@@ -123,6 +127,10 @@
         'assignmentScope', item.assignment_scope,
         'roomId', item.project_room_id,
         'roomName', COALESCE(room.name, section.room_name),
+        'conceptRenderUrl', room.concept_render_url,
+        'conceptRenderCaption', room.concept_render_caption,
+        'conceptRenderUploadedAt', room.concept_render_uploaded_at,
+        'conceptRenderUploadedBy', room.concept_render_uploaded_by,
         'quantity', item.quantity,
         'clientUnitPriceCents', NULL,
         'clientLineTotalCents', item.line_total_cents,
```

Eight lines, the same four keys twice. Nothing else moved.

### A finding the plan should know about: there is no "rooms payload"

The plan (step 3) and the spec (§4) both say to add the four fields "to the
rooms payload". **`get_client_project_threshold` has no rooms payload.** Its
whole return is four top-level keys — `projectId`, `projectName`, `origin`,
`selections` — where `selections` is one flat array built from two branches
(furnishings, trade) concatenated with `||`. Verified by reading the body and by
probing the live function:

```
NOTICE:  top keys: {origin,projectId,selections,projectName}
```

Its only consumer is `apps/client-portal/src/hooks/use-commercial-client.ts:131`
→ `adaptClientSelections`, which reads selections. Rooms reach the client page by
a **different** path: `useProjectRooms` (`use-project-v2.ts:123`) does
`.from('project_rooms').select('*')`, so the four new columns already arrive
there with no code change at all.

What I did, and why: each selection line already carries the room facts
`roomId` and `roomName`, both read off a `LEFT JOIN public.project_rooms AS room`
that **both** branches already make. The four render fields are four more room
facts off that same join, placed directly after `roomName`. That is the only
placement that satisfies the brief's hard constraint — *"the diff must be only
the four keys"* — while still widening the reader. Adding a new top-level
`rooms` array would have been a fifteen-line diff and a fifth top-level key.

**For the reviewer / Wave 2:** H5 does not need the RPC for this. It should read
the render off `ThresholdRoom` (fed by `useProjectRooms`), which is what
`derive.ts` maps. The RPC widening is parity, not the delivery path.

## 4. What else the migration does

- **Columns.** `ALTER TABLE public.project_rooms ADD COLUMN IF NOT EXISTS ×4` —
  `concept_render_url text`, `concept_render_caption text`,
  `concept_render_uploaded_at timestamptz`,
  `concept_render_uploaded_by uuid REFERENCES auth.users(id)`. All nullable, no
  default, no backfill, no destructive step. Each carries a `COMMENT ON COLUMN`.
- **Bucket.** `INSERT INTO storage.buckets … ON CONFLICT (id) DO NOTHING` in the
  `00234_capture_media_bucket.sql` idiom: `room-renders`, **`public = false`**,
  `file_size_limit = 8388608` (8 MB), `allowed_mime_types` = jpeg/png/webp only.
- **Policies.** Four, all `TO authenticated`, all `DROP POLICY IF EXISTS` +
  `CREATE POLICY` so a re-run is safe. Insert/update/delete gate on
  `app_private.is_project_studio_member`; select gates on that **or**
  `app_private.is_project_client`. Neither predicate is redefined — 00565's
  definitions are called as-is.
- **The cast guard.** Both leading segments are matched against a strict uuid
  regex **inside a `CASE`**, and the cast happens only in the `THEN`. `AND` does
  not guarantee left-to-right evaluation, so a guard written as a separate
  conjunct would still let a malformed prefix reach `::uuid` and raise 22P02 out
  of a policy; `CASE` does guarantee it, and both predicates return false for
  `NULL`. The SQL test asserts the malformed path is refused with **42501, not
  22P02**.
- **Column coverage — verified, not assumed.** Probed against the database:

  ```
  $ psql … -c "select polname, polcmd from pg_policy where polrelid='public.project_rooms'::regclass;"
   Clients can view their project rooms | r
   Designers manage their project rooms | *
   project_rooms_studio_rw              | *
  $ psql … -c "select has_table_privilege('authenticated','public.project_rooms','SELECT,INSERT,UPDATE,DELETE');"
   t
  ```

  None of the three policies is column-scoped and `authenticated` already holds
  the table-wide grant, so the four columns ride all of it. **No column-level
  grant was added**, and the SQL test asserts the four columns are readable and
  `concept_render_url` writable by `authenticated`.
- **Grants.** 00565's `REVOKE ALL … FROM PUBLIC, anon, authenticated, service_role`
  + `GRANT EXECUTE … TO authenticated, service_role` are **restated** (00578 left
  them to `CREATE OR REPLACE`'s ACL preservation; the post-2026-05-30 rule is to
  name them). Because the file now carries GRANT/REVOKE,
  `python3 scripts/generate-legacy-grants.py` was re-run — a clean 12-line
  append, nothing else changed:

  ```
  wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2572 replayed statements
   supabase/seed/00-legacy-grants.sql | 12 ++++++++++++
  ```
- `COMMENT ON FUNCTION` updated to name the four keys and to say
  `conceptRenderUrl` is an object path, not a URL.

## 5. The SQL test

`supabase/tests/rls/room_concept_render_test.sql`, in the
`rls/project_notes_test.sql` house style (plain psql, `pg_temp.assume_user`,
`DO` blocks of `ASSERT`, savepoints, `ROLLBACK`). Fixture actors are the same
ones that file establishes and pins by fixed uuid — studio_manager `…0003` (the
studio writer, deliberately *not* the project's designer), client `…0005`,
cf-phase1-alice `cf100000-…-0001` (the second studio), manufacturer `…0006` (the
stranger); all three third parties were confirmed to exist in `auth.users`, so
their refusals are not vacuous.

Eight sections: the bucket is private/capped/image-only · a studio co-member
writes under its own `<project_id>/<room_id>/` prefix and is refused (42501) for
a foreign project, a malformed prefix and an unprefixed object · the second
studio reads zero and cannot insert · the client selects the render and cannot
insert · the stranger reads zero and cannot insert · the reader's **whole** key
set (top level and every selection line, both branches) plus the values landing
on the room the line stands in and four nulls on the room without a render ·
the columns riding the existing `project_rooms` policies · the grants.

The key-set assertion is **whole, not additive**: the expected 24-element array
is compared with `=`, so a `CREATE OR REPLACE` from a stale body that dropped a
key fails here rather than passing on the additions.

## 6. Gate output

```
$ cd supabase && supabase db reset
… (28 seed files) …
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}

$ bash scripts/run-sql-tests.sh
================ summary ================
total:             167
green:              146
expected-fail:      21  (documented in supabase/tests/KNOWN_FAILURES.md)
unexpected-fail:    0
effective-green:    167 / 167  (green + expected-fail)
===========================================

$ bash scripts/run-sql-tests.sh -f room_concept_render
PASS   supabase/tests/rls/room_concept_render_test.sql   0s
green: 1 / 1

$ psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1 \
    -f supabase/tests/rls/room_concept_render_test.sql
EXIT=0

$ export SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
$ pnpm db:generate && git diff --stat packages/supabase/src/database.types.ts
 packages/supabase/src/database.types.ts | 12 ++++++++++++
 1 file changed, 12 insertions(+)
# and, after committing, a second regenerate proves sync:
$ pnpm db:generate && git diff --exit-code packages/supabase/src/database.types.ts
TYPES_IN_SYNC_EXIT=0

$ pnpm --filter @patina/supabase type-check
(clean)
$ pnpm --filter @patina/supabase test
 Test Files  94 passed (94)
      Tests  1152 passed | 12 skipped (1164)

$ pnpm --filter @patina/client-portal type-check
(clean)
$ pnpm --filter @patina/client-portal test -- --ci
Test Suites: 134 passed, 134 total
Tests:       2250 passed, 2250 total
```

`git diff --stat packages/supabase/src/database.types.ts` (the four columns, in
`Row`/`Insert`/`Update`, and nowhere else):

```
 packages/supabase/src/database.types.ts | 12 ++++++++++++
 1 file changed, 12 insertions(+)

@@ project_rooms Row / Insert / Update @@
+          concept_render_caption: string | null
+          concept_render_uploaded_at: string | null
+          concept_render_uploaded_by: string | null
+          concept_render_url: string | null
```

The FK to `auth.users` produces no `Relationships` entry — `supabase gen types`
does not emit cross-schema relationships to `auth`. Expected, not a drift.

**Note on the type-check gate:** `pnpm --filter @patina/client-portal type-check`
fails with ~40 `TS2307 Cannot find module '@patina/types'` errors on a fresh
worktree until the workspace dists are built. `pnpm turbo build
--filter=@patina/supabase^... --filter=@patina/client-portal^...` (8 tasks,
11.2s) is a precondition, not part of the change.

## 7. The hook

`useRoomConceptRender` (mutation) in the shape of `use-comms-attachments.ts`'s
uploader, mocked in its vitest at the two boundaries every hook suite here uses.

- Uploads to `` `${projectId}/${roomId}/${file.name}` `` in `room-renders` with
  `{ contentType, upsert: true }` — replacing a render overwrites in place rather
  than orphaning the old object.
- **Then** reads `auth.getUser()` and updates `project_rooms` — `.eq('id', roomId)`
  **and** `.eq('project_id', projectId)`, so the write cannot stray to a room on
  another project even if the caller passes a mismatched pair.
- A blank caption is stored as `null`, never `''`.
- `onSuccess` invalidates `['project-rooms', projectId]` and
  `['client-selections', projectId]`. The second key is stated literally with a
  comment naming its source (`client-portal use-commercial-client.ts:22`),
  because that key lives in the portal, not this package.
- **A failed upload never writes the row** — the test asserts `from()` was not
  called at all on that path.

Six vitests: path composition · the row payload and both `.eq` scopes · blank
caption → null · upload failure writes nothing · row-write failure surfaces ·
both invalidations and exactly two of them.

Exported from `packages/supabase/src/hooks/index.ts` (the barrel A2 owns):
`useRoomConceptRender`, `roomConceptRenderPath`, `roomConceptRenderRoomsKey`,
`roomConceptRenderThresholdKey`, `ROOM_RENDERS_BUCKET`, `ROOM_RENDER_MAX_BYTES`,
`ROOM_RENDER_MIME_TYPES`, and the two input/result types.

## 8. `derive.ts`

- New exported `RoomConceptRender { url; caption; uploadedAt; uploadedBy }`.
- `ThresholdRoom.conceptRender?: RoomConceptRender | null` (optional — the
  producer, `threshold.tsx:184 toThresholdRoom`, is an H-lane file and is
  untouched here).
- `RoomBandModel.conceptRender: RoomConceptRender | null` (required, per the plan).
- One pure private helper `conceptRenderOf(room)`: a row with no object path is
  **not** a render (a plate drawn from it would be an empty frame captioned
  "Concept"); a blank caption becomes `null`; the other three fields are each
  independently optional. No rendering — H5 renders it.
- Four tests appended to `derive.test.ts`: the render lands on its own band and
  no other · a house with no renders says nothing on every band · a half-written
  row (path blank, caption set) yields `null` · an image with no caption keeps
  the image.

`RoomBandModel.conceptRender` being required does not break
`components/threshold/__tests__/room-band.test.tsx`'s `band()` helper: the
client-portal `tsconfig.json` excludes `**/*.test.tsx`, and `room-band.tsx` does
not read the field yet. All 53 threshold suites (1281 tests) and the full
client-portal run (134 suites, 2250 tests) are green.

## 9. What I did NOT do

- **Nothing was applied to Strata.** No `supabase db push`, no `migration list
  --linked`, no prod probe. 00580 exists only on `portal-polish/a2` and in the
  local database. That is the Wave 1 ship step's work.
- **No seed fixture.** No `supabase/seed/*` file gained a concept render; the
  only seed change is the generated `00-legacy-grants.sql`.
- **No UI.** No plate, no caption rendering, no upload control. The designer-side
  control in `ffe-section.tsx` (spec §4) is Wave 3's D6; the client-side plate is
  Wave 2's H5.
- **`threshold.tsx` was not touched** — it is not in this lane's file list, so
  `toThresholdRoom` does not yet populate `conceptRender`. Until an H lane wires
  it, every band's `conceptRender` derives to `null`, which is the correct inert
  state. **This is the one hand-off Wave 2 must pick up.**
- **No `.env.local` check was possible in the worktree** — neither
  `apps/client-portal/.env.local` nor `apps/designer-portal/.env.local` exists
  there (`No such file or directory`, checked with the sandbox disabled). The
  reset targeted the local stack only, confirmed by
  `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres` answering before
  anything destructive ran; the Supabase CLI reset reads `supabase/config.toml`,
  not `.env.local`.
- **Not verified locally:** that `DROP POLICY IF EXISTS … ON storage.objects`
  succeeds under Strata's `db push` role. It succeeds locally as `postgres`, and
  `00234` created policies on `storage.objects` and shipped, so the precedent
  holds — but the ship step should watch for it.

## 10. Review checklist, answered

| Item | Answer |
|---|---|
| RPC body came from 00578 | Yes — `grep \| sort \| tail -1` winner, extracted from `:3451-3618` |
| Diff is exactly four keys | Yes — §3, eight added lines, the same four keys twice |
| Every DDL step additive and nullable | Yes — four `ADD COLUMN IF NOT EXISTS`, no default, no backfill |
| Bucket is private | Yes — `public = false`, asserted in the SQL test |
| Policies scope by `<project_id>/<room_id>` and reuse existing predicates | Yes — strict uuid regex on both segments, `app_private.is_project_studio_member` / `is_project_client` called, never redefined |
| No trade cost or vendor pricing enters the client payload | Yes — the SQL test re-runs 00565's leak scan (`trade_price\|vendor\|cost\|markup\|margin`) over every key at every depth of the widened payload |
| Hook never writes the row when the upload fails | Yes — asserted (`from` not called) |
| `database.types.ts` committed | Yes — in `a5e1c1899`; a fresh regenerate leaves it clean |
