# Final integration review — PRODUCT + SHIP-READINESS, round 2

**clean = false** — 1 blocker, 3 major.

Every round-1 blocker and major **is discharged** (S-1, S-2 measured fixed; S-3, S-4
closed; MS-01…MS-04 probed green). The blocker below is **not a regression from the fix
round** — it is a round-1 miss the fix round's own change makes legible: S-1's switch now
lets you stand on the *right* studio and read `0 min / "Nothing logged in this window."`
over three billable hours the same sheet shows one click away.

Branch `hour-tracking/integration` @ `5ee33101f`; `origin/main` (`b88fd4c5`) is an
ancestor. Reviewer context separate from every implementer. Stack: the isolated
`patina-hours` stack (`127.0.0.1:54421` / `:54422`). Portal on **:3100**; 3000/3002 never
touched (3000 is held by another program and was left alone).

---

## §0 · Gates run in my lens — commands and verbatim outcomes

All `pnpm --dir …/.codex/worktrees/agent-integration/<app>`; all SQL on
`127.0.0.1:54422`.

| Gate | Command | Result |
|---|---|---|
| designer-portal types (the real gate) | `type-check` | **PASS** — exit 0, `tsc --noEmit`, no output |
| designer-portal unit | `test` | **PASS** — `Test Suites: 581 passed, 581 total / Tests: 7445 passed, 7445 total / Snapshots: 1 passed`, 26.6 s |
| designer-portal lint (the one config that resolves) | `lint` | **PASS** — exit 0, `✖ 201 problems (0 errors, 201 warnings)`; all warnings are the pre-existing "unused eslint-disable directive" family |
| client-portal types | `type-check` | **PASS** — exit 0 |
| client-portal unit (coverage floor enforced) | `test` | **PASS** — `151 passed, 151 total / 2475 passed` |
| admin-portal build (repo's strictest gate) | `build` | **PASS** — exit 0, full route table printed |
| `@patina/supabase` types | `type-check` | **PASS** — exit 0 |
| `@patina/supabase` unit | `test` | **PASS** — `Test Files 102 passed (102) / Tests 1259 passed | 12 skipped` |
| SQL, whole tree | `scripts/run-sql-tests.sh -H 127.0.0.1 -p 54422 -k supabase/tests/KNOWN_FAILURES.md` | `total 188 · green 163 · expected-fail 22 · **unexpected 3** · effective-green 185/188` |
| Edge functions | `deno test --allow-all --config supabase/functions/deno.json supabase/functions/time-nudges/index.test.ts supabase/functions/digest-dispatcher/status.test.ts` | **`ok | 18 passed | 0 failed`** (199 ms) |
| `qbo-export` type | `deno check --config supabase/functions/deno.json supabase/functions/qbo-export/index.ts` | **clean**, no output |
| Portal e2e (Hours) | `PLAYWRIGHT_DESIGNER_PORT=3100 PLAYWRIGHT_SUPABASE_URL=http://127.0.0.1:54421 … DATA_MODE=live npx playwright test --config playwright.hours.config.ts e2e/document/hours.spec.ts` | **7 passed (2.3 m)** — incl. `the sheet doorway opens the Hours book` (W3-R5-m5's carried red) |
| Generated types | `SUPABASE_DB_URL=… pnpm --dir … db:generate` then `git diff --stat -- packages/supabase/src/database.types.ts` | **IN SYNC** — empty diff |
| ACL seed | `python3 ./scripts/generate-legacy-grants.py` (the worktree's own) | **IN SYNC** — "2650 replayed statements", empty diff |
| iOS | `apps/mobile/Capture/scripts/capture-gate.sh all` on `.codex/worktrees/agent-ios`, **fast-forwarded to `5ee33101f`** | **PASS** — `✔ build · ✔ tests · ✔ lint · ✔ fc-r3 sweep (inbox) · ✔ fc-r3 sweep (ai) · ✔ principle-4 sweep`, exit 0. Simulator only; **never device-verified** |

### The 3 unexpected SQL failures are not this program's — re-verified, not taken on trust

1. `edge_api/catalog_roles_remote_conformance_negative_test.sql` — the file hard-refuses
   any port but 54322 (`:'PORT' = '54322'`, else `SELECT 1/0`). An isolated-stack
   artifact.
2. `proposals/proposal_copy_immutability_test.sql` — `proposals column census drifted`,
   the delta is exactly **`subject`**, added by `00590_engagement_subject.sql` which is on
   `origin/main`. Reproduced the verbatim error.
3. `capture_enrichment/target_type_visibility_test.sql` — `FAIL c2: an org co-member must
   not see a run targeting a non-inbox field_capture they do not own, got 1`. The policy
   chain is `capture_enrichment_runs_target_visibility` → `field_captures` RLS →
   `field_captures_studio_select = is_studio_comember(designer_id)`, defined in
   **`00584_studio_comember_rls_sweep.sql`** (on main). No migration in `00595–00620`
   names `field_captures` except a jsonb payload string inside 00613. Pre-existing.

### Deploy-chain preconditions — all measured this session

| Precondition | State |
|---|---|
| `infra/deploy-portal.sh` present and unchanged | ✅ `git diff --stat origin/main...HEAD -- infra/ 'apps/*/wrangler.jsonc' '*.env*' package.json turbo.json pnpm-lock.yaml` is **empty** |
| `apps/*/wrangler.jsonc` `vars` untouched | ✅ same empty diff |
| No new `process.env` read in shipped portal code | ✅ the only additions are `PLAYWRIGHT_DESIGNER_PORT` / `PLAYWRIGHT_SUPABASE_URL` in `playwright.hours.config.ts` (a test config) |
| No new edge-function env var prod lacks | ✅ new `Deno.env.get` reads are `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEYS`; the third is already read by the live `client-invite` |
| No `supabase/functions/_shared/*` edit (no fan-out redeploy) | ✅ `git diff --name-only … -- supabase/functions/_shared/` is empty |
| `--include-all` required | ✅ `supabase migration list --linked` (read-only): Strata's newest applied version is **`20260910152111`**, which sorts after every `NNNNN_` name; peer's `00592–00594` and `00621+` are **not** on Strata |
| **Where the push can be run from** | ❌ **see P2-M1 — neither checkout can run it as it stands** |

---

## §1 · Discharge of every round-1 blocker and major

| id | r1 severity | Round-2 verdict | Evidence |
|---|---|---|---|
| **S-1** two-studio viewer reads only the alphabetical first | major | **FIXED — measured** | At 1440, owner of two studios: `THE STUDIO · Leah Hartwell (1 of 2) · THIS WEEK`; the name is a button (164.6 × 49.5 — above §A's 44px floor) that cycles to `THE STUDIO · Local Dev Studio (2 of 2) · THIS WEEK`. Present at 390 too, with `documentElement.scrollWidth = 390` (no sideways scroll). |
| **S-2** three surfaces picked a studio three ways | major | **FIXED — measured** | In one browser context: switched the Hours lens to Local Dev Studio, then opened `/desk?account=studio` — the Account sheet's Studio page opened on **`Local Dev Studio · LOCAL-DEV-STUDIO · STUDIO 2 OF 2 · SWITCH`**, i.e. it followed the Hours choice. Clicking its switch returns both surfaces to `Leah Hartwell · STUDIO 1 OF 2`. A **plain member** (seated `member` in Local Dev Studio, no owned studio) sees the same page named `Local Dev Studio`, read-only, **with no switch** — `useAccountStudio`'s ordered fallback. |
| **S-3** ship client before designer | major (closed by checklist) | **STILL CLOSED** | `ship-checklist.md` §1③ deploys `client` then `designer` with the raw-JSON reason stated. Re-read; unchanged. |
| **S-4** the stack was serving W7's bodies as W4/W2's | major (evidence) | **CLOSED** | `pg_get_functiondef(...) like '%roster_role%'` → **t** for **both** `classify_project_time_entry_authority` and `resolve_time_rate_cents`. Whole-tree SQL sweep 185/188 effective with only the 3 non-program failures above. Every number in §0 was produced on this stack after the repair. |
| **MS-01** an unpriced hour reached an invoice | blocker | **FIXED — probed** | `information_schema.columns` count for `project_unbilled_time` ∈ {`rate_source`,`rate_role`} = **2**; `pg_get_functiondef('claim_time_entries(uuid,uuid[])') ~ 'rate_source IS DISTINCT FROM ''none'''` → **t**; `time_claim_atomicity_test.sql` green incl. new case (e). Read the portal half end to end: the split is in `useUnbilledTime` (hook, not component), `useStudioUnbilledTime` drops them too, and the composer prints the held-back rows disabled with `rate pending` in both cells and `set the studio rate →` beneath. Both consumers (`invoice-composer.tsx`, `desk-contents.tsx`) are the only ones; no third caller can tick one. |
| **MS-02** studio stamp bound a non-designer lead | blocker | **FIXED — probed** | `pg_get_functiondef('set_project_studio_id_owned()') ~ 'has_designer_domain_role'` → **t**; `public_rpc_authorization_contract_test.sql` green (was ERROR at `:171`). |
| **MS-03** countersign body unregistered | blocker | **FIXED** | `public_sd_hardening_contract_test.sql` green (was ERROR at `:2424`). |
| **MS-04** CSV formula injection | major | **FIXED** | Both `time-export.ts` and `qbo-export/index.ts` carry the identical guard; the plain-signed-number exemption (`/^[+-]?\d+(\.\d+)?$/`) keeps `-145.00` a number. Four new jest cases inside the 581/7445 green; `deno check` clean. |
| **MS-05** legacy-stamp cost on Strata | major | **PARTLY CLOSED, unchanged** | `ms-05-strata-legacy-stamp-preflight.sql` exists and is wired into checklist §1②a. The seven Strata numbers are **still unread** — carried. |
| **MS-06 / W7-R6-04** the two PostHog flags | major | **STILL OPEN** → **P2-M2**, now with a measured consequence | |
| **n7-05** | major | **FIXED** by S-1/S-2 | See above. |

---

## §2 · Findings

### BLOCKER

#### P2-B1 · The studio's week is a **UTC** week; `mine`'s is the viewer's **local** week. An hour timed on a Sunday evening in a US studio drops out of the studio rollup, the entries and the CSV — while `mine`, one click away, still shows it.
*Confidence: high — rendered on both sides, then reproduced at the RPC. Severity: blocker (a wrong money answer on a shipped surface, and it reproduces the exact sentence round 1 escalated).*

**Measured, one browser session, `DATA_MODE=live`, 1440, owner of two studios.**
Two entries on **Cedar Lane Study**, whose `projects.studio_id` is **Local Dev Studio**;
`time_entry_ledger.studio_id` agrees; both `rate_source='studio_member'`, `$120/hr`.
Machine clock **Sun 13 Sep 2026, 21:34 / 22:34 CDT**.

* **`mine`** — `TODAY · 3H 00M · WEEK · 3H 00M`, `UTILIZATION / 3h 00m / LOGGED THIS
  WEEK / 100% BILLABLE`, and both rows printed: `Cedar Lane Study · TIMER · STUDIO RATE ·
  $120/HR · $120` and `… · $240`.
* **`the studio`, standing on the CORRECT studio** (after using S-1's new switch) —
  `THE STUDIO · Local Dev Studio (2 of 2) · THIS WEEK` / **`0 min`** / **"Nothing logged
  in this window."**

Reproduced beneath the UI, on the RPC the sheet calls:

```
studio_hours_rollup(LocalDevStudio, '2026-09-07','2026-09-13','member',null,null) → 0 rows
studio_hours_rollup(LocalDevStudio, '2026-09-13','2026-09-19','member',null,null) → 180 min, 36000 cents
```

**The mechanism, in four files.**

| where | what it uses |
|---|---|
| `time_entry_ledger.day` (00604) | `(te.started_at AT TIME ZONE 'UTC')::date` → **2026-09-14** for a 21:34 CDT entry |
| `studio_hours_rollup` (00607) | `AND ledger.day >= p_from AND ledger.day <= p_to` |
| `hours-ledger.tsx:164-171` `weekRange()` | **local** Monday 00:00 → +7 days |
| `hours-ledger.tsx:158-161, 646-647` `isoDate()` | "Local calendar date, not a UTC shift of it" → `from='2026-09-07'`, `to='2026-09-13'` |
| `hours-ledger.tsx:274-275` (`mine`) | `.gte('started_at', weekStart.toISOString()).lt('started_at', weekEnd.toISOString())` — **instants**, so it *does* catch the row |

So the sheet asks two different questions under one caption (`Hours · this week`) and
prints the two answers two clicks apart.

**Reach.** For every timezone west of UTC there is a nightly band (CDT: 19:00–24:00) in
which an hour's UTC day is tomorrow's. Consequences, all on the same window:

1. `the studio` and `a member` rollups under-report; on the **last day of the week** the
   hour vanishes from the week entirely rather than merely moving a bucket.
2. `BY DAY` buckets every evening hour on the wrong day.
3. `Export → CSV` and the statement use the same `from`/`to` against the same
   `day` column (`useTimeEntryLedger` → `.gte('day', from).lte('day', to)`,
   `hours-ledger.tsx:652-655, 706-713`) — so the week's CSV omits them too.
4. `The entries` toggle under the rollup (`ScopeEntries`) shares the window.

**Why HT-13-a does not cover it.** HT-13-a rules that an entry logged with a **date and
no time** is filed at 12:00 UTC precisely so `(started_at AT TIME ZONE 'UTC')::date`
equals the named day, and says in terms that the ledger's `day` stays UTC-derived and no
studio timezone column is added. That closes the **date-only** doors (Hours add row, ⌘K
verb, backdated Field sheet) and they do work — the `t` dialog's DATE field goes through
`startedAtFromDateValue`. It does **not** close the **timer** door, which stores the real
instant: my rows print `TIMER` in the ledger, and the timer is the program's flagship
capture path *and* the one HT-35's auto-start disclosure is written about.

**What round 1 saw.** S-1 reported `the studio` saying "Nothing logged in this window"
over 2 h and attributed it entirely to the alphabetical studio pick. The pick was real and
is fixed. The sentence is not gone — it is now reachable while standing on the correct
studio, which is worse, because the caption no longer gives the reader anything to doubt.

*Smallest honest fixes (pick one, ruling owed either way):*
(a) make the two reads agree by asking the rollup/ledger for the **instant** range the
`mine` read already uses (`started_at >= weekStart AND < weekEnd`) rather than a `day`
BETWEEN — one predicate in `studio_hours_rollup` and one in `useTimeEntryLedger`; or
(b) derive `day` from a studio timezone (explicitly out of scope per HT-13-a — needs a
ruling to reopen); or
(c) accept and **say so**: file the timer's stop at the same noon-UTC treatment the date
door already gets. (c) is the smallest but loses the time of day the timer genuinely
collected.

---

### MAJOR

#### P2-M1 · `supabase db push --include-all` cannot be run from either checkout as it stands — from one it is a silent no-op, from the other it is not linked.
*Confidence: high — both measured. Severity: major (a ship-time hazard the checklist's command line does not close).*

* `/Users/kody/Code/patina-merged` **is** the linked checkout (`supabase/.temp/project-ref`
  = `bkvcixdmuyejfzcijpdg`) but its working tree is on **stale local `main` @ `b8dd4b7f7`**,
  whose `supabase/migrations/` ends at **`00580_room_concept_render.sql`**
  (`git ls-tree main` confirms; `origin/main` carries 00581–00591 +
  `20260910152111_create_contact_messages.sql`). Run there today, `db push --include-all`
  finds no local file Strata lacks and reports success having pushed **nothing** — the
  operator reads a green and believes the schema shipped.
* `/Users/kody/Code/patina-merged/.codex/worktrees/agent-integration` has every file but is
  **not linked** — `supabase/.temp/` contains only `cli-latest`, no `project-ref` — and its
  `supabase/config.toml` is the **skip-worktree'd** isolated-stack one
  (`project_id = "patina-hours"`, ports 54421/54422; `git ls-files -v` → `S`). It must
  never be committed and should not be the ship's working directory.

*Fix (operational, no code):* merge `hour-tracking/integration` into `main`, `git -C
/Users/kody/Code/patina-merged pull`, confirm `ls supabase/migrations | tail -1` shows
`20260910152111_…` **and** `00620_…`, and only then run `supabase db push --include-all`
from that linked checkout. Added to the checklist as **§0a**.

#### P2-M2 · `studio-workspaces` and `agreement-parts` are still unread — and I measured what "off" costs: with the flag off there is no **STUDIO** tab at all, and `/desk?account=studio` falls back to PROFILE in silence.
*(= MS-06 / W7-R6-04, carried. Confidence: high on the consequence (rendered both ways); the rollout percentages remain unknown. Severity: major — must be settled before the ship.)*

The PostHog MCP server is **disconnected in this session too**, so I have no live reading
either. What I can now add is the measured consequence, which round 1 could only reason
about:

* Flag **off** (the suite's own default — see P2-m1): the Account sheet's tab row reads
  `PROFILE | NOTIFICATIONS | SECURITY | DEVICES | EXTENSION` — **no STUDIO** — and
  `/desk?account=studio` lands on Profile with no message
  (`account-sheet.tsx:133-142` reconciles `page` back to `'profile'`).
* Flag **on**: the Studio page carries `RATE CARD · + Add a role`, `AGREEMENT DEFAULTS`,
  `AGREEMENT LIBRARY`, `MEMBERS`, and the new `STUDIO n OF m · SWITCH`.

So for a studio the rollout has not reached, HT-3's per-member rate card and HT-4's role
picker **do not exist**, every services hour prices `rate_source='none'` → "rate pending"
→ $0 on the ledger, the CSV and the composer, and MS-01's new refusal means it also can
no longer reach an invoice at all. P-5 holds — this program adds no flag — but "unflagged"
describes the program's code, not the doors it hangs inside.

#### P2-M3 · The Hours e2e suite runs with `agreement-parts` and `studio-workspaces` **OFF**, and a caller's `NEXT_PUBLIC_FLAG_OVERRIDES` cannot turn them on. Any evidence gathered "with the flags forced on" through that config measured them off.
*Confidence: high — read the config, then measured the flag-off render twice. Severity: major (evidence integrity — the same class as r1's S-4).*

`playwright.config.ts:103-105` hard-codes
`NEXT_PUBLIC_FLAG_OVERRIDES = 'procurement-workspace-pilot:true,the-document-pilot:true,client-invite-letter:true'`
in its `webServer.env`. `playwright.hours.config.ts` spreads
`env: { ...baseWebServer?.env, ...stackOverride }` — `stackOverride` carries no flag key,
so the base's literal wins over the shell's value (Playwright merges `webServer.env` **over**
`process.env`). I exported
`NEXT_PUBLIC_FLAG_OVERRIDES='studio-workspaces:true,agreement-parts:true,…'` and got the
flag-**off** account sheet; only a hand-started `next dev -p 3100` with the value in its own
environment produced the Studio page.

Consequences: (1) **HT-3's rate card, HT-4's role picker, `+ Add a role`, the agreement
defaults card and the new account-page switch have zero e2e coverage** — the 7 passing
Hours cases touch none of them; (2) any round-1 or wave claim of the form "flags forced on
through `NEXT_PUBLIC_FLAG_OVERRIDES`" made through this config is about the flag-off
surface. *Fix, two lines:* put `NEXT_PUBLIC_FLAG_OVERRIDES` into `stackOverride` (or after
the base spread) in `playwright.hours.config.ts`, defaulting to the base value and
honouring `process.env` when set.

---

### MINOR

* **P2-m1 · `useAccountStudio`'s member fallback still picks in silence for a member of
  two studios.** `use-viewer-studio.ts:240-243` sorts, then takes the first
  `design_studio` — ordered now, which the original was not, so it cannot flip between
  loads. But a hire seated `member` in two studios gets no `n of m · switch` (the switch
  renders from `candidates`, which is owner/admin-only). Narrow shape, same family as
  n7-05; recorded rather than escalated because nothing she can do on that page is a money
  act.
* **P2-m2 · Three copies of the time-sub-table parser** — `invoice-composer.ts` (writer),
  `apps/client-portal/.../invoice-sheet.tsx`, `packages/patina-design-system/.../InvoicePaper.tsx`
  — with `TIME_ATTRIBUTION_KIND = "patina_time_subtable"` re-declared in each and nothing
  pinning them together. (= r1's S-8, unchanged.)
* **P2-m3 · `ScopeRollup`'s caption keeps a stray space when `studioName` is null.** The
  new branch renders `{""}{" "}· {weekLabel}`; harmless, cosmetic, noted only because the
  fix touched that expression.
* **P2-m4 · S-5 unchanged:** a rate written today does not price an hour logged before it,
  and nothing on the surface says so. Belongs in what Leah is told (checklist §2.3) and in
  Kody's walk.
* **P2-m5 · S-7 unchanged:** `useStudioUnbilledTime()` carries no studio filter, so a
  viewer who owns one studio and is a member of another can be offered the composer over
  rows RLS lets her read from both. MS-01 narrowed it (unpriced rows are dropped) but did
  not scope it.

### NOTE — ruling owed

* **P2-n1 · Which week is "this week" for a timer?** — the ruling P2-B1 needs. HT-13-a
  answered it for date-only entries and explicitly declined a studio timezone column; the
  timer path was not in front of the panel.
* **P2-n2 · Does MS-02's rule bind `00620`?** — carried verbatim from the fix report's own
  open list. `00620`'s one-off legacy stamp still applies the tier rule to any lead, not
  only a designer-domain one. Changing it moves MS-05's numbers, so it was left alone
  deliberately. Ruling owed before or with the push.
* **P2-n3 · S-9 / W7-R6-03 — should an emptied rate card block a send?** Unchanged, and now
  measured as the **default**: on the repo's own seed the Studio page's `RATE CARD` section
  renders the caption, the sentence and `+ Add a role` and **no rows at all**.
* **P2-n4 · HT-25-a, HT-6-a, HT-6-b** still OWED and shipping as built (carried from r1's
  S-10).
* **P2-n5 · `run-sql-tests.sh -d <subdir>` silently loses the allowlist** (r1's S-6) —
  unchanged; I ran the whole tree with an explicit `-k` and say so above.

---

## §3 · Disposition of every carried item I was asked to settle

No iOS file changed between `944e12a5c` and `5ee33101f` (`git diff --name-only` over
`apps/mobile` is empty), and `capture-gate.sh all` is green on the integration tip, so the
W6 rows stand exactly as round 1 left them.

### W6 (`W6-review-r3.md`)

| id | Disposition | Reason |
|---|---|---|
| **W6-R3-01** note field 20px / no AX label | **ACCEPT AS RESIDUAL** (minor) | An input, not an act; §A's 44px floor is written about acts. Reproduces the repo's existing `RouteFieldShell { TextField }`. `.frame(minHeight: 44)` + `.accessibilityLabel("Note")` at the next Field touch. |
| **W6-R3-02** save error swallowed then dismissed | **ACCEPT AS RESIDUAL** (minor) | `try?` on a local SwiftData save; the outbox is the durability path. Real honesty gap against the caption's promise; `V4VisitReviewScreen.logTheHours` already models the fix. |
| **W6-R3-06** `rate_source` NULL renders "Billable" | **ACCEPT AS RESIDUAL** (minor) | `worthLabel` returns "Awaiting authorization" for `pending_authorization` first, so only an authorized + billable + NULL-`rate_source` + rate-less legacy row misreads (HT-6-a measured that population on Strata: 4 rows, all on a test project). Two-surface divergence — the desk prints "rate not recorded". One-line fix recommended, not required. |
| **W6-R3-07** stepping duration files a future span | **ACCEPT AS RESIDUAL** (note) | Re-probed: `project_time_entries` carries nine CHECK constraints and **none** on `started_at`. Same mechanism as W7-R5-07; one shared ship-report line. **Cross-reference P2-B1** — both are the program's UTC/local seam. |
| **W6-R3-10** V4 stepper/billable gated on `projectID`, never measured at 390 | **ACCEPT AS RESIDUAL** (note) | Coverage gap, not a defect; the same `stepButton` / `Toggle("Billable")` shapes measured 45 × 45 and 350 × 53.3 on H1. Needs a fixture visit with a `projectID` in the shots matrix. |

### W7 (`W7-review-r6.md`, `-r5.md`)

| id | Disposition | Reason |
|---|---|---|
| **W7-R6-03** an emptied rate card passes readiness | **ACCEPT AS RESIDUAL + RULING OWED** → **P2-n3** | Now measured as the seed default, not an edge case. Pre-existing state (`materialize_standard_parts` seeds `'[]'`); W7's per-row `Remove` is a second, quieter door to it. |
| **W7-R6-05 / W7-R5-03** sub-44px Remove acts (18px, 30px) | **ACCEPT AS RESIDUAL** (minor) | Unchanged. One §A pass should cover **both** Removes together. For contrast, the two acts this fix round added both clear the floor: the rollup switch **164.6 × 49.5**, the account switch **164.6 × 49.5**. |
| **W7-R5-02** no re-index after Remove | **ACCEPT AS RESIDUAL** (minor) | `sortOrder` is a display key; HT-4 binds pricing on `roster_role`. Cosmetic. |
| **W7-R5-04** trim drops the tail, not the unbindable row | **ACCEPT AS RESIDUAL** (minor) | Worst case surfaces through `UNBOUND_ROLE_BLOCKER` and blocks the send — visible, not silent, not money. |
| **W7-R6-04** studio half of HT-4 behind `agreement-parts` | **STILL OPEN — MUST VERIFY BEFORE SHIP** → **P2-M2** | PostHog MCP disconnected in this session as well. **And the larger one holds:** the entire `AccountStudioPage` sits behind `studio-workspaces` (`account-sheet.tsx:105`, `:272`) — I rendered the flag-off sheet and there is no STUDIO tab at all. |
| **W7-R5-07** noon-UTC can file `started_at` in the future | **ACCEPT AS RESIDUAL** (note) | Nine CHECKs on `project_time_entries`, none on `started_at`. A consequence of HT-13-a, not a defect beside it. Shares a ship-report line with W6-R3-07 and **P2-B1**. |

### W1/W2 portal (`W1W2-portal-review-r7.md`)

| id | Disposition | Reason |
|---|---|---|
| **n7-02** studio money under the word "mine" | **ACCEPT AS RESIDUAL** (minor) | Pre-dates the wave under the same caption with no lens at all. The one-expression caption fix is cheap and worth taking with P2-m5. |
| **n7-05** a two-studio viewer reads only the alphabetical first | **FIXED — measured** | See §1. The *sentence* it produced survives for a different reason — **P2-B1**. |
| **n7-06** same-day upsert re-authors `created_by` | **ACCEPT AS RESIDUAL** (minor, raised in significance) | Under HT-3-e(2) a same-day correction **by the member herself** flips a studio-authored (pricing) row into a self-authored (inert) one, and the shipped portal path always sends `created_by: userId`. Recommend splitting insert/update so `created_by` rides only the insert. |

### W3 (`W3-review-r5.md`)

| id | Disposition | Reason |
|---|---|---|
| **W3-R5-m3** Enter submits with no note while the authority window is open | **ACCEPT AS RESIDUAL** (minor) | `log-time-sheet.tsx:167` returns early while `valid` is false; the greyed `Log it` is the only signal. One line in the existing `note` slot closes it. |
| **W3-R5-m5** the e2e serial-mode first case is red | **RESOLVED — not a defect** | Re-run whole this session on the isolated stack: **7 passed (2.3 m)**, `the sheet doorway opens the Hours book` included. |

---

## §4 · The walk — what answered correctly

Signed in against the isolated stack with `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` at
**1440** and **390**, as **owner** (`designer@patina.dev` — owner of *Leah Hartwell* and
*Local Dev Studio*) and as a **plain member** I created and then deleted (`member` of Local
Dev Studio only, `studio_designer` role so she could enter the portal at all, no owned
studio — `00295` early-exits for a user already seated, which is the production hire shape).

* **⌘K / bare `t`, nothing in hand** — the Log time dialog opens with the full capture
  door, verbatim: *"An hour with nothing in hand — a call, a drive, a sourcing run. Pick
  the document, say how long, and press Enter."*, a Document picker carrying **"Studio
  time — no document"** (HT-15), MINUTES, a **DATE** field, the five activity chips
  including **"activity not set"** (HT-24), a **NON-BILLABLE** pill (HT-11), NEVER MIND and
  LOG IT. No role chip — correct, HT-41 shows it only for a member holding more than one
  roster role.
* **The lens** — owner sees `MINE | THE STUDIO` (and no `a member` / `this document`, whose
  subjects do not exist). The **plain member sees no lens at all** (HT-8), reads **only her
  own row**, gets **no `EXPORT → CSV`**, and is offered **no repair door** (`STUDIO RATES →`
  is absent from her sheet and present on the owner's).
* **HT-26** — her unpriced hour prints **`TYPED · RATE PENDING`**, never a blank; the
  owner's priced ones print `TIMER · STUDIO RATE · $120/HR · $120`.
* **HT-30** — totals stand above the rows that produced them: `UTILIZATION / 3h 00m /
  LOGGED THIS WEEK / 100% BILLABLE`, then the pending-authority band, then the rows.
* **The pending-authority band** — *"These hours are visible, but cannot be billed until a
  services agreement authorizes a rate."* with `STUDIO RATES →` and `CEDAR LANE STUDY · 3H →`.
* **HT-35** — the opt-out reads on Account → Profile: *"The clock — While a document is
  open, Patina keeps the time for you. Turn that off and the document carries a one-tap
  start instead — the clock is still there, it just waits for you."* + the toggle *"Keep
  the time automatically while a document is open"*.
* **HT-3 / HT-4's doors** (flag on, hand-started server) — Studio page carries `RATE CARD`
  with `+ Add a role` and the binding sentence, `AGREEMENT DEFAULTS`, `AGREEMENT LIBRARY`,
  `LICENSING`, `MEMBERS` with per-member rows, and `LEAVE STUDIO` for the member.
* **390** — `documentElement.scrollWidth = 390` on every view walked; the new studio switch
  survives at 390.

---

## §5 · What I did NOT verify

* **Strata was never written to.** The only prod contact was `supabase migration list
  --linked` (read-only). No `db push`, no `functions deploy`, no `wrangler deploy`.
* **PostHog flag state is still UNKNOWN.** The PostHog MCP server is disconnected in this
  session (`plugin:posthog:posthog` listed as disconnected). Both flags gate ruled surfaces
  — P2-M2.
* **MS-05's seven Strata numbers are still unread.** The preflight SQL is ready.
* **Prod exposure of P2-B1 is unmeasured** — no read-only Strata credential. The mechanism
  and the local measurement are solid; how many Strata rows sit in the nightly band is not.
* **iOS is Simulator-only.** `capture-gate.sh all` green on the tip; no physical device, so
  every camera/LiDAR/upload/airplane-mode-drain claim in W6 remains **not device-verified**.
  P-6 rules that acceptable; Kody's walk is the closure.
* **Client-portal e2e not run** (chromium-only suite). The client change is covered by
  `invoice-sheet-time-subtable.test.tsx` and `InvoicePaper.test.tsx`, both inside the
  151/151 pass; I read `invoice-sheet.tsx`'s parser end to end and it fails closed to plain
  text for every non-`time` line kind and every unparseable payload.
* **Lint outside designer-portal was not run** and would not be trustworthy if it had been.
* **1024 was not walked by hand** — covered by the suite's own passing case.
* **The CSV was read as code, not downloaded.** No file was produced in a browser; the
  14-column contract and the deliberate absence of `notes` (HT-36) were verified by reading.
* **The `this document` lens was not driven from inside a document** (`?sheet=hours` is a
  `/desk` doorway); covered by the suite's three width cases.
* **The `Bill week → Accounts` act was not clicked** as the plain member; it renders
  `disabled` when `weekUnbilled` is empty, which was her state, but I did not assert the
  attribute.
* **I mutated the isolated stack and cleaned up after.** Created and deleted
  `r2-member@patina.dev` (auth user, membership, `user_roles` row); inserted and deleted
  3 `project_time_entries` and 1 `studio_member_rates` row. Final state verified:
  `entries 0 · rates 0 · testuser 0`. I did **not** reset the stack. Two temporary files
  (`e2e/document/zz-r2-walk.spec.ts`, `zz-r2drive.cjs`) were written and deleted;
  `git status` in the worktree is clean (`next-env.d.ts`, touched by `next dev`, was
  restored). Port 3100 is free; 3000/3002 were never touched.
