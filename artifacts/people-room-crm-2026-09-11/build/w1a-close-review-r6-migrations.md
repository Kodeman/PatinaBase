# W1a close-out — adversarial migration review, round 6

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, HEAD `d1b95d9cc`
(`fix(consent): a refusal the rail cannot record is not one it acknowledges, and
an opted_out seat's number cannot move`). Local Postgres only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). **No prod act of any
kind** — no `supabase db push`, no `supabase functions deploy`, no Strata
connection.

Read first, in full: `rulings.md` (all five sections, R-A…R-AX),
`synthesis/direction.md` §2.2/§3.8/§7/§8, `synthesis/crm-model.md` §1/§2/§4/§5,
`briefing/current-state.md` §B–§E, `build/inventory.md`, `briefing/fixture.md`,
`build/w1a-report.md`, `build/w1a-close-review-r5-migrations.md`,
`build/w1a-close-review-r5-tests.md`, `build/w1a-close-fix-log-r5.md`,
`build/w1a-review-r10-tests.md`. Then, in full:
`supabase/migrations/00594_studio_channel_consent.sql` (2,471 lines),
`supabase/migrations/00621_consent_readers_repointed.sql` (253),
the grep-winners it grafts from (`00419:94-158`, `00589:696-935`, `00282:565-597`,
`00284:95-210`, `00281:110-145`, `00317`), `supabase/functions/_shared/sms.ts`,
`supabase/functions/sms-inbound/pipeline.ts`,
`supabase/functions/field-daily/core.ts`,
`packages/supabase/src/hooks/use-coordination.ts`, and
`supabase/tests/people/w1a_identity_channels_consent_test.sql` at the blocks this
round turns on (13, 16B, 37–43).

**Verdict: NOT clean — 0 BLOCKING, 1 MAJOR, 16 MINOR (6 fresh, 10 carried).**

r5's two non-minor findings are both **FIXED** and I re-proved each from the
catalog and from behaviour rather than from the fix log. The MAJOR below is
fresh, and it is the same failure shape as close-review r2 MAJOR-2 — the room
printing a word every send refuses — arriving through the one leg
`channel_consent_status()` does not fold in: the SEAT refusal that the send gate
and **both** write doors read. Its state is already staged and asserted by the
suite's own block 16Be; what no assertion and no report line does is ask that
state what the room prints.

---

## 1. What I ran

### 1.1 `.env.local`, before any destructive local act

```
$ ls .codex/worktrees/agent-people-build/apps/designer-portal/.env.local
No such file or directory                      # the worktree has none
$ grep -n '^NEXT_PUBLIC_SUPABASE_URL' /Users/kody/Code/patina-merged/apps/designer-portal/.env.local
19:NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321      # local, not Strata
```

### 1.2 Reset, twice

```
$ pnpm --dir .../agent-people-build supabase:reset          # pass A
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
RESET_EXIT=0        errors=0

$ psql … -At -c "select version from supabase_migrations.schema_migrations order by version desc limit 5;"
20260910152111 / 00621 / 00594 / 00593 / 00592

$ pnpm --dir .../agent-people-build supabase:reset          # pass B
Finished supabase db reset on branch main.
RESET_EXIT=0        errors=0
head: 20260910152111 / 00621 / 00594
```

(The first attempt failed inside the sandbox on
`EPERM … /Users/kody/.supabase/telemetry.json.tmp…` — a sandbox write
restriction, not a migration failure. Re-run with the sandbox disabled for that
one command.)

### 1.3 SQL tests — after pass A and again after pass B

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
PSQL_EXIT=0    45 lines matching ": passed"
NOTICE:  43. an opted_out seat's number cannot move, and every other phone edit still can (close-out r5 MAJOR-1): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
```

Both passes identical. The only `ERROR|FAIL` greps are block titles
(`16B. a DATELESS refusal fails closed too`) and the `FAIL …` strings inside
`ASSERT` messages — no failure.

### 1.4 Replay / idempotency

Each migration re-applied inside its own rolled-back transaction on the
already-migrated database:

```
--- 00592_people_cards_affiliations_rules  EXIT=0 errors=0
--- 00593_studio_contact_channels          EXIT=0 errors=0
--- 00594_studio_channel_consent           EXIT=0 errors=0
--- 00621_consent_readers_repointed        EXIT=0 errors=0
```

### 1.5 Legacy grants, generated types, Deno

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2644 replayed statements
$ diff -u <before> supabase/seed/00-legacy-grants.sql
LEGACY_GRANTS: byte-identical

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir … db:generate
GEN_EXIT=0      TYPES_DIFF_LINES=0        # no drift
$ ls deno.lock → No such file or directory

$ deno test --no-check -A --node-modules-dir=auto --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts \
    supabase/functions/_tests/field-daily.test.ts
ok | 103 passed | 0 failed (210ms)
```

### 1.6 My own probes

