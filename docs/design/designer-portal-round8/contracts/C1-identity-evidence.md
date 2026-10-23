# C1 — Identity and evidence manifest

**Status:** proposed contract, revised 2026-10-23 after the SQ-1817 frontier review (CHANGES REQUIRED). Re-review pending (`review-audit-frontier`).
**Ticket:** SQ-1812 (WP-00.5a); revision SQ-1849. **Source inspected at:** `0fabcadf2` (branch `redesign/designer-portal-round8`; app/DB source identical to `ee9c450a5` main). Revision anchors re-checked at `4952624a16d1`.

**Revision 2026-10-23 (SQ-1817).** This file answers findings F2, F14, F18 and the C1 part of F20. Each change is marked inline with its finding id:
- **F2** (§3 Authority, §3 RLS, §6): new writes and reads are bound to the job's recorded studio, never to a studio derived from the caller.
- **F14** (§4 table, §4 RPC, §6): manifest dedupe and replay include the package, the purpose and the full request.
- **F18** (§3 Read model, §5): the all-sheets read is the `usePlanRoom` bundle, not `get_plan_room_holdings`.
- **F20** (§3 Activation, §4 Activation, §6): every function states its revokes for all three roles, with effective-privilege tests.
**Serves:** A01, A02, A05, A08, A09, A15, A16, A17, X01, X09, X10. It also feeds C3 (fabrication instruction evidence), C4 (acceptance evidence) and C5 (package contents).

**Citation rule.** `NNNNN:L` means `supabase/migrations/NNNNN_*.sql` line `L`. `DP` means `apps/designer-portal/src`, and `SB` means `packages/supabase/src`. "Today" means the inspected source. Nothing here claims what is deployed on Strata.

**Lineage rule for implementers.** Before you write a migration, re-run `grep -ln` for every function or view this file names, and copy the latest head body verbatim. This file cites the heads that existed at `0fabcadf2`.

---

## 1. Canonical identities that already exist (reuse, do not re-key)

