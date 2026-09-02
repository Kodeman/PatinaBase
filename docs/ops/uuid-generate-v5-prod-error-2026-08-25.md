# `permission denied for function uuid_generate_v5` on `/doc/<id>` — 2026-08-25

Status: **diagnosed, not fixed** (read-only investigation; no mutation applied). Root cause is a
**pre-existing latent grant bug**, unrelated to the Wave 1P portal deploy (A) and unrelated to the
13-migration scan-pipeline/capture push (B) that landed within minutes of it.

## TL;DR

- The failing object is `public.margin_items` (created migration `00194`, **2026-07**, long before
  either (A) or (B)). It is `security_invoker = true`, and one of its `UNION ALL` branches (the
  `'time'` kind, a rolling 7-day summary of `project_time_entries`) calls unqualified
  `uuid_generate_v5(...)`, which resolves to `extensions.uuid_generate_v5(uuid, text)`.
- `authenticated` (and `anon`) have **never had `EXECUTE` on `extensions.uuid_generate_v5`** on
  Strata — only `postgres` (and presumably `service_role`-adjacent superuser paths) do.
- Because the view is `security_invoker = true`, the EXECUTE check runs as the **querying role**
  (`authenticated`, via PostgREST), not the view owner. Postgres evaluates this lazily per output
  row of the `'time'` branch — the error only fires when a project actually has ≥1
  `project_time_entries` row with `duration_minutes IS NOT NULL AND started_at > now() - interval
  '7 days'`. That is rare, which is why this has sat live and undetected since July.
- The designer portal's `useMarginItems` hook (`apps/designer-portal/src/hooks/use-margin-items.ts`)
  queries `margin_items` on every `/doc/<id>` mount **and polls it every 30s**
  (`refetchInterval: 30_000`), which is why the toast repeated/stacked during the incident window.
- Postgres logs pin the exact failing statement and window: **09:41:41–09:44:06Z**, 9 occurrences,
  `sql_state 42501`, `user_name: authenticator` (PostgREST's pooled role, which then runs as
  `authenticated`), `application_name: PostgREST 14.1`. No occurrences before or after that ~2.5
  minute window (checked through 20:00Z same day) — i.e. it was **not a continuous "every load"
  failure**, it was every `/doc/<id>` load **for whichever project(s) had a qualifying time entry**,
  during the window QA/deploy traffic happened to hit one. `project_time_entries` currently has
  **zero** rows matching the view's 7-day window prod-wide, so the bug is dormant right now but will
  recur the instant any designer logs time and someone opens that project's document.
- **Not caused by (A)**: `git diff cde7c7628..eb4b45265` touches neither `use-margin-items.ts` nor
  `margin-derivation.ts` — those files are byte-identical across the deploy. Wave 1P's new files
  (`use-capture-media.ts`, `use-capture-venues.ts`, the rewritten `useClientRoomScans` in
  `use-room-scans.ts`, `RoomFilesSection`) query `room_scans`/`media_registry` tables directly and
  never touch `margin_items` or `uuid_generate_v5`.
- **Not caused by (B)**: none of `00494, 00495, 00498, 00499, 00500, 00501, 00514, 00515, 00516`
  reference `uuid_generate_v5`, touch `margin_items`, or change grants on the `extensions` schema
  (confirmed by `git grep` on each file). Their `REVOKE`/`GRANT` statements are scoped to their own
  new objects (`media_registry`, `media_upload_intents`, `capture_enrichment_*`,
  `commit_field_capture`, `commit_proposal_capture`, etc.).
- The coincidence in timing is exactly that — a coincidence: fresh QA/verification traffic hit
  `/doc/<id>` right after the 09:39:51Z deploy, and it happened to land on a project with a
  qualifying time entry, surfacing a bug that has been live on prod since `00194`.

## Evidence

### 1. Which function(s) call `uuid_generate_v5` unqualified, and where

