# Seed notes — "the long paper" (Aspen Loft, project `…d5`)

Agent W0-L2. Script: `scripts/the-document-lens-seed.sql` (worktree
`.codex/worktrees/agent-lens-w0-l2`, branch `document-lens/w0-l2`).

## What it creates

A brand-new project `b0000000-0000-0000-0000-0000000000d5` ("Aspen Loft — the
long paper") for `designer@patina.dev` and the same client (`a…005`) that the
existing Aspen Loft Refresh project (`…d1`) uses, plus a second, unrelated
pre-work proposal `b0000000-0000-0000-0000-0000000000d6` for the same client.

| Table | Count | Notes |
|---|---|---|
| `projects` | 1 | `current_phase='procurement'` → `document_state.active_section='project'` |
| `proposals` | 2 | `…1401` (lineage — accepted, signed, `project_id=d5`) + `…d6` (pre-work, sent, unopened) |
| `project_rooms` | 5 | Living 18 · Dining 12 · Primary Bedroom 14 · Mudroom 8 · Kitchen 10 = **62** |
| `project_ffe_items` | 62 | see status table below; 58 carry `product_id`; 2 unspecified; 1 damaged |
| `vendors` | 4 | Sturdy Oak Woodworks, Heritage Cabinetry Co, Coastal Millwork, Fond du Lac Ironworks |
| `purchase_orders` | 4 | PO-2026-0418 (draft/unacknowledged 14d), HC-2244 (in_production, acknowledged), CM-1187 (shipped→delivered via clean inspection), FDL-0912 (shipped, damaged inspection) |
| `po_payments` | 6 | none in `state='due'` — deliberately, so none surface as an extra `margin_items` "vendor payment due" row |
| `receiving_inspections` | 2 | 1 clean (CM-1187), 1 damaged (FDL-0912, the console) |
| `client_decisions` | 4 | 2 overdue (pending), 2 approved (responded) |
| `client_decision_options` | 8 | 2 per decision |
| `comms_threads`/`messages`/`participants` | 2/2/2 | the console-photo thread and the PO-chase thread, both `line`-anchored |
| `invoices`/`invoice_line_items` | 1/1 | $17,500 outstanding, `letterhead`-anchored (no `ffe_item_id` on its line) |
| `project_phases` | 5 | Concept (completed) → DD (completed) → Procurement (in_progress, current) → Installation (pending) → Completion (pending) |
| `schedule_milestones` | 4 | COM deadline (overdue 3d) · site walk (+14d) · install day (~+21d, next Tuesday) · punch list (+25d) |

## Reconciled requirements

The brief's original 4-room/36-line specimen was superseded, per the task's
own instruction, by `build/design/reconciliation.md`'s "Seed requirements"
section (5 rooms/62 lines) and two coordinator addenda received mid-task:
- 5 rooms / 62 lines, every date relative to `now()`/`CURRENT_DATE`.
- Margin split verified against the `margin_items` **view** itself (3 beside
  Pieces / 4 whole job), not re-derived from source tables.
- A `receiving_inspections` row with a **non-clean** outcome for the damaged
  console (trigger C stamps `delivered_date` on every outcome but only
  advances the PO to `delivered` on a clean outcome), plus a **separate**
  clean-delivered PO so `delivered` status exists on its own path too.
- A second, fixed-id pre-work proposal (`…d6`).

## The `aaa_ffe_ratchet_to_po_stage` trigger, handled deliberately

`ffe_ratchet_to_po_stage()` (migration 00184) fires `BEFORE INSERT OR UPDATE
OF purchase_order_id` on `project_ffe_items` and only ever moves a line's
status **up** to `po_status_to_ffe_stage(po.status)` — never down, and never
at all when `purchase_order_id IS NULL`.

- **2 unspecified lines** (Mudroom) carry no `purchase_order_id` at all — the
  trigger never touches them.
- **PO-2026-0418** (`status='draft'` → target `'ordered'`): its 2 lines are
  inserted with `status='ordered'` explicitly (set directly rather than left
  to ratchet up from a lower default, so the intended value lands cleanly).
- **HC-2244** (`status='in_production'` → target `'production'`): its 2 lines
  inserted with `status='production'`.
- **CM-1187** (`status='shipped'` at insert; its 2 lines inserted with
  `status='shipped'`) — then a **clean** `receiving_inspections` row (A-04)
  fires trigger C, which advances the PO to `'delivered'` and cascades via
  trigger B to bump both linked lines to `'delivered'` (rank 5→6).
- **FDL-0912** (`status='shipped'`, never advanced): the damaged console line
  is inserted with `status='delivered'` directly, *while* `purchase_order_id`
  is set to this PO. The ratchet compares ranks (`delivered`=6 vs the PO's
  target `shipped`=5) and only acts when `rank(NEW.status) < rank(target)` —
  6 < 5 is false, so it leaves the explicit `'delivered'` alone. A **damaged**
  `receiving_inspections` row is then logged for the PO (A-04): trigger C
  stamps `delivered_date` but — per its "only a CLEAN outcome advances the
  PO" rule — leaves `FDL-0912.status = 'shipped'`, which is exactly the
  real-world shape (goods arrived broken; the order itself never formally
  "delivered" clean).

## Expected status distribution (printed by the script; observed in the
validation run — will vary slightly run-to-run only in the `now()`-relative
fields, never in these counts)