| Identity | Source of truth | Key and stability | Notes |
|---|---|---|---|
| Document / engagement | `public.document_state` view, head body 00590:57 (`security_invoker = true`). Four legs: project (00590:61-62), proposal keyed by `chain_root_id` (00590:223-224), lead (00590:321-322), relationship (00590:374-375) | `engagement_id` uuid | One row per engagement. Any key (project, proposal, lead, engagement) reaches it |
| Document resolver | `public.document_open(p_id uuid) RETURNS jsonb` (00792:44-50): `STABLE SECURITY INVOKER SET search_path = ''`. Grant: authenticated only (00792:200-201) | Returns `{kind:'engagement',row,ids}`, `{kind:'redirect',projectId}` or `{kind:'missing'}` | R6 redirects an activated proposal (00792:115-123). F1 redirects an accepted lead (00792:125-140). J6 and R21 redirects follow (00792:161-186). This is the only definition at this source |
| Client resolution | `documentEngagementQueryOptions` `DP/hooks/use-document-state.ts:70-80`, keyed `docKeys.engagement(id)` (`SB/query-keys/document.ts:6`) | `DocumentResolution` union (`use-document-state.ts:60-68`) | Desk-seeded placeholder (`use-document-state.ts:82-93`) |
| Project | `projects.id` | uuid | Every round-8 chapter is project-scoped |
| Room | `project_rooms` (00066:220-234), `project_id` ON DELETE CASCADE | uuid | `source_scope_room_id` keeps proposal lineage (00066:223) |
| FF&E line | `project_ffe_items.id`; room = `project_ffe_items.project_room_id` (00066:259); `assignment_scope` room/throughout (00434:207, 220) | uuid | Pieces DOM marks `data-line-id` (`DP/lib/document/pieces/sheet-focus.ts:54-60`) |
| Line specification | `project_ffe_specs` (00380), `row_version` optimistic concurrency (`SB/hooks/use-spec-books.ts:346-382`) | uuid + `row_version` | A zero-row update is a conflict (`use-spec-books.ts:367-372`) |
| Configuration | `product_configurations` (00403:192-214): `configuration_key`, `version`, `previous_configuration_id`, `snapshot_hash` (sha256), status saved/approved/issued/superseded/archived | uuid + `snapshot_hash` | Already immutable-hash evidence |
| Custom revision | `custom_commission_revisions` (00403:259-280): `UNIQUE(configuration_id, revision_number)`, `previous_revision_id` | uuid + number | Statuses include `approved` and `issued` |
| Review edition / item | `project_review_editions` (00434:294-320), with `snapshot_hash` required once published; `project_review_items.content_hash` (00434:324-341) | uuid + hash | One published edition per project (00434:320-322) |
| Drawing sheet | `plan_sheets` (00429:99-118): `project_id` NOT NULL, **no room column**; unique `(project_id, upper(btrim(sheet_number)))` (00429:123-124) | uuid; content = `current_print_id`, moved only by `file_plan_prints` (00429:131) | Client may read only `state='shared'` (00429:2057-2063) |
| Print | `plan_prints` (00429:170-190), immutable, `sha256`, `UNIQUE(sheet_id, print_number)` | uuid + sha256 | Immutability trigger `_plan_room_immutable_row` (00429:383-423) |
| Issue | `plan_issues` (00429:206-221): `set_checksum` over canonical `{sheetNumber, revLetter, sha256}` (00429:229), `UNIQUE(project_id, idempotency_key)`, `prior_issue_id` chain | uuid + checksum | `plan_issue_prints` copies number, title, rev and sha (00429:237-251) |
| Approval artifact | `project_approval_artifacts` (00463:128-155): `source_kind` plan_issue / spec_book_artifact / budget_version, `source_version`, `artifact_hash` | uuid + hash | Prior art for "consequential act cites exact content" |
| Order snapshot | `po_spec_snapshots` (00711:421), `spec_book_artifacts` (00380:210) | uuid | Existing frozen evidence for PO and spec book |
| Room scan | `room_scans.project_room_id` (00265:36), routing guard (00265:100) | uuid | |
| Field capture | `field_captures.project_room_id` (00233:93), guard that the room belongs to the project (00233:223-234); `suggested_project_room_id` is never truth (00532:98-104) | uuid | |

**Rule C1-R1.** Round 8 composes these identities. It must not create a generic `documents` table, a second job store, or a client-side identity map (R8-08). Any new id below joins existing rows by foreign key.

## 2. URL and return identities used by the round-8 unfold

Today:
- The Build room route is `/doc/[id]/pieces?lens=&room=`. The lenses are `rough, spec, price, release, finishes` (`DP/lib/document/pieces/build-room-url.ts:12-18`). Price is dropped for a seat without money (`build-room-url.ts:37-39`). An unknown lens reads as `rough` and the URL is left untouched (`build-room-url.ts:42-56`).
- A return lands on `/doc/[id]#pieces-room-<roomId>`, or on `#project-ffe` for the rail places `throughout`/`unassigned`/`removed` (`build-room-url.ts:22-24`, `:81-89`).
- No `line=` parameter exists anywhere in pieces. A line landing is `?ffeItemId=` on the document page (`DP/app/(document)/doc/[id]/page.tsx:1218-1222`), carried as arrival `Landing {kind:'ffe', ffeItemId}` (`DP/lib/arrival/types.ts:8-11`) and executed by `jumpToLine` once the paper settles (`page.tsx:3027-3040`).
- `?sheet=call` is an **address** that persists in the bar. `?sheet=household` is a **one-shot instruction** consumed before opening (`page.tsx:1348-1365`).
- No consumer exists for `?unfold=` or `?land=`.
- Origin memory is session-scoped: Desk place `holdDeskPlace` (`DP/app/(document)/desk/page.tsx:104-111`), Room origin `rememberRoomOrigin`/`readRoomOrigin` (`DP/lib/document/room-origin.ts:17-35`), and line focus `focusLineAct`/`focusPlace` (`sheet-focus.ts:48-90`).