```sql
SELECT n.nspname AS schema, p.proname, p.oid::regprocedure AS signature, p.proconfig,
       pg_get_userbyid(p.proowner) AS owner
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosrc ILIKE '%uuid_generate_v5%';
```
Result — only 3 hits total on prod, exhaustive:
| schema | name | signature | proconfig | owner |
|---|---|---|---|---|
| extensions | uuid_generate_v5 | uuid_generate_v5(uuid,text) | — | postgres |
| public | `_send_proposal_with_dispatch` | (...) | `search_path=public, pg_temp` | postgres |
| public | `send_commercial_document` | (...) | `search_path=public, pg_temp` | postgres |

Both `public` functions are `SECURITY DEFINER` (`prosecdef=true`) and call
`extensions.uuid_generate_v5` **schema-qualified** — so they run the nested call as owner
(`postgres`, which does have EXECUTE) and are unaffected by the grant gap. `authenticated` cannot
call `_send_proposal_with_dispatch` at all (explicitly `REVOKE ALL ... FROM PUBLIC, anon,
authenticated, service_role` in `00390_proposal_copy_immutability.sql`, by design — it's an internal
helper for `send_proposal`). `send_commercial_document` grants `authenticated` EXECUTE directly, but
since it's SECURITY DEFINER this is safe.

Neither of these is what's failing. `pg_proc.prosrc` search is exhaustive over every function
(including trigger functions) — there is **no** other function, default expression
(`pg_attrdef`), or constraint (`pg_constraint`) referencing `uuid_generate_v5` on prod (both
checked and empty).

**The actual failing object is a VIEW**, found via `pg_get_viewdef(...) ILIKE '%uuid_generate_v5%'`:

```sql
SELECT c.relname, c.relkind, pg_get_userbyid(c.relowner) AS owner, c.reloptions,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_can_select
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('v','m')
  AND pg_get_viewdef(c.oid) ILIKE '%uuid_generate_v5%';
```
→ `margin_items` | view | owner `postgres` | **`reloptions: {security_invoker=true}`** |
`authenticated_can_select: true`

The `'time'` branch of `margin_items` (unchanged across every `CREATE OR REPLACE VIEW` restatement
from `00194` through `00282`):
```sql
SELECT 'time'::text AS kind,
    uuid_generate_v5('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid, te.project_id::text || te.day::text) AS item_id,
    ...
FROM (
    SELECT pte.project_id, date(pte.started_at) AS day,
           sum(pte.duration_minutes) AS minutes, count(*) AS entry_count
    FROM project_time_entries pte
    WHERE pte.duration_minutes IS NOT NULL AND pte.started_at > (now() - '7 days'::interval)
    GROUP BY pte.project_id, date(pte.started_at)
) te
```
`uuid_generate_v5(...)` here is unqualified. It resolves to `extensions.uuid_generate_v5` (the only
function of that name on prod) via the standard Supabase Cloud search_path (`"$user", public,
extensions`), so **resolution is not the problem** — this is a straight EXECUTE-privilege denial,
confirmed by the SQLSTATE below, not a "function does not exist" search_path miss (that was the
different, already-fixed `00282` issue from July).

Migrations `00194, 00197, 00200, 00202, 00206` each restate this same view body (adding unrelated
branches); `00219` (`coordination_read_models.sql`) is a *different* view family
(`coordination_court_summary`, `task_blocked_state`) and does not touch `margin_items`.

### 2. Which RPC/view `/doc/<id>` calls, and Wave 1P's relationship to it

`apps/designer-portal/src/hooks/use-margin-items.ts`:
```ts
export function useMarginItems(projectId: string | null, proposalId: string | null) {
  return useQuery<MarginItemRow[]>({
    queryKey: ['margin-items', key],
    enabled: Boolean(projectId || proposalId),
    refetchInterval: 30_000,               // ← polls every 30s while the doc page is open
    queryFn: async () => {
      const { data, error } = await getSupabase().from('margin_items').select('*').or(clauses);
      if (error) throw error;
      return (data ?? []) as MarginItemRow[];
    },
  });
}
```
This is mounted on the document page's margin rail and fetches on load, then re-polls every 30s —
matching the "1–3 stacked toasts, self-dismissing" pattern (initial mount + 1–2 poll ticks before
the offending data aged out or was cleaned up).

