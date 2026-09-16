# Integration fix — round 2

Branch `hour-tracking/integration`, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-integration`.
Stack: the isolated `patina-hours` stack (Postgres `127.0.0.1:54422`, API `54421`).
Nothing was run against Strata. 2026-09-14.

Eleven findings arrived. **Nine are fixed in code. One is recorded as a ruling and
escalated (MS-15). One could not be closed and is a hard pre-ship gate (MS-06 / P2-M2).**
No finding was skipped as wrong — every one reproduced.

---

## What changed

| Finding | Verdict | Where |
|---|---|---|
| **P2-B1** (blocker) | **FIXED** — the window is an instant range | `00607`, `00613`, `use-time-tracking.ts`, `hours-ledger.tsx`, `studio_hours_rollup_test.sql`, `00-legacy-grants.sql` |
| **MS-11** | **FIXED** — `rate_source` + `user_id` on the sheet's own unbilled read | `hours-ledger.tsx`, both hours jest specs |
| **MS-12** | **FIXED** — the designer-domain gate, in the statement and in the preflight | `00620`, `ms-05-strata-legacy-stamp-preflight.sql`, `rulings.md` |
| **MS-13** | **FIXED** — `qbo-export` added to §① | `ship-checklist.md` |
| **MS-14** | **FIXED** — documented, not "repaired" | `00596` banner, `ship-checklist.md` |
| **MS-15** | **RULED + ESCALATED** — not closed in code | `rulings.md` (**HT-10-b**), `ship-checklist.md` §2.8 |
| **MS-06 / P2-M2** | **STILL OPEN** — PostHog token expired again | `ship-checklist.md` §2.3 (hard gate) |
| **P2-M1** | already applied by the round-2 checklist revision; verified in place | `ship-checklist.md` §0a |
| **P2-M3** | **FIXED** — flags reach the server, and a case now reads the rate card | `playwright.hours.config.ts`, `e2e/document/hours.spec.ts` |

---

## P2-B1 — the UTC/local week seam (blocker)

Option **(a)**, the finding's own first choice: the rollup and the ledger read now take the
same INSTANT range `mine` already used.

* `public.studio_hours_rollup` — `p_from` / `p_to` are **`timestamptz`** (from INCLUSIVE,
  to EXCLUSIVE); the `scoped` CTE compares `ledger.started_at`, never `ledger.day`. The old
  `(uuid, date, date, text, uuid, uuid)` form is **dropped**, not left as an overload — two
  bound types is an ambiguity a caller passing a bare date string resolves by accident.
  New postconditions **(h)** (the `started_at` comparison is present and `ledger.day >=` /
  `<=` is absent) and **(i)** (no `date` overload survives) pin it; **(f)**'s
  signature-drift assert was updated to the new identity arguments.
* `00613`'s two `to_regprocedure(...)` references and the SQL suite's follow the signature.
* `useTimeEntryLedger` — `.gte('started_at', from).lt('started_at', to)`.
* `hours-ledger.tsx` — `fromInstant` / `toInstant` (`weekStart.toISOString()` /
  `weekEnd.toISOString()`) feed the rollup, "the entries" and the CSV/statement read;
  `fromDate` / `toDate` survive only as the export filename and the analytics `period`.

**Measured, on the program's stack, in one rolled-back transaction.** An entry filed by the
timer at `2026-09-14 02:34:00+00` — Sunday 13 Sep, 21:34 CDT, the last day of the local
week:

```
ledger day bucket (UTC) | 2026-09-14
NOTICE: P2-B1: OLD day-bucket rows in the local week = 0;
        NEW instant-window minutes = 90 (cents 18000)