Contract (owned by the integration lead and the WP-01.4b unfold slice):

| Parameter | Kind | Values | Rule |
|---|---|---|---|
| `unfold` | address (stays in the bar) | `pieces` only, in wave 1 | Opening uses `pushState`. Closing calls `history.back()` when the current entry was pushed by the unfold, and otherwise uses `replaceState` without the unfold parameters. A reload reopens the instrument. It never re-runs a write: the URL carries no act |
| `lens` | address | the `BUILD_ROOM_LENSES` set; `purchase` only after ratification (DECISIONS P-confirmations) | Parse with `parseBuildRoomSearch` unchanged. An unknown or forbidden lens reads as `rough` |
| `room` | address | `project_rooms.id`, `throughout`, `unassigned` or `removed` | Same parser. A room id outside the job's room list falls back to the whole-job view and focuses the sheet title (`focusPlace`, `sheet-focus.ts:80-90`) |
| `line` | address | `project_ffe_items.id` (uuid) | Validate the uuid shape first. If the line is absent, forbidden or removed, `focusLineAct` returns false (`sheet-focus.ts:48-66`), and focus falls back to the room heading and then the sheet title. Never print "not found" for a line the caller cannot read (X02) |
| `land` | one-shot | `region:<DocumentIndexKey>`, `line:<uuid>`, `section:<SectionKey>` | Maps 1:1 onto the existing `Landing` union. Consumed once, then removed with `replaceState`, the same way `household` is. Landing only positions and focuses. It may dispatch an `ACT_LANDING_EVENTS` event (`DP/lib/document/act-names.ts:284-290`) that **opens** a control, but it never executes a write |
| `ffeItemId` | legacy alias | uuid | Still accepted and treated as `land=line:<id>`. It is not emitted by new code |

- **Legacy route.** `/doc/[id]/pieces?lens=&room=` keeps resolving. Under round 8 it does a `replace` to `/doc/[id]?unfold=pieces&lens=&room=`. Under the legacy renderer it stays exactly as it is (A01, X10).
- **Return identity.** The new `paper-origin` helper records `{path, search, anchorId, scrollY, focusId}` in sessionStorage under one key. It delegates to `holdDeskPlace` (Desk) and `rememberRoomOrigin` (Rooms) instead of duplicating them. It is a convenience: it never carries authority, never carries a mutation and never syncs across tabs.
- **Identity is not authority.** Every id in the URL is re-read under RLS. `document_open` already reports an id the caller cannot read as `missing` (00792 header :13-17).

## 3. Room/package ↔ drawing join (the one additive C1 migration; WP-05, wave 2)

**Gap.** Drawings are project-scoped only. `plan_sheets` has `project_id` and no room or package column (00429:99-118). `plan_issues` is the same (00429:206-221). The round-8 Design chapter and the cabinetry package both need "these sheets belong to this room/package".

**Why a join table and not a column.** One elevation sheet can show several rooms, and one cabinet package spans several sheets. `plan_sheets` is also guarded row by row (`guard_plan_sheets_row`, 00429:432), so adding a column would widen that guard's surface. A join table leaves every existing plan-room RPC untouched.