`git -C /Users/kody/Code/patina-merged diff cde7c7628..eb4b45265 --stat` (the Wave 1P deploy diff):
does **not** include `use-margin-items.ts` or `apps/designer-portal/src/lib/document/margin-derivation.ts`
— `git diff cde7c7628..eb4b45265 -- <those two paths>` is empty. Wave 1P's actual new/changed
files (`use-capture-media.ts`, `use-capture-venues.ts`, the rewritten `useClientRoomScans` in
`use-room-scans.ts`, `RoomFilesSection`, `capture-context-section.tsx`, `library-card.tsx`,
`orders-book-receiving.tsx`) query `room_scans` / `media_registry` tables directly (plain
`.from(...).select(...)`), never `margin_items`, and never reference `uuid_generate_v5`.

### 3. Grant state + prod logs (the smoking gun)

```sql
SELECT
  has_function_privilege('authenticated','extensions.uuid_generate_v5(uuid,text)','EXECUTE'),
  has_function_privilege('anon','extensions.uuid_generate_v5(uuid,text)','EXECUTE'),
  has_function_privilege('service_role','extensions.uuid_generate_v5(uuid,text)','EXECUTE'),
  has_function_privilege('postgres','extensions.uuid_generate_v5(uuid,text)','EXECUTE');
```
→ `authenticated: false`, `anon: false`, `service_role: false`, `postgres: true`.

`uuid-ossp` extension is installed in schema `extensions` (confirmed via `list_extensions`),
version 1.1, owner `postgres` — standard Supabase Cloud placement (not in `public`).

Empirical, read-only confirmation on live prod (no writes): `SET ROLE authenticated; SELECT *
FROM margin_items WHERE kind <> 'time' LIMIT 1;` succeeds today with **zero rows** and no error
(because `project_time_entries` currently has 0 rows in the 7-day window, so the `'time'` branch's
executor node never evaluates `uuid_generate_v5` — confirming the failure is row/data-dependent,
lazy per-branch, not a query-plan-time-eager check).

Prod postgres logs (`query_logs`, `source='postgres_logs'`), 2026-08-25 08:30Z–20:00Z window, 9
matching `event_message = 'permission denied for function uuid_generate_v5'` rows, **all** between
`09:41:41.647Z` and `09:44:06.683Z`, none before or after. Full attributes on one:
```
parsed.sql_state_code: 42501
parsed.error_severity: ERROR
parsed.user_name: authenticator
parsed.application_name: PostgREST 14.1
parsed.command_tag: BIND
parsed.query:
  WITH pgrst_source AS ( SELECT "public"."margin_items".* FROM "public"."margin_items"
    WHERE ( "public"."margin_items"."project_id" = $1) LIMIT $2 OFFSET $3 )
  SELECT null::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total,
    coalesce(json_agg(_postgrest_t), '[]') AS body, ... FROM ( SELECT * FROM pgrst_source ) _postgrest_t
```
This is the literal PostgREST-generated SQL for `.from('margin_items').select('*').eq('project_id',
…)` — i.e. exactly `useMarginItems`'s query, via the `authenticator` pooled role (which PostgREST
then executes as `authenticated` per the caller's JWT).

## (a) Which function + which migration introduced the error