```

The old shape (`day BETWEEN '2026-09-07' AND '2026-09-13'`) returns **0 rows**; the new
window (`2026-09-07 05:00Z` incl → `2026-09-14 05:00Z` excl) returns **90 min / 18000
cents**. That is the sentence the finding measured, closed.

**Named residual (P2-n1, recorded in `rulings.md`).** The `day` / `iso_week` BUCKET LABELS
are still 00604's UTC derivation, so inside a now-correct window an evening entry west of
UTC is labelled under the next UTC day. No hour is omitted and no money figure is wrong;
moving the labels needs the studio timezone HT-13-a declined. It is written into 00607's
banner and the checklist rather than left to be found.

## MS-11 — the Hours ledger's own unbilled read

The band held a raw read of `project_unbilled_time` that MS-01's fix never touched. Now:

* `rate_source` is selected and **rate-pending rows are split out** — out of
  `unbilledMinutes`/`unbilledCents`, out of `unbilledProjects` (so `· N documents` is
  right), and out of `billingTargetRows`, so "Bill it" is no longer enabled onto a composer
  where nothing is tickable.
* They are **counted, not hidden**: the band prints `· 2H 00M AWAITING A RATE`, and a studio
  whose whole balance is unpriced now gets that clause instead of `$0.00 · 2H 00M`. The
  zero-state ("No hours logged yet") also stops firing over held-back hours.
* **n7-02 closed in the same edit**: `.eq('user_id', me)`. The band renders only in the
  `mine` scope and the view is `security_invoker`, so an owner/admin was reading the whole
  studio's balance under the word "mine". It is now the same scope the week read uses.
* `unbilledById` is still built from ALL rows — it supplies only a per-line amount fallback
  and a pending line's amount is 0 either way.

Both hours jest specs needed `isRatePendingTimeEntry` added to their `@patina/supabase`
mock (the factory replaces the whole module); 54/54 pass.

## MS-12 — the two stamps now agree

`00620`'s tiered CTE, its three per-key counters and postcondition (a) all ask
`public.has_designer_domain_role(project.designer_id)` — the gate MS-02 put in front of the
INSERT path. A fourth reported count, `v_left_non_designer`, and a matching
`left_null_non_designer_lead` column in `ms-05-strata-legacy-stamp-preflight.sql` (inlined,
since 00511's EXECUTE is revoked from `dashboard_user`) keep the pre-push read and the
statement describing the same rows.

**The gate went in rather than the disagreement being written down**, because the two
directions are not symmetric: a row left NULL prices "rate pending" and can still be stamped
by hand under HT-3-g(3); a row stamped to the wrong studio is a read+write grant that
00606's bound (b) makes final. Recorded as **HT-3-g AMENDED (c)** with the measurement.

Negative control, one rolled-back transaction:

```
has_designer_domain_role(lead)            = f
designer_tier_pricing_studio(lead)        = e7000000-…-0001 / 'employer'
rows 00620's gated CTE would consider     = 0
```

`legacy_project_studio_stamp_test.sql` and `time_entry_studio_stamp_test.sql` both stay
green — the suite's leads hold designer-domain roles, so the gate costs their assertions
nothing.

## MS-14 — 00596 documented, not "repaired"

A banner block now says, in the file, that the sentence "Column list, order and types are
unchanged so CREATE OR REPLACE VIEW holds" is true only on a first run and only up to
00617; that the view's live column list is **00617's**; that one `db push --include-all`
applies in version order so the chain is unaffected; and that the two wrong repairs
(adding the columns here, adding a `DROP VIEW`) must not be attempted. Mirrored in the
checklist beside the migration list. No SQL changed.

## MS-13 — the export fix reaches the accountant

`supabase functions deploy qbo-export` added to §① with its reason, and the probe line now
reads "all three". The §0 pre-flight row already named all three function directories in the
round-2 checklist revision, so only §① was actually short.

## P2-M3 — the flags now reach the server, and something reads them

`playwright.hours.config.ts` merges the caller's `NEXT_PUBLIC_FLAG_OVERRIDES` **over** the
base config's three, pair by pair — a plain override would have taken `the-document-pilot`
out from under every Document-route spec. `e2e/document/hours.spec.ts` gains one case that
opens `/desk?account=studio`, asserts the STUDIO tab is `aria-current="page"` (with the flag
off the page reconciles to Profile in silence), reads **Studio rates** (HT-3) and, when
`agreement-parts` is also on, **Agreement defaults** / **Rate card** / **+ Add a role**
(HT-4). It **skips** rather than passing when `studio-workspaces:true` is absent, so it can
never green over the flag-off surface.

Proven by the difference between two runs of the same file (below).

## MS-15 — ruled, escalated, NOT closed in code

Confirmed directly against the schema. `Designers manage their project time entries`
(00177:136-137) is a permissive **ALL** policy whose whole qual is

```
EXISTS (SELECT 1 FROM projects p
         WHERE p.id = project_time_entries.project_id AND p.designer_id = auth.uid())