```sql
-- Identity of a package. Composition only; it never copies sheet/line content.
CREATE TABLE public.project_packages (
  id              uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  package_kind    text NOT NULL CHECK (package_kind IN ('cabinetry', 'build')),
  code            text NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 32),   -- e.g. 'K'
  package_key     text NOT NULL CHECK (package_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'), -- immutable; see below
  title           text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  project_room_id uuid REFERENCES public.project_rooms(id) ON DELETE SET NULL,  -- optional home room
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz
);
CREATE UNIQUE INDEX uniq_project_packages_code
  ON public.project_packages (project_id, upper(btrim(code))) WHERE archived_at IS NULL;
-- Never reused within a job, archived rows included: an edition that names a key must never resolve to a later package.
CREATE UNIQUE INDEX uniq_project_packages_key
  ON public.project_packages (project_id, package_key);

-- Sheet ↔ room. Many-to-many.
CREATE TABLE public.plan_sheet_rooms (
  sheet_id        uuid NOT NULL REFERENCES public.plan_sheets(id) ON DELETE RESTRICT,
  project_room_id uuid NOT NULL REFERENCES public.project_rooms(id) ON DELETE CASCADE,
  added_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  added_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sheet_id, project_room_id)
);

-- Sheet ↔ package. Many-to-many.
CREATE TABLE public.plan_sheet_packages (
  sheet_id   uuid NOT NULL REFERENCES public.plan_sheets(id) ON DELETE RESTRICT,
  package_id uuid NOT NULL REFERENCES public.project_packages(id) ON DELETE RESTRICT,
  added_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  added_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sheet_id, package_id)
);
```

- **Same-project invariant.** A `BEFORE INSERT` trigger rejects any row whose sheet's `project_id` differs from the room's or package's `project_id`. Error: `plan_sheet_link_off_project`. This follows the `field_captures` room guard (00233:223-234) and the `assert_party_authority_copy_to` pattern (00624:917-950).
- **Writes.** Only through `SECURITY DEFINER SET search_path = public, pg_temp` RPCs. `authenticated` gets SELECT only on these tables, and INSERT/UPDATE/DELETE are revoked:
  - `set_plan_sheet_rooms(p_sheet_id uuid, p_project_room_ids uuid[]) RETURNS jsonb` replaces the set and returns `{sheetId, roomIds[]}`. It is naturally idempotent because the same set gives the same result.
  - `set_plan_sheet_packages(p_sheet_id uuid, p_package_ids uuid[]) RETURNS jsonb` works the same way.
  - `create_project_package(p_project_id uuid, p_kind text, p_code text, p_title text, p_project_room_id uuid DEFAULT NULL, p_idempotency_key text) RETURNS public.project_packages` replays on `(project_id, idempotency_key)` the way `plan_print_batches` does (00429:139-165). That needs an `idempotency_key text` and `request_hash text` column pair on `project_packages`, with `UNIQUE(project_id, idempotency_key)`.
- **`package_key` (Revision 2026-10-23, orchestrator, closing the C1↔C2 seam left open by SQ-1850).**
  - C2 §2.4a fixes the package identity shared by C1, C3, C5 and C6 as `(project_id, package_key)`. C5 §3.4 reaches `public.assert_fabrication_instruction_authority` (C3 §3.2) by resolving that key to this row's `id`.
  - `create_project_package` derives `package_key` on the server, once, from `lower(btrim(p_code))`. Any character outside `[a-z0-9_-]` becomes `-`. On a collision with any row in the job, archived rows included, it appends `-2`, `-3`, and so on.
  - The key is never a caller argument, and no RPC updates it. A `BEFORE UPDATE` trigger raises `package_key_immutable` when `package_key` or `project_id` changes.
  - `code` stays the editable display label. Renaming or re-using a code never moves a key.
  - Because the key index includes archived rows, an edition that froze key `k` can never resolve to a package created later. A C2/C5/C6 read whose key resolves to an archived package treats it as present-but-archived. It never treats it as absent, and it never re-binds.
  - Tests the WP-05 slice adds:
    - the key is server-derived and immutable on update;
    - archive then re-create with the same code yields a distinct key;
    - the C5 route refuses `fabrication_instruction_binding` for an unknown key.
