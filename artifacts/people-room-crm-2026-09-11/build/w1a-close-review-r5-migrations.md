# W1a close-out — adversarial migration review, round 5

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, HEAD `e409a7825`
(`fix(consent): a STOP whose studio could not be read is not a STOP that
landed, and the START asks the verdict`). Local Postgres only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). **No prod act of
any kind** — no `supabase db push`, no `supabase functions deploy`, no Strata
connection.

Read in full: `rulings.md` (all sections, R-A…R-AV), `synthesis/direction.md`
§2.2/§3.8/§7/§8, `synthesis/crm-model.md` §1/§2/§4/§5,
`briefing/current-state.md` §B–§E, `build/inventory.md`, `briefing/fixture.md`,
`build/w1a-report.md`, `build/w1a-close-review-r4-migrations.md`,
`build/w1a-close-fix-log-r4.md`, `build/w1a-review-r10-tests.md`, and the four
migrations the report names (`00592`, `00593`, `00594`, `00621`) plus
`_shared/sms.ts`, `sms-inbound/pipeline.ts`, `field-daily/core.ts`,
`sms-dispatch/index.ts`, `use-coordination.ts`, and the grep-winning lineages
(`00282`, `00284`, `00374`, `00419`, `00589`, `00317`, `00318`, `00563`).

**Verdict: NOT clean — 1 BLOCKING, 1 MAJOR, 5 fresh MINOR, 24 carried MINOR.**

Both non-minor findings are the **same population**: a seat whose studio cannot
be resolved, or whose refusal lives only on a frozen seat. r4's three findings
are all genuinely fixed. What is left is the one item the report parks for
Fable (§5.2 bullet 3 / r1 F1) — graded BLOCKING here because the rubric's own
clause ("an opt-out can be lost … without a newly recorded consent") describes
it word for word — and one half of r3 MAJOR-4 that was closed at the portal
door and not in the database.

---

## 1. What I ran

### 1.1 `.env.local` check, before any destructive local act

Sandbox disabled for this one read.

```
$ grep -n NEXT_PUBLIC_SUPABASE_URL /Users/kody/Code/patina-merged/apps/designer-portal/.env.local
1:# prod # NEXT_PUBLIC_SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co
14:# prod # NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
19:NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
$ ls .codex/worktrees/agent-people-build/apps/designer-portal/.env.local
No such file or directory        # the worktree has none; the repo root's is the one read
```

Local. Not Strata. And no concurrent reset this round:

```
$ ps -Ao pid,ppid,command | grep -iE "supabase:reset|supabase db reset" | grep -v grep
(no rows)
```

### 1.2 Reset, twice

```
$ pnpm --dir .../agent-people-build supabase:reset        # pass A
RESET_A_EXIT=0
Restarting containers...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
$ grep -icE "^error|failed" reset-r5-a.log → 0
$ psql … -At -c "select version from supabase_migrations.schema_migrations order by version desc limit 4;"
20260910152111
00621
00594
00593

$ pnpm --dir .../agent-people-build supabase:reset        # pass B
RESET_B_EXIT=0
Finished supabase db reset on branch main.
$ grep -icE "^error|failed" reset-r5-b.log → 0
$ psql … → 20260910152111 / 00621
```

### 1.3 SQL tests — after pass A and again after pass B

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
PSQL_EXIT=0
44                                  # lines matching ": passed"
NOTICE:  All W1a assertions passed.
ROLLBACK
$ grep -nE "ERROR|FAIL" sqltest-r5-a.log → (no matches)
```

Pass B: `PSQL_EXIT=0`, 44 blocks, `All W1a assertions passed.`, no `ERROR|FAIL`
line at all.

### 1.4 Replay / idempotency

Each migration re-applied inside its own rolled-back transaction:

```
--- replay 00592_people_cards_affiliations_rules --- EXIT=0 errors=0
--- replay 00593_studio_contact_channels        --- EXIT=0 errors=0
--- replay 00594_studio_channel_consent         --- EXIT=0 errors=0
--- replay 00621_consent_readers_repointed      --- EXIT=0 errors=0
```

### 1.5 Legacy grants, generated types, Deno, package gates

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2644 replayed statements
$ diff -u <before> supabase/seed/00-legacy-grants.sql   → (no output)
$ git status --porcelain supabase/seed/00-legacy-grants.sql → (clean)

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir .../agent-people-build db:generate
GEN_EXIT=0
$ diff -u <before> packages/supabase/src/database.types.ts → (no output)   # no drift
37486 packages/supabase/src/database.types.ts

$ deno test --no-check -A --node-modules-dir=auto --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts \
    supabase/functions/_tests/field-daily.test.ts
ok | 100 passed | 0 failed (172ms)
$ ls deno.lock → No such file or directory

$ pnpm --dir .../agent-people-build --filter @patina/supabase test
Test Files  100 passed (100)
     Tests  1253 passed | 12 skipped (1265)
$ pnpm --dir .../agent-people-build --filter @patina/supabase type-check
> tsc --noEmit        # clean
```