`build/probe40-close-r6.sql`, `build/probe41-close-r6.sql`,
`build/probe42-close-r6.sql` — catalog reads plus three rolled-back fixtures.
Objects and access only; the shipped ledger is never written.

---

## 2. Migration rules — pass/fail

| Rule | This wave |
|---|---|
| hand-numbered `NNNNN_slug.sql` | **PASS.** `00592`/`00593`/`00594` + `00621`. No `supabase migration new`. 00595–00620 untouched (fresh MINOR-6 on the brief's own "W1b mints from 00621") |
| grep-winner before redefining a function | **PASS, re-run and re-diffed by hand.** `v_project_roster` ← `00419:94-158` (only line `:119` changed, everything else byte-identical); `people_directory` ← `00589:696-935`; `field_activity_summary` ← `00282:572-589` (its sole definition site, only `:582`'s consent test changed); `fc_dispatch_court_assignment` ← `00284:101-145`; `fc_dispatch_task_assignment` ← `00284:160-203` (both keep every early return, the party-kind filter, the fire-and-forget `BEGIN/EXCEPTION`, the template key, the vars, the REVOKE and the trigger). `refuse_legacy_consent_write`, `channel_consent_status`, `project_consent_org`, `record_channel_*` and the fold have 00594 as sole definer |
| banner + lineage | **PASS.** Both files carry a full banner naming the finding each change closes; 00594's §3 and the freeze function's own comment carry the r5 phone clause |
| idempotent | **PASS.** `CREATE TABLE IF NOT EXISTS` + restated `ALTER … ADD COLUMN IF NOT EXISTS`, a `DO $ck$` guard for the CHECK, `DROP TRIGGER IF EXISTS`/`CREATE TRIGGER`, `CREATE OR REPLACE` throughout, `DROP FUNCTION IF EXISTS` for the retired mirror. Replay clean (§1.4) |
| RLS in the same file | **PASS.** `studio_channel_consent`: `ENABLE ROW LEVEL SECURITY` + `studio_channel_consent_member_select` in 00594. 00621 creates no table |
| explicit grants both directions + `REVOKE … FROM PUBLIC, anon` on definer RPCs | **PASS on the wave's own doors.** Probed ACLs for 13 functions: **`anon` holds EXECUTE on none** (0 rows). `studio_channel_consent` = `postgres=arwdDxtm \| service_role=arwdDxtm \| authenticated=r` — SELECT only, no write grant, so the RPCs are the sole door (proved: a member's direct INSERT → `permission denied for table studio_channel_consent`). Two `authenticated=X` residues on trigger functions are carried MINOR-10 |
| SECURITY DEFINER pins `search_path` | **PASS.** Catalog sweep: every definer in 00592/00593/00594/00621 carries `search_path=public` (00593's one trigger fn pins `public, pg_temp`). `project_consent_org`, `record_channel_*`, the fold and both 00621 gates all `search_path=public` |
| schema-qualify extension fns | **PASS.** No extension function is called in a body. The two `gen_random_uuid()` column DEFAULTs in 00592/00593 resolve to the `pg_catalog` copy (probed: the name exists in both `pg_catalog` and `extensions`, and `pg_catalog` is implicitly first), so the unqualified default is not ambiguous. Unchanged this round |
| guarded crons | **N/A.** No `cron.` statement in any of the four files |
| CHECK over enum for new vocab | **PASS.** `channel_kind`, `status`, `source`, `opt_out_source` are all TEXT + CHECK |
| money integer cents | **N/A** |
| regenerate `seed/00-legacy-grants.sql` | **PASS** — regenerated byte-identical (§1.5) |
| `pnpm supabase:reset` twice | **PASS** (§1.2) |
| `db:generate` | **PASS** — no drift (§1.5) |
| SQL tests under `supabase/tests/people/` via psql | **PASS** — 45 assertions, exit 0, twice (§1.3) |
| probe objects, never the ledger | **PASS** — catalog reads + `BEGIN … ROLLBACK` fixtures |

### RLS predicates the brief names

| Family | Predicate as applied | Verdict |
|---|---|---|
| `studio_contacts` family — `studio_person_affiliations`, `studio_contact_channels`, `studio_contact_rules` (person leg), `studio_channel_consent` | `is_active_studio_member(studio_contact_org(...))` / `is_active_studio_member(organization_id)` on all four commands, with the affiliation's WITH CHECK also asserting both cards share one org | **PASS** (probed from `pg_policy`) |
| `project_parties` family — `studio_contact_rules` engagement leg | `is_studio_comember(project_party_designer(subject_id))` | **PASS** |
| site access card has NO client branch (PR-w) | not in W1a — `project_site_access_cards` does not exist yet (direction §7 puts it in P1's later slice) | **N/A this wave** |

### The single-source consent model, point by point

| Claim | Verdict |
|---|---|
| no code path writes party `sms_consent_*` except the guarded legacy path | **QUALIFIED PASS.** UPDATE is sealed: probe P4a, every one of the eight raises `consent_legacy_column_frozen`, and a phone-only UPDATE on an `opted_out` seat now raises `consent_opted_out_phone_frozen` (P4b). `app.consent_legacy_write='on'` is the only opener and a tree-wide grep finds it nowhere outside 00594 and the test file. **But the trigger is UPDATE-only**: a DELETE (P4d) and an INSERT straight at `granted` (P4e) both land — fresh MINOR-1 and MINOR-2 |
| the send gate refuses on the record or on an org-scoped `opted_out` row | **PASS.** `_shared/sms.ts:448-558` — five refuse legs, `orgHasOptedOutParty` org-scoped (`:355-381`), a failed read refuses at each (R-AM), `"allow"` only after the seat scan, and the no-studio branch reads the RECORDS phone-globally before the party rows |
| START scope | **PASS, and r4 MAJOR-1 stays fixed.** `recordVerdict()` (`pipeline.ts:362-366`) is `channel_consent_status()` in TypeScript; `studiosHoldingRecord` filters on it (`:341`); the START call site keeps `['opted_out','pending']` (`:827-830`), so the fold's `granted + flag` and `not_asked + flag` shapes are in the target set and R-AJ's narrowing survives by construction |
| evidence never nulled on the record | **PASS.** Every consent-side column is `COALESCE(NULLIF(btrim(EXCLUDED.x),''), scc.x)`; the four `opt_out_*` are written only when the verdict IS the refusal and an `inbound_sms` refusal is never spoken for by a studio one; `opt_out_at` is `LEAST(...)`; `reconsent()` touches none of the four. Blocks 10/18/23/35 assert it |
| `v_project_roster` and `people_directory` read the record | **PASS** (probed: `reads_record = t`, `still_reads_seat = f` on all three readers, `field_activity_summary` included) |
| RLS / grants | **PASS** — see above, plus the cross-tenant matrix in §4's MINOR-4 |
| reset twice | **PASS** |

---

## 3. Prior findings, re-checked

### r5's two non-minor findings

| Finding | Now |
|---|---|
| **BLOCKING-1** — a STOP on a project no studio can be resolved for was acknowledged 200 and recorded nowhere | **FIXED.** `studiosHoldingPhone()` returns `{ targets, failed, unattributed }` (`pipeline.ts:249-302`), `unattributed` raised on the `if (!org) continue` branch (`:283-286`) and logged on its own line (`:295-300`); the STOP gate is five terms (`:779-782`) with `partyOrgUnattributed` in the log (`:790`), answers `500 / opt_out_incomplete` and clears `twilio_sid` first (`:794-802`); START is deliberately not gated, with the reason stated at `:824-826`. Three Deno tests present and green. R-AW recorded |
| **MAJOR-1** — a phone-only UPDATE transplanted a frozen `opted_out` refusal | **FIXED, in the database.** Catalog: `refuse_legacy_consent_write_trg` is `BEFORE UPDATE OF <the eight>, phone, phone_e164` (probed, 10 columns); the clause is `00594:914-921`, raising `consent_opted_out_phone_frozen` with the hook's sentence as HINT. Fire order verified from the catalog: `normalize_phone_project_parties` (`n` < `r`) is `BEFORE INSERT OR UPDATE` on all columns and derives `NEW.phone_e164 := normalize_phone_e164(COALESCE(NEW.phone, NEW.phone_e164))` (`00281:117-139`), so the comparison sees the derived value and a cosmetic reformat is not a change. Probe P4b: `consent_opted_out_phone_frozen`; P4c: an unrelated edit on the same refused seat still lands. Block 43, seven legs, passes. R-AX recorded |

### r4's three, r3's four, r1/r2's

All still fixed; I re-verified each from the code rather than from the logs:
`writeChannelConsent` checks read **and** write (`pipeline.ts:447-454`,
`:563-570`); `project_consent_org` exists, is a pinned definer, and all three
readers call it (`00594:1080-1094`, `:1156`, `:1352`, `:1364`, `00621:89`, `:154`,
`:218`); `record_channel_invite` is called **before** the INSERT
(`use-coordination.ts:464-483`); `AND NOT (EXCLUDED.status='pending' AND
scc.status='granted')` at `00594:2004`; `channel_consent_status` folds
`refusal_unanswered` at `:1016-1017`; the mirror, its trigger and every reader of
`patina.suppress_consent_dispatch` are gone (probed: `0 | 0 | 0`);
`_site_request_consent_granted_dispatch` and `fc_dispatch_optin_invite` carry
their shipped bodies; the Desk rollup and both 00284 gates read the record
(00621). Blocks 37–43 pass.

### r5's five fresh MINORs and r4's 24

**All OPEN**, unchanged. Re-verified with fresh evidence rather than by reading
the prior report: MINOR-A (`00621:152-157`, `:216-221` — the seat leg still
overrides a recorded refusal), MINOR-B (`00621:88-90` — the definer call inside
the Desk poll), MINOR-C (`use-coordination.ts:577-599` maps four errors;
`consent_awaiting_recipient` and `consent_not_recordable` are not among them),
MINOR-D (probed ACLs: `authenticated=X` on `fc_dispatch_court_assignment`,
`fc_dispatch_task_assignment` and `refuse_legacy_consent_write`), MINOR-E (the
report still says the SQL file is "4,765 lines"; `wc -l` = **5,765**),
r4 MINOR-A (`field-daily/core.ts` — `grep '\.order(\|\.range(\|\.limit('`
returns nothing), r4 MINOR-B (`channel_value_was_on_sms_rail` still reads the
frozen column, `00593`; my catalog sweep finds **eleven** functions whose bodies
read `sms_consent_status`), r4 MINOR-E (four inlined resolver copies at
`00594:405`, `:1700`, `:1976`, `:2044`), r4 MINOR-12 (`project_consent_org` is an
ungated definer oracle), r4 MINOR-16 (after a clean reset
`studio_channel_consent` = **0 rows**, `project_parties` = **0 rows**).

---

## 4. Findings

### MAJOR-1 (fresh) — after the recipient's own START, both shipped readers print "Texting" for a number every send refuses. `channel_consent_status()` folds `refusal_unanswered` but not the SEAT refusal that the send gate and both write doors read — G-3 verbatim, on the fixture's own F-12 row

**Files.**
`supabase/migrations/00594_studio_channel_consent.sql:1016-1022` (the one
reader), `:1693-1717` and `:1969-1977` (the write door's seat leg, R-AL),
`:1149-1158` and `:1350-1365` (the two views' COALESCE),
`supabase/functions/_shared/sms.ts:355-381` and `:498` (the send gate's seat
leg), `apps/designer-portal/src/lib/document/roster-derivation.ts:390` (the
Call Sheet vitals count),
`supabase/tests/people/w1a_identity_channels_consent_test.sql:1961-1986`
(block 16Be — the suite already stages exactly this state).

**Claim.** The verdict `channel_consent_status()` returns is
`status` folded with `refusal_unanswered` and nothing else. The send gate
(`channelConsentVerdict`) and **both** studio-side write doors
(`record_channel_consent`'s 2a read and its `DO UPDATE … WHERE` leg, therefore
`record_channel_invite` too) fold in a **third** term: an `opted_out`
`project_parties` row on that number in that studio — PR-x's fail-closed second
check, ruling R-AL. Since R-AS froze the seats, that third term is
**permanent**: nothing can move a pre-fold `opted_out` seat. So the moment the
recipient does the one thing the design tells the studio to wait for — replies
START — the record goes `granted`/`refusal_unanswered = false`, the reader says
`granted`, and the seat leg goes on refusing every send.

Close-review r2 MAJOR-1/MAJOR-2 fixed this exact shape for the flag
("the room cannot print 'Texting' for a number every send is refused on",
`00594:980-1005`). The seat leg was never folded in with it.

**Probed** (`build/probe42-close-r6.sql`, one rolled-back transaction; fixture =
Pete Rusk, `briefing/fixture.md` F-12: one `sub` seat, `sms_consent_status =
'opted_out'`, `sms_opt_out_at 2025-12-03`, `inbound_sms`, "Replied STOP", folded
by `backfill_channel_consent_from_parties()`, then the rail's START written as
`writeChannelConsent` writes it):

```
=== P6: test 16Be's own state, asked of every READER ===
P6a v_project_roster word              = granted  -> "Texting"
P6b Desk awaiting_reply_count          = 0  -> the Desk says nothing either
P6c 00621 dispatch gate would dispatch = t  -> sms-dispatch fires
P6d send gate seat leg refuses         = t  -> sendPartySms {sent:false, reason:opted_out}
```

and from `build/probe40-close-r6.sql`, the same state read through every door at
once:

```
=== P1: a pre-fold refused SEAT, the record answered by the recipient's own START ===
P1a channel_consent_status()      = granted   (the one reader)
P1b v_project_roster word         = granted   -> Call Sheet prints "Texting"
P1c people_directory status_raw   = granted   -> Directory prints "Texting"
P1d frozen seat still says        = opted_out
P1e send gate seat leg refuses?   = t   (orgHasOptedOutParty -> sendPartySms "opted_out")
P1g record_channel_consent(granted) -> channel_opted_out
```

**Failure scenario, concrete.** Pete Rusk replied STOP on the 2025 Lindqvist
thread; Hartwell Studio's seat for him reads `opted_out`. 00594's fold mints
`(Hartwell, sms, +1612…) = opted_out / refusal_unanswered = true`. The room
correctly prints "Opted out", and the party sheet tells Priya "This number
already opted out of Patina texts. Only they can rejoin by replying START"
(`use-coordination.ts:585`, `:870`). Pete replies **START**. The rail writes the
record `granted`, flag down. From that moment:

- the Call Sheet row prints **Texting** and the Directory row prints **Texting**
  (`field-config.ts:175-180` maps `granted` → "Texting"; §3.8's Current/sage
  word);
- the Call Sheet's vitals line counts him in **"N reachable by text"**
  (`roster-derivation.ts:390` counts `sms_consent_status === 'granted'`);
- the Desk's `awaiting_reply_count` says nothing is outstanding;
- **every send comes back `opted_out`** — `channelConsentVerdict` takes the
  `orgHasOptedOutParty` branch at `sms.ts:498`, and `sendPartySms`'s own legacy
  leg refuses again at `:821`;
- 00621's two dispatch gates *pass* (the record says `granted`), so a court or
  task assignment fires `sms-dispatch`, which is then silently dropped by the
  send gate — a fire-and-forget with a `RAISE WARNING` nobody reads;
- and the studio cannot correct the word: `record_channel_consent(… 'granted' …)`
  answers `channel_opted_out` (P1g), and `record_channel_reconsent()` answers
  `no_opt_out_to_supersede` because the record no longer says `opted_out`.

That is G-3 as `briefing/current-state.md` §E states it — *"One row can read
'Texting' while the same phone is opted out"* — and as
`briefing/fixture.md`'s own F-12 note states it, restored inside the record
built to end it, on the most ordinary recovery path the design has.

**Why it is not merely the disclosed §5.2 bullet 1.** The report's bullet 1 and
bullet 2's residue both describe the **send** ("un-sendable for that studio even
after the recipient replies START") and name the way out (W2 retiring PR-x's
check, or an `app.consent_legacy_write` repair — block 16Bf). Neither says what
the room prints while that stands, and the word it prints is the dangerous one.
The suite's block 16Be stages this state precisely and asserts only the write
door (`ASSERT raised = 'channel_opted_out'`); it never asks
`v_project_roster` or `people_directory`. So the gap is in the reader, not in
the disclosure of the send.

**Severity.** MAJOR by the rubric's first clause — a shipped reader (Call Sheet
row, Call Sheet vitals, Directory row) shows a wrong verdict. Not BLOCKING: no
text goes out, no opt-out is lost or overwritten, the refusal's four `opt_out_*`
columns and the seat both stand, and there is no cross-tenant or grant hole.

**Fix, and it is one function plus one expression.** The reader has to fold the
same three terms the writers fold. Because the seat scan crosses
`project_parties` (whose RLS would answer differently per caller) and because
the answer must also be `opted_out` when there is **no** record but a refused
seat stands, it wants a small definer helper in the shape
`project_consent_org()` already takes:

```sql
-- org_has_opted_out_seat(org, phone) : STABLE, SECURITY DEFINER,
--   SET search_path TO 'public', REVOKE … FROM PUBLIC, anon,
--   GRANT EXECUTE TO authenticated, service_role
--   -- orgHasOptedOutParty() in SQL: the send gate's own leg, one copy
```

then, in `channel_consent_status()` (and only for `p_channel_kind = 'sms'`, the
one kind the seats speak for):

```sql
SELECT CASE
  WHEN p_channel_kind = 'sms'
   AND public.org_has_opted_out_seat(p_organization_id, p_channel_value)
     THEN 'opted_out'
  WHEN scc.refusal_unanswered IS TRUE THEN 'opted_out'
  ELSE scc.status END
FROM ( … LEFT-joined so a refused seat with no record still answers … )
```

That makes the room, the send gate and both write doors agree by construction —
which is what R-AS is for — and it closes three of the open MINORs as a side
effect: 00621's dispatch gate stops passing on a refused number (carried
MINOR-A, the record leg now reads `opted_out`), and the "no record + refused
seat" variants (a seat inserted at `opted_out` after the fold; a seat on a
studio-less project) stop printing "Not asked". It must NOT be done by patching
the two views — that is the two-places-for-one-rule failure R-AS exists to end.

---

### MINOR-1 (fresh) — the freeze is UPDATE-only, and the report's "no code path writes these columns" does not say so about DELETE

`00594:943-956` creates `refuse_legacy_consent_write_trg` as `BEFORE UPDATE OF
…`. Probe P4d: `DELETE FROM project_parties WHERE id = <the opted_out seat>`
**lands**. `useRemoveProjectParty` (`use-coordination.ts:951`) is a hard delete
(G-10) and is reachable by any studio co-member.

I traced the consequence and it is **not** a lost refusal in the ordinary case:
post-fold the record holds the verdict, so after the seat is deleted
`channelConsentVerdict` still refuses on the record, and re-adding the party with
"text updates" ticked is still refused by `record_channel_invite` →
`record_channel_consent` → `channel_opted_out`. It matters in two places worth
one sentence in the report: it is the only *shipped* act that clears the
MAJOR-1 strand (remove the seat, and the START-answered record finally prints
and sends consistently — a repair nobody has been told about), and for the
studio-less population §5.2 bullet 3 already names, the deleted seat was the
last copy of the refusal anywhere. The report's §3 table and 00594's header both
say "the freeze is BEFORE UPDATE, so a seat may still be born carrying what the
studio recorded at the door"; they should say the same about its death.

### MINOR-2 (fresh) — an INSERT straight at `granted` is the only remaining way to manufacture "this seat consented", and it is open to any studio co-member

Probe P4e: `INSERT INTO project_parties (…, sms_consent_status) VALUES (…,
'granted')` **lands** — the freeze is UPDATE-only and `project_parties`' INSERT
policy is `is_studio_comember(designer_id)` (`00584:884-921`), so
`POST /rest/v1/project_parties` with that body is reachable by any authenticated
studio member. `sendPartySms`'s legacy leg honours `recipient.consent ===
'granted'` (`sms.ts:824`), `field-daily`'s `mayTextField` honours it
(`core.ts:70`), and both 00621 gates honour it (`00621:157`, `:221`).

It cannot beat a recorded refusal — `channelConsentVerdict` refuses on the
record before any of that — so this is a consent-free **send** only for a number
the studio holds **no** record for. That was equally true before this wave, but
before the freeze the shipped portal was also a writer of that column, so the
INSERT was one door among several; since R-AS it is the *only* thing on the books
that can make a seat say "consented", and nothing in the report names it. Worth
a line in §3's writer table, and worth W2 either widening the freeze to INSERT
or dropping the legacy leg with PR-x's check.

### MINOR-3 (fresh) — a re-attribution of `projects.studio_id` after a STOP moves the seat off the org that holds its refusal; reachable only by `service_role`

`project_consent_org()` derives the org rather than storing it, and the record is
keyed on the derived answer. Probe P5 (`build/probe41-close-r6.sql`): a
pre-fold `granted` seat, folded to a `granted` record, then the rail's STOP
written to that record only (R-AS) — the seat stays frozen at `granted`:

```
=== P5: the job re-attributed to the designer's OTHER studio, after a STOP ===
P5d frozen seat says=granted   new org has an opted_out seat?=f
P5e the refusal now lives under the OLD org alone: opted_out/true
P5f  => channelConsentVerdict(org=new): no record, no opted_out seat => "unknown"
P5g  => sendPartySms legacy leg: recipient.consent = granted => SENDS
```

**It is MINOR because the move itself is closed to every client path.** 00511's
hardened `set_project_studio_id()` refuses a `studio_id` UPDATE from
`current_user = 'authenticated'` outright — it only ever returns NEW on
`TG_OP = 'INSERT'` for that role. Probed twice: both a plain co-member and the
designer herself got `studio_id_not_designer_studio` (P2a, P5a). Only
`service_role` (or a future definer RPC) can do it, and the rubric puts
service_role-only paths at MINOR. Worth recording because pre-R-AS the deleted
phone-global seat write made this safe, and because it is the same root as r4
BLOCKING-1 and r5 BLOCKING-1 — a refusal keyed on a *derived* org, with no
second copy left — so any future "move a job between studios" feature must carry
a consent-record migration with it.

### MINOR-4 (fresh) — a co-member who can read the roster row but is not a member of the resolving studio is shown "Not asked" for a refused number

`channel_consent_status()` stays SECURITY INVOKER on purpose, and both views
COALESCE its NULL to `not_asked`. `project_parties`' studio-read policy is
`is_studio_comember(designer_id)`, which is TRUE across **any** shared org
(`is_studio_comember` joins `organization_members` on the same org id), while the
consent read needs `is_active_studio_member(project_consent_org(project_id))` —
membership of the *resolved* studio. Probe P3e: Eve, a member only of studio Y,
reads studio X's roster row (through the designer she shares Y with) and is
given `not_asked` for a number X's record refuses:

```
=== P3: cross-tenant ===
P3a Eve reading X's verdict through channel_consent_status = NULL
P3b Eve's row count on X's records                        = 0
P3c Eve writing X's record                                = not_a_studio_member
P3d Eve direct INSERT on the table                        = permission denied for table studio_channel_consent
P3e Eve sees X's roster row? rows=1   word=not_asked
```

The access half is **clean** — no cross-tenant read, no cross-tenant write, the
table's own RLS is the whole rule, exactly as `00594:976-978` says. It is graded
MINOR rather than MAJOR because it fails in the safe direction (the most
conservative word, and every send is still refused by the service-role gate) and
because report §2.3 discloses it in so many words ("a caller who is not a member
of the owning studio reads NULL and the view COALESCEs to `not_asked`"). It is
still a reader printing a word the record contradicts, and the report frames it
as an accepted posture rather than as anything owed; one line in §5 would settle
which it is.

### MINOR-5 (fresh) — 00621's two gates resolve the org from `NEW.project_id` while the party is fetched by id with no same-project constraint

`00621:154` and `:218` pass `NEW.project_id`; `:144` and `:212` fetch `v_party`
by `NEW.court_party_id` / `NEW.owner_party_id`. Probed: the only constraints on
those two columns are `FOREIGN KEY … REFERENCES project_parties(id) ON DELETE SET
NULL` — nothing requires the party to be on the same project, and there is no
guard trigger for it. So a cross-project assignment asks the wrong studio's
ledger.

The consequence is bounded: `resolveRecipient` re-derives the project from the
party row itself (`sms.ts:565-576`, `party?.project_id ?? input.projectId`), so
the send gate always answers off the *seat's* own studio and no wrong text goes
out — the gate can only cause a dispatch that is then dropped, or a dispatch
that is wrongly skipped. Using `v_party.project_id` instead of `NEW.project_id`
is one token per gate and removes the class.

### MINOR-6 (fresh) — the brief and the file disagree about W1b's first number

My brief says "W1b mints from 00621 upward"; `00621_consent_readers_repointed.sql`
exists and is applied. `00621:61-62` and report §8 both say W1b mints from
**00622**. Nothing is broken; restating it where W1b will read it avoids a
collision, since 00595–00620 remain reserved for the other program.

### Carried MINORs (7–16), all re-verified this round

| # | Finding | Evidence now |
|---|---|---|
| 7 | r5 MINOR-A — 00621's dispatch gate lets a frozen `granted` seat override a recorded refusal, where the header describes a record-**absent** fallback | `00621:152-157`, `:216-221`. Unchanged. MAJOR-1's fix closes it |
| 8 | r5 MINOR-B — a non-inlinable definer call inside a view the Desk polls every 30s with no project filter | `00621:88-90` (`project_consent_org` is SECURITY DEFINER, so never inlined; the subquery is correlated per party row) |
| 9 | r5 MINOR-C — the add path fails whole, in a raw Postgres string, on a record carrying an unanswered refusal | `use-coordination.ts:577-599` maps `channel_opted_out`, `invalid_channel_value`, `not_a_studio_member`, `consent_evidence_required`. `consent_awaiting_recipient` (the verdict `record_channel_invite` re-raises for a `granted + flag` record, `00594:2246-2249`) and `consent_not_recordable` fall through raw |
| 10 | r5 MINOR-D — `authenticated` EXECUTE on the trigger functions the files say are revoked | probed ACLs: `fc_dispatch_court_assignment`, `fc_dispatch_task_assignment`, `fc_dispatch_optin_invite`, `refuse_legacy_consent_write` all carry `authenticated=X/postgres`. Inert (a plpgsql trigger function called directly raises), so defence-in-depth only |
| 11 | r5 MINOR-E — the report's own counts are stale | §6 says the SQL file is "4,765 lines"; `wc -l` = **5,765** |
| 12 | r4 MINOR-A — `field-daily` recipient selects are unbounded against `max_rows = 1000` | `grep '\.order(\|\.range(\|\.limit(' supabase/functions/field-daily/core.ts` → nothing |
| 13 | r4 MINOR-B — frozen-column readers the report does not count | catalog sweep of `pg_proc.prosrc` for `sms_consent_status` returns **eleven**: `backfill_channel_consent_from_parties`, `refuse_legacy_consent_write`, `record_channel_consent`, `fc_dispatch_court_assignment`, `fc_dispatch_task_assignment`, `fc_dispatch_optin_invite`, `_site_request_consent_granted_dispatch`, `site_request_send`, `site_request_resend`, `site_request_dispatch_after_consent`, **`channel_value_was_on_sms_rail`** — the last still absent from §2.3b and §5.1b |
| 14 | r4 MINOR-E — four inlined resolver copies against `:1053`'s "one resolver, not three inlined copies" | `00594:405` (the fold), `:1700`, `:1976`, `:2044` (the three seat tests). MAJOR-1's helper would make it five unless they are repointed with it |
| 15 | r4 MINOR-12 — `project_consent_org` is an ungated definer oracle | any authenticated caller maps any project id to its studio id; it returns an org id only and the verdict stays behind RLS. Same shape as the shipped `studio_contact_org` (`00592:65-76`), which is the precedent `00594:1075` cites |
| 16 | r4 MINOR-16 — the fold is never exercised over real data | after a clean reset `studio_channel_consent` = 0 rows, `project_parties` = 0 rows. Every fold assertion rests on the test file's own fixtures; the first prod fold is the first run over the real book |

---

## 5. Things I checked that are clean (so the next round need not re-walk them)

- **Cross-tenant read and write: clean.** Probe P3 — a stranger studio's member
  gets NULL from `channel_consent_status`, 0 rows from the table, `not_a_studio_member`
  from the RPC and `permission denied for table studio_channel_consent` on a
  direct INSERT. `anon` holds EXECUTE on none of the 13 wave functions and no
  privilege at all on `studio_channel_consent`.
- **`anon` and the three repointed views.** `anon` holds creation-time-default
  privileges on `field_activity_summary`, `v_project_roster` and
  `people_directory` (pre-existing, not this wave). I checked whether the new
  `channel_consent_status` call turns an `anon` SELECT into a
  `permission denied for function`: it does not — `field_activity_summary`
  returns cleanly for `anon` because `projects` RLS gives it no rows, so the
  correlated subquery never calls the function, and `v_project_roster` /
  `people_directory` already fail earlier on base-table permissions
  (`permission denied for table profiles` / `studio_contacts`). No new anon
  failure mode.
- **The freeze's fire order.** `normalize_phone_project_parties` is `BEFORE
  INSERT OR UPDATE` on all columns and sorts before
  `refuse_legacy_consent_write_trg`, so a direct `phone_e164` write is
  re-derived from the unchanged `phone` (block 43a2's asserted fact) and a
  cosmetic reformat is genuinely not a change (P4c). A `SET phone = NULL,
  phone_e164 = <new>` pair is caught too: the normalizer's
  `COALESCE(NEW.phone, NEW.phone_e164)` makes the new value stick and both
  columns are on the trigger's list.
- **The retired mirror.** Function 0, trigger 0, readers of
  `patina.suppress_consent_dispatch` 0; both shipped AFTER triggers on
  `project_parties` carry their unguarded 00432/00374 bodies.
- **`record_channel_invite`'s standing-grant leg.** Membership gated before the
  read (it is a definer, so the table's RLS is not the backstop); the
  "standing" predicate is the sibling's refusal leg word for word
  (`00594:2233-2238` vs `:2065-2070`), so the two doors cannot drift; the
  `EXCEPTION WHEN SQLSTATE 'P0001'` handler re-raises anything but
  `consent_already_granted`.
- **`normalize_channel_value` vs `normalize_phone_e164`.** The consent key and
  `project_parties.phone_e164` are derived by the same function for phones
  (`00593` delegates to `normalize_phone_e164` and only falls back to the
  trimmed raw string when that returns NULL), so the seat gate's
  `pp.phone_e164 = v_value` cannot miss a refusal on a parseable number, and an
  unparseable one lands on one key for both the channel row and the record
  (block 11).
- **The email asymmetry (r6 R6-M3).** The two `EXCLUDED.channel_kind = 'email'`
  legs (`00594:1941`, `:1957`) and the `SET`'s matching clause (`:1835-1836`) are
  reachable only when the caller passes `'email'`; no SMS path can take them.
- **Both dispatch gates' `COALESCE(..., false)`.** Without it a NULL record
  would fall through `NOT (…)` in plpgsql and dispatch; with it, a party with no
  record fails closed. Asserted by block 42 and by the negative control
  `probe39`.
- **`opt_out_at` monotonicity.** `LEAST(scc.opt_out_at, EXCLUDED.opt_out_at)`
  keeps the earliest and still dates a dateless refusal; an `inbound_sms`
  refusal is never spoken for by a studio-sourced one (`:1893-1920`).
- **Grafts.** Diffed by hand against the grep-winners: `v_project_roster` and
  the three 00621 objects differ from their winners in exactly the one
  expression each file claims.

---

## 6. What would make this clean

1. **MAJOR-1** is one definer helper plus one expression in
   `channel_consent_status()` — the seat leg the send gate and both write doors
   already read, folded into the one reader, for `channel_kind = 'sms'` only,
   with the function able to answer `opted_out` on a refused seat that has no
   record. Do it there, not in the two views. It also closes carried MINOR-7 and
   the two "no record + refused seat" variants, and it should repoint carried
   MINOR-14's four inlined resolver copies rather than becoming a fifth.
2. Then add the assertion block 16Be is missing: in that exact state, ask
   `v_project_roster`, `people_directory` and `vitals()` what they say, and a
   negative control that shows the pre-fix bodies saying `granted`.
3. The six fresh MINORs are cheap and three of them are report text, not code:
   MINOR-1 and MINOR-2 are two sentences in §3 and 00594's header (and one W2
   line about widening the freeze to INSERT); MINOR-6 is one number; MINOR-5 is
   one token per gate; MINOR-3 and MINOR-4 are each one line in §5 saying which
   they are — owed, or accepted.
4. The ten carried MINORs are unchanged. Take MINOR-9 first (the add path's two
   unmapped errors are the only raw Postgres strings a designer can still see),
   then MINOR-11 (the report's own numbers), then MINOR-13 (the eleventh frozen
   reader).
5. Nothing in §2's rule table fails. Reset twice, replay four times, 45 SQL
   assertions, 103 Deno tests, byte-identical legacy grants, no type drift — all
   green, all pasted above.