- **Authority: tenant first (Revision 2026-10-23, SQ-1817 F2).** The original text reused `is_design_studio_comember(projects.designer_id)` (00429:2047-2054) and made the tenant leg conditional on a future `plan_sheets` repair. That is withdrawn. `is_design_studio_comember` (00399:1164-1193) is true for a member of *any* active design studio the designer also belongs to. So with designer D in studios A and B, a B-only member could link sheets and create packages on A's job. Every new C1 RPC and every studio read policy on the three new tables uses one predicate that reads the studio from the job's **record**:
  ```sql
  CREATE FUNCTION public.can_compose_project_plan(p_project_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.projects p
       WHERE p.id = p_project_id
         AND CASE
               WHEN public.project_recorded_studio(p.id) IS NOT NULL THEN
                 public.is_active_studio_member(public.project_recorded_studio(p.id))
                 AND public.is_design_studio_comember(p.designer_id)
               ELSE p.designer_id = (SELECT auth.uid())
             END);
  $$;
  REVOKE ALL ON FUNCTION public.can_compose_project_plan(uuid) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.can_compose_project_plan(uuid) TO authenticated, service_role;
  ```
  - `project_recorded_studio` is `projects.studio_id` alone, with no caller-relative fallback (00624:335-365). `is_active_studio_member` is NULL-safe and excludes guests (00417:40-55). The designer leg is kept as an extra narrowing, as in the 00624 policies (00624:989-997). It never widens access.
  - **Studio-less job** (`studio_id IS NULL`): only the designer of record passes. A co-member from any of the designer's studios is refused. This follows the 00624 ruling that a caller-relative tenant is self-satisfying (00624:349-365, w1b r8 BLOCKING-1). It never uses `project_tenant_org()`.
  - `authenticated` keeps EXECUTE because RLS policies evaluate the predicate as the querying role. It returns only a boolean about the caller's own access.
  - The link RPCs read the sheet, room and package rows as SECURITY DEFINER. They therefore call the predicate on the sheet's `project_id` themselves, and never rely on `plan_sheets` RLS as the gate.
  - **Inherited gap, not repaired here (OPEN for the orchestrator).** `plan_sheets_studio_rw` and the other plan-room studio policies (00429:2047-2054 onward), and the `get_plan_room_holdings` access check (00429:1939-1945), still use `is_design_studio_comember` without a tenant leg. That exposure exists today and is outside C1's declared change. C1's new rows do not inherit it. A separate ticket should decide the plan-room repair, the way SQ-1847 repairs `margin_notes`.
- **Lock order.** Lock the `projects` row `FOR KEY SHARE` first, then the `plan_sheets` row `FOR UPDATE`, then the join rows in id order. This matches the job-first rule of `_ffe_lock_job_labels` (00808:85-100).
- **RLS (read).**
  - Studio: `can_compose_project_plan(project_id)` (SQ-1817 F2). For `plan_sheet_rooms` and `plan_sheet_packages` the project is the sheet's `project_id`.
  - Client: a row is visible only when the sheet is `state='shared'` and `projects.client_id = auth.uid()`, which is the existing client gate (00429:2057-2063). Package rows are studio-only until C5 rules on client visibility.
  - Field: there is no direct table access. Field reads these joins through an RPC only when a later slice needs them.
- **Read model (Revision 2026-10-23, SQ-1817 F18).** The original text extended `get_plan_room_holdings`. That is withdrawn: the RPC returns the latest transmittal per recipient and the issue prints that recipient holds (00429:1947-2005). A job that has drawings but no transmittal returns `parties: []`, so newly linked, unissued or unsent sheets would carry no room or package mapping.
  - The all-sheets read is `usePlanRoom` (`SB/hooks/use-plan-room.ts:268-357`). It selects every `plan_sheets` row for the job (`:276-281`), then fans out to prints, batches, issue prints, transmittals and tokens in one `Promise.all` (`:294-330`).
  - Add `plan_sheet_rooms` and `plan_sheet_packages` to that fan-out, scoped with `.in('sheet_id', sheetIds)` and the zero-uuid sentinel already used for `plan_prints` (`:303-311`). Add `project_packages` with `.eq('project_id', projectId)`.
  - Expose the result as additive `sheetRooms`, `sheetPackages` and `packages` arrays on `PlanRoomBundle` (`:108`). Old callers ignore the new keys.
  - `get_plan_room_holdings` and `usePlanRoomHoldings` (`:359-370`) stay unchanged and remain recipient history.
  - Do not add a second plan read hook. The bundle grows by three requests per job; P11 counts them.
