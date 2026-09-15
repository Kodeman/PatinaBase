# W0 — implementation report (lane A, `hour-tracking/server`)

**Worktree** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`
**Branch** `hour-tracking/server`, cut from `origin/main @ 2ff00bb2b` (migration head `00591`)
**Commits** `343252aaa` · `01372b0dd` · `c6b8fa763` · `ef8fe776f`
**Plan** `artifacts/hour-tracking-2026-09-11/build/plan-v2.md` §0 + §1 + §9 + §10

> **Renumbered 2026-09-11, review round 1 (W0-1).** This report was written against migration numbers
> `00592–00594`. Those three numbers were already taken by a concurrent, committed program —
> people-room CRM, branch `build/people-room-crm-2026-09-11`, commit `1970075c2`, cut from the same
> head `00591` the same day. Hour-tracking is the side that ships last, so hour-tracking moved:
> **`00592 → 00595`, `00593 → 00596`, `00594 → 00597`**, and plan-v2's whole reserved range shifted
> with it (`00595–00617` → `00598–00620`). Every number in this report — including the quoted ledger
> output, which a post-renumber `db reset` reproduces — has been rewritten to the new numbers. The
> same round recorded the governance-ledger collision: this program's decision entry moved
> `R151 → R152` and its VISION entry `V10 → V11`.

Everything plan-v2 assigns to W0 landed. Nothing from a later wave was built. Two items are owed,
both named below with the reason (`VISION.md` is untracked in git; one pre-existing field SQL test
fails for an unrelated reason).

---

## 1 · Migrations (at the plan's assigned numbers)

### `supabase/migrations/00592_time_entry_claim_and_source.sql` — HT-5 + the source vocabulary

```sql
CREATE OR REPLACE FUNCTION public.claim_time_entries(
  p_invoice_id uuid,
  p_entry_ids  uuid[]
) RETURNS SETOF uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  UPDATE public.project_time_entries
     SET invoice_id = p_invoice_id
   WHERE id = ANY(p_entry_ids)
     AND invoice_id IS NULL
     AND billable
     AND (billing_state = 'authorized' OR billing_state IS NULL)
  RETURNING id;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_time_entries(uuid, uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.claim_time_entries(uuid, uuid[]) TO authenticated;
```

Signature verbatim from the plan. `project_time_entries_source_ck` widened **by name** (00545 named
it) from four values to nine — `timer_auto, timer_manual, manual_entry, field_visit, command_bar,
field_manual, internal, widget, intent` — with 00545's conkey-anchored postcondition extended to all
nine, and the column COMMENT rewritten to say which of the new values have writers and which two are
reserved.

Probe:

```
CHECK ((source = ANY (ARRAY['timer_auto'::text, 'timer_manual'::text, 'manual_entry'::text,
  'field_visit'::text, 'command_bar'::text, 'field_manual'::text, 'internal'::text,
  'widget'::text, 'intent'::text])))
```

### `supabase/migrations/00593_project_unbilled_time_repair.sql` — HT-6

`public.project_unbilled_time` redefined, name and column list/order/types unchanged (three callers
and a SQL test read it), grafted from the `00412:2671-2688` body — the `grep | sort | tail -1` winner
(`00177` → `00412`, no later redefinition). Two changes and nothing else:

- `JOIN public.profiles` → `LEFT JOIN public.profiles` (the `00555:3024-3026` row-dropping hazard
  under `security_invoker = true`).
- one rate source: `resolved_rate_cents = COALESCE(te.hourly_rate_cents, 0)` and `amount_cents =
  COALESCE(te.rated_amount_cents, round(duration/60 × COALESCE(te.hourly_rate_cents,0)))`. The
  `change_order_terms` and `profiles.default_hourly_rate_cents` legs are gone **as rate legs**; the
  `profiles` column is NOT dropped (HT-2 unruled, plan-v2 §2).

The file carries a `pg_get_viewdef` postcondition that raises if either legacy leg reappears or the
profiles join is not a LEFT JOIN.

### `supabase/migrations/00594_time_entry_auto_roster.sql` — HT-25

```sql
CREATE OR REPLACE FUNCTION public.time_entry_auto_roster()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp AS $$ … $$;
REVOKE ALL ON FUNCTION public.time_entry_auto_roster()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER aaa0_time_entry_auto_roster_trg
BEFORE INSERT ON public.project_time_entries
FOR EACH ROW EXECUTE FUNCTION public.time_entry_auto_roster();
```

Seats `role = 'support_designer'`, `assigned_by = NEW.user_id`, when `NEW.project_id IS NOT NULL` and
the logger holds no `project_team_members` row with `removed_at IS NULL`.

**Trigger-order probe after reset — CORRECTED in review round 2 (finding n9).** The paragraph
originally printed here listed five triggers as the BEFORE-INSERT set. Two of them are not
BEFORE INSERT at all. Re-measured against `pg_trigger` on the isolated stack
(`tgtype & 2` = BEFORE, `tgtype & 4` = INSERT, `tgtype & 16` = UPDATE):

| trigger | timing | events | function |
|---|---|---|---|
| `aaa0_time_entry_auto_roster_trg` | BEFORE | INSERT | `time_entry_auto_roster` |
| `aaa_guard_time_entry_invoice_insert_trg` | BEFORE | INSERT | `guard_commercial_time_entry_derived_fields` |
| `aab_guard_commercial_time_entry_derived_fields_trg` | BEFORE | **UPDATE only** | `guard_commercial_time_entry_derived_fields` |
| `aac_classify_project_time_entry_authority_trg` | BEFORE | INSERT + UPDATE | `classify_project_time_entry_authority` |
| `aad_guard_time_entry_invoice_authority_trg` | BEFORE | **UPDATE of `invoice_id` only** | `guard_time_entry_invoice_authority` |

So the BEFORE-INSERT set is exactly three: `aaa0_`, `aaa_guard_time_entry_invoice_insert_trg`,
`aac_classify_…`. **The conclusion is unchanged** — `aaa0_` sorts first and therefore fires ahead
of the classifier — and it was verified by effect as well as by name: a member seated by `aaa0_`
in the same statement has her authority rate (`11000`) resolved by `aac_` on that insert. The file
asserts the first BEFORE-INSERT trigger by name and raises otherwise.

One thing the table makes plain and a later wave needs: `guard_commercial_time_entry_derived_fields`
**already has a BEFORE INSERT trigger** — under the misleading name
`aaa_guard_time_entry_invoice_insert_trg` (`00412:2387-2391`). §0.7(c)'s "harden the guard's INSERT
branch" is therefore a function-body edit, **not** a new trigger (recorded in plan-v2 §2).

**Two shapes the plan did not spell out, decided and stated:**

1. **Re-seat is an `ON CONFLICT (project_id, user_id, role) DO UPDATE SET removed_at = NULL, …`.**
   `project_team_members` carries `UNIQUE (project_id, user_id, role)` (`00084:172`), so a member
   whose `support_designer` seat the owner removed cannot be given a *second* row — clearing
   `removed_at` is the only way to express the re-seat the plan's own test demands. Asserted as case
   (d).
2. **The seat is gated on the studio co-membership the INSERT policies already require** (own row +
   `is_studio_comember(projects.designer_id)`), with `auth.uid() IS NULL` bypassing per the
   `00317:38-39` precedent. Reason: Postgres evaluates RLS `WITH CHECK` **after** before-row
   triggers, and `Team can log their own time entries` keys on `is_project_team_member(project_id)` —
   an ungated seat is a candidate privilege escalator (the seat authorizing the insert). I measured
   it: with an ungated trigger body the cross-studio case **still** fails closed on this Postgres, so
   the gate is defence in depth rather than a live hole being closed. It excludes nobody the plan
   wants seated — every policy that can admit an insert (project designer, rostered team member,
   studio co-member) is either already rostered or satisfies the gate (`is_studio_comember`'s first
   branch is `p_owner = auth.uid()`). **Flagged as an addition beyond the plan text.**

**RLS:** no policy added, dropped, renamed or re-qualified. The 00484 quartet, the `00316` studio
policies and `guard_invoiced_time_entry` (`00177:51-84`) are untouched. No backfill (P-4). No flags
(P-5).

**Generated files regenerated and committed with the migrations:**
`python3 scripts/generate-legacy-grants.py` → `supabase/seed/00-legacy-grants.sql` (2597 → 2600
replayed statements); `pnpm db:generate` → `packages/supabase/src/database.types.ts`, whose whole
diff is:

```
+      claim_time_entries: {
+        Args: { p_entry_ids: string[]; p_invoice_id: string }
+        Returns: string[]
+      }
```

---

## 2 · SQL tests (new)

| File | What it pins |
|---|---|
| `supabase/tests/billing/time_claim_atomicity_test.sql` | (a) a partial claim returns only the free id and leaves the composing invoice's pre-existing entry AND the rival invoice's entry on their original invoices — the 00595 defect; (b) re-claiming the same id to the same invoice returns nothing and restamps nothing; (c) a claimed entry cannot move to a second invoice |
| `supabase/tests/billing/time_unbilled_view_repair_test.sql` | (a1) precondition — the project's own designer **cannot** read the roster vendor's profile (`can_view_profile` false: not an org member, no other relationship, and the designer holds no team seat); (a2) both the vendor's entries appear in `project_unbilled_time` anyway; (b) `round(duration/60 × resolved_rate_cents) = amount_cents` on **every** row, plus 15000/22500 on the rated entry and 0/0 on the rate-less one |
| `supabase/tests/rls/time_entry_auto_roster_test.sql` | per role — (a) one `support_designer` seat, live; (b) a second entry adds none; (c) an existing `lead_designer` is not re-seated or downgraded; (d) a removed seat is re-seated on the next log; (e) a cross-studio non-member is refused (`insufficient_privilege`) and seats nobody |

**The view test was verified to bite.** Re-running it with the `00412` view body restored inside a
transaction:

```
psql:supabase/tests/billing/time_unbilled_view_repair_test.sql:109: ERROR:  FAIL a2: both vendor
entries must appear in project_unbilled_time (INNER JOIN profiles dropped them), got 0
```

---

## 3 · Portal / package (lane A's W0 half)

`apps/designer-portal/src/hooks/use-time-tracking.ts` → **`packages/supabase/src/hooks/use-time-tracking.ts`**
(`git mv`, rename detected), re-exported from `packages/supabase/src/hooks/index.ts`. Every exported
identifier keeps its name (§0.21): `useCreateTimeEntry`, `useUpdateTimeEntry`, `useDeleteTimeEntry`,
`useRunningTimer`, `useStartTimer`, `useStopTimer`, `useDiscardTimer`, `useClaimTimeEntries`,
`useUnbilledTime`, `useStudioTimeReport`, `useUpdatePhaseEstimates`, `filterProjectUnbilledEntries`,
`fetchTimeSummary`. Kept app-local per CR-28: `document-time-provider.tsx`,
`lib/document/time-derivation.ts`, `lib/document/authority-hours.ts`.

**`useClaimTimeEntries`** now calls `rpc('claim_time_entries', { p_invoice_id, p_entry_ids })`,
compares `claimed.length` to `entryIds.length`, and throws on a short return. **The compensating
detach is deleted.**

**Deleted (§10, zero callers each):** `useTimeEntries`; the `useTimeSummary` hook wrapper only
(`fetchTimeSummary` stays — live caller `use-projects.ts:481`); `useReleaseTimeEntries` and the
second invoice-wide detach inside it; the stale `// ── Studio time report (the Hours book —
/desk?book=hours) ──` comment. `grep -rn "useTimeEntries\|useReleaseTimeEntries\|useTimeSummary\b"
apps packages` → nothing.

**Four seams the move forced, each resolved to one definition rather than a copy** — these are the
only places the move is more than a file path, and they are all flagged here:

| Seam | Resolution |
|---|---|
| `queryKeys` from `@/lib/react-query` | a module-local `timeKeys` whose literal arrays mirror the portal factory exactly — `['projects', id, 'time-entries'\|'time-tracking'\|'unbilled-time'\|'key-metrics'\|'timeline']`, `['time']`, `['time','running-timer',undefined]`, `['time','studio-report',period]`. The trailing `undefined` is load-bearing: `document-time-provider.tsx:262,298,346,405` invalidates `queryKeys.time.runningTimer()`. Same house style as `use-invoices.ts`. `lib/react-query.ts` is NOT edited |
| `TimeBillingState` / `InvoiceEligibleTimeEntry` / `isInvoiceEligibleTimeEntry` from `lib/document/authority-hours` | moved into the package; `authority-hours.ts` re-exports them, so its document-side callers are unchanged. Its `timeBillingStateLabel` now takes a local `BillingStateEntry` structural type |
| `studioPeriodStartISO` / `StudioPeriod` from `lib/time-billing` | moved into the package (only `useStudioTimeReport` uses them); `lib/time-billing.ts` re-exports, keeping `STUDIO_PERIODS` and its own test green |
| `useToast` from `@/components/portal/toast-provider` | injected: `useStartTimer(options?: { toast?: TimeToast })`, and `document-time-provider.tsx` passes `useToast().toast`. Behaviour unchanged — both live call sites pass `quiet: true`, so the toast was already unreachable in production. W3 deletes this branch anyway (§10 row 15) |

**Callers repointed:** `components/document/hours-ledger.tsx` (note: the plan cites
`overlays/invoice-composer.tsx:611-616`; the real path is
`components/document/accounts/invoice-composer.tsx`), `hooks/document-time-provider.tsx`,
`hooks/use-projects.ts` (merged into its existing `@patina/supabase` import).

**Specs repointed (the jest.mock no-op hazard):** the two suites that mocked
`'@/hooks/use-time-tracking'` now fold those hooks into their existing `'@patina/supabase'` mock
factories (`document-time-provider.test.tsx`, `accounts/__tests__/invoice-composer-studio.test.tsx`);
`hooks/__tests__/use-time-tracking-authority.test.tsx` imports the hooks from `'@patina/supabase'`
and mocks **`'@patina/supabase/client'`** — the module the hooks actually reach for. I verified by
experiment that jest can load the real `@patina/supabase` in designer-portal and that the
`/client` subpath mock intercepts the package's internal `../client` import.

---

## 4 · Governance (§9, zero code)

- **`docs/vision/VISION-DECISIONS.md`** — new section `## Ruled — 2026-09-11 (hour tracking)` with
  **V10** (HT-30, companions HT-32 / HT-33), footer updated to `last id = V10`. The brief's "V7" is
  taken (V7/V8/V9 exist; the file's footer read `last id = V9`) — **the entry is V10**, as plan-v2
  §9.2 itself predicted.
- **`docs/design/the-document/DECISIONS.md`** — **R151** appended (never rewritten): the scope lens
  (amending R77), the billable control + activity honesty (amending D10 and R20, zero-tap protected),
  the backdated mark, the auto-start disclosure + opt-out (amending R19), the role chip, the quiet
  Record row (under R82), and R64's scope-only extension. Recorded as **one dated entry with named
  parts**, matching R149/R150's shape, rather than six thin numbers four lanes would then race for —
  an architect choice, flagged.
- **`docs/design/the-document/CLAUDE.md`** (§10's "verify first" row) — the prototype pointer is
  **accurate**: `patina-the-document-prototype-v4.html` exists and the file already records the `-v3`
  drift. Nothing to fix; recorded.

### OWED — the VISION §6 bullet could not be committed

`docs/vision/VISION.md` is **untracked in git**. `git ls-files docs/vision/` returns only
`VISION-DECISIONS.md`; in the main checkout `git status` shows `?? docs/vision/VISION.md`. It is
therefore absent from every worktree and uncommittable without `git add` in the main checkout, which
this lane is forbidden to touch. The exact bullet and its insertion point (immediately after
`VISION.md:73`, the `**Tab / zone / dashboard UI…**` bullet, which I confirmed is still line 73) are
recorded **verbatim inside V10**, so the paste is one line of work:

> - **The one exception, and its test.** A ledger is not a dashboard: a total is permitted as the
>   **front matter of the rows that produced it**, and a total with no rows beneath it is a
>   dashboard. The Hours sheet is a permitted reporting surface on exactly that condition. Nothing
>   here licenses a utilisation score, leaderboard, ranking, streak, target, burn-down, progress bar,
>   sparkline or red/green state — those stay refused (V10, 2026-09-11).

**Decision needed from the orchestrator:** either `git add docs/vision/VISION.md` in the main
checkout (it would arrive as a whole new tracked file, which is a governance act of its own), or Kody
pastes the bullet into his own copy.

---

## 5 · Gate outputs, verbatim

### `supabase db reset --workdir …/agent-server`

```
Restarting containers...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
```

Ledger probe after reset:

```
    version
----------------
 20260910152111
 00597
 00596
 00595
```

(First attempt failed inside the sandbox on `~/.supabase/telemetry.json` — `EPERM`, not a migration
error — and was retried with the sandbox off, as the brief allows.)

### `scripts/run-sql-tests.sh` (run from the worktree, `-H 127.0.0.1 -p 54322`)

`-d supabase/tests/billing`:

```
PASS  supabase/tests/billing/invoice_checkout_integrity_test.sql
PASS  supabase/tests/billing/invoice_links_test.sql
PASS  supabase/tests/billing/studio_invoice_test.sql
PASS  supabase/tests/billing/time_claim_atomicity_test.sql
PASS  supabase/tests/billing/time_unbilled_view_repair_test.sql
total: 5   green: 5   unexpected-fail: 0   effective-green: 5 / 5
```

`-d supabase/tests/commercial -k supabase/tests/KNOWN_FAILURES.md`:

```
total: 16   green: 10   expected-fail: 6   unexpected-fail: 0   effective-green: 16 / 16
```

`-d supabase/tests/rls -k supabase/tests/KNOWN_FAILURES.md` (carries the new auto-roster suite):

```
PASS  supabase/tests/rls/time_entry_auto_roster_test.sql
total: 25   green: 23   expected-fail: 2   unexpected-fail: 0   effective-green: 25 / 25
```

`-d supabase/tests/field -k supabase/tests/KNOWN_FAILURES.md`:

```
PASS  supabase/tests/field/time_entry_field_visit_source_test.sql
total: 6   green: 5   expected-fail: 0   unexpected-fail: 1   effective-green: 5 / 6
unexpected failures:
  - supabase/tests/field/field_capture_note_routing_test.sql
```

**Two honest notes on these numbers, both measured, not assumed:**

1. **`commercial`'s six failures are pre-existing and documented.** All six are listed in
   `supabase/tests/KNOWN_FAILURES.md` (`authorized_schedule`, `design_services_authority`,
   `design_services_gap_hardening`, `executed_on_paper`, `trade_rfq`, `trade_scope`). I proved they
   are not mine: I moved `00595/00596/00597` out of `supabase/migrations/`, regenerated the ACL seed,
   ran a full `db reset`, and re-ran the suite — **the identical six failed** (`total: 16, green: 10,
   unexpected-fail: 6`). Then I restored the three files, regenerated, and reset again. So "commercial
   stays green unchanged" holds: same set, same count.
2. **The runner's `-k` default cannot match when the script is invoked from the main checkout.**
   `scripts/run-sql-tests.sh` derives paths from its own location, so running
   `/Users/kody/Code/patina-merged/scripts/run-sql-tests.sh -d <worktree>/supabase/tests/billing`
   prints paths as `.codex/worktrees/agent-server/supabase/tests/…`, which never match
   `KNOWN_FAILURES.md`'s repo-root-relative entries — every documented failure then reads
   "unexpected". The numbers above are from the **worktree's own** copy of the script with
   `-k supabase/tests/KNOWN_FAILURES.md`. Worth fixing in the brief for later waves.
3. **`field_capture_note_routing_test.sql` fails and is NOT in `KNOWN_FAILURES.md`** —
   `FAIL 7f: field_captures should carry exactly five policies, got 9`. A policy-count drift on
   `field_captures` (the 00584 sweep's likely author). Nothing in W0 touches `field_captures`. Left
   as found; flagged for the ledger.

### Type / test / build gates

```
$ pnpm --filter @patina/supabase type-check
> tsc --noEmit                                  (clean, no output)

$ pnpm --filter @patina/designer-portal type-check
> tsc --noEmit                                  (clean, no output)

$ pnpm --filter @patina/designer-portal test -- src/hooks/__tests__/use-time-tracking-authority.test.tsx \
    src/hooks/document-time-provider.test.tsx \
    src/components/document/accounts/__tests__/invoice-composer-studio.test.tsx
PASS src/hooks/__tests__/use-time-tracking-authority.test.tsx
PASS src/components/document/accounts/__tests__/invoice-composer-studio.test.tsx
PASS src/hooks/document-time-provider.test.tsx
Test Suites: 3 passed, 3 total
Tests:       23 passed, 23 total

$ pnpm --filter @patina/designer-portal test          # the whole suite, not only the three
Test Suites: 573 passed, 573 total
Tests:       7259 passed, 7259 total
Snapshots:   1 passed, 1 total

$ pnpm --filter @patina/supabase test                 # the package's own vitest suite
Test Files  100 passed (100)
     Tests  1244 passed | 12 skipped (1256)

$ pnpm --filter @patina/admin-portal build
▲ Next.js 16.2.10 (webpack)   … route table printed, exit 0

$ pnpm --filter @patina/designer-portal lint
✖ 201 problems (0 errors, 201 warnings)
```

Notes on the last three:

- **`admin-portal build` failed once for a worktree-state reason, not a code reason**: `Module not
  found: Can't resolve '@patina/design-system'` — this worktree had no `dist/` for the dist-resolved
  packages. `pnpm turbo build --filter=@patina/design-system --filter=@patina/api-client
  --filter=@patina/help-system …` built them (4 tasks; the rest have no build script and are
  source-resolved), after which the build passed. Worth doing once per fresh worktree in later waves.
- **`pnpm turbo build --filter=@patina/supabase` (plan §1's type-integrity gate) is a no-op**:
  `packages/supabase/package.json` has **no `build` script**, so turbo silently skips it — exactly the
  §0.24 hazard. `pnpm --filter @patina/supabase type-check` is the real gate and it is clean.
- **`lint`: 0 errors.** All 201 warnings are pre-existing (`react-hooks/exhaustive-deps`, unused
  eslint-disable directives across files this wave never touched).
- **Prettier's pre-commit check warns on 9 touched files.** I verified the drift is pre-existing:
  piping `git show 2ff00bb2b:<file>` through `prettier --check` reports the same files as already
  drifting at the baseline. Nothing was reformatted (a formatting sweep would bury the diff).

---

## 6 · Deferred, with reasons

| Item | Why |
|---|---|
| the `VISION.md` §6 bullet | `docs/vision/VISION.md` is untracked in git — see §4. Text recorded verbatim in V10 |
| `field_capture_note_routing_test.sql` | pre-existing failure on `field_captures` policy count, unrelated to W0; not in `KNOWN_FAILURES.md`. Left as found |
| the six `commercial` failures | pre-existing and documented; proved identical with and without W0's migrations |
| everything W1+ | `rate_source` / `rate_role` / the resolver / `studio_member_rates` / the ledger view / the rollup / `useStudioTimeReport`'s deletion / the lens: not touched. `useStudioTimeReport` and `useUpdatePhaseEstimates` both survive W0 deliberately (§10 rows 14 and "NOT deleted") |

## 7 · For the next lane to know

- **Branch name**: the orchestrator's brief said `hour-tracking/server`; plan-v2 §1 says
  `hour-tracking/w0-money-bugs`. The work is on **`hour-tracking/server`**.
- **`Team can view their project time entries` does not carry `user_id = auth.uid()`.** plan-v2 §0.17
  quotes all four 00484 policies as `((user_id = auth.uid()) AND is_project_team_member(project_id))`;
  the live SELECT policy's qual is **`is_project_team_member(project_id)`** alone (`pg_policies`, this
  reset). The delete/update policies do carry the `user_id` leg. This matters to **HT-10-a** (W2): the
  rostered read is broader than the plan's §0.17 text assumes, so narrowing it to own rows is a real
  change of behaviour, not a no-op tidy.
- **Migration numbers are provisional — and the first check was not enough.** `00592–00594` were free
  on `origin/main @ 2ff00bb2b` and on `hour-tracking/integration` (same commit), which is exactly what
  this bullet originally said — and they were taken all the same, by a sibling BRANCH that had not yet
  merged. The numbers are now `00595–00597`. The tip is not the check: the check is
  `git log --all --oneline -- supabase/migrations/` across every branch, immediately before the merge
  (plan-v2 §0.2, amended in review round 1).
- **Local stack state**: left as a clean `db reset` of this branch (head `00597` + the imported
  `20260910152111`). Lane A owns reset in phase 1; nothing foreign was observed in two resets.