Nothing I ran changed a tracked file.

### 1.6 My own probes — objects, access, and one rolled-back fixture

`/tmp/claude/probe-r5-objects.sql` (pg_proc / pg_class / pg_trigger / pg_policy
only) and `/tmp/claude/probe-r5-behaviour.sql` (one fixture, `BEGIN … ROLLBACK`).
Output is pasted inside the findings.

---

## 2. Migration rules — pass/fail

| Rule | Verdict |
|---|---|
| hand-numbered `NNNNN_slug.sql` | **PASS** — `00621_consent_readers_repointed.sql` |
| 00595–00620 reserved; W1b mints from 00622 | **PASS** — nothing in the range; report §8 line 757 says 00622 |
| grep-winner before redefining a function/view | **PASS** — I re-ran every grep. `field_activity_summary` → `00282` alone; `fc_dispatch_court_assignment` / `fc_dispatch_task_assignment` → `00284` alone; `v_project_roster` → `00419`; `people_directory` → `00589`. I diffed all four grafts against their winners: **one expression changed each**, everything else byte-identical (both early returns, the party-kind filter, the fire-and-forget `BEGIN/EXCEPTION`, the template key, the vars, the REVOKE; the roster's team branch and all 16 other columns; the directory's five other branches) |
| banner + lineage | **PASS** — `00621:1-63` names both findings, all three lineages with line ranges, the reason for the seat disjunct, the reason for the `COALESCE`, the grant posture, and the numbering note |
| idempotent | **PASS** — `CREATE OR REPLACE` ×3 + restated GRANTs in 00621; `CREATE TABLE IF NOT EXISTS` + mirrored `ALTER … ADD COLUMN IF NOT EXISTS` + a guarded `DO` block for the CHECK in 00594; replay clean for all four (§1.4) |
| RLS in the same file | **PASS** — 00621 adds no table. 00594's table: RLS on, one SELECT policy, grants stated in the same file |
| explicit grants both directions + `REVOKE … FROM PUBLIC, anon` on definer RPCs | **PASS on the wave's own objects.** Probed ACLs for all 13 relevant functions: **`anon` holds EXECUTE on none of them** (probe §10 returned 0 rows); `_primary_studio_for` is still `postgres=X` alone. Two pre-existing `authenticated=X` residues are carried MINORs (fresh MINOR-4, carried MINOR-3) |
| SECURITY DEFINER pins `search_path` | **PASS** — every wave definer carries `search_path=public` (one 00593 trigger fn pins `public, pg_temp`; carried MINOR-14) |
| schema-qualify extension fns | **PASS** — the only bare call is `gen_random_uuid()`, which resolves in `pg_catalog` on this stack (probed: `pg_catalog.gen_random_uuid` exists alongside `extensions.gen_random_uuid`) and is the idiom in 106 prior migrations. 00594/00621 call no extension function at all |
| guarded crons | **N/A** — grep for `cron`/`job_runs` across all four files returns nothing |
| CHECK over enum for new vocab | **PASS** — `status` / `channel_kind` / `source` / `opt_out_source` are all CHECKs, and `opt_out_source`'s is also stated as a guarded `DO` block for the ALTER path |
| money integer cents | **N/A** |
| regenerate `seed/00-legacy-grants.sql` after any GRANT/REVOKE | **PASS** — regenerating produced a byte-identical file (§1.5) |
| apply with `supabase:reset` | **PASS**, twice, `.env.local` checked first |
| `db:generate` | **PASS** — no drift |
| SQL tests under `supabase/tests/people/` via psql | **PASS** — exit 0, 44 blocks, twice |
| probe objects, never the ledger | **PASS** — catalog reads plus one `BEGIN … ROLLBACK` fixture |
| RLS predicate: `is_active_studio_member(organization_id)` for the `studio_contacts` family | **PASS** — probed `pg_policy`: `studio_contact_channels` and `studio_person_affiliations` use `is_active_studio_member(studio_contact_org(…))` on all four commands; `studio_channel_consent` uses `is_active_studio_member(organization_id)` |
| RLS predicate: `is_studio_comember(designer_id)` for the `project_parties` family | **PASS** — `studio_contact_rules`' `subject_type = 'engagement'` branch is `is_studio_comember(project_party_designer(subject_id))` on all four commands |
| site access card has NO client branch (PR-w) | **N/A this wave** — `project_site_access_cards` does not exist yet (probed: not in `pg_class`). Nothing in 00592/00593/00594/00621 adds a client-facing branch to anything |