```
   status   | count
------------+-------
 approved   |    11
 delivered  |     3   (2 from CM-1187's clean cascade + the damaged console)
 installed  |    10
 ordered    |     2   (PO-2026-0418's table + chairs)
 production |     2   (HC-2244's 2 lines)
 quoted     |    11
 shipped    |    10
 specified  |    13   (includes the 2 unspecified + the COM-blocked line)
```
rooms=5, lines=62, lines_with_product=58.

## Margin items — verified against the VIEW (A-02)

`seed-verify.sql` `SELECT`s from `margin_items` (00194/00282) directly rather
than re-deriving the split. Every OTHER branch of that view (`pulse`, `time`,
`note`/`margin_notes`, `field_sms`, and the `po_payments state='due'`
"vendor payment due" branch) is deliberately kept empty for this project —
no `weekly_pulses`, no `project_time_entries`, no `sms_messages`, no
`margin_notes` rows, and every `po_payments` row is `'pending'` or `'paid'`,
never `'due'` — so the count lands on exactly 7 with no surprise rows:

- **beside Pieces** (`anchor_kind='line'`, 3): the COM decision (Living room
  reading-chair fabric, line-linked via `project_ffe_items.blocked_by_decision_id`
  on FF&E line n=2), the console-photo `comms_threads` row, the PO-chase
  `comms_threads` row.
- **whole job** (`anchor_kind` letterhead/section, 4): the overdue
  rug/nightstands decision, the 2 approved decisions (dining finish sample,
  whole-house hardware), and the outstanding invoice.

## "0 OF 6 CLOSED OUT" and "12 COMPLETE" (A-03)

Traced both to their actual source (not assumed from the specimen):

- **`0 OF 6 CLOSED OUT`** (`care-band.tsx` → `closure-derivation.ts`
  `defaultClosureItems()` / `CLOSURE_ITEM_DEFS`) is **pure client component
  state** — a fixed 6-item checklist that always starts unchecked on every
  page load. It is not backed by any table; no seed row can change it. It
  will always print `0 OF 6` for this (or any) not-yet-closed project.