```

— **no `user_id` leg** — while `studio_member_rates` carries only
`studio_member_rates_read_self_or_admin` (`user_id = auth.uid() OR
is_org_admin_or_owner(studio_id)`). So a project's own lead, who may be a plain studio
member, reads a rostered teammate's `hourly_rate_cents`, `rated_amount_cents` and `notes`
off the entries table while RLS denies her that teammate's rate card.
`resolve_time_rate_cents` justifies its `pg_trigger_depth()` gate as protecting "a number
RLS gives her nothing of"; that premise does not hold.

Recorded as **HT-10-b**: a deliberate exception, because option (c) would delete the path
that lets a lead CORRECT a teammate's entry (`time_rate_resolution_test.sql` case (ab4),
W1-R1-05) and nothing replaces it, and option (b) — a GRANT-level column split plus a
definer correction RPC — is a wave of its own, not an integration fix.

> **ESCALATION for Kody.** If HT-10-a is read as binding on every read path, this is a
> blocker and the ship waits on his word. If the exception stands, option (b) is owed.

## MS-06 / P2-M2 — still not read

Retried this round. The server answered, verbatim:

```
MCP server "plugin:posthog:posthog" requires re-authorization (token expired)
```

One thing did get nailed down: `apps/designer-portal/wrangler.jsonc:33` ships
`NEXT_PUBLIC_POSTHOG_KEY = phc_D6Rf7ZYD5L7cTCgP1aBIV6kgANIFGnsbEgoYPXpsaNG`, which is the
token of PostHog project **326191 ("Patina Website")** — so the two flags are read at
<https://us.posthog.com/project/326191/feature_flags>, and the "which project" question is
gone. **The two rollout percentages remain unread. This is a hard pre-ship gate and the
checklist's top banner now carries it.**

---

## Gates run, and their real output

| Gate | Result |
|---|---|
| `python3 scripts/generate-legacy-grants.py` | baseline + **2650** replayed statements; 00607's grants follow the new signature |
| `supabase db reset --workdir …/agent-integration` | **clean** — every migration 00595–00620 applied, including 00607's new postconditions (h)/(i) and 00620's gated statement |
| `pnpm db:generate` (SUPABASE_DB_URL=…54422) | ran; `git diff database.types.ts` **empty** (both `date` and `timestamptz` generate `string`) |
| `run-sql-tests.sh -f time` | **12 / 12 PASS** |
| `run-sql-tests.sh -f hours` | **2 / 2 PASS** (`project_hours_total`, `studio_hours_rollup`) |
| `run-sql-tests.sh -f legacy` | **1 / 1 PASS** (`legacy_project_studio_stamp_test.sql`) |
| `run-sql-tests.sh` (full) | **188 total · 163 green · 22 expected-fail · 3 unexpected · effective 185/188** — the same three standing reds (`target_type_visibility`, `catalog_roles_remote_conformance_negative`, `proposal_copy_immutability`), unchanged from round 1 |
| `--filter @patina/designer-portal type-check` | clean |
| `--filter @patina/supabase type-check` | clean |
| `--filter @patina/client-portal type-check` | clean |
| `--filter @patina/admin-portal build` | **green** (the portal whose build enforces types — the shared-package change is exercised) |
| `--filter @patina/designer-portal test` | **581 suites / 7445 tests passed** |
| `--filter @patina/supabase test` | **102 files / 1259 tests passed** (12 skipped) |
| `--filter @patina/designer-portal lint` | **0 errors**, 201 warnings (unchanged posture) |
| Hours e2e, flags ON (`studio-workspaces:true,agreement-parts:true`, port 3100, stack 54421, DATA_MODE=live) | **8 passed** |
| Hours e2e, flags absent | **7 passed, 1 skipped** — the new case refuses to green over the flag-off surface |

The two e2e runs differ by exactly one case, which is the proof that P2-M3's config fix
works: before it, an exported `NEXT_PUBLIC_FLAG_OVERRIDES` reached nothing.

---

## Not done, and said plainly

* **iOS / Capture was not touched.** No finding named `apps/mobile/Capture`; `hour-tracking/ios`
  was not fast-forwarded and `capture-gate.sh` was not re-run this round. The tip's green
  from round 1 stands unchanged because nothing under `apps/mobile` changed.
* **Nothing ran against Strata.** No `db push`, no `functions deploy`, no linked-project call
  of any kind.
* **`supabase/config.toml` was not committed** — it is still `skip-worktree` (`git ls-files -v`
  → `S`), carrying `project_id = "patina-hours"` and ports 54421/54422.
* **The artifact files are untracked in the main checkout** and so are not in any commit:
  `ship-checklist.md`, `rulings.md`, `ms-05-strata-legacy-stamp-preflight.sql` and this file
  were edited in place at `/Users/kody/Code/patina-merged/artifacts/hour-tracking-2026-09-11/`.
  No git command was run in the main checkout.
* **The `day` / `iso_week` label residual (P2-n1) is open by decision**, not by omission.
* **MS-15 is a ruling on paper, not a code change.**
* **The two PostHog rollout percentages are still unmeasured.**