### The single-source consent model, point by point

| Claim | Verdict |
|---|---|
| no code path writes party `sms_consent_*` except the guarded legacy path | **QUALIFIED PASS, as disclosed.** Probed the freeze end to end: `refuse_legacy_consent_write_trg` is `BEFORE UPDATE OF` all eight columns, and **each of the eight individually raises `consent_legacy_column_frozen`** (probe P5a, eight lines, eight refusals). The only opener is `app.consent_legacy_write='on'`, and a tree-wide grep for that GUC outside 00594 and the test file returns nothing. The **INSERT** path is deliberately untouched (`use-coordination.ts:486-503`) and load-bearing for 00432's invite trigger — disclosed §3. **One UPDATE shape still reaches a frozen column's MEANING without naming it: a phone-only UPDATE on an `opted_out` seat — MAJOR-1 below.** |
| the send gate refuses on the record or on an org-scoped `opted_out` row | **PASS** — `channelConsentVerdict` (`_shared/sms.ts:448-558`): failed resolve → refuse; `status='opted_out'` → refuse; `refusal_unanswered` → refuse; `orgHasOptedOutParty` → refuse; then `granted` → allow. `orgHasOptedOutParty` (`:355-381`) reads `opted_out` only, org-scoped, and refuses on an unattributable seat. Every Twilio call in the tree goes through `sendPartySms` or `flushDeferredMessages` except `sms-dispatch`'s own account-holder rail (`index.ts:396`, keyed on `profiles.sms_opt_in`, a separate pre-existing rail this wave does not touch); `handlePartySms` delegates entirely (`index.ts:100-146`) and writes nothing before the gate |
| START scope | **PASS, and r4 MAJOR-1 is fixed.** `recordVerdict()` (`pipeline.ts:331-335`) is `channel_consent_status()` in TypeScript; `studiosHoldingRecord` (`:283-314`) selects `refusal_unanswered` and filters `onlyVerdicts.includes(recordVerdict(r))`; the START call site (`:782-785`) keeps `['opted_out','pending']`, so the fold's `granted + flag` and `not_asked + flag` shapes are now in the target set, and R-AJ's narrowing survives by construction. Two new Deno tests pass; 00594's `refusal_unanswered` column comment and `channel_consent_status`'s function comment are corrected **and present in the applied DB** (probed `t\|t`) |
| evidence never nulled on the record | **PASS** — every consent-side `SET` leg is `COALESCE(NULLIF(btrim(…),''), scc.…)` or an explicit keep (`00594:1807-1817`); the four `opt_out_*` are touched only by a refusal (`:1838-1865`) and never by `reconsent()` (`:2322-2368`); `reconsent()` restates the five plus its own `consented_at`. Blocks 10/18/23/27/35/36 assert it and pass |
| `v_project_roster` and `people_directory` read the record | **PASS** — probed `pg_views`: both definitions contain `channel_consent_status`, and **neither matches `pp\.sms_consent_status`**. The only seat columns left in `people_directory` are `pp.sms_consented_at` / `pp.sms_opt_out_at` (the two DATES, disclosed §5.3; grep confirms no shipped consumer) |
| RLS / grants | **PASS** — `studio_channel_consent`: `relrowsecurity=t`, one SELECT policy for `authenticated` (`is_active_studio_member(organization_id)`), ACL `authenticated=r` and nothing more, `service_role=arwdDxtm`, **no `anon` at all**, and no INSERT/UPDATE/DELETE policy — the three RPCs are the only doors. Probe P6: a Beta owner reading Alpha's verdict gets `(NULL)` |
| reset twice | **PASS** (§1.2) |

---

## 3. Prior findings re-checked

### r4's three non-minor findings

| Finding | Now |
|---|---|
| **BLOCKING-1** (a STOP acknowledged 200 when the studio-attribution read errored) | **FIXED.** `studiosHoldingPhone` returns `{ targets, failed }` (`pipeline.ts:233-271`, docblock `:219-231`); the STOP branch gates on all four flags (`:738-741`) with `partyOrgReadFailed` in the log (`:748`), answers `500 / opt_out_incomplete` and clears `twilio_sid` (`:752-760`). START/YES deliberately do not gate, with the reason stated at `:776-781`. Two new Deno tests; 100 pass |
| **MAJOR-1** (START read the column where the room read the verdict) | **FIXED.** See the START row in §2 above. R-AU recorded in `rulings.md` |
| **MAJOR-2** (Patina Field punch routing) | **ADDRESSED as option (a), disclosure.** §5.1b's table gains the punch-routing row and §8 gains the "dead until W2" bullet; R-AV recorded. I verified every citation against the Swift: `PunchTaskWrite.swift:98-106` gates on `$0.smsConsentGranted`; `SupabaseSiteRequestService.swift:16-18` selects `…,party_kind,sms_consent_status`; `:513-519` maps `smsConsentGranted: consentStatus == "granted"`. The fix log's rejection of option (b) is evidenced (no `phone_e164` on `v_project_roster` — I re-probed the column list) and reasonable |