- **`The record · N complete`** (`previous-work.tsx`, `count =
  sections.filter(s.state === 'settled').length`, from
  `lib/document/section-derivation.ts` `deriveSections()`) settles
  Brief/Discovery/Direction/Proposal **only when the project carries a real
  proposal lineage** (`project.proposal` via `projects.proposal_id`) — a
  manual/direct project row otherwise "ghosts" those four sections as
  `unrecorded` (never settled), and `project`/`install`/`care` can only be
  settled if the *active* section is later than them. The seven-section
  `ORDER` array therefore caps this project's real ceiling at **4**, not the
  specimen's fictional 12. To make it non-empty (per A-03) the seed creates a
  historical, already-**accepted and signed** lineage proposal
  (`…0005-000000001401`) and links `projects.proposal_id` to it — this
  project's actual, verified resulting string is **`The record · 4
  complete`**, not `12 COMPLETE`. Record this corrected string in any walk
  script that quotes the specimen's `12 COMPLETE`.

## Guards discovered and worked around

Several BEFORE INSERT/UPDATE/DELETE guard triggers on `projects` and
`proposals` (migrations 00390, 00399) enforce activation provenance and
edition immutability — none of which are documented in the task brief, and
all of which reject a naive delete-then-insert re-seed:

1. **`guard_project_completion_authority`** (00390) — `projects.proposal_id`
   may only be set at INSERT time, only as `postgres`, only while
   `app.proposal_activation_id` matches the target proposal's id, and only
   when that proposal is `'accepted'` with `project_id IS NULL` and matching
   designer/client. Its UPDATE branch has **no escape hatch at all** — once
   set, `proposal_id` can never change again, including via a cascading
   `ON DELETE SET NULL`. Worked around by inserting the lineage proposal
   first (`project_id NULL`), setting the activation GUC, inserting the
   project with `proposal_id` set directly, then back-filling
   `proposals.project_id` (see next point) — and by **never deleting the
   project row again** on a re-run (an `IF EXISTS … UPDATE` branch handles
   repeats).
2. **`guard_proposal_copy_immutability`** (00390) — mirrors the above from
   the proposal side (`project_id` may only move `NULL → non-NULL` once,
   under the same GUC + matching-project check), and separately forbids
   **deleting** any non-`'draft'` proposal outright. Both the lineage
   proposal and the pre-work doc `…d6` are therefore created **once** and
   never deleted on a re-run (`IF NOT EXISTS` guards around each).
3. **`guard_project_terminal_identity_integrity`** (00399) — fires on
   `UPDATE OF status, client_id, designer_id, proposal_id, …` (fires because
   the column is *named* in the `SET` clause, even when the value is
   unchanged) and, whenever `proposal_id IS NOT NULL`, requires
   `proposals.designer_client_id` to resolve to a `designer_clients` row
   whose designer/client match the proposal's own designer/client. The
   lineage proposal therefore carries `designer_client_id` explicitly.
4. **`guard_project_ffe_selection_integrity`** (00438) — an
   `assignment_scope='room'` FF&E line may never end up with a NULL
   `project_room_id` (as a naive `DELETE FROM project_rooms` would cause via
   `ON DELETE SET NULL`). `project_rooms` and `project_ffe_items` are
   therefore **upserted** (`INSERT … ON CONFLICT (id) DO UPDATE`), never
   deleted-then-reinserted. `assignment_scope='room'` must be set explicitly
   on every FF&E insert (its default is `'unassigned'`, which the same guard
   rejects the moment `project_room_id` is non-NULL).
5. **`guard_client_decision_option_authority`** (00399) — a cascading
   `DELETE FROM client_decisions` (which cascades to
   `client_decision_options`) is rejected unless the caller holds the RPC's
   own `app.client_decision_delete_cascade_id` session token. The 4
   decisions + 8 options are therefore created **once** and left alone on a
   re-run.
6. **`receiving_inspections.purchase_order_id`** is `ON DELETE RESTRICT`
   (not `SET NULL`/`CASCADE`) — a naive `DELETE FROM purchase_orders` after
   the first run (which has already logged inspections against those POs)
   would fail outright. `purchase_orders` is therefore **upserted**;
   `po_payments` and `receiving_inspections` remain delete-then-reinsert
   (safe — nothing else references them with `RESTRICT`), and because
   `purchase_orders.status` is reset to its scripted base value on every
   upsert, the `receiving_inspections` re-insert re-fires the same cascade
   every run, converging on an identical final state.

None of this is exotic to seed-writing in this repo generically — it is
specific to `projects`/`proposals`/`client_decisions`/`project_ffe_items`,
the four tables this program's authority-boundary migrations (00390/00398/
00399/00438) lock down hardest. Every other table in the script (vendors,
purchase orders, po_payments, receiving_inspections, comms, invoices,
phases, milestones) uses a plain upsert or delete-then-insert with no
special handling required.

## Run / verify

```
docker exec -i supabase_db_supabase psql -U postgres -d postgres < scripts/the-document-lens-seed.sql
docker exec -i supabase_db_supabase psql -U postgres -d postgres < artifacts/document-lens-build-2026-08-29/build/seed/seed-verify.sql
```

## Validation performed (per the task's "do not persist" instruction)

Run, unsandboxed, inside a transaction that always rolls back (`docker`
requires `dangerouslyDisableSandbox: true` — logged here as instructed):

```
( echo 'BEGIN;'; cat scripts/the-document-lens-seed.sql; cat scripts/the-document-lens-seed.sql; \
  cat artifacts/document-lens-build-2026-08-29/build/seed/seed-verify.sql; echo 'ROLLBACK;' ) \
  | docker exec -i supabase_db_supabase psql -U postgres -d postgres -v ON_ERROR_STOP=1
