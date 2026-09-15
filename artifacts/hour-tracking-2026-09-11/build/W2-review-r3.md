# W2 — lane A (DB) adversarial review, round 3

**clean = false** — one **BLOCKER** and one **MAJOR**, both in the function round 2's fix pass added
(`stamp_project_pricing_studio`, `00606` section 4). Round 2's two MAJORs are discharged as named on the
surfaces they were written against — measured, not quoted — but the repair shipped for **W2-R2-02** is itself
the attack surface: its ARM 2 standing **is** manufacturable (round 2's B1 predicate, made permanent), and its
ARM 1 standing lets a member move her own resolved rate to a number she set. Everything else is minor or
"note — ruling owed" per the brief's severity discipline.

**Scope reviewed.** `origin/hour-tracking/integration..hour-tracking/server` = three commits, `c71db49d9`
(W2 lane A) + `9f80b0c09` (round 1's B1 fix) + `3d36ffb6e` (round 2's fix pass). Every line of `00604`–`00607`,
the hook diff, the re-registered contract row, the regenerated seed and types, the five test files,
`W2-impl.md`, `W2-review-r2.md`, `W2-fix-r2.md`. Lane B (scope lens, `hours-ledger.tsx`, HT-35 band/opt-out,
Desk card, `desk-doorway.tsx`, copy deck, Sanity article, `hours-ledger-scope.test.tsx`,
`e2e/document/hours.spec.ts`) is phase 2; its absence is not counted.

---

## Gates re-run by the reviewer (not quoted from the implementer)

All on this program's isolated stack — API 54421, Postgres `127.0.0.1:54422`, `project_id "patina-hours"`.
The shared 54321/54322 stack was never touched. No prod anything; nothing was pushed to Strata.

| Command | Result |
|---|---|
| `supabase db reset --workdir …/agent-server` | **clean** — `Finished supabase db reset on branch main.`; `00604`–`00607` replayed, every `DO $postcondition$` passed (incl. 00606's six new ones and 00607's (g)) |
| `run-sql-tests.sh -d …/agent-server/supabase/tests/billing -H 127.0.0.1 -p 54422` | **7 green / 7**, 0 unexpected-fail |
| `run-sql-tests.sh -d …/agent-server/supabase/tests/commercial -H 127.0.0.1 -p 54422` | **10 green / 16, 6 unexpected as the brief invokes it** — the identical W1/r1/r2 baseline, all six aborting in `_countersign_design_services_agreement_impl` (`design services agreement … not found or access denied`). Re-run from the worktree with `-k supabase/tests/KNOWN_FAILURES.md` → **16 / 16, 0 unexpected** |
| `run-sql-tests.sh -d …/agent-server/supabase/tests/rls -f time_entry -H 127.0.0.1 -p 54422` | **3 green / 3** (`time_entry_admin_write_test`, `time_entry_auto_roster_test`, `time_entry_studio_stamp_test`) |
| `run-sql-tests.sh -d …/agent-server/supabase/tests/rls -f hours -H 127.0.0.1 -p 54422` | **2 green / 2** (`project_hours_total_test`, `studio_hours_rollup_test`) |
| `pnpm --dir …/agent-server --filter @patina/supabase type-check` | clean (`tsc --noEmit`, no output) |
| `pnpm --dir …/agent-server --filter @patina/designer-portal type-check` | clean |
| `pnpm --dir …/agent-server --filter @patina/admin-portal build` | **succeeds** (the repo's strictest gate; route table printed) |

Run beyond the brief's list, because the new function is cross-cutting:

| Command | Result |
|---|---|
| whole `tests/rls` with `-k supabase/tests/KNOWN_FAILURES.md` | **28 green + 2 documented = 30 / 30**, 0 unexpected |
| `tests/edge_api -f public_rpc_authorization_contract` | **RED** at `:171` (`00511 must not auto-derive a studio for a non-designer lead`) — W1's, carried as **W2-R2-10**; still absent from `supabase/tests/KNOWN_FAILURES.md` |
| `python3 scripts/generate-legacy-grants.py` then `git diff --exit-code supabase/seed/00-legacy-grants.sql` | **CLEAN** after regeneration (baseline + 2623 replayed statements) |
| `SUPABASE_DB_URL=…54422 pnpm db:generate` then `git diff --exit-code packages/supabase/src/database.types.ts` | **CLEAN** after regeneration |
| commit hygiene — `git show --stat` ×3, `git status --porcelain`, `git ls-files -v \| grep '^S'` | 13 + 3 + 7 files, all intended; working tree clean; `supabase/config.toml` skip-worktree'd and in none of the three commits; `origin/hour-tracking/server == HEAD` (`3d36ffb6e`) |

## Program-rule sweep (each checked against the diff and the live DB)

- **no flag** — `grep -iE 'feature_flag|useFeatureFlag|posthog|ComingSoon'` over the added lines of the whole diff: nothing.
- **no backfill** — no top-level `UPDATE`/`INSERT`/`DELETE` against `project_time_entries` in any of the four files; `ADD COLUMN IF NOT EXISTS updated_by` lands NULL. 00606's new function writes `projects.studio_id` **only when a caller asks**, one project at a time — not a backfill.
- **additive only** — one nullable column, no type change, no NOT NULL, no default.
- **client-supplied rate** — W2 adds no rate-writing path; the classifier still overwrites (measured again in probe A: a fresh hour came back `99900 / studio_member / 99900` from the server's resolver).
- **invoiced lock untouched** — `guard_invoiced_time_entry` present in `pg_trigger`; no file re-creates or routes around it; case (g) of the admin-write suite green.
- **running-timer slot** — zero `CREATE INDEX`/`DROP INDEX` in the diff; `uniq_project_time_entries_running_timer ON project_time_entries(user_id) WHERE duration_minutes IS NULL` verbatim in `pg_indexes`; both new aggregates exclude running rows.
- **notes never in a rollup return** — measured on the TYPE: `studio_hours_rollup(…) → TABLE(bucket_key text, bucket_label text, member_id uuid, member_name text, entry_count integer, total_minutes integer, billable_minutes integer, billable_cents bigint, internal_minutes integer)`; `project_hours_total(uuid) → TABLE(minutes integer, billable_minutes integer, amount_cents bigint)`; `information_schema` shows no `%note%` column on `time_entry_ledger`.
- **DEFINER contract (§0.16)** — `stamp_project_pricing_studio` is DEFINER with `search_path=public, pg_temp`, `anon` has no EXECUTE (`has_function_privilege` = f), `authenticated` does; `project_pricing_studio_id` and `project_hours_total` likewise; `audit_time_entry_change` REVOKEd from PUBLIC/anon/authenticated/service_role; `studio_hours_rollup` is INVOKER (`prosecdef = f`, HT-38). Two standing deviations: no caller assert on `project_pricing_studio_id` (**W2-R2-07**), no pinned `search_path` on `stamp_time_entry_updated_by` (**W2-R2-18**, re-measured `proconfig = NULL`).
- **no RLS policy keyed on `projects.studio_id`** — the three new policies key on `is_org_admin_or_owner(project_pricing_studio_id(project_id))`; live `pg_policy` confirms. Fail-closed direction re-measured inside 00605's impersonated assert.
- **00484 quartet** — live quals: delete/update/insert `((user_id = auth.uid()) AND is_project_team_member(project_id))` byte-identical to 00484's registration; `Team can view their project time entries` carries the same shape now (HT-10-a's ruled narrowing); all four names, commands, role sets, permissive flags intact.
- **signatures at the plan's numbers** — `00604`–`00607`, `studio_hours_rollup`'s identity arguments asserted argument-for-argument, policy names `time_entries_owner_admin_{read,update,delete}` present, `time_entries_studio_read` kept by name and narrowed.

## Discharge of round 2

| Round-2 finding | Status |
|---|---|
| **W2-R2-01 · MAJOR** (`project_hours_total`'s third leg self-grantable) | **DISCHARGED as named, measured.** `00607:210` now reads `is_org_admin_or_owner(public.project_pricing_studio_id(p_project_id))`; postcondition (g) pins it. Fresh fixture, project NAMES its studio: attacker refused `42501` before, writes the consent-free seat (`INSERT 0 1`), still reads **0** rows, still refused `42501`, pricing studio unmoved. Shipped case (i) green. **But the same deleted predicate now lives in the new stamp's ARM 2, where it is manufacturable — W2-R3-01.** |
| **W2-R2-02 · MAJOR** (the promised repair did not exist) | **ADDRESSED, and it introduces two new findings.** The absence is re-measured (a studio owner's plain `UPDATE projects SET studio_id` still raises `studio_id_not_designer_studio`); `stamp_project_pricing_studio` exists, is DEFINER, granted correctly, and both arms work (measured: ARM 1 in probe A, ARM 2 in probe B). **W2-R3-01** (ARM 2 manufacturable) and **W2-R3-02** (ARM 1 self-pricing) are the cost. |
| W2-R2-03 · W2-R2-04 (ruling owed) | Untouched by design; re-read and still live. **W2-R3-01 extends W2-R2-04 from a revocable vector to a permanent one.** |
| W2-R2-05 … W2-R2-19 (MINOR / NOTE) | Untouched by design. Each re-checked below; none has changed severity. |

---

## Findings

### W2-R3-01 · BLOCKER · confidence HIGH (measured end to end)
**ARM 2 of `stamp_project_pricing_studio` is manufacturable. `reassign_project_lead` (00399:301, GRANTed to
`authenticated` at 00399:510) lets any designer put somebody else's designer in the lead of her own project —
so three authenticated statements permanently move an unstamped project's pricing studio into an outsider's
org, and the real studio's owner can never take it back.**

*Location:* `supabase/migrations/00606_time_entries_studio_read_narrow.sql:183-189` (ARM 2's justification —
*"An attacker cannot manufacture that: `set_project_studio_id`'s authenticated-INSERT arm requires
NEW.designer_id = auth.uid(), so nobody can create a project led by somebody else"*) and `:232-249` (the
standing test), with the same claim in `W2-fix-r2.md` §W2-R2-02 and in the function's `COMMENT`.

*Why the claim is false:* nobody has to **create** such a project. `reassign_project_lead(p_project_id,
p_expected_designer_id, p_new_designer_id)` is SECURITY DEFINER, granted to `authenticated`, and admits *"the
current lead or an exact-studio owner/admin"* with an `is_designer` target. Its only other bounds are that the
project's `studio_id` is non-NULL and that **both** the old and the new lead hold an `active`, non-`guest` seat
in that studio — and the attacker writes the victim designer's seat herself, consent-free, through the
00484-registered `Org owners can insert members` (`WITH CHECK (is_org_admin_or_owner(organization_id) AND role
<> 'owner')`, `status` DEFAULT `'active'`). The same seat simultaneously makes the victim's employer tier
ambiguous, which is what satisfies the stamp's own bound (c) (`project_pricing_studio_id … IS NOT NULL`
refuses).

*Measured (this program's stack, fresh fixture, every attack step through RLS as the attacker; the only
postgres-written state is the ordinary pre-existing world — two real studios, one legacy unstamped project,
and one ordinary client project of the attacker's own):*

```
BASELINE   victim project P_V: designer D, studio_id COLUMN = NULL, pricing studio = a1 (Leah's studio,
           employer tier = 1); D's hour: 120 min billable, 25000 / studio_member / 50000
Leah BEFORE (owner of a1):     rows = 1     project_hours_total = 120 / 50000        ← HT-10's read, working

as the ATTACKER (an ordinary designer who owns her own studio a2 and has one client project in it):
 step 1  INSERT INTO organization_members (user_id D, organization_id a2, role 'member')   -- consent-free
         → pricing studio of P_V is now NULL            (her seat made the employer tier ambiguous)
 step 2  SELECT reassign_project_lead(<her own project>, <herself>, D)      → SUCCEEDED
         → a2 now holds "another project led by that designer" = ARM 2's standing
 step 3  SELECT stamp_project_pricing_studio(P_V, a2)                       → SUCCEEDED

AFTER      projects.studio_id of P_V = a2      project_pricing_studio_id(P_V) = a2      (PERMANENT)
ATTACKER:  rows = 1 · notes = "the real studio's confidential note" · hourly_rate_cents = 25000
           project_hours_total = 120 / 50000 · time_entry_ledger rows = 1 · studio_hours_rollup buckets = 1
           UPDATE of the victim studio's hour = 1 row      DELETE = 1 row
LEAH:      rows = 0 · project_hours_total → refused 42501
           re-stamp → REFUSED "only this project's designer, or an owner/admin of a studio that already
           holds one of her projects, may name its studio"   (and set_project_studio_id freezes the column)
```

*Why blocker:* it contradicts **HT-3-a** in force (*"the studio that prices an hour is derived from the
PROJECT only"* — here a third party chooses it), **HT-3-b**'s operative sentence (*"a member can only push the
outcome toward 'none', never toward a number she set"*), **HT-10** (the owner's studio read, now permanently
removed from her), and §0.12's spirit (billing evidence deleted by an unrelated party). It is round 1's
**B1** — the program's only previous blocker — restored and made **irreversible**, in the very function written
to discharge round 2. It needs no new ruling: the orchestrator already chose that this predicate must not be
self-grantable. The attacker's prerequisites are the ordinary state of a Patina designer: an org she
owns/admins (00295 auto-provisions one at her designer grant) and one project of her own with a client and a
`designer_clients` row (every activated proposal leaves one).

*Exact fix — pick one, and add the measurement above as a case in
`supabase/tests/rls/time_entry_studio_stamp_test.sql`:*

1. **Drop ARM 2** (`00606:234-243`): the stamp's standing becomes `v_designer_id = v_actor` only. The designer
   is the one standing an attacker cannot manufacture (00563 freezes `projects.designer_id` on UPDATE and
   `reassign_project_lead` cannot change it without the studio already being non-NULL). This leaves HT-3-a's
   *"the owner fixes 'none'"* unimplemented → file that as a ruling owed, with a request/accept door as the
   durable answer (HT-3-b arm (c)'s consent door is the same device). Note this does **not** fix
   **W2-R3-02**.
2. **Keep ARM 2 but key it on something the attacker cannot author** — require the sibling project to have
   been created by the designer herself: `AND sibling.created_by = v_designer_id`. `projects.created_by` is
   frozen on UPDATE by `set_project_studio_id` (`NEW.created_by IS DISTINCT FROM OLD.created_by → RAISE`), a
   direct authenticated INSERT may only set it to the actor, and `reassign_project_lead` does not touch it, so
   the attacker cannot produce such a sibling. The shipped case (g) fixture must change (its sibling's
   `created_by` is the owner, not the designer), which is the fixture being artificial rather than the rule
   being wrong.
3. **Land HT-3-b arm (c)'s consent door first** and let the stamp require a consented seat. Largest, and the
   only one that also closes **W2-R2-04**.

### W2-R3-02 · MAJOR · confidence HIGH (measured)
**ARM 1 lets a member move her own resolved rate to a number she set: a designer with two employer seats
stamps her own auto-provisioned workspace onto her ambiguous legacy project, and from that moment her hours
price at the rate she wrote for herself instead of either employer's rate.**

*Location:* `00606:177-182` (ARM 1) + `:232-233` (`v_designer_id = v_actor`) + `:273-288` (bound (d), which
accepts any `active`, non-`guest` seat — `role = 'owner'` included).

*Measured (every write through RLS as the actor; no attacker, no manoeuvre, and the workspace is the one
00295 provisions for every designer who gets her role before her first seat):*

```
the hire: designer role first (00295 provisions her workspace W, she is its OWNER), then seated as a plain
'member' in two employer studios a1 (Leah, rate 20000) and a3 (rate 21000) ⇒ employer tier AMBIGUOUS
as her:  INSERT INTO studio_member_rates (W, herself, 99900, …)          -- allowed: she is W's owner
         hour ONE on her legacy project  → rate_source 'none', no rate         (HT-3-a step 3)
         SELECT stamp_project_pricing_studio(<that project>, W)          → SUCCEEDED   (ARM 1)
         hour TWO, same project          → hourly_rate_cents 99900 · studio_member · rated 99900
         she now also reads the colleague's private note, gets the 210 / 99900 project total, and her
         UPDATE of the colleague's hour succeeds
Leah (the employer whose client it was): rows = 0 · project_hours_total → refused 42501
```

*Why major:* the brief's own second clause — it lets a member move her own resolved rate to a number she set —
and it is the precise failure HT-3-b's design sentence exists to forbid. It is **not** a backfill problem
(hour one stays `'none'`, P-4 intact); it is the forward rate that moves. HT-3-a assigns the repair to *the
owner* (*"The owner fixes 'none' by stamping `projects.studio_id`"*), not to the member being priced, and
`W2-fix-r2.md` itself flags the sentence as *"now inexact"*.

*Exact fix (either, plus a per-role case in the stamp suite):*
(a) narrow ARM 1's acceptable `p_studio_id` to a studio where the designer's own seat is an **employer** seat
(`designer_seat.role NOT IN ('owner','admin')`) — i.e. a studio whose `studio_member_rates` she does not
control — and let the genuine sole proprietor reach her own studio only through ARM 2 / an owner act;
(b) if the orchestrator reads **HT-3-c arm (a)** (*"a project whose designer NAMED its studio_id at creation
prices from that studio, even when the designer owns it"*) as covering the same act performed **after**
creation, then this is ruled behaviour and downgrades to a note — but say so explicitly, because as shipped the
member both picks the studio and sets the price, and HT-3-c's stated mitigation (*"W2's composer and the studio
settings page are where a suspicious `studio_member_rates` row is seen"*) does not hold here either: after the
stamp **no** employer can see the project, the hour or the rate (measured above).

### W2-R3-03 · MINOR · confidence HIGH (code)
**The stamp is an irreversible, money-moving act and it leaves no trace** — no `audit_logs` row, in the same
wave that audits every time-entry UPDATE and DELETE (`00605:136-196`). `00606:290-295` writes the column and
returns. After the write the project's whole hour ledger, its `project_unbilled_time`, its invoice composer and
(per `00605:162`) the `organization_id` of every future audit row follow the new studio, and nothing records
who moved it or when. *Fix:* insert one `audit_logs` row inside the function (`action
'project.pricing_studio_stamped'`, `resource_type 'project'`, `organization_id = p_studio_id`, old/new values)
— the function is already DEFINER, so the no-INSERT-policy problem §0.18 describes does not arise.

### W2-R3-04 · MINOR · confidence HIGH (code)
**00606's banner now contradicts itself, and plan §3's risk-5 revertability claim no longer holds.**
`00606:97-98` still reads *"THIS IS THE ONLY CHANGE IN THIS MIGRATION (risk 5 of plan-v2 §12): it reverts
without touching the ledger view, the rollup or the lens"*, eleven lines above section (4), which adds a public
RPC, two grants, a COMMENT and six postconditions — and `:100-101` says so. Reverting 00606 to restore the old
reads would now also delete the repair path that **W2-R2-02** required. *Fix:* correct the sentence (the
policy narrowing alone is revertable; the stamp is not part of that revert), or move the function to its own
number from W3's reserved range and say which side moved.

### W2-R3-05 · MINOR · confidence MEDIUM (code)
**The stamp reports success it may not have achieved.** `00606:290-295`: `UPDATE public.projects SET studio_id
= p_studio_id WHERE id = p_project_id AND studio_id IS NULL; RETURN p_studio_id;` — the row count is never
read, so under a concurrent stamp (or any path that filled the column between bound (b) and the UPDATE) the
function returns `p_studio_id` while the column holds another studio, and the caller — a future lane-B button —
will report the wrong studio to the owner. `W2-fix-r2.md` states the lost update is "a no-op rather than a
wrong write", which is true of the row and false of the return value. *Fix:* `UPDATE … RETURNING studio_id INTO
v_written;` and return `v_written`, raising or returning the existing studio when `v_written IS NULL`.

### W2-R3-06 · note — ruling owed · confidence HIGH (code, from the same fixture shape as probe A)
**Where two real studios both satisfy ARM 2, the books go to whoever stamps first, silently.** A designer who
leads projects in two studios she genuinely belongs to leaves an ambiguous tier; each studio's owner/admin then
holds ARM 2 standing on her unstamped legacy projects, there is no tie-break, no notice to the other studio,
and the first write is final (bound (b)). *Question for Kody:* is first-stamp-wins acceptable for a legitimate
two-studio designer, or does the stamp need the designer's own confirmation (the same consent door HT-3-b arm
(c) would add)? No code change until ruled.

### Carried unchanged from round 2 — each re-checked this round

| id | Severity · confidence | State this round |
|---|---|---|
| **W2-R2-03** | note — ruling owed · HIGH | Live. Untouched by the fix pass; the stamp cannot give Leah the read (the hire's project is **stamped**, and bound (b) makes that final). **W2-R3-02** is the same question seen from the rate side. |
| **W2-R2-04** | note — ruling owed · HIGH | Live, and **widened by W2-R3-01** from a revocable vector (remove the seat, lose the access) to a permanent one (stamp, and the column never moves again). Rule it together with **W2-R3-01**. |
| **W2-R2-05** | MINOR · HIGH | Live; `fetchTimeSummary` (`use-time-tracking.ts:263-279`), `useSectionLoggedMinutes`, `usePhaseActualMinutes` untouched by this pass (confirmed against the diff). A rostered member still sees a per-phase under-count. |
| **W2-R2-06** | MINOR · HIGH | Live; `project_pricing_studio_id` is still a per-row plpgsql DEFINER call inside three RLS policies and the ledger view. No `limit` default added to `useTimeEntryLedger`. |
| **W2-R2-07** | MINOR · HIGH | Live; `00604:84-158` still has no caller assert, and the function is now called from a fourth place (the stamp's bound (c)). |
| **W2-R2-08** | MINOR · HIGH (re-measured) | Live. As the author, a plain member: `INSERT … (updated_by) VALUES (<the studio owner's id>)` succeeded and the never-edited row reads `updated_by = <the owner>`. `updated_by` is in neither of the guard's two lists (§0.8). |
| **W2-R2-09** | MINOR · HIGH (re-measured) | Live. One ordinary self-edit by a plain member wrote **1** full `old_values`/`new_values` audit row; the trigger still has no `WHEN`. |
| **W2-R2-10** | MINOR · HIGH (re-measured) | Live. `tests/edge_api/public_rpc_authorization_contract_test.sql` aborts at `:171`; the re-registered VALUES row at `:548` is still never reached; the file is still absent from `supabase/tests/KNOWN_FAILURES.md` and from the program's gate list. |
| **W2-R2-11** | MINOR · HIGH (verified) | Live. `apps/designer-portal/src/lib/react-query.ts:309` still defines `studioReport` for the deleted hook. |
| **W2-R2-12** | NOTE · HIGH | Live. `00604:256-257`'s second profiles assert is still a tautology. |
| **W2-R2-13** | note — ruling owed · HIGH | Live. An owner/admin may still rewrite an invoiced entry's `notes` (that is `guard_invoiced_time_entry`'s own design; §0.12 forbids touching it on a guess). |
| **W2-R2-14** | note — ruling owed · HIGH | Live. An audit row with `organization_id = NULL` is readable only by its actor. |
| **W2-R2-15** | NOTE · HIGH | Live. `00604:204` still coalesces a missing rate to `0`. |
| **W2-R2-16** | NOTE · HIGH | Live. `internal_minutes`' `project_id IS NULL` leg is still dead behind `WHERE ledger.studio_id = p_studio_id`, and 00607's "W4 needs no edit here" sentence is still there. |
| **W2-R2-17** | NOTE · HIGH | Live. `TimeEntryLedgerRow.project_id` / `user_id` are still non-nullable. |
| **W2-R2-18** | NOTE · MEDIUM (re-measured) | Live. `stamp_time_entry_updated_by` has `proconfig = NULL`; both functions added this round do pin `search_path`. |
| **W2-R2-19 / `W2-impl.md` finding 1** | note — ruling owed · HIGH | Live and still W1's: `00602`/`00603` stamp a studio for a non-designer lead, which the shipped contract test forbids at `:171`. |

---

## Done-when, probed independently (not read off the tests)

- *"Opening a project's lens as the owner shows that house's hours with every member named"* — measured: the
  owner of the pricing studio read her designer's row and `project_hours_total` = `120 / 50000` on a project
  her studio prices (probe B baseline). **But** on an unstamped project she reads 0 until somebody stamps it,
  and the stamp's standing is **W2-R3-01**/**02**.
- *"A plain `member` sees no lens and, after 00606, no studio-mate's row on a non-rostered project"* — the
  narrowed quals are live in `pg_policy` (both SELECT policies carry `user_id = auth.uid()`), and the shipped
  per-role suites that assert it are green.
- *"An admin adjust writes one `audit_logs` row carrying `old_values` and `new_values`; `updated_by` is the
  admin"* — green in `time_entry_admin_write_test.sql`; `updated_by` is nevertheless forgeable on INSERT
  (**W2-R2-08**).
- *"`\d+ studio_hours_rollup` shows no `notes`"* — confirmed on the TYPE (above), for both functions and the
  view.
- The `/desk?sheet=hours` door, the copy deck and the Sanity article are lane B — not reviewed.

## What I did not verify

- **Lane B, entirely** — phase 2, by scope, not a finding.
- `pnpm --filter @patina/designer-portal test` / `lint` and the `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`
  e2e line — outside the brief's gate list and lane-B-shaped. I did confirm by grep that nothing outside the
  deleted hook references `useStudioTimeReport` / `StudioTimeReport` / `StudioProjectRollup` /
  `StudioTimeEntry`.
- **No prod anything.** Nothing was pushed to Strata; every command ran against 54422. W1's constraint stands
  (W1 must not reach Strata ahead of 00606). **Nobody has yet counted the Strata population of
  `projects.studio_id IS NULL`** — that is the exact population **W2-R3-01**, **W2-R3-02**, **W2-R2-02** and
  **W2-R2-04** all turn on, and it should be one read-only count before any deploy decision.
- **Concurrency and volume.** No two-simultaneous-stamp test (the basis of **W2-R3-05** is the code, not a
  race I ran); no performance re-measurement of **W2-R2-06** this round.
- I staged and committed nothing; `supabase/config.toml` remains skip-worktree'd and untouched.