### r3's four

All four still fixed: `field_activity_summary` reads the record and not the seat
(probed); both 00284 gates repointed and still DEFINER with `search_path=public`
and their triggers untouched (probed `pg_trigger`); `field-daily`'s two selects
ask `mayTextField` → the exported `channelConsentVerdict`; the phone-correction
refusal is in `use-coordination.ts:751-753`. Blocks 41 and 42 pass. **One half
of MAJOR-4 was closed at the portal door only — MAJOR-1 below.**

### r1 / r2

`writeChannelConsent` checks read **and** write (`pipeline.ts:416-423`, `:532-539`);
`project_consent_org` exists and both views call it (`00594:1025-1035`, `:1101`,
`:1297`, `:1309`); `record_channel_invite` is called before the INSERT
(`use-coordination.ts:464-482`); `AND NOT (EXCLUDED.status='pending' AND
scc.status='granted')` at `00594:1949`; `channel_consent_status` folds the flag
at `:961-962`. Blocks 38/39/40 pass.

### r4's 24 MINORs

All **OPEN**, unchanged, exactly as r4 assessed them. Ones I re-verified with
fresh evidence rather than by reading the prior report:

- **MINOR-A** — `field-daily/core.ts:202-205` still has no `.order()` / `.range()`
  (grep returns nothing) and `supabase/config.toml:18` still sets
  `max_rows = 1000`. Unbounded, silently truncatable.
- **MINOR-B** — `channel_value_was_on_sms_rail` (`00593:209-229`) is still a
  frozen-column reader, still `postgres=X | service_role=X` (probed), and still
  absent from §2.3b's "three more SQL readers" and from §5.1b's table. My own
  catalog sweep finds **eleven** functions whose bodies read
  `sms_consent_status`: the six the report accounts for plus
  `site_request_send`, `site_request_resend`,
  `site_request_dispatch_after_consent` (all §5.1),
  `_site_request_consent_granted_dispatch` (§5.1b) and this one.
- **MINOR-E** — four inlined resolver copies remain, at `00594:405` (the fold),
  `:1645`, `:1921`, `:1989` (the three seat tests), against `:1032`'s
  "one resolver".