```

The seed body was run **twice** back-to-back inside the same transaction
before verifying (per the brief) — the status distribution and room/line/
product counts printed identically after each run. All 14 `seed-verify.sql`
checks print **PASS**. A separate, independent `BEGIN; <seed>; <verify>;
ROLLBACK;` run afterward reproduced the same 14 PASS lines. Nothing was
persisted — every invocation ended in `ROLLBACK`.

## Caveats

- **Budget figures** ($184,500 / $171,240 / $141,600 on `projects.budget_cents`
  / `committed_cents` / `actual_cents`) are set directly per
  reconciliation.md's numbers — they are not organically summed from the 62
  FF&E lines' `line_total_cents` (that reconciliation would require either
  hand-tuning ~62 line prices to an exact target sum or a second pass that
  recomputes them from the generated lines; out of scope for this pass).
- **`The record`** prints `4 complete`, not the specimen's `12 COMPLETE` —
  see the A-03 section above. Any walk/deck copy quoting `12 COMPLETE` for
  this seed should be corrected to `4 complete`.
- **`0 OF 6 CLOSED OUT`** is unconditional client state, not a seed-derived
  number — it will read that way regardless of any seed content.
- **Closing-the-book items** (a hypothetical `closeout_items`-style table)
  do not exist in this schema as of migration 00531 — "closing the book" is
  entirely the client-side checklist above, so no source rows were seeded
  for it (there is nothing to seed).
- Re-running the script against a **live** (non-reset) database leaves the 4
  client decisions', the lineage proposal's, and the pre-work doc's
  `now() - interval …` fields frozen at whatever they were on the run that
  first created them (see guard-driven "create-once" sections above) — a
  fresh `supabase db reset` always hits the create branch, so this only
  matters for a seed re-run against a database that was never reset since
  this project was last seeded.
- Vendors `Sturdy Oak Woodworks`, `Heritage Cabinetry Co`, `Coastal
  Millwork`, and `Fond du Lac Ironworks` are new rows (no pre-existing
  fixtures under those names) — `vendors.name` has no `UNIQUE` constraint,
  so idempotency is via fixed `id`s + `ON CONFLICT (id) DO UPDATE`, matching
  `supabase/seed/procurement_workspace_dev.sql`'s own approach for its
  vendor rows.
- Product linkage cycles through whichever rows already exist in `products`
  at seed time (queried at runtime via `array_agg(id)`, not hardcoded) — the
  brief's "21 local products" figure did not match what `supabase/seed/
  products.sql` actually seeds (12 rows) in this checkout; the script does
  not assume a fixed count.

---

## W0-fix — corrections applied 2026-08-29 (worktree `agent-lens-w0-fix`)

Five changes to `scripts/the-document-lens-seed.sql`, from the W0 correctness
and fidelity reviews. The script is now **applied for keeps** on the local
stack (see "For-keeps apply" below) — not rolled back.

### 1. `damage_claims` — the row the DAMAGED stamp actually reads (fidelity L2-5)

The seed set `project_ffe_items.blocked` and logged a `damaged`
`receiving_inspections` row, but wrote nothing to `damage_claims` — and
`deriveLineStamp` (`stamp-derivation.ts:97-108`) returns `'damaged'` **only**
from the item's `item_claims` embed (`damage_claims!ffe_item_id`,
`use-project-v2.ts:192`) in state `drafted`/`vendor_notified`. Nothing in the
database auto-drafts it: 00150's "auto-drafted" comment describes
`useCreateReceivingInspection`, an application hook, and 00184's
`receiving_inspection_side_effects()` touches only
`purchase_orders`/`po_payments`/item statuses. So the console would have
rendered as an ordinary delivered line once Wave 3 wired the real derivation.

Now inserted: id `b0000000-0000-0000-0005-00000c1a0901`, hung off `v_ri_fdl`,
`ffe_item_id` = the console (FF&E n=1), `state='drafted'`,
`vendor_notified_at NULL` (drafted, not filed), description carrying the same
`CURRENT_DATE + 1 day` carrier-claim window the line's `blocked_reason` prints.
The claim is DELETEd before the inspection on every re-run —
`damage_claims.receiving_inspection_id` is `ON DELETE RESTRICT`, the same
ordering 00151 documents for the app's own delete path.

`seed-verify.sql` gains **"open damage_claims on a line of this project = 1"**,
joined through `project_ffe_items`. The old `damaged = 1` check reads
`blocked = true AND status = 'delivered'` on `project_ffe_items` only, which
is exactly the false positive fidelity L2-5 named; it is kept (it still says
something true) but it is no longer the binding check.

### 2. `blocked = true` on the COM line (fidelity L2-6)

The `blocked` column was `(n = 1)` for every row, so the COM line (n=2) carried
`blocked_by_decision_id` with `blocked = false` — and `deriveLineStamp`'s
`'decision_due'` branch needs **both**. Now `(n IN (1, 2))`, with a
`blocked_reason` of its own ("Customer's own material — held for the client's
fabric decision."). `seed-verify.sql` gains **"blocked lines = 2 (console +
COM)"**. The margin split is unaffected — 00194's decision branch joins
`blocked_by_decision_id` directly, not the boolean — and still lands 3/4.

### 3. Install date exactly `now() + 21d` (fidelity L2-7/L2-8)

`v_install_date` was "next Tuesday on/after `CURRENT_DATE + 21`", which drifted
21–27d by run day (on 2026-08-29 it computed +24d) — and +27d rounds to four
weeks, not the reconciliation's "3 WEEKS". Now simply `CURRENT_DATE + 21`.
`seed-verify.sql` gains **"install milestone = current_date + 21"**, which
prints the actual date beside the expected one.

### 4. Local-dev guard (correctness L2-1)

Line 1 is now `LOCAL DEV ONLY — never run against Strata (or any other hosted
database).` and the "safe to re-run against a live DB" phrase is gone. Above
the main `DO $$` block there is now a real refusal, not just a warning:

- `auth.users` must hold `designer@patina.dev` — the local fixture, absent on
  any hosted project.
- `inet_server_addr()` must be NULL (the unix socket `docker exec … psql`
  uses) or inside `127.0.0.0/8`, `::1`, `10/8`, `172.16/12` or `192.168/16`.

Both proven, not assumed. Substituting a non-existent address for the fixture
email aborts the file at the first statement:

```
ERROR:  the-document-lens-seed: local dev only (designer@patina.dev fixture not found)
CONTEXT:  PL/pgSQL function inline_code_block line 6 at RAISE
```

and the address predicate was evaluated against a sample set — `127.0.0.1`,
`::1`, `172.17.0.3`, `10.1.2.3`, `192.168.1.9` all allowed; `52.1.2.3` and
`2600::1` both refused.

### 5. Idempotency + id families (correctness L2-3, L2-4)

**`po_payments.due_date` (L2-4).** `delivered_date` is now carried in the
`purchase_orders` upsert and reset to NULL on every run
(`delivered_date = EXCLUDED.delivered_date`). Trigger C only shifts a net-30
balance's `due_date` when `delivered_date` transitions **from NULL**
(00184's `v_delivered_was_null`), so a run-1 `delivered_date` left in place
made run 2 re-insert the payments with `due_date NULL` and never re-derive it.
Measured before/after in one transaction:

```
RUN1|CM-1187|balance|2026-09-24|pending|2026-08-25
RUN2|CM-1187|balance|2026-09-24|pending|2026-08-25     ← was NULL on run 2
RUN1|FDL-0912|balance|2026-09-22|pending|2026-08-23
RUN2|FDL-0912|balance|2026-09-22|pending|2026-08-23
```

Neither row's `state` moves off `pending`, so the `margin_items` "vendor
payment due" branch stays empty and the split stays 3/4.

**Id families (L2-3).** FF&E ids are minted `lpad(to_hex(2000 + n), 12, '0')`
= `0x7d1…0x80e`, so the decimal-looking decision constants `…0801`–`…0804`
were literally the ids of FF&E lines n=49…52 — `v_dec_com` was simultaneously
the id of FF&E line n=50 and the value of line n=2's `blocked_by_decision_id`.
The four decisions moved to the sub-prefix `dec`:
`b0000000-0000-0000-0005-00000dec0801`…`0804` (`dec` is a valid hex triplet;
`0xdec0801` is nowhere near the 2001–2062 band). The FF&E band was left alone
so no line id changes.

### Validation performed

All unsandboxed (`docker exec` requires `dangerouslyDisableSandbox: true`),
all against `supabase_db_supabase` on the local stack.

1. **Seed ×2 in one rollback transaction, verify after each, diffed.**
   ```
   ( echo 'BEGIN;'; <purge old-band decisions>; \
     cat scripts/the-document-lens-seed.sql; echo "SELECT '===RUN1==='"; cat …/seed-verify.sql; \
     cat scripts/the-document-lens-seed.sql; echo "SELECT '===RUN2==='"; cat …/seed-verify.sql; \
     echo 'ROLLBACK;' ) | docker exec -i supabase_db_supabase psql -U postgres -d postgres -q -v ON_ERROR_STOP=1
   ```
   17/17 PASS after each run; `diff` of the two verify tables → **identical**.
2. **Two independent `BEGIN; <seed>; <verify>; ROLLBACK;` transactions**, so the
   proof is not confined to one frozen `now()` (correctness L2-5's criticism of
   the original single-transaction harness). 17 rows each, `diff` → identical.
3. **`po_payments` probe** (above), run 1 vs run 2 in one transaction.
4. **Guard probes** (above).

### For-keeps apply (2026-08-29)

The local DB held run-1 data from the integration lane, including the four
decisions at the OLD colliding id band. Because `client_decisions` is
create-once under `guard_client_decision_option_authority`, the old rows had to
go first or the project would have carried 8 decisions. One-off, outside the
seed (these rows exist only because an earlier run of this same script used the
colliding band; as `postgres` the guard's `v_maintenance` branch permits the
delete when the options go before the parent):

```sql
DELETE FROM public.client_decision_options WHERE decision_id IN (…0801,…0802,…0803,…0804);  -- DELETE 6
DELETE FROM public.client_decisions        WHERE id          IN (…0801,…0802,…0803,…0804);  -- DELETE 4
```

Then, for keeps:

```
docker exec -i supabase_db_supabase psql -U postgres -d postgres -v ON_ERROR_STOP=1 < scripts/the-document-lens-seed.sql
docker exec -i supabase_db_supabase psql -U postgres -d postgres -v ON_ERROR_STOP=1 < artifacts/document-lens-build-2026-08-29/build/seed/seed-verify.sql
```

Status distribution and counts unchanged from the table above
(approved 11 · delivered 3 · installed 10 · ordered 2 · production 2 ·
quoted 11 · shipped 10 · specified 13; rooms 5 / lines 62 / with product 58).

**Verify table after the for-keeps apply — 17/17 PASS:**

```
                       check_name                       |   actual   |  expected  | result