- **Audit.** Rows carry `added_by` and `added_at`. A removed link is a deleted row in the RPC transaction. If a later slice needs a link history, add an append-only `plan_sheet_link_events` table. That is not required for A08 or A09.
- **Backfill.** None. Existing sheets start with no room and no package. Unknown stays unknown: the Design chapter shows unlinked sheets under "Drawings for the whole job" and never guesses a room from a title or sheet number.
- **Activation.** Not consequential: these RPCs record composition, not authority. They ship active behind the renderer flag in the UI. They are listed here so reviewers see that no deny-by-default gate was skipped on purpose.
- **Explicit privileges (Revision 2026-10-23, SQ-1817 F20).** Shipping active is not the same as relying on defaults. The stack's `ALTER DEFAULT PRIVILEGES` gives `anon` and `authenticated` EXECUTE on every function created in `public` (00654:209-214). 00483:258-262 removes only the PUBLIC default. So every C1 function states all three roles:
  - The three composition RPCs: `REVOKE ALL … FROM PUBLIC, anon, authenticated; GRANT EXECUTE … TO authenticated, service_role`.
  - `can_compose_project_plan`: as shown above.
  - The same-project trigger function: `REVOKE ALL … FROM PUBLIC, anon, authenticated`, with no grant.
  - Tables: `REVOKE ALL … FROM PUBLIC, anon, authenticated; GRANT SELECT … TO authenticated; GRANT ALL … TO service_role`.

## 4. Immutable evidence manifest (WP-08 with C5, wave 3; not needed before)

A consequential act cites one immutable record that names the exact content it acted on. Consequential acts here are a fabrication instruction (C3/C5), a service-acceptance request or response (C4), and an issued package. Existing hashes are reused as members. The manifest never copies their content.

```sql
CREATE TABLE public.evidence_manifests (
  id              uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  package_id      uuid REFERENCES public.project_packages(id) ON DELETE RESTRICT,
  purpose         text NOT NULL CHECK (purpose IN ('fabrication_instruction', 'service_acceptance', 'package_issue')),
  members         jsonb NOT NULL CHECK (jsonb_typeof(members) = 'array'),
  manifest_hash   text NOT NULL CHECK (manifest_hash ~ '^[0-9a-f]{64}$'),
  -- SQ-1817 F14: the hash of the whole request binding, not only the members.
  request_hash    text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key text NOT NULL,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, idempotency_key),
  -- SQ-1817 F14: the package is part of the identity (PG 17, supabase/config.toml:31).
  UNIQUE NULLS NOT DISTINCT (project_id, package_id, purpose, manifest_hash),
  -- A fabrication instruction or a package issue always names its package.
  CONSTRAINT evidence_manifests_package_required
    CHECK (purpose = 'service_acceptance' OR package_id IS NOT NULL)
);
-- Immutable: reuse the plan-room blanket rejector pattern (00429:383-423).
```

**Revision 2026-10-23 (SQ-1817 F14).** The original uniqueness `(project_id, purpose, manifest_hash)` and the hash-only replay are withdrawn:
- `manifest_hash` covers only the members. Two packages in one job that cite the same issue set would collide, and C3 requires the manifest to belong to *its* package.
- A replay that compared only `manifest_hash` could return a row bound to a different package or purpose.

The rules now are:
- `request_hash` = sha256 of `_plan_room_canonical_json({projectId, packageId, purpose, manifestHash})`, computed by the server.
- Uniqueness is per `(project, package, purpose, members)`. The same members cited by two packages give two manifests, one per package.
- Replay is judged on `request_hash`, not on `manifest_hash`.