`extensions.uuid_generate_v5` (uuid-ossp), called unqualified from the `'time'` branch of the
`public.margin_items` view. The view — with this exact branch and `security_invoker = true` — was
introduced in `supabase/migrations/00194_margin_items_view.sql` (2026-07, long predating both (A)
and (B)) and restated unchanged through `00197/00200/00202/00206/00219/00282` as later migrations
added sibling branches. The `authenticated`/`anon` EXECUTE gap on `extensions.uuid_generate_v5` has
presumably existed since `uuid-ossp` was installed into the `extensions` schema — this is the
default Supabase Cloud posture; nothing in the migration history grants it.

## (b) Caused by (A), (B), or pre-existing?

**Pre-existing.** Confirmed by: the view/branch's migration number (00194, months old); the absence
of `use-margin-items.ts`/`margin-derivation.ts` from the (A) diff; the absence of any
`uuid_generate_v5` or `extensions`-schema grant reference in any of the nine (B) migration files.
The only reason it fired in a tight window right at 09:41–09:44Z is that post-deploy verification
traffic hit `/doc/<id>` for a project that (transiently) had a qualifying `project_time_entries`
row — an unrelated coincidence of timing, not a causal link to either change set.

## (c) Minimal fix (proposed, NOT applied)

Narrowest fix consistent with the existing pattern on prod (e.g. `_send_proposal_with_dispatch`'s
explicit, scoped REVOKE in `00390`): grant `EXECUTE` on just this one overload to `authenticated`
only (not `anon`, not `PUBLIC` — `margin_items` is gated by base-table RLS via `security_invoker`,
but the synthetic-ID helper itself doesn't need to be anon-reachable):

```sql
-- supabase/migrations/NNNNN_grant_uuid_generate_v5_authenticated.sql
GRANT EXECUTE ON FUNCTION extensions.uuid_generate_v5(uuid, text) TO authenticated;
```

Alternative (schema-qualifying the call site) would NOT fix this — the call already resolves
correctly to `extensions.uuid_generate_v5` via the default search_path; qualifying it only changes
*resolution*, not the EXECUTE ACL check, which is the actual failure (`42501`, not `42883`
"function does not exist"). A `SET search_path` change on the view/role is likewise irrelevant for
the same reason.

If a tighter blast radius than a bare GRANT is preferred, an equally minimal alternative is to
replace the `'time'` branch's ID generation with something that doesn't need a privileged
extension function at all, e.g. `('x' || substr(md5(te.project_id::text || te.day::text), 1,
32))::uuid` (deterministic, no extension dependency) — but this changes the synthetic
`item_id` values for existing/cached clients, so the plain GRANT is the safer minimal fix.

## (d) User impact

**Read-only toast, no write path affected.** `margin_items` is only ever `SELECT`ed by the
portal (a `UNION ALL` read model over `client_decisions`, `comms_threads`, `invoices`,
`weekly_pulses`, `project_time_entries`, `margin_notes`, `po_payments`, `sms_messages` — not a
PostgREST-updatable view). The failure means the document page's **margin rail silently fails to
load its item list** for the affected project while the qualifying time-entry data exists (all
other `/doc/<id>` data — document state, FF&E lines, room files, etc. — loads normally via separate
queries), and the user sees a self-dismissing error toast, repeating every ~30s (the hook's
`refetchInterval`) until either the time-entry data ages out of the 7-day window or the grant is
fixed. No data is lost, no other write or read path is blocked.

## Not verified / follow-ups

- Which specific project_id(s)/document(s) were open during the 09:41–09:44Z window — PostgREST logs
  the bound query but not bind-parameter values, so the exact project(s) affected isn't recoverable
  from these logs alone. Whoever was testing `/doc/<id>` at that time (deploy verification?) would
  know which project(s) they had open.
- Whether the triggering `project_time_entries` row was a real designer time-log or synthetic
  QA/seed data that was later deleted (it's gone now — 0 matching rows prod-wide as of this
  investigation).
- Whether `service_role` ever needs this grant too (currently also `false`) — no evidence found of
  a service-role caller hitting this path, but not exhaustively ruled out beyond the `pg_proc`
  search already covering every function.