--------------------------------------------------------+------------+------------+--------
 a non-clean receiving_inspections row exists           | 1          | >= 1       | PASS
 a separate PO reaches clean-delivered >= 1             | 1          | >= 1       | PASS
 blocked lines = 2 (console + COM)                      | 2          | = 2        | PASS
 damaged = 1                                            | 1          | = 1        | PASS
 install milestone = current_date + 21                  | 2026-09-19 | 2026-09-19 | PASS
 lines >= 60                                            | 62         | >= 60      | PASS
 lines with product >= 40                               | 58         | >= 40      | PASS
 margin_items beside Pieces (anchor=line) = 3           | 3          | = 3        | PASS
 margin_items total = 7                                 | 7          | = 7        | PASS
 margin_items whole job (anchor=letterhead/section) = 4 | 4          | = 4        | PASS
 open damage_claims on a line of this project = 1       | 1          | = 1        | PASS
 overdue approvals = 2                                  | 2          | = 2        | PASS
 PO unacknowledged >= 14d = 1                           | 1          | = 1        | PASS
 pre-work doc d6 exists (sent, unopened)                | 1          | = 1        | PASS
 purchase orders >= 3                                   | 4          | >= 3       | PASS
 rooms >= 4                                             | 5          | >= 4       | PASS
 unspecified = 2                                        | 2          | = 2        | PASS
(17 rows)
```

### One environment caveat worth knowing (new)

The first for-keeps verify read `margin_items total = 8` / `whole job = 5`. The
extra row was **not** the seed's: an idle `project_time_entries` row on this
project (`source='timer_auto'`, `raw_seconds = idle_seconds = 1082`, created
17:48 and last touched 18:06) from a document left open in a browser. The
seed deliberately creates no time entries, and the view's `time` branch picks
up any that exist. Removed (`delete … where source='timer_auto' and
raw_seconds = idle_seconds`), after which the table reads 7/3/4 as above. If a
future verify shows total 8 with a `time · <date>` row, that is ambient timer
noise, not a seed regression.

### Re-run reminder (correctness L2-6)

`scripts/the-document-lens-seed.sql` is NOT registered in
`supabase/config.toml [db.seed] sql_paths` (matching ten sibling
`scripts/*.sql`), so **every `pnpm supabase:reset` drops this project**. Any
W1+ walk lane must re-run the seed after a reset, or it will find an empty
spread.