- **Member shape.** Each member is `{kind, id, version|rev, sha256}`. The allowed kinds are a closed list:

  | Member kind | Points at | Hash field cited |
  |---|---|---|
  | `plan_issue` | `plan_issues.id` | `set_checksum` |
  | `plan_issue_print` | `plan_issue_prints.id` | `sha256` |
  | `plan_print` | `plan_prints.id` | `sha256` |
  | `product_configuration` | `product_configurations.id` | `snapshot_hash` |
  | `custom_commission_revision` | `custom_commission_revisions.id` | none; frozen by status `approved`/`issued` |
  | `review_item` | `project_review_items.id` | `content_hash` |
  | `approval_artifact` | `project_approval_artifacts.id` | `artifact_hash` |
  | `po_spec_snapshot` | `po_spec_snapshots.id` | none |
  | `coordination_item_revision` | `coordination_item_revisions.id` (00214) | status must be `approved` |

  A member must be an immutable row. `plan_sheets.current_print_id` is mutable, so it is **never** a member. Cite the print or the issue print instead.
- **Hash.** `manifest_hash` is the sha256 of `_plan_room_canonical_json(members sorted by kind, id)`. That reuses the existing canonicaliser (00429:625). The member hashes are copied in. Two manifests with the same hash are the same evidence, which is the same rule as `plan_issues.set_checksum` (00429:229).
- **RPC.** `create_evidence_manifest(p_project_id uuid, p_package_id uuid, p_purpose text, p_members jsonb, p_idempotency_key text) RETURNS jsonb {manifestId, manifestHash, replayed}`, `SECURITY DEFINER SET search_path = public, pg_temp`. The server re-reads every member under a project check. A member from another project fails with `manifest_member_off_project`, and a member that is not in a frozen state fails with `manifest_member_not_frozen`. The server recomputes each member hash and never trusts a client-supplied one.
  - **Package binding (SQ-1817 F14).** When `p_package_id` is not NULL, the server reads the package row and refuses `manifest_package_off_project` unless `project_packages.project_id = p_project_id` and `archived_at IS NULL`. A NULL package for `fabrication_instruction` or `package_issue` raises `manifest_package_required`.
  - **Replay (SQ-1817 F14).**
    - The same key with the same `request_hash` returns the original row with `replayed: true`.
    - The same key with a different `request_hash` raises `idempotency_key_reused`, as in 00429:164-165. That covers a different package, a different purpose or different members.
    - A new key whose binding already exists returns the existing manifest with `replayed: true`. It is the same evidence for the same package and purpose.
  - **Authority (SQ-1817 F2).** The caller must pass `can_compose_project_plan(p_project_id)` (§3). The consuming act may narrow it further.
- **Activation.** `create_evidence_manifest` is created with `REVOKE ALL ... FROM PUBLIC, anon, authenticated` and is granted to `service_role` only. It is **inactive** until the consuming act (C3/C5 fabrication instruction, or C4 acceptance) is activated by its own reviewed migration, which grants EXECUTE. Until then nothing can mint evidence.
  - **Revision 2026-10-23 (SQ-1817 F20).** The activation grants EXECUTE to `authenticated` only, never to `anon` or PUBLIC. It ships in the same reviewed migration that activates the consuming act. Rollback is the matching `REVOKE … FROM authenticated`. The SQL suite asserts effective privilege, not just the absence of a GRANT line: `has_function_privilege('anon', 'public.create_evidence_manifest(uuid,uuid,text,jsonb,text)', 'EXECUTE')` is false before and after activation, and the same check for `authenticated` is false before activation.
- **Lock order.** Lock the `projects` row `FOR KEY SHARE`, then the package row `FOR SHARE`, then each member row `FOR SHARE` in (kind, id) order, then insert.
- **Backfill.** None. Historical acts keep the evidence they already have (approval artifacts, PO snapshots). No manifest is fabricated for a past act.

## 5. Consumer compatibility