- **MINOR-12** — probe P6: a Beta owner calling
  `project_consent_org('<Alpha project>')` gets
  `b5000000-…-00000000000a` (Alpha's org id). Ungated definer oracle, but it
  returns an org id only — the verdict itself came back `(NULL)`. Same shape as
  the shipped `studio_contact_org` (`00592:65-76`), which is the precedent
  `00594:1020` cites.
- **MINOR-16** — measured again after a clean reset: `studio_channel_consent` = **0
  rows**, `project_parties` = **0 rows**. Every fold assertion rests on the test
  file's own fixtures; the first prod fold is the first run over real data.

---

## 4. Findings

### BLOCKING-1 — a STOP on a project no studio can be resolved for is acknowledged 200, records nothing on any ledger, and the number stays textable; both room readers then print "Not asked" for it

**Files:** `supabase/functions/sms-inbound/pipeline.ts:697-763` (the STOP
branch), `supabase/functions/_shared/sms.ts:308-342` (`orgsOfProjects`),
`:453-557` (`channelConsentVerdict`'s no-studio branch),
`supabase/functions/field-daily/core.ts:59-71` (`mayTextField`'s legacy leg),
`supabase/migrations/00594_studio_channel_consent.sql:405` + `:445` (the fold's
`WHERE org IS NOT NULL`), `:1032` (`project_consent_org`).

**This is report §5.2 bullet 3 and close-review r1's F1**, which the report
parks for Fable ("Fable's call: leave it, refuse every unattributable send
outright, or make an unresolvable org a loud 500"). I am grading it BLOCKING,
not re-discovering it: the rubric's second BLOCKING clause — *"an opt-out can be
lost or overwritten without a newly recorded consent"* — describes this
literally, and "clean" is a rubric verdict rather than a judgement about which
wave owes the fix. Two things are new this round: the loss is now **walked end
to end in code with a probe behind it**, and the same population makes **both
shipped room readers print the wrong word**, which §5.2 does not say.

**The population is real in shape.** `projects.studio_id` is nullable (probed),
and after a clean local reset **5 of 6 projects carry `studio_id IS NULL`**.
00317 backfilled `studio_id = _primary_studio_for(designer_id)`, so what remains
on a live book is exactly the designers with no active `design_studio`
membership — the population `_shared/sms.ts:266-275` and `00594:405` both write
a fallback for.

**Probed** (`/tmp/claude/probe-r5-behaviour.sql`, one rolled-back transaction; an
"orphan" project with `studio_id IS NULL` whose designer holds no membership,
carrying one pre-fold `granted` seat):

```
=== P1. the unattributable project: does any org resolve? ===
                  id                  | studio_id | primary_studio | consent_org
--------------------------------------+-----------+----------------+-------------
 d5000000-…-00000000000c              |           |                |
```

`project_consent_org` → NULL, `_primary_studio_for` → NULL. So:

- **The fold skips it** (`00594:445`, `WHERE org IS NOT NULL`) — no record is
  ever minted.
- **The STOP records nothing.** Walked: `loadPhoneParties` succeeds
  (`failed=false`); `studiosHoldingRecord` returns `[]` (`failed=false` — there
  is genuinely no record); `studiosHoldingPhone` → `orgsOfProjects` finds
  `studio_id IS NULL`, calls `primaryStudioFor`, gets `{org:null, failed:false}`
  — **`failed` is correctly false, because nothing errored** — so the map is
  empty and `targets=[]`, `failed=false`. `withRecordOnlyStudios([], [])` = `[]`.
  `writeChannelConsent(…, [], …)` loops zero times and returns
  `{failed:false}`. All four flags at `:738-741` are false → **200 /
  `disposition: "opted_out"`**, `twilio_sid` claim kept, no retry. r4's
  BLOCKING-1 fix does not reach this: that flag says "a read errored", and here
  nothing errored (R-AM's own distinction, pointed the other way).
- **The next send goes out.** `channelConsentVerdict(phone, orphanProject)`:
  `failed=false`, `org=null` → both `if (org)` blocks skipped → phone-global
  RECORD scan (`:525-541`) finds nothing → phone-global PARTY scan
  (`:543-557`) finds nothing `opted_out`, **because R-AS deleted
  `optOutAllForPhone()`'s phone-global seat write and the seats are frozen** →
  `"unknown"`. `field-daily`'s `mayTextField` then honours the frozen
  `granted` seat (`core.ts:70`) and `sendPartySms`'s legacy leg passes it
  (`sms.ts:824`). The digest is sent.

**And the room prints the wrong word for the same seat** (probe P2, same
fixture, the "Orla Orphan" row):

```
 display_name |   seat    | record_word | would_dispatch
--------------+-----------+-------------+----------------
 Orla Orphan  | granted   |             | t
```

`channel_consent_status(NULL, 'sms', …)` can never match a row, so both views
`COALESCE` to `'not_asked'`. The Call Sheet prints "Not asked", the Directory
prints "Not asked", `roster-derivation.ts:390`'s "N reachable by text" vitals
under-count — for a seat holding an evidenced grant that the cron, the two 00621
dispatch gates and `sendPartySms` all still treat as textable. §5.2 bullet 3
describes only the SEND fail-open; the reader half is unstated.

**Why it is a regression rather than a pre-existing gap.** Before this wave the
STOP branch's `optOutAllForPhone()` stamped every seat on the number
phone-globally, with no org resolution involved at all — so this exact seat read
`opted_out`, `reduceConsent` returned `opted_out`, and both the send gate and
the room refused. The report says so itself ("Before this wave the phone-global
party write covered it").

**Mitigation worth naming.** Twilio Advanced Opt-Out holds its own block list at
the Messaging Service level — the branch's own comment at `pipeline.ts:762` says
Twilio already auto-replied — so the outbound attempt would most likely come back
`21610` rather than reach the handset. That is environmental, outside the
platform's own gate, and it does not make the ledger honest: Patina's record of
the refusal is nowhere, the room says "Not asked", and
`record_channel_consent(…, 'granted', …)` would mint a fresh grant for that
number the moment the project gains a studio.

**The three options the report lists are still the options.** The cheapest that
closes the loss without a policy decision is the third: make an **unresolvable**
org on the STOP branch a `500 / opt_out_incomplete` with the claim released,
exactly as the four read-failure flags already do — i.e. have
`studiosHoldingPhone` also report "some seats resolved to no studio at all"
(distinct from `failed`), and gate the STOP on it. Twilio then retries, and if
the project is still studio-less the refusal is loudly unrecordable rather than
quietly lost. Fable's ruling is what this needs; it is not a defect in any line
of 00594 or 00621.

---

### MAJOR-1 — a phone-only UPDATE still transplants a frozen `opted_out` refusal onto a number that never refused; the freeze cannot see it, and only the portal hook refuses

**Files:** `supabase/migrations/00594_studio_channel_consent.sql:894-901` (the
trigger's `BEFORE UPDATE OF` column list),
`packages/supabase/src/hooks/use-coordination.ts:751-753` (the portal refusal),
against `supabase/functions/_shared/sms.ts:355-381` (`orgHasOptedOutParty`) and
`00594:1638-1662` / `:1914-1922` / `:1983-1997` (the three seat gates).

**Claim.** r3 MAJOR-4 was closed in the hook and not in the database. The freeze
is `BEFORE UPDATE OF` the eight consent columns, so an UPDATE that names only
`phone` / `phone_e164` never fires it — which is precisely the shape that moves
the refusal, because the refusal is identified by `phone_e164`, not by the
consent columns.

**Probed** (P5b, same rolled-back transaction — an `opted_out` seat, then a
phone-only UPDATE):

```
=== P5b. a phone-only UPDATE on an opted_out seat: does the freeze fire? ===
NOTICE:  phone-only UPDATE on an opted_out seat -> LANDED (freeze did not fire)
         (now +16125550399 / opted_out)
```

**Failure scenario (concrete).** A studio holds a real inbound STOP on
`+16125550302`; the fold minted `opted_out` on both the record and the seat. A
studio member corrects a typo through any client that is not the party sheet — a
`PATCH /rest/v1/project_parties?id=eq.<seat>` with `{"phone":"612-555-0399"}` is
enough, and `project_parties`' UPDATE policy is
`is_studio_comember(designer_id)` (`00584:884-921`), so **any authenticated
member of the studio can issue it**. The seat now reads `opted_out` against
`+16125550399`. From that moment:

- `orgHasOptedOutParty(+16125550399, org)` returns true, so **every** send to the
  corrected number is refused as `opted_out`;
- all three write doors refuse a grant for it (`channel_opted_out`);
- and the room prints the RECORD's word for `+16125550399` — `granted` where the
  studio already holds a real grant for it (the commonest typo shape), or
  `not_asked` where it holds none. **Record and reader disagree**: the Call Sheet
  says "Texting", every text comes back `opted_out`, and nothing on any surface
  names the transplanted seat. That is G-3's sentence restored inside the record
  built to end it — the report's own words for this finding.

**Why MINOR does not fit.** The rubric's MINOR carve-out is "paths reachable only
by `service_role`". This one is reachable by an ordinary authenticated studio
member through PostgREST, and it satisfies MAJOR word for word ("a reachable
write path leaves the record and a reader disagreeing"). The report's §5.2
bullet 1 does name the residue — "any future transplant done outside the hook
(service_role, SQL, a direct PostgREST call)" — so this is a severity
disagreement with r4's grading, not a new fact.

**Fix, and it is cheap and in this wave's own file.** Add `phone, phone_e164` to
`refuse_legacy_consent_write_trg`'s column list and one clause to the function:
refuse when `OLD.sms_consent_status = 'opted_out'` **and**
`NEW.phone_e164 IS DISTINCT FROM OLD.phone_e164`, with the hook's own sentence as
the HINT. That is symmetrical with what the trigger already does for the other
direction (a `pending`/`granted` seat's phone edit restates the eight and is
refused), it puts the rule where the hook cannot be bypassed, and it leaves every
legitimate phone edit on a `not_asked` / `pending` / `granted` seat behaving
exactly as it does today. A cosmetic reformat still lands, because
`phone_e164` is derived by `normalize_party_phone_e164` before this trigger's
tuple comparison. One test block, in the shape of block 13.

---

### MINOR-A (fresh) — 00621's dispatch gate lets a frozen `granted` seat OVERRIDE a recorded refusal, where the header describes a record-absent FALLBACK

`supabase/migrations/00621_consent_readers_repointed.sql:152-157` and
`:216-221`:

```sql
OR (NOT COALESCE(
      public.channel_consent_status(
        public.project_consent_org(NEW.project_id),
        'sms', v_party.phone_e164) = 'granted',
      false)
    AND v_party.sms_consent_status <> 'granted')
```

The banner says the seat leg exists because "sendPartySms … still honours a
frozen seat holding a real pre-fold grant. A gate that dropped that leg would
refuse dispatches the send rail itself would allow." That is the right intent
for a seat with **no record**. As written the conjunction also fires when the
record says `opted_out`: the record leg is true, the seat leg is false, so the
early return does not happen and the trigger dispatches. Probed (P2, "Gus GC" —
Alpha's record says `opted_out` with `refusal_unanswered`, his seat is a
pre-fold `granted`):

```
 display_name |   seat    | record_word | returns_early | would_dispatch
--------------+-----------+-------------+---------------+----------------
 Gus GC       | granted   | opted_out   | f             | t
 Orla Orphan  | granted   |             | f             | t
 Sal Sub      | not_asked | granted     | f             | t
```

**No text goes out** — `sms-dispatch`'s `handlePartySms` delegates straight to
`sendPartySms` (`index.ts:100-146`), whose gate refuses and returns before
`insertOutbound`, so not even an `sms_messages` row is written. So this is cost
and noise (a `pg_net` invoke plus an edge-function round trip per assignment for
every refused party), not a send — MINOR by consequence. It is worth fixing
anyway because it is the same shape six rounds have been removing (a gate
trusting the frozen seat over the record), pointed in the permissive direction,
and because the function's own COMMENT says "to a consented field party".

Fix: make the seat a fallback rather than an override —

```sql
OR COALESCE(
     public.channel_consent_status(
       public.project_consent_org(NEW.project_id), 'sms', v_party.phone_e164),
     v_party.sms_consent_status) <> 'granted'
```

which reads the seat only when the record is absent, keeps `COALESCE`'s
fail-closed NULL handling, and needs no new test fixture beyond block 42's
existing four (add a fifth: record `opted_out`, seat `granted` → no dispatch).

### MINOR-B (fresh) — 00621 put a non-inlinable definer call inside a view the Desk polls every 30 seconds with no project filter

`00621:88-90` passes `pp.project_id` to `project_consent_org()`. That function is
SECURITY DEFINER, so it is never inlined (carried MINOR-6), and the subquery
evaluates it **once per candidate party row**. The caller amplifies it:
`packages/supabase/src/hooks/use-field-activity.ts:47-51` selects
`field_activity_summary` with **no `.eq('project_id', …)`** and
`refetchInterval: 30_000`, so every open Desk tab re-evaluates the rollup for
every project its RLS admits, twice a minute. Before 00621 that count was a
plain predicate on an indexed column.

The subquery already constrains `pp.project_id = p.id`, so passing the **outer**
`p.id` is the identical value and makes the org a per-project constant the
planner can hoist out of the row loop:

```sql
AND public.channel_consent_status(
      public.project_consent_org(p.id), 'sms', pp.phone_e164) = 'pending')
```

One token, no behaviour change, one definer call per project instead of one per
party row. (The same hoist is not available in `v_project_roster` /
`people_directory`, where `pp.project_id` really does vary per row — that is
carried MINOR-6 and stays owed.)

### MINOR-C (fresh) — the add path fails the whole act, in a raw Postgres string, on a record carrying an unanswered refusal

`use-coordination.ts:464-482` calls `record_channel_invite` **before** the
INSERT, and throws whatever it raises. Probed (P4, a record at `not_asked` with
`refusal_unanswered = true` — the fold's second W4-M1 shape):

```
NOTICE:  record_channel_invite on not_asked+flag -> consent_awaiting_recipient
```

`asWrittenConsentRpcError` (`:577-601`) maps four errors and not this one, so the
party sheet renders `consent_awaiting_recipient` verbatim — **and the party is
not added to the roster at all**, because the RPC runs first. Pre-freeze the seat
was inserted and only the text was refused. Fail-closed and recoverable (untick
"text updates" and add them), but nothing on the face says so. This sharpens
carried MINOR-7 (two unmapped RPC errors) with the consequence that matters: the
add fails, not just the text. One more branch in
`asWrittenConsentRpcError` — "This number has a refusal on it that they haven't
answered. Add them without texting for now." — costs nothing.

### MINOR-D (fresh) — 00621's two trigger functions keep `authenticated` EXECUTE while the file says otherwise

Probed ACLs after a clean reset:

```
 fc_dispatch_court_assignment | postgres=X/postgres authenticated=X/postgres service_role=X/postgres
 fc_dispatch_task_assignment  | postgres=X/postgres authenticated=X/postgres service_role=X/postgres
```

00621 restates `REVOKE ALL … FROM PUBLIC, anon` (`:183`, `:247`) exactly as
00284 shipped it, so `authenticated` keeps what creation-time defaults (replayed
locally by `seed/00-legacy-grants.sql`) gave it. Inert — a direct call raises
`0A000` "trigger functions can only be called as triggers" — and identical in
shape to carried MINOR-3 on `refuse_legacy_consent_write`. Worth one explicit
`REVOKE EXECUTE … FROM authenticated` on all three if the wave wants the probed
ACL to match what the file claims.

### MINOR-E (fresh) — the report's own verification numbers are stale after r4

`build/w1a-report.md:675` says `ok | 96 passed | 0 failed` — r4 added four tests
and its own fix log records `ok | 100 passed`; my run confirms **100**. And
`:637` says the SQL suite is "**45 passed**" where the run emits **44** numbered
`: passed` blocks (the 45th NOTICE is `All W1a assertions passed.`). The report
is the evidence artifact a deploy reads; both numbers should be what a re-run
prints. Carried MINOR-17 said the report was stale in four places; these two are
new since r4's edits.

---

## 5. Things I checked that are clean (so the next round need not re-walk them)

- **No cross-tenant read or write through the wave's own objects.** Every table
  the wave adds has RLS on, no `anon` in its ACL, and a member predicate on
  every command (probed `pg_policy`, 13 policies). `studio_channel_consent` has
  a SELECT policy and nothing else, so the three RPCs are the only write doors.
  Probe P6: a Beta owner reads `(NULL)` for Alpha's verdict; block 37's
  isolation leg and block 38's resolver leg both pass.
- **Every wave definer pins `search_path` and is closed to `anon`** (probed
  `pg_proc.proacl` + `proconfig`; the anon-EXECUTE query returned 0 rows).
  `_primary_studio_for` is still `postgres=X` alone.
- **The four grafts are faithful**, diffed line by line against 00282/00284/
  00419/00589: one expression each.
- **The freeze is complete on the UPDATE side**, column by column (probe P5a:
  eight refusals) — and the tuple comparison lets a whole-row restatement
  through, so the shipped portal's whole-row writes still land. No other
  `BEFORE` trigger on `project_parties` touches the eight (probed
  `pg_get_triggerdef` for all five).
- **The mirror is gone** and nothing reads the suppression flag (probed
  `mirror_fn = 0`; `fc_dispatch_optin_invite` and
  `_site_request_consent_granted_dispatch` carry their shipped bodies and their
  shipped triggers).
- **Both room readers read the record and neither reads `pp.sms_consent_status`**
  (probed `pg_views`, regex-matched).
- **No portal reader of the frozen column.** Every designer-portal consent read
  is view-sourced: `roster-row.tsx:95`, `people-derivation.ts:233`,
  `party-profile-sheet.tsx:260`, `roster-derivation.ts:390`. The only writers
  are `use-coordination.ts`'s own two, and `use-studio-contacts.ts:440` touches
  `studio_contact_id` alone.
- **`site_request_send` really does raise, and atomically.** Walked
  `00374:1240-1290`: the `not_asked → pending` UPDATE (`:1265-1268`) is reached
  after every other guard, so the RPC raises and its whole statement rolls back —
  no half-sent site request. `_resend` (`:1364`) and
  `_dispatch_after_consent` (`:1424`) gate on `= 'granted'` exactly as §5.1
  says. The disclosure is accurate.
- **The `app.consent_legacy_write` hatch has no setter anywhere** outside 00594
  and the test file (tree-wide grep of `supabase`, `packages`, `apps`, `infra`,
  `scripts`).
- **`field_activity_summary` is safe for `anon` today** despite its
  creation-time-default ACL (`anon=arwdDxtm`): probed `SET LOCAL ROLE anon;
  SELECT count(*)` → **0**, because `projects` RLS hides every row before any
  subquery is evaluated (carried MINOR-G).
- **Generated types and the legacy-grants seed are already correct** —
  regenerating both produced byte-identical files.
- **Replay is idempotent** for all four migrations, including the fold, which
  re-runs, writes nothing new (`ON CONFLICT DO NOTHING`) and reaches no seat.
- **`gen_random_uuid()` needs no qualification** on this stack (resolves in
  `pg_catalog`; 106 prior migrations use the bare call).

---

## 6. What would make this clean

1. **BLOCKING-1** is Fable's ruling, not a code defect in 00594/00621. The
   narrowest close that does not decide policy: give `studiosHoldingPhone` a
   second flag for "a seat resolved to no studio at all", gate the STOP branch on
   it beside the four it already checks, and let Twilio retry — so an
   unrecordable refusal is loud instead of lost. Whatever is chosen, §5.2
   bullet 3 should also say that both room readers print "Not asked" for that
   population while the rail still texts it.
2. **MAJOR-1** is two lines in 00594's own trigger: add `phone, phone_e164` to
   the `BEFORE UPDATE OF` list and refuse a genuine `phone_e164` change on an
   `opted_out` seat, with the hook's sentence as the HINT. One test block.
3. The five fresh MINORs are all cheap. Take MINOR-A first (it is a one-token
   predicate on a live trigger and it is the last place a frozen seat outranks
   the record), then MINOR-B (one token, on a 30-second poll), then MINOR-E (the
   report's own numbers).
4. The 24 carried MINORs are unchanged. MINOR-16 (the fold is never exercised by
   a local reset — re-measured: 0 records, 0 seats) remains the one whose blast
   radius is the first prod fold.
