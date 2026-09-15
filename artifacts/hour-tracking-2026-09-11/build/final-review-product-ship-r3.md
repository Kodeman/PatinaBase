# Final integration review — PRODUCT + SHIP-READINESS, round 3

**clean = false** — 0 blockers, 4 major.

Round 2's **blocker is discharged** — P2-B1 verified twice, independently: at the RPC in a
rolled-back transaction, and rendered in the browser at 1440 on the isolated stack. One of
round 2's three majors (**P2-M3**) is discharged and proved by a measured run difference.
The other two (**P2-M1**, **P2-M2**) are **not** discharged and I re-measured both as still
live today. Two new majors are raised: the stack had drifted again out of the branch's
migration order (S-4's failure mode, third occurrence), and the P2-n1 label residual is
sharper in the browser than the ruling that accepted it describes.

Branch `hour-tracking/integration` @ **`b030275f8`**; `origin/main` (`b88fd4c5`) is an
ancestor (`git merge-base --is-ancestor` → true). Reviewer context separate from every
implementer. Stack: the isolated `patina-hours` stack (`127.0.0.1:54421` / `:54422`).
Portal on **3100**; 3000/3002 never touched. Nothing was written to Strata — the only prod
contact was `supabase migration list --linked` (read-only).

---

## §0 · Gates run in my lens — commands and verbatim outcomes

All `pnpm --dir …/.codex/worktrees/agent-integration/<app>`; all SQL on `127.0.0.1:54422`.

| Gate | Command | Result |
|---|---|---|
| designer-portal types (the real gate) | `type-check` | **PASS** — exit 0, no output |
| designer-portal unit | `test` | **PASS** — `Test Suites: 581 passed, 581 total / Tests: 7445 passed, 7445 total / Snapshots: 1 passed`, 28.3 s. ⚠ one earlier run under concurrent load reported `1 failed, 580 passed / 7440 tests` — see **R3-n6** |
| designer-portal lint (the one config that resolves) | `lint` | **PASS** — exit 0, `✖ 201 problems (0 errors, 201 warnings)`; unchanged posture |
| client-portal types | `type-check` | **PASS** — exit 0 |
| client-portal unit (coverage floor enforced) | `test` | **PASS** — `151 passed, 151 total / 2475 passed` |
| admin-portal build (repo's strictest gate) | `build` | **PASS** — exit 0, full route table printed |
| `@patina/supabase` types | `type-check` | **PASS** — exit 0 |
| `@patina/supabase` unit | `test` | **PASS** — `Test Files 102 passed (102) / Tests 1259 passed \| 12 skipped` |
| SQL, whole tree — **as found** | `scripts/run-sql-tests.sh -H 127.0.0.1 -p 54422 -k supabase/tests/KNOWN_FAILURES.md` | `total 188 · green 162 · expected-fail 22 · **unexpected 4** · effective 184/188` — **`billing/time_rate_resolution_test.sql` RED** (see **R3-M1**) |
| SQL, whole tree — **after repairing the stack** | same | `total 188 · green 163 · expected-fail 22 · **unexpected 3** · effective 185/188` — the same three standing non-program reds |
| Edge functions | `deno test --allow-all --config supabase/functions/deno.json supabase/functions/time-nudges/index.test.ts supabase/functions/digest-dispatcher/status.test.ts` | **`ok \| 18 passed \| 0 failed`** (65 ms) |
| `qbo-export` type | `deno check --config supabase/functions/deno.json supabase/functions/qbo-export/index.ts` | **clean**, no output |
| Portal e2e (Hours), **flags ON** | `PLAYWRIGHT_DESIGNER_PORT=3100 … NEXT_PUBLIC_FLAG_OVERRIDES='studio-workspaces:true,agreement-parts:true' … npx playwright test --config playwright.hours.config.ts e2e/document/hours.spec.ts` | **8 passed** — incl. `[8/8] the studio rate card …`, the new P2-M3 case |
| Portal e2e (Hours), **flags absent** | same without `NEXT_PUBLIC_FLAG_OVERRIDES` | **7 passed, 1 skipped** — the new case refuses to green over the flag-off surface. The one-case difference between the two runs is P2-M3's proof |
| Generated types | `SUPABASE_DB_URL=…54422 pnpm --dir … db:generate` then `git diff --stat` | **IN SYNC** — empty diff |
| ACL seed | `python3 ./scripts/generate-legacy-grants.py` | **IN SYNC** — "baseline + 2650 replayed statements", empty diff |
| iOS | `apps/mobile/Capture/scripts/capture-gate.sh all` on `.codex/worktrees/agent-ios`, **fast-forwarded to `b030275f8`** | **PASS** — `✔ build · ✔ tests · ✔ lint · ✔ fc-r3 sweep (inbox) · ✔ fc-r3 sweep (ai) · ✔ principle-4 sweep`, exit 0. Simulator only; **never device-verified** |
| Worktree hygiene | `git -C … status --porcelain` | **clean**; `git ls-files -v \| grep ^S` → `supabase/config.toml` only (skip-worktree, never committed) |

### The three standing SQL reds are not this program's — re-verified

`capture_enrichment/target_type_visibility_test.sql` (policy from `00584`, on main),
`edge_api/catalog_roles_remote_conformance_negative_test.sql` (the file hard-refuses any
port but 54322 — an isolated-stack artifact), `proposals/proposal_copy_immutability_test.sql`
(column census drifted by `subject`, added by `00590` on main). Unchanged from rounds 1 and 2.

### Deploy-chain preconditions — all measured this session

| Precondition | State |
|---|---|
| `infra/deploy-portal.sh` present and unchanged | ✅ `git diff --stat origin/main...HEAD -- infra/ 'apps/*/wrangler.jsonc' '*.env*' package.json turbo.json pnpm-lock.yaml` is **empty** |
| `apps/*/wrangler.jsonc` `vars` untouched | ✅ same empty diff |
| No new `process.env` read in shipped portal code | ✅ `git diff origin/main...HEAD -- 'apps/**/src/**' 'packages/**/src/**' \| grep '^+.*process\.env'` returns **nothing**. The only new reads are in `playwright.hours.config.ts` / `e2e/document/hours.spec.ts` — test-only, not bundled |
| No new edge-function env var prod lacks | ✅ new `Deno.env.get` reads are `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEYS`; the third is already read by the live `client-invite` |
| No `supabase/functions/_shared/*` edit (no fan-out redeploy) | ✅ `git diff --name-only … -- supabase/functions/_shared/` is empty. Function diff is `digest-dispatcher/{index,status,status.test}.ts`, `qbo-export/index.ts`, and the new `time-nudges/` |
| `time-nudges` registered in the COMMITTED `config.toml` | ✅ `git show HEAD:supabase/config.toml` carries `[functions.time-nudges] verify_jwt = true` (the working-tree copy is the skip-worktree'd isolated-stack one and is not what ships) |
| `--include-all` required | ✅ **re-read today.** `supabase migration list --linked`: Strata's newest applied version is **`20260910152111`**, which sorts after every `NNNNN_` name. `00595–00620` are **not** on Strata; the peer's `00592–00594` and `00621+` are **not** on Strata either |
| Where the push can run from | ❌ **P2-M1 still live — re-measured today.** See §1 |

---

## §1 · Discharge of every round-2 blocker and major

| id | r2 severity | Round-3 verdict | Evidence |
|---|---|---|---|
| **P2-B1** the studio's week is a UTC week | **blocker** | **DISCHARGED — measured twice, independently** | (1) At the RPC, one rolled-back transaction on the program's stack: an entry filed by the timer at `2026-09-14 02:34:00+00` (Sun 13 Sep 21:34 CDT, the last day of the local week) has `time_entry_ledger.day = 2026-09-14`; the OLD day-bucket shape (`day >= '2026-09-07' AND day <= '2026-09-13'`) returns **0 rows**, the NEW instant window (`studio_hours_rollup(studio,'2026-09-07 05:00Z','2026-09-14 05:00Z','member')`) returns **90 minutes**, and the fact-view read the entries toggle and the CSV now use (`started_at >= … AND started_at < …`) returns **1 row**. (2) In the browser, `DATA_MODE=live`, 1440, owner of two studios, standing on the correct studio and paged back one week: `THE STUDIO · Local Dev Studio (2 of 2) · WEEK OF SEP 7` → **`1h 30m · $180 billable · 1 ENTRY`**, `BY PERSON → Leah Hartwell 1H 30M · 1H 30M BILLABLE · $180`, and `MINE` over the same week reads **`WEEK · 1H 30M`**. The two answers agree. The signature is `studio_hours_rollup(uuid, timestamptz, timestamptz, text, uuid, uuid)` and **no `date` overload survives** (`pg_proc` shows exactly one). |
| **P2-M1** the push runs from neither checkout | major | **NOT DISCHARGED — documented only, and re-measured live today** | `supabase migration list --linked` from `/Users/kody/Code/patina-merged` returns `{"local":"","remote":"00581"}` … `{"local":"","remote":"20260910152111"}` — i.e. **the linked checkout's working tree still has no file for 00581 or anything after it**; its migrations still end at `00580`. Run there today, `db push --include-all` finds nothing to push and reports success. The fix is checklist §0a, which exists and is correct; it is an instruction, not a guard. |
| **P2-M2 / MS-06 / W7-R6-04** the two PostHog flags | major | **NOT DISCHARGED — fourth attempt, same wall** | The brief asks me to verify `agreement-parts` is 100% live and say so. **I cannot.** `mcp__plugin_posthog_posthog__exec` with `call feature-flag-get-all {}` answered, verbatim: `MCP server "plugin:posthog:posthog" requires re-authorization (token expired)`. The tool's own environment block does confirm the project — **326191 "Patina Website", token `phc_D6Rf7ZYD5L7cTCgP1aBIV6kgANIFGnsbEgoYPXpsaNG`**, matching `apps/designer-portal/wrangler.jsonc:33` — so "which project" is settled and only the two rollout percentages are missing. |
| **P2-M3** the Hours e2e could not carry a flag | major | **DISCHARGED — read and measured** | `playwright.hours.config.ts` now builds `flagOverride` by merging the caller's pairs **over** the base config's three key-by-key (`mergeFlagOverrides`) and spreads it **last** into `webServer.env`; the base's `the-document-pilot` survives, which a plain override would have dropped. Measured both ways this session: with the flags exported the suite is **8 passed**, including the new `the studio rate card …` case; with them absent it is **7 passed, 1 skipped**. The one-case difference is the proof that an exported `NEXT_PUBLIC_FLAG_OVERRIDES` now reaches the server, and the skip is the guarantee that the case can never green over the flag-off surface. |
| **MS-11** the band's own unbilled read | blocker (money lane) | **DISCHARGED — code read end to end** | `hours-ledger.tsx` selects `rate_source` and `user_id`, splits `unbilledRows` / `ratePendingUnbilled` through `isRatePendingTimeEntry`, drops pending rows from `unbilledMinutes`, `unbilledCents`, `unbilledProjects` and `billingTargetRows`, prints `· N awaiting a rate`, and the zero-state no longer fires over held-back hours. `.eq('user_id', me)` closes **n7-02** in the same read. |
| **MS-12** the two legacy stamps disagreed | major (money lane) | **DISCHARGED — probed** | `pg_get_functiondef('set_project_studio_id_owned()') ~ 'has_designer_domain_role'` → **t**; `00620` and `ms-05-strata-legacy-stamp-preflight.sql` both carry the gate and the fourth counter. |
| **MS-13 / MS-14** | major / minor | **DISCHARGED** | `qbo-export` is in checklist §①; `00596` carries the banner. |
| **MS-15 / HT-10-b** a lead reads a teammate's rate and notes | major → **escalation** | **STILL OPEN, correctly recorded** | Recorded in `rulings.md` as **HT-10-b**, a deliberate exception, NOT closed in code. **If Kody reads HT-10-a as binding on every read path this is a blocker and the ship waits on his word.** Carried into the checklist as §2.8. |

---

## §2 · Findings

### BLOCKER

*None.*

### MAJOR

#### R3-M1 · The isolated stack had drifted out of the branch's migration order again — a program SQL test was RED when I arrived, and `resolve_time_rate_cents` / `classify_project_time_entry_authority` were serving PRE-`00618` bodies. This is S-4's failure mode, third occurrence, and it means every gate number in `final-fix-r2.md` is only as good as the stack state at the moment it was taken.
*Confidence: high — measured, then repaired, then re-measured. Severity: major (evidence integrity; not a branch defect and not a Strata hazard).*

**What I found, before touching anything.**

```
select p.proname, pg_get_functiondef(p.oid) like '%roster_role%' …
  classify_project_time_entry_authority | f
  resolve_time_rate_cents               | f
```

— both **false**, where the ship checklist's own post-push probe requires both true, and where
round 2 measured both **t**. The whole-tree SQL sweep as found was **4 unexpected failures**,
one more than rounds 1 and 2, and the extra one is this program's:

```
supabase/tests/billing/time_rate_resolution_test.sql:6034: ERROR:
  FAIL al1 (HT-4): a card bound to lead_designer prices the lead REGARDLESS of its
  label — "Principal designer" is exactly the label that cannot normalize-match;
  got NULL / none / lead_designer
```

Case (al1) is exactly `00618`'s delta.

**The branch is fine; the stack was not.** `supabase_migrations.schema_migrations` listed
`00618`, `00619`, `00620` as applied. No migration numbered above `00618` redefines either
function (`00620` only names `resolve_time_rate_cents` inside three `to_regprocedure`
postconditions). But `00613` and `00615` — both BELOW `00618` — each carry a
`CREATE OR REPLACE` of both bodies, and `00613` is one of the files the round-2 fix pass
edited for P2-B1. `user_roles.granted_at` on this stack is `2026-09-14 05:26 UTC`, i.e. the
last `db reset` ran ~20 minutes before this review began and **before** the fix round's final
commits — so the round-2 rollup change reached the stack by a hand re-apply of individual
files, and a hand re-apply of `00613` after that reset is precisely what reverts both bodies.

**Repaired, not reset** (the brief reserves `db reset` to the agent a stage names): I re-ran
`00618` and `00619` in order. Both bodies came back (`like '%roster_role%'` → **t / t**) and
the whole-tree sweep returned to **185/188 effective, 3 unexpected, the same three standing
non-program reds**. Every other number in §0 was taken after that repair.

*What this costs the ship:* nothing on Strata — `db push --include-all` applies in version
order, so `00618` lands last there by construction, and the checklist already carries the two
`roster_role` probes to prove it. What it costs is **confidence in locally-measured evidence**:
any claim in `final-fix-r2.md` or earlier taken between a hand re-apply and the next reset
described a stack that was not the branch. *Recommendation:* before the ship, one clean
`supabase db reset --workdir …/agent-integration` followed by the two `roster_role` probes and
one whole-tree SQL sweep, run by the agent authorised to reset, and no hand `psql -f` of any
migration file after it.

#### R3-M2 · Inside one Hours sheet, under one week caption, the same hour is dated **13 September** in `mine` and **2026-09-14** in `the studio` — and `BY DAY` lists a day the displayed week does not contain. This is P2-n1's declared residual, but it is sharper than the ruling that accepted it says.
*Confidence: high — rendered in one browser session, then reproduced at the RPC. Severity: major (user-visible, on a money surface). Disposition: already ruled as an accepted residual — this finding asks Kody to confirm THAT reading, now that its consequence is measured rather than described.*

Same fixture as P2-B1's UI proof, week of **Sep 7** (local Mon 7 → Sun 13), one entry timed
Sun 13 Sep 21:34 CDT:

* `MINE` prints the day header **`13 SEPTEMBER`** over the row.
* `THE STUDIO → THE ENTRIES` prints **`CEDAR LANE STUDY · 2026-09-14 · CLIENT · STUDIO RATE ·
  $120/HR · $180 · PRICED BY LOCAL DEV STUDIO`**.
* `THE STUDIO → BY DAY` prints one bucket, **`2026-09-14 · 1H 30M · 1H 30M BILLABLE · $180`** —
  a date **outside** the week the caption names.
* `EXPORT → CSV` writes `"2026-09-14"` in the Date column for the same row.

Reproduced beneath the UI:

```
studio_hours_rollup(studio,'2026-09-07 05:00Z','2026-09-14 05:00Z','day') →
  bucket_key = 2026-09-14, total_minutes = 90
```

The ruling (`rulings.md`, **P2-n1 residual**) records this as *"an evening entry west of UTC is
still labelled under the NEXT UTC day … a labelling question — no hour is omitted, no money
figure is wrong."* Both halves of that are true. What it does not say is that **the two lenses
of the same sheet now print two different dates for the same hour**, and that a seven-day week
can list an eighth day. Before P2-B1 the studio lens simply omitted the boundary row, so the
contradiction had nowhere to appear; the fix traded an omission for a visible disagreement.
`time_entry_ledger.day` is `00604` — this program's own migration — so this ships with the
program, not from `origin/main`.

*Smallest honest options, no ruling reopened:* (a) derive the `day`/`iso_week` labels from the
CALLER's offset the same way the window already is (an argument, not a stored studio timezone —
HT-13-a declined the column, not the parameter); (b) print the row's local date in the studio
entries list the way `mine` already does, leaving the buckets alone; (c) accept and say so in
the ship report and to Leah. **Ruling owed either way.**

#### R3-M3 · `supabase db push --include-all` still cannot be run from the linked checkout — re-measured today, unchanged from round 2.
*(= P2-M1, carried. Confidence: high — read off `supabase migration list --linked` this session. Severity: major — a silent-no-op ship-time hazard.)*

`{"local":"","remote":"00581"}` through `{"local":"","remote":"20260910152111"}`: the linked
checkout `/Users/kody/Code/patina-merged` has no local file for any migration after `00580`.
Checklist **§0a** names the fix (merge to `main`, pull, verify `ls supabase/migrations | tail -3`
shows `00619 00620 20260910152111`, then push from there). It is an instruction with nothing
enforcing it, and the failure mode is a green that means nothing. Kept as a hard gate in the
checklist rather than treated as closed.

#### R3-M4 · The two PostHog rollout percentages are still unread, after a fourth attempt in a fourth session.
*(= P2-M2 / MS-06 / W7-R6-04, carried. Confidence: high on the consequence, which round 2 rendered both ways; the percentages remain unknown. Severity: major — the checklist's own hard pre-ship gate.)*

I was asked to verify `agreement-parts` is 100% live and say so. **It is not verified, and I say
so.** The server's verbatim answer is in §1. The consequence round 2 measured stands: with
`studio-workspaces` off the Account sheet's tab row carries **no STUDIO tab** and
`/desk?account=studio` reconciles back to Profile in silence, so a studio the rollout has not
reached has **no door at all** to set a per-member rate — every services hour then prices
`rate_source='none'`, prints "rate pending", and since MS-01 cannot reach an invoice at all.
With both flags on (measured this session at 390) the Studio page carries `RATE CARD`,
`+ Add a role`, `AGREEMENT DEFAULTS` and `STUDIO RATES` with a per-member `Hourly rate for …`
field. P-5 holds — the program adds no flag — but "unflagged" describes the code, not the doors
it hangs inside.

### MINOR

* **R3-m1 · The studio CSV writes an empty `Member` cell where the on-screen rollup writes
  `Unnamed member`.** `time-export.ts:120` is `csvField(row.member_name ?? "")`, and
  `member_name` is `profiles.full_name`. Measured with a seated member whose profile carries no
  name: `studio_hours_rollup(..., 'member')` returns `bucket_label = 'Unnamed member'`, while
  the downloaded file's first data row is
  `"","2026-09-14","Cedar Lane Study","Nora Ellison","design","Yes","45","pending","none","","pending","pending_authorization","No",""`
  — an unattributable money row in the accountant's file. An invited teammate who has not set a
  display name is the ordinary production shape for this. One `?? "Unnamed member"` closes it.
* **R3-m2 · `+ Add a role` measures 69 × 18 at 390** — under §A's 44px floor, and program-new.
  It belongs with the two carried sub-44px `Remove` acts (W7-R6-05 / W7-R5-03, 18px and 30px);
  one §A pass should take all three. For contrast, every act the fix rounds added clears the
  floor: the rollup studio switch **165 × 50**, the account switch **165 × 50**, `EXPORT → CSV`
  122 × 44, `ADD` 44 × 44 (289 × 44 at 390), the ⌘K dialog's `NON-BILLABLE` 113 × 44 /
  `NEVER MIND` 96 × 44 / `LOG IT` 64 × 44.

### NOTE

* **R3-n1 · Two sub-44px acts inside the Hours sheet are PRE-EXISTING, not this program's.**
  `‹ earlier` measures **66 × 17** and `Bill week → Accounts` **180 × 28**. I diffed both against
  `origin/main`: `‹ earlier` is untouched, and `Bill week → Accounts` is a W5 **rename** of
  `Export week → Accounts` with a byte-identical class list. Recorded so the §A pass sweeps them
  with R3-m2, not as a program regression.
* **R3-n2 · designer-portal `test` was intermittently red once.** One run under concurrent load
  (an `admin-portal build` running beside it) reported `Test Suites: 1 failed, 580 passed /
  Tests: 7440 passed` — a suite that failed to produce its 5 tests rather than an assertion
  failure; the suite name was lost to output truncation. Two subsequent clean runs both gave
  `581 passed / 7445 passed`. Run the suite **alone** on the ship pass and read the name if it
  recurs.
* **R3-n3 · A stale comment survives the P2-B1 fix.** `hours-ledger.tsx:158` still reads
  `/** Local calendar date, not a UTC shift of it — the rollup takes dates. */` above `isoDate`.
  The rollup takes instants now; `isoDate`'s two remaining callers are the export filename and
  the analytics `period`. One line.
* **R3-n4 · The internal-time door has no studio picker — ruling owed.** Measured: with nothing
  in hand, `t` → `Studio time — no document` → 25 minutes → `Admin` → `LOG IT` wrote
  `source='internal'`, `project_id = NULL`, `billable = false`, and `studio_id =
  142f6474…` — **Leah Hartwell**, the viewer's default studio, while the Hours lens had last
  been shown on **Local Dev Studio**. The hour does reach a studio's reads (that studio's
  rollup returns `internal_minutes = 25`, and the sheet prints `— INTERNAL — / Studio time /
  TYPED · NO DOCUMENT · NON-BILLABLE`, which is W7-R4-07 and -12 working). But an owner of two
  studios is given no way, on the capture door itself, to say which studio an internal hour
  belongs to; it follows a selection made elsewhere. Ruling owed: does the internal-time door
  need to name its studio for a multi-studio owner?
* **R3-n5 · A local-dev trap that can fake a flag-off reading.** Driving the dev server at
  `http://127.0.0.1:3100` makes Next 16 refuse its own dev resources cross-origin
  (`⚠ Blocked cross-origin request to Next.js dev resource /_next/webpack-hmr from "127.0.0.1"`);
  chunks 403, the page never hydrates, `aria-expanded` never flips and **every control is inert
  while the page looks correct**. At `http://localhost:3100` the same build hydrates in ~5 s.
  Any walk that concludes "the control does nothing" or "the flag is off" from a `127.0.0.1`
  session should be re-run on `localhost` before it is believed.
* **R3-n6 · Ruling still owed, shipping as built:** **P2-n1** (now with R3-M2's measurement),
  **P2-n3 / W7-R6-03 / S-9**, **HT-25-a**, **HT-6-a**, **HT-6-b**, and **HT-10-b**'s escalation.
* **R3-n7 · `run-sql-tests.sh -d <subdir>` silently loses the allowlist** (r1's S-6) — unchanged;
  I ran the whole tree with an explicit `-k` and say so in §0.

---

## §3 · Disposition of every carried item I was asked to settle

`git diff --name-only 5ee33101f..b030275f8 -- apps/mobile` is **empty**, and `capture-gate.sh all`
is green on the tip, so the W6 rows stand as round 1 left them except where I correct the record.

### W6 (`W6-review-r3.md`)

| id | Disposition | Reason |
|---|---|---|
| **W6-R3-01** note field 20px / no AX label | **ACCEPT AS RESIDUAL** (minor) | An input, not an act; §A's floor is written about acts. `.frame(minHeight: 44)` + `.accessibilityLabel("Note")` at the next Field touch. |
| **W6-R3-02** save error swallowed then dismissed | **ACCEPT AS RESIDUAL** (minor) | `try?` on a local SwiftData save; the outbox is the durability path. `V4VisitReviewScreen.logTheHours` already models the fix. |
| **W6-R3-06** `rate_source` NULL renders "Billable" | **ACCEPT AS RESIDUAL** (minor) — **and the record is corrected** | Read directly: `FieldHours.worthLabel` is `guard billable else "Not billable"` → `rateSource == "none"` → **"Rate pending"** → `billingState == "pending_authorization"` → **"Awaiting authorization"** → **"Billable"**. Round 2's disposition described the opposite precedence ("returns 'Awaiting authorization' … first"); it does not. The residual is unchanged and narrow: an **authorized + billable + NULL-`rate_source` + rate-less** legacy row reads "Billable". HT-6-a measured that population on Strata at 4 rows, all on a test project. One-line fix recommended, not required. |
| **W6-R3-07** stepping duration files a future span | **ACCEPT AS RESIDUAL** (note) | Re-probed: `project_time_entries` carries CHECK constraints on `activity` and `source` (both verified this session) and **none on `started_at`**. Same mechanism as W7-R5-07; one shared ship-report line. |
| **W6-R3-10** V4 stepper/billable gated on `projectID`, never measured at 390 | **ACCEPT AS RESIDUAL** (note) | Coverage gap, not a defect. Needs a fixture visit with a `projectID` in the shots matrix. |

### W7 (`W7-review-r6.md`, `-r5.md`)

| id | Disposition | Reason |
|---|---|---|
| **W7-R6-03** an emptied rate card passes readiness | **ACCEPT AS RESIDUAL + RULING OWED** (= P2-n3) | **Re-measured as the default, twice.** On the repo's own seed, the owner's Studio page renders `RATE CARD` + the binding sentence + `+ Add a role` and **no rows at all** at both 1440 and 390. Pre-existing state (`materialize_standard_parts` seeds `'[]'`); W7's per-row `Remove` is a second, quieter door to it. |
| **W7-R6-05 / W7-R5-03** sub-44px `Remove` acts (18px, 30px) | **ACCEPT AS RESIDUAL** (minor) | Unchanged. Take them together with **R3-m2** (`+ Add a role`, 69 × 18) in one §A pass. |
| **W7-R5-02** no re-index after Remove | **ACCEPT AS RESIDUAL** (minor) | `sortOrder` is a display key; HT-4 binds pricing on `roster_role`. Cosmetic. |
| **W7-R5-04** trim drops the tail, not the unbindable row | **ACCEPT AS RESIDUAL** (minor) | Worst case surfaces through `UNBOUND_ROLE_BLOCKER` and blocks the send — visible, not silent, not money. |
| **W7-R6-04** the studio half of HT-4 sits behind `agreement-parts` | **MUST FIX BEFORE SHIP** → **R3-M4** | **I was asked to verify that flag is 100% live and say so: I could not.** Fourth session, same expired token, verbatim error in §1. What I CAN say: with both flags forced on, the Studio page's HT-4 surface renders correctly at 390 (`RATE CARD`, `+ Add a role`, `AGREEMENT DEFAULTS`, `STUDIO RATES` with `Hourly rate for …`), `aria-current` on the STUDIO tab is `page`, and `documentElement.scrollWidth = 390`. What gates it in production is unmeasured. |
| **W7-R5-07** noon-UTC can file `started_at` in the future | **ACCEPT AS RESIDUAL** (note) | No CHECK on `started_at`. A consequence of HT-13-a, not a defect beside it. Shares a ship-report line with W6-R3-07 and **R3-M2**. |

### W1/W2 portal (`W1W2-portal-review-r7.md`)

| id | Disposition | Reason |
|---|---|---|
| **n7-02** studio money under the word "mine" | **FIXED** | `hours-ledger.tsx`'s own `project_unbilled_time` read now carries `.eq("user_id", userData.user.id)`, matching the week read on the same sheet. Read end to end in the diff. |
| **n7-05** a two-studio viewer reads only the alphabetical first | **FIXED — re-measured** | At 1440 the caption is `THE STUDIO · Leah Hartwell (1 of 2) · THIS WEEK`; the name is a **165 × 50** button that cycles to `Local Dev Studio (2 of 2)`, and the studio scope's numbers follow it (`0 min` on Leah Hartwell, `1h 45m · $120 billable · 2 ENTRIES` on Local Dev Studio, over the same week). The account sheet's `STUDIO 1 OF 2 · SWITCH` is the same 165 × 50 act. |
| **n7-06** same-day upsert re-authors `created_by` | **ACCEPT AS RESIDUAL** (minor, raised in significance) | Under HT-3-e(2) a same-day correction by the member herself flips a studio-authored (pricing) row into a self-authored (inert) one. Recommend splitting insert/update so `created_by` rides only the insert. |

### W3 (`W3-review-r5.md`)

| id | Disposition | Reason |
|---|---|---|
| **W3-R5-m3** Enter submits with no note while the authority window is open | **ACCEPT AS RESIDUAL** (minor) | `log-time-sheet.tsx:167` returns early while `valid` is false; the greyed `Log it` is the only signal. One line in the existing `note` slot closes it. |
| **W3-R5-m5** the e2e serial-mode first case is red | **RESOLVED — not a defect** | Re-run whole this session with the flags on: **8 passed**, `[1/8] the sheet doorway opens the Hours book` included. |

---

## §4 · The walk — what answered correctly

Signed in against the isolated stack, `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`, flags on,
at **1440** and **390**, as **owner** (`designer@patina.dev`, owner of *Leah Hartwell* and
*Local Dev Studio*) and as a **plain member** I created and then deleted (`member` of Local Dev
Studio, `studio_designer`, no owned studio). Money was put on the sheet rather than walked
empty: a studio rate row, a priced timer hour in the previous local week, a priced typed hour
today, an unpriced hour on a studio-less document, and the member's own unpriced hour.

* **⌘K / bare `t`, nothing in hand** — the Log time dialog opens with the full capture door,
  verbatim: *"An hour with nothing in hand — a call, a drive, a sourcing run. Pick the document,
  say how long, and press Enter."* Fields measured: `SELECT aria="Document" 413 × 50` (carrying
  **"Studio time — no document"**), `INPUT/number aria="Minutes" 200 × 50`,
  **`INPUT/date aria="Date" 200 × 50`**, `SELECT aria="Activity" 413 × 50` (five chips +
  *"activity not set"*), `NON-BILLABLE 113 × 44`, `NEVER MIND 96 × 44`, `LOG IT 64 × 44`. No
  role chip — correct, HT-41 shows it only for a member holding more than one roster role.
* **The add row on the sheet** — `Document…` picker, activity picker, **`DATE 140 × 50`** at
  x=46..186 and **`MINUTES 140 × 50`** at x=195..335 (both inside the 390 viewport), `ADD`
  289 × 44, `NON-BILLABLE` 113 × 44.
* **The internal-time door, written and read back** — `Studio time — no document` + 25 minutes +
  `Admin` + `LOG IT` produced `source='internal'`, `project_id NULL`, `billable false`, and the
  sheet prints `— INTERNAL — / Studio time / TYPED · NO DOCUMENT · NON-BILLABLE`. Its studio's
  rollup returns `internal_minutes = 25`. (Which studio: see R3-n4.)
* **The lens** — owner sees `MINE | THE STUDIO` (30 × 50 and 75 × 50); the **plain member sees
  no lens at all** (HT-8), reads **only her own 45 minutes**, gets **no `EXPORT → CSV`**, is
  offered **no `STUDIO RATES →` repair door**, and her `BILL WEEK → ACCOUNTS` is
  **`disabled: true`** — the exact attribute round 2 left unasserted.
* **HT-26** — the unpriced hour prints `TYPED · RATE PENDING` with the repair door
  `NAME THE STUDIO THAT PRICES THIS DOCUMENT`; the priced ones print
  `TYPED · STUDIO RATE · $120/HR · $120` and `IN HAND · STUDIO RATE · $120/HR · $180`.
* **HT-30** — totals stand above the rows: `UTILIZATION / 3h 00m / LOGGED THIS WEEK / 100%
  BILLABLE`, then the pending-authority band, then the rows.
* **The pending-authority band** — *"These hours are visible, but cannot be billed until a
  services agreement authorizes a rate."* with `STUDIO RATES →`, `ASPEN LOFT REFRESH · 2H →`
  and `CEDAR LANE STUDY · 2H 30M →`; the total (`4H 30M`) equals the three entries.
* **The rollup's five groupings** — `BY PERSON 67 × 50`, `BY DOCUMENT 82 × 50`, `BY DAY 45 × 50`,
  `BY WEEK 52 × 50`, `BY ACTIVITY 82 × 50`; `THE ENTRIES` / `HIDE THE ENTRIES` 104 × 44.
* **The CSV, downloaded not read** — `patina-hours-studio-2026-09-14.csv`, header exactly
  `Member, Date, Project, Client, Activity, Billable, Duration (min), Rate, Rate Source,
  Rate Role, Amount, Billing State, Invoiced, Invoice #` — **fourteen columns and no `Notes`**
  (HT-36). Every field quoted (MS-04's guard). A rate-pending row prints `pending / none / ""`
  rather than `$0.00`. One defect: the blank `Member` cell, **R3-m1**.
* **HT-35** — the disclosure reads on Account → Profile at 390: *"The clock — While a document
  is open, Patina keeps the time for you. Turn that off and the document carries a one-tap
  start instead — the clock is still there, it just waits for you."* plus the toggle *"Keep the
  time automatically while a document is open"*.
* **HT-3 / HT-4's doors at 390** — the STUDIO tab carries `aria-current="page"`; the page holds
  `RATE CARD` + `+ Add a role`, `AGREEMENT DEFAULTS`, `MEMBERS`, and `STUDIO RATES` with
  *"What an hour of each teammate's time is worth when no signed agreement names a rate for the
  work. A new figure is a new dated row — the rate an invoice already billed against stays on
  the record."* and a `Hourly rate for Leah Hartwell` field. The **plain member's** same page is
  read-only: `RATE CARD / Not set`, no `+ Add a role`, **no `STUDIO RATES` section at all**,
  `LEAVE STUDIO`, and no `SWITCH`.
* **390** — `documentElement.scrollWidth = 390` on every view walked, including the account
  sheet full-page.

---

## §5 · What I did NOT verify

* **Strata was never written to.** The only prod contact was `supabase migration list --linked`
  (read-only). No `db push`, no `functions deploy`, no `wrangler deploy`.
* **The two PostHog rollout percentages remain UNKNOWN** — R3-M4. Fourth attempt.
* **MS-05's eight Strata numbers are still unread.** The preflight SQL is ready and wired into
  checklist §1②a.
* **Prod exposure of R3-M2 is unmeasured** — no read-only Strata credential. The mechanism and
  the local measurement are solid; how many Strata rows sit in the nightly band is not.
* **The MS-11 unbilled band was not walked with money in it.** `project_unbilled_time` requires
  `billing_state = 'authorized'`, which needs a signed services agreement I did not construct;
  all four fixture entries sat at `pending_authorization`. The band's logic is covered by the
  581/7445 jest pass and by a full read of the changed code, not by a render.
* **The `a member` and `this document` lenses were not driven by hand** — neither subject
  existed for the owner in the fixture; the suite's three width cases cover the lens rendering.
* **1024 was not walked by hand** — covered by the suite's own passing case.
* **iOS is Simulator-only.** `capture-gate.sh all` green on the tip after fast-forwarding
  `hour-tracking/ios` to `b030275f8`; no physical device, so every camera/LiDAR/upload/
  airplane-mode claim in W6 remains **not device-verified**. P-6 rules that acceptable; Kody's
  walk is the closure. The Field `LogTimeSheet` was reviewed by reading, not by running.
* **Client-portal e2e not run** (chromium-only suite). The client change is covered by
  `invoice-sheet-time-subtable.test.tsx` inside the 151/151 pass; I read `invoice-sheet.tsx`'s
  parser end to end and it fails closed to plain text for every non-`time` line kind and every
  unparseable payload.
* **Lint outside designer-portal was not run** and would not be trustworthy if it had been
  (designer-portal holds the only flat ESLint config that resolves in this repo).
* **I mutated the isolated stack and cleaned up after.** Created and deleted
  `r3-member@patina.dev` (auth user, membership, two `user_roles` rows); inserted and deleted
  5 `project_time_entries` and 1 `studio_member_rates` row. Final state verified:
  `entries 0 · rates 0 · testuser 0`. I also **re-applied `00618` and `00619`** to repair the
  drift in R3-M1 — a repair toward the branch's own state, not a reset. `git status` in the
  worktree is clean (`next-env.d.ts` and `database.types.ts`, both touched by tooling, were
  restored and re-verified). Port 3100 is free; 3000/3002 were never touched.