| Consumer | Effect |
|---|---|
| Designer, legacy renderer | None. The join tables are additive and the holdings keys are additive. The `/pieces` route is unchanged |
| Designer, round 8 | Reads `sheetRooms`/`sheetPackages`/`packages` from the `usePlanRoom` bundle, not from holdings (SQ-1817 F18), and URL identities per §2 |
| Client portal | Plan reads already go through the shared-sheet gate. New join rows are visible only for shared sheets. The client portal reads no package rows. Token links (`resolve_plan_transmittal`, 00429:1787) are unchanged |
| iOS Patina | No change. It reads `room_scans`, `project_documents` and `get_client_project_selections`, never `plan_*` directly |
| Field (Capture) | No change. `field_captures.project_room_id` is already the room identity |

## 6. Tests the implementing slices own

- **SQL (WP-05).**
  - A link across projects is rejected.
  - A client sees a link only for a shared sheet.
  - Repeating `set_plan_sheet_rooms` with the same set gives the same result.
  - `create_project_package` replay and conflicting replay.
  - **Tenant matrix (SQ-1817 F2).** These cases hold from the first migration, not "once a tenant leg exists". Designer D is an active member of studios A and B. Job J records `studio_id = A`.
    - An A member links sheets, creates a package and reads the join rows on J.
    - A B-only member is refused by all three RPCs and reads zero join and package rows on J.
    - A guest of A is refused.
    - The job client is refused by every RPC and reads only links on shared sheets.
    - On a studio-less job, D is allowed and an A or B co-member is refused.
  - **All-sheets read (SQ-1817 F18).** A job with sheets linked to rooms and **zero** transmittals returns those links in the `usePlanRoom` bundle. `get_plan_room_holdings` output is byte-identical before and after the migration.
  - **Privileges (SQ-1817 F20).** `has_function_privilege('anon', …, 'EXECUTE')` is false for every C1 function. It is also false for `authenticated` on the trigger function.
- **SQL (WP-08).**
  - The manifest is immutable: UPDATE and DELETE are rejected.
  - A member from another project is rejected.
  - A mutable member is rejected.
  - Hash recomputation ignores a client-supplied hash.
  - Direct EXECUTE by `authenticated` is denied while inactive (`42501`). `has_function_privilege` shows the same for `anon` and `authenticated` (SQ-1817 F20).
  - **Binding (SQ-1817 F14).**
    - Packages P1 and P2 in one job cite the same members. That gives two manifests, each bound to its own package.
    - Replaying P1's key with P2, with another purpose, or with other members raises `idempotency_key_reused`.
    - A new key with P1's exact binding returns P1's manifest.
    - A package from another project raises `manifest_package_off_project`.
    - A NULL package for `fabrication_instruction` raises `manifest_package_required`.
- **Jest (WP-01.4b).** URL parse/emit round-trip for `unfold`, `lens`, `room` and `line`. `land` is consumed once. The `ffeItemId` alias still lands.
- **Playwright (WP-01.9).** Back and Forward walk unfold and close. A reload on `?unfold` reopens with no write replayed (first vertical slice, step 10).

## 7. Open product questions (recommendation first)

1. **Can one sheet belong to several rooms?** Recommend **yes**, many-to-many. Elevations and a whole-floor plan span rooms.
2. **Package code uniqueness (K-201 versus living-room A-201).** Recommend making the package `code` unique per project among live packages. Sheet numbers keep their own uniqueness (00429:123-124). Display labels are never identity, and the demo's K/A naming is fixture data only.
3. **When is a manifest minted?** Recommend minting at the consequential act, idempotent by hash, and never at draft time. A draft that changes before the act simply produces a different hash.
4. **Ratify the sixth `purchase` lens.** Recommend adopting it. The parser already tolerates unknown lenses by reading them as `rough`, so old links stay valid either way.
5. **Should a client ever see packages?** Recommend not in wave 2. C5 decides when the external-fulfilment contract lands.
