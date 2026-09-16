# W1a — final-run adversarial migration review, round 1

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, HEAD `a6b98fc18`
(`refactor(consent): the record is the only gate and the only reader (R-AW);
site-request rail on the record`). Local Postgres only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`, this wave's sole
owner). **No prod act of any kind** — no `supabase db push`, no
`supabase functions deploy`, no Strata connection.

Read first, in full: `rulings.md` (all five sections, R-A…R-AY),
`synthesis/direction.md` §2.2/§3.8/§7/§8, `synthesis/crm-model.md` §1/§2/§4/§5,
`briefing/current-state.md` §B–§E, `build/inventory.md`, `briefing/fixture.md`,
`build/w1a-report.md`, `build/w1a-close-review-r6-migrations.md`,
`build/w1a-close-review-r6-tests.md`. Then, in full:
`supabase/migrations/00592` (1,061), `00593` (612), `00594` (2,471),
`00621` (253), `00622` (910), their grep-winners (`00212`, `00281`, `00282`,
`00284`, `00374`, `00419`, `00432`, `00589`), `supabase/functions/_shared/sms.ts`,
`supabase/functions/sms-inbound/pipeline.ts`,
`supabase/functions/field-daily/core.ts`,
`supabase/functions/sms-dispatch/index.ts`,
`supabase/functions/site-request-dispatch/core.ts`,
`packages/supabase/src/hooks/use-coordination.ts`, and
`supabase/tests/people/w1a_identity_channels_consent_test.sql`.

**Verdict: NOT clean — 1 BLOCKING, 3 MAJOR, 16 MINOR.**

The BLOCKING is a **regression this wave introduced**, not a carried gap: R-AS
deleted the inbound rail's phone-global party write (`optOutAllForPhone`,
`origin/main:supabase/functions/sms-inbound/pipeline.ts:159-163`) and froze the
seats, while leaving the inbound **YES** gate on `project_parties
.sms_consent_status = 'pending'`. Before the wave a STOP moved every seat on the
number to `opted_out`, so a later YES found nothing pending and granted nobody.
Now the seat is frozen at `pending` for ever — which is the state
`useAddProjectParty`'s INSERT gives **every** invited party
(`use-coordination.ts:495`) — so a bare `YES`/`Y` lifts a standing recorded
STOP, for every studio holding such a seat, and the next send goes out.
Reproduced end to end below.

Everything in §2's rule table passes. Two clean resets, five clean replays, 46
SQL assertions twice, 103 Deno tests, byte-identical legacy grants, no type
drift, no cross-tenant read or write, no grant hole, `anon` refused everywhere.

---

## 1. What I ran

### 1.1 `.env.local`, before any destructive local act

```
$ ls .codex/worktrees/agent-people-build/apps/designer-portal/.env.local
No such file or directory                       # the worktree carries none
$ grep -n '^NEXT_PUBLIC_SUPABASE_URL' /Users/kody/Code/patina-merged/apps/designer-portal/.env.local
19:NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321      # local, not Strata
```

### 1.2 Legacy grants, regenerated BEFORE the reset

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2651 replayed statements
$ git diff --stat supabase/seed/00-legacy-grants.sql
(no output)                                     # byte-identical, as the report says
```

### 1.3 Reset, twice

```
$ pnpm --dir .../agent-people-build supabase:reset          # pass A
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
$ psql … -At -c "select version from supabase_migrations.schema_migrations order by version desc limit 6;"
20260910152111 / 00622 / 00621 / 00594 / 00593 / 00592

$ pnpm --dir .../agent-people-build supabase:reset          # pass B
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
head: 20260910152111 / 00622 / 00621
```

(Both runs needed the sandbox disabled for that one command — the CLI writes
`~/.supabase/telemetry.json` and shells out to the Docker socket. Not a wave
defect.)

### 1.4 SQL tests, after each reset

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
PSQL_EXIT=0            46 lines matching ": passed"
NOTICE:  44. the site-request rail asks the record and writes no seat, and a
         record-granted / seat-refused number is sendable (R-AW): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
…
PSQL_EXIT_B=0          46
```

The only `ERROR|FAIL` grep is a block TITLE (`16B. a DATELESS refusal fails
closed too … : passed`). No failure. Only one file exists under
`supabase/tests/people/`.

### 1.5 Replay / idempotency — each migration in its own rolled-back transaction

```
--- replay 00592_people_cards_affiliations_rules  EXIT=0 errors=0
--- replay 00593_studio_contact_channels          EXIT=0 errors=0
--- replay 00594_studio_channel_consent           EXIT=0 errors=0
--- replay 00621_consent_readers_repointed        EXIT=0 errors=0
--- replay 00622_consent_record_is_the_only_gate  EXIT=0 errors=0
```

### 1.6 Generated types, Deno

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir … db:generate
GEN_EXIT=0
$ git diff --numstat packages/supabase/src/database.types.ts | wc -l
0                                               # no drift
$ ls deno.lock → No such file or directory

$ deno test --no-check -A --node-modules-dir=auto --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts \
    supabase/functions/_tests/field-daily.test.ts
ok | 103 passed | 0 failed (164ms)
```

### 1.7 My own probes

`build/probe46-final-r1-yes-after-stop.test.ts` (two Deno probes against the
shipped `fake-supabase` harness), `build/probe47-final-r1-seat-leg.test.ts`
(three Deno probes), and three rolled-back SQL fixtures. Objects, access and
rolled-back fixtures only; the shipped ledger is never written.

---

## 2. Migration rules — pass/fail

| Rule | This wave |
|---|---|
| hand-numbered `NNNNN_slug.sql` | **PASS.** `00592`/`00593`/`00594` + `00621` + `00622`. No `supabase migration new`. 00595–00620 untouched |
| grep-winner before redefining ANY function | **PASS, re-run by hand.** `grep -rln "CREATE OR REPLACE FUNCTION[^(]*<name>" supabase/migrations/*.sql \| sort \| tail -1` gives 00594 for `record_channel_consent` and 00374 for `site_request_send` / `site_request_dispatch_after_consent` / `_site_request_consent_granted_dispatch` — exactly what 00622's banner claims. I diffed each grafted body against its winner: `site_request_send` 12 non-comment lines changed (the seat read + the seat WRITE → one `channel_consent_status()` call); `site_request_dispatch_after_consent` 7 (one gate); `_site_request_consent_granted_dispatch` 23 (the trigger guard, the loop's join, the payload's party_id); `record_channel_consent` 50, all DELETIONS of the three inlined seat tests. Nothing else moved in any of the four |
| banner + lineage | **PASS.** 00622 names its six-file lineage, the ruling's two ids (R-AW / R-AY), the three changes, the three deliberate non-changes, and the one thing it does not repoint (`site_request_resend`) |
| idempotent | **PASS.** `CREATE OR REPLACE` throughout, `DROP TRIGGER IF EXISTS` before each `CREATE TRIGGER` (including the old `project_parties` trigger AND the new `studio_channel_consent` one). Replay clean (§1.5) |
| RLS in the same file | **PASS / N/A.** 00622 creates no table. `studio_channel_consent`'s `ENABLE ROW LEVEL SECURITY` + `studio_channel_consent_member_select` are in 00594 |
| explicit grants both directions + `REVOKE … FROM PUBLIC, anon` on definer RPCs | **PASS.** Every function 00622 redefines restates its REVOKE and its grants. Probed ACLs for all 13 wave functions: `anon` holds EXECUTE on **none**. `studio_channel_consent` = `{postgres=arwdDxtm, service_role=arwdDxtm, authenticated=r}` — SELECT only, so the RPCs are the sole write door (proved: a member's direct INSERT → `permission denied for table studio_channel_consent`). `site_request_dispatch_after_consent` and `_site_request_consent_granted_dispatch` are `{postgres, service_role}` |
| SECURITY DEFINER pins `search_path` | **PASS.** Catalog sweep over every definer in 00592/00593/00594/00621/00622: `0 rows` without a pinned `search_path` |
| schema-qualify extension fns | **PASS.** No extension function is called in a body in 00621/00622 (unchanged from r6) |
| guarded crons | **N/A.** No `cron.` statement in any of the five files |
| CHECK over enum | **PASS.** `channel_kind`, `status`, `source`, `opt_out_source` are TEXT + CHECK |
| money integer cents | **N/A** |
| regenerate `seed/00-legacy-grants.sql` | **PASS** — byte-identical (§1.2) |
| `pnpm supabase:reset` twice | **PASS** (§1.3) |
| `db:generate` | **PASS** — no drift (§1.6) |
| SQL tests under `supabase/tests/people/` via psql | **PASS** — 46 assertions, exit 0, twice (§1.4) |
| probe objects, never the ledger | **PASS** — catalog reads + `BEGIN … ROLLBACK` fixtures |

### RLS predicates the brief names

| Family | Predicate as applied (read from `pg_policy`) | Verdict |
|---|---|---|
| `studio_contacts` family — `studio_person_affiliations`, `studio_contact_channels`, `studio_contact_rules` (person leg), `studio_channel_consent` | `is_active_studio_member(studio_contact_org(owner_id/person_id/subject_id))` / `is_active_studio_member(organization_id)`, on all four commands; the affiliation's WITH CHECK also asserts both cards share one org | **PASS** |
| `project_parties` family — `studio_contact_rules` engagement leg | `is_studio_comember(project_party_designer(subject_id))` | **PASS** |
| the site access card has NO client branch (PR-w) | `project_site_access_cards` does not exist yet (`pg_class` count = 0; direction §7 puts it in P1's later slice) | **N/A this wave** |

### Cross-tenant, probed directly (`build/probe-r1-tenant` pattern, one rolled-back txn)

Studio A records a **refusal** and studio B a **grant** on the same number:

```
T1  A reads A                          = opted_out
T2  A reads B                          = <null>            ← no cross-tenant read
T3  A row count on B's records         = 0
T4  A writing B's record               = not_a_studio_member
T5  A direct INSERT on the table       = permission denied for table studio_channel_consent
T6  A's roster word for A's seat       = opted_out
T7  A's row count on B's roster seat   = 0
T8  B's roster word for B's seat       = granted           ← A's STOP does not silence B
T9  anon channel_consent_status()      = permission denied for function channel_consent_status
T10 anon SELECT on the table           = permission denied for table studio_channel_consent
```

**No cross-tenant read, no cross-tenant write, no grant hole, `anon` closed.**

### The record-only model (R-AW), point by point

| Claim | Verdict |
|---|---|
| no gate, RPC, view, trigger or edge path reads `project_parties.sms_consent_*` for a verdict except the migration-time backfill | **FAIL — MAJOR-1.** Catalog sweep of `pg_proc.prosrc`: **7** functions still read a frozen column — `backfill_channel_consent_from_parties` (the one permitted reader), `refuse_legacy_consent_write` (a write guard, correctly kept), `channel_value_was_on_sms_rail` (00593, a `sms_capable` seed test, MINOR-4), and four verdict readers: `fc_dispatch_court_assignment`, `fc_dispatch_task_assignment`, `fc_dispatch_optin_invite`, `site_request_resend`. In TypeScript, five more: `sendPartySms`'s three legacy legs, `flushDeferredMessages`'s second check, `mayTextField`, the invite's evidence proof, the inbound YES gate. In Swift, two (R-AV). All four consent RPCs are clean (`reads_seat_col = f`) and no VIEW reads the seat's verdict (`pp.sms_consent_status` appears in none of `v_project_roster` / `people_directory` / `field_activity_summary`; `people_directory` keeps the two DATES only, §5.3) |
| the send gate refuses on a missing record and on `opted_out` / `refusal_unanswered` | **PASS.** `_shared/sms.ts:394-484` — four branches, a failed studio resolution and a failed record read each refuse (R-AM), `!record` refuses, `refusal_unanswered` is read BEFORE the status, `pending` → `unknown`, everything else refuses. Probed: record `opted_out` + frozen seat `granted` → `verdict = refuse`, `sendPartySms = {sent:false,reason:"opted_out"}` |
| START/YES scope (R-AU) | **START: PASS. YES: FAIL — BLOCKING-1.** `studiosHoldingRecord(from, ['opted_out','pending'])` folds the flag through `recordVerdict()` (`pipeline.ts:341`, `:362-366`), so the START target set is the VERDICT's, and R-AJ's narrowing survives. The YES leg has **no verdict filter at all** — it gates on a frozen seat (`pipeline.ts:862`) |
| STOP read-failure handling (R-AT / R-AW) | **PASS.** Five flags on one gate (`pipeline.ts:779-782`): `loadPhoneParties.failed`, `studiosHoldingRecord.failed`, `studiosHoldingPhone.failed`, `studiosHoldingPhone.unattributed`, `writeChannelConsent.failed` — which checks its prior READ (`:447-454`) and its UPSERT (`:563-570`). On any of them: `500 / opt_out_incomplete`, `twilio_sid` cleared first so Twilio's retry is not answered `duplicate`, the `sms_messages` row kept as the 10DLC artifact |
| site-request release through the record | **PASS on the happy path, FAIL on the abort path — MAJOR-3.** Probed: the grant releases each parked request exactly once (two seats, one number, two requests → 2 `consent-granted` outbox rows, 2 snapshots `granted`), and a RESTATED grant releases nothing more (`consent_granted_dispatch_ready` events stay at 2). But `site_request_dispatch_after_consent()` is called **un-wrapped** inside the trigger, so a raise inside it aborts the consent write |
| RLS / grants | **PASS** — above |
| reset twice | **PASS** |
| every deno and SQL test passes | **PASS** — 46/46 SQL (twice), 103/103 Deno |

---

## 3. Prior rounds' findings, re-checked

r6's MAJOR-1 (both room readers printing "Texting" for a number every send
refuses, through the SEAT refusal `channel_consent_status()` did not fold) is
**closed by construction, not by the fix r6 proposed**: R-AW deleted the seat
leg from the write doors and from `channelConsentVerdict` instead of folding it
into the reader. Re-probed: `record_channel_consent(granted)` over a frozen
`opted_out` seat with no record now **lands** (SQL block 19), and the room and
the verdict agree. What survives is the same consequence one layer down, in
`sendPartySms`'s own leg — **MAJOR-1** below.

r6's six fresh MINORs: MINOR-1 (the freeze is UPDATE-only, DELETE lands),
MINOR-2 (an INSERT straight at `granted` lands), MINOR-3 (a `studio_id`
re-attribution, service_role-only), MINOR-4 (a non-member co-member reads
`not_asked`), MINOR-5 (`NEW.project_id` in the two gates), MINOR-6 (W1b's first
number) — **all still open**, re-verified from the catalog and the files, not
from the logs. MINOR-2 is now load-bearing for BLOCKING-1's sibling shape.

r6's ten carried MINORs: all still open. MINOR-7/A (00621's seat leg), MINOR-9
(unmapped RPC errors), MINOR-10 (`authenticated=X` on four trigger functions),
MINOR-11 (the report's stale counts), MINOR-12 (`field-daily`'s unbounded
selects), MINOR-13 (the eleventh frozen reader), MINOR-14 (four inlined resolver
copies — now three, 00622 deleted one), MINOR-15 (`project_consent_org` as an
ungated oracle), MINOR-16 (the fold never exercised over real data: after a
clean reset `studio_channel_consent` = 0 rows, `project_parties` = 0 rows).

---

## 4. Findings

### BLOCKING-1 — a bare `YES` / `Y` lifts a standing recorded STOP, for every studio whose frozen seat reads `pending`, and the next send goes out. The wave introduced this by deleting the STOP's phone-global seat write while leaving the YES gate on the seat

**Files.** `supabase/functions/sms-inbound/pipeline.ts:861-897` (the YES branch),
`:862` (`parties.some(p => p.sms_consent_status === "pending")`), `:866-878`
(the target set, filtered only by "holds a pending seat"), `:880-884`
(`writeChannelConsent(… "granted" …)`), `:417-572` (which sets
`refusal_unanswered: status === "opted_out"` → **false** on a grant);
`packages/supabase/src/hooks/use-coordination.ts:495` (every invited party's
seat is born `pending`); `supabase/migrations/00594_studio_channel_consent.sql
:943-956` (the freeze is `BEFORE UPDATE`, so the seat can never leave `pending`);
`origin/main:supabase/functions/sms-inbound/pipeline.ts:159-163` (the
phone-global seat write R-AS deleted).

**Claim.** Pre-wave, a STOP wrote `sms_consent_status = 'opted_out'` onto **every**
party row on the number (`optOutAllForPhone`), so a later `YES` found nothing
`pending` and granted nobody. R-AS deleted that write and froze the seats; the
YES gate was left reading `sms_consent_status = 'pending'`. That is the state
`useAddProjectParty`'s INSERT gives every party added with "text updates"
ticked, and nothing can ever move it — the freeze refuses the UPDATE and the
consent doors never touch a seat. So for every invited party the YES gate is
permanently armed, and a bare `YES` or `Y` writes `granted` /
`refusal_unanswered = false` over a recorded inbound STOP.

00594's own `refusal_unanswered` COMMENT (`:311-313`) calls this "a seat state
no consent act can produce since the freeze, so it is owed to W2" — and the same
file's §3 table says the add path's INSERT is "unaffected by the freeze". Both
are in the file; only one of them was carried into the assessment.

**Probed** (`build/probe46-final-r1-yes-after-stop.test.ts`, the shipped
`_tests/fake-supabase.ts` harness, `deno test` output pasted verbatim):

```
PROBE 1 after STOP: { "org-alpha": "opted_out/true", "org-beta": "opted_out/true" }
PROBE 2 frozen seats after STOP: pA=pending pB=pending
PROBE 3 YES disposition: granted
PROBE 4 after YES:  { "org-alpha": "granted/false", "org-beta": "granted/false" }
PROBE 5 sendPartySms after the YES: {"sent":true,"messageId":"977bccaa-…",
        "twilioSid":"dev-f74ca8fd-…","body":"Hello from the studio"}
```

and the sharpest shape — **the YES belongs to a different studio**: Alpha
invited months ago and was STOPped; Alpha never invited again; the recipient
replies `Y` to **Beta's** brand-new invite:

```
PROBE X-STUDIO 'Y' disposition: granted
PROBE X-STUDIO records after: {
  "org-alpha": "granted/unanswered=false/opt_out_at=2026-02-01T00:00:00Z",
  "org-beta":  "granted/unanswered=false/opt_out_at=null"
}
```

Alpha's refusal is gone with `opt_out_at` left behind as the only trace, and
Alpha received nothing from the recipient at all.

**Failure scenario, concrete.** Priya adds Pete Rusk to the Lindqvist kitchen
with "text updates" ticked: `record_channel_invite` records `pending`, the seat
is born `pending`, `fc_dispatch_optin_invite` texts the opt-in invite. Pete
replies STOP. The rail records `opted_out` / `refusal_unanswered = true` for
Hartwell Studio; the room correctly prints "Opted out"; every send is refused;
the party sheet says "Only they can rejoin by replying START"
(`use-coordination.ts:585`). Weeks later Pete replies `Y` — to a different
studio's invite, to a stale field-daily menu, or to nothing in particular. The
YES branch sees his frozen `pending` seat, writes Hartwell's record back to
`granted`, lowers the flag, and from that moment `channelConsentVerdict` returns
`allow` and `sendPartySms` sends. Pete is texted after a STOP he never
retracted, on a 10DLC campaign.

**Severity.** BLOCKING on both of the rubric's first two clauses: an opt-out is
overwritten without a newly recorded consent (for every targeted studio but the
one the YES answered — and for that one it is a YES, not the START the design's
own copy tells the recipient to send), and a text then goes to a number whose
studio record said `opted_out`. It is also a regression against pre-00594
behaviour, not a pre-existing gap: the seat write that closed it was deleted by
this wave.

**Fix, and it is one line plus a test.** The YES target set must be filtered by
the record's VERDICT exactly as the START's is (R-AU, `recordVerdict()` already
exists at `pipeline.ts:362-366`): a YES may answer a `pending` record and must
not touch a record whose verdict is `opted_out`. Either

```ts
const yesOrgs = new Set((await studiosHoldingRecord(supabase, from, ["pending"])).orgs);
… .filter((t) => yesOrgs.has(t.org))
```

or, better, replace `hasPending` with the record read outright, which also
retires the last recipient-facing frozen-seat gate. Add the two probes above as
shipped tests (`_tests/sms-inbound.test.ts` has no YES-after-STOP case: its four
YES tests all start from a clean `pending`).

---

### MAJOR-1 — R-AW is not implemented for the send path: the frozen seat still decides, and the visible consequence is a number the record says `granted` that every send refuses

**Files.** `supabase/functions/_shared/sms.ts:745-762` (`recipient.consent ===
"opted_out"` refuses; `recipient.consent !== "granted"` refuses a non-invite),
`:486-520` (`resolveRecipient` / `reduceConsent`, which read
`project_parties.sms_consent_status`), `:1037-1060` (the same in
`flushDeferredMessages`), `supabase/functions/field-daily/core.ts:73`,
`supabase/functions/sms-inbound/pipeline.ts:862`, `_shared/sms.ts:766-779` (the
invite's evidence proof), `supabase/migrations/00621_consent_readers_repointed
.sql:157`, `:221`, `supabase/migrations/00374_field_site_request_loop.sql:1364`
(`site_request_resend`), `apps/mobile/Capture/Capture/Features/SiteRequests/
SupabaseSiteRequestService.swift:17`, `CaptureKit/Sync/PunchTaskWrite.swift:101`.

**Claim.** R-AY's canonical text is "`studio_channel_consent` is the only thing
any gate, RPC, view, trigger or edge path consults for SMS consent; the frozen
`project_parties.sms_consent_*` columns are read by nothing but the one-time
backfill." The migrations deliver that for the RPCs and the views. The SEND path
does not: nine live verdict readers remain (four SQL, five TypeScript, two
Swift). The report discloses them in §5.1b(b) and scopes R-AW to its enumerated
points, so this is a gap between the ruling's headline and the pass, not an
undisclosed one — but the consequence is the G-3 sentence again, from the other
side.

**Probed** (`build/probe47-final-r1-seat-leg.test.ts`):

```
PROBE a verdict = allow  | sendPartySms = {"sent":false,"reason":"opted_out"}
        # record granted, frozen seat opted_out
PROBE b verdict = refuse | sendPartySms = {"sent":false,"reason":"opted_out"}
        # record opted_out, frozen seat granted — correct, and the direction that matters
```

**Failure scenario, concrete.** Pete Rusk's pre-fold seat reads `opted_out`; the
fold mints `opted_out / refusal_unanswered = true`; the studio reconsents as
evidence; Pete replies **START** and the rail writes `granted`. From that moment
`channel_consent_status()` says `granted`, `v_project_roster` prints "Texting",
`people_directory` prints "Texting", `roster-derivation.ts:390` counts him in
"N reachable by text", `field_activity_summary.awaiting_reply_count` says
nothing is outstanding, and 00621's two dispatch gates fire `sms-dispatch` — and
every one of those sends comes back `{sent:false, reason:"opted_out"}` off
`_shared/sms.ts:748`, because `resolveRecipient` read the frozen column. SQL
block 44c asserts the record-side half of exactly this fixture and stops before
asking the send rail; the Deno test "a granted record does not override an
opted-out party row — sendPartySms's legacy leg, not the verdict" names the
residue in its own title.

**Severity.** MAJOR: three shipped readers (Call Sheet row, Call Sheet vitals,
Directory row) and one shipped rollup print a verdict the send path will not
honour, on the design's own recovery path. No text goes out and no opt-out is
lost, so not BLOCKING.

**Fix.** The report names it as a one-line change and puts it behind Kody:
delete `sendPartySms`'s and `flushDeferredMessages`'s `recipient.consent` legs
(and `mayTextField`'s `"unknown"` leg with them), leaving `channelConsentVerdict`
as the whole gate. That also retires 00621's seat leg (MINOR-6) and
`site_request_resend`'s.

---

### MAJOR-2 — the unattributable send is authorised by the frozen seat ALONE, so the frozen column can still cause a text

**Files.** `supabase/functions/_shared/sms.ts:443-484` (the no-studio branch),
`:748-752` (`!isInvite && !studioGranted && recipient.consent !== "granted"`),
`:486-504` (`resolveRecipient`).

**Claim.** Report §4 and §5.2 both say branch 4 closed "the one path by which a
frozen column could still AUTHORISE a text". It did not. On the no-studio branch
the verdict is `unknown` when nothing on the number has refused, and what
decides the send after that is `recipient.consent`, read off
`project_parties.sms_consent_status`. A frozen `granted` seat sends; a frozen
`not_asked` seat on the same population does not. The seat is the authority.

**Probed** (same file, probe c — a project with `studio_id IS NULL` whose
designer holds no active `design_studio` membership, no record anywhere, a seat
frozen at `granted`):

```
PROBE c verdict = unknown | sendPartySms = {"sent":true,"messageId":"fd5520d0-…",
        "twilioSid":"dev-1380191d-…","body":"hi"}
```

**Severity.** MAJOR. The population is the one §5.2 already names (a studio-less
project), and the POLICY question the report escalates to Fable is real — but the
statement of fact it rests on ("a frozen column can no longer authorise a text")
is wrong, and the two different outcomes for `granted` vs `not_asked` seats on
that population prove it. Not BLOCKING: no record says `opted_out` on that
number (any studio's recorded refusal on it refuses this branch, verified at
`:479-484`).

**Fix.** Either MAJOR-1's one-line deletion (which makes the branch refuse
uniformly, since `unknown` then means "pending record" only) or the policy
ruling §8 asks for. Until one of them lands, §4/§5.2's sentence needs
correcting.

---

### MAJOR-3 — 00622's release trigger calls `site_request_dispatch_after_consent()` un-wrapped, so a raise inside it aborts the consent write — including the recipient's own inbound START, which the rail then acknowledges 200

**Files.** `supabase/migrations/00622_consent_record_is_the_only_gate.sql
:848-878` (the loop; `:863` is the bare `PERFORM
public.site_request_dispatch_after_consent(v_request.id)`, with the
`BEGIN/EXCEPTION` only around the edge invocation at `:864-877`), `:742-749`
(the gate that raises `assignee has not granted SMS consent`), `:732-736`
(`v_party` fetched with `project_id = v_request.project_id`),
`supabase/functions/sms-inbound/pipeline.ts:841-845` (the START branch discards
`writeChannelConsent`'s `failed`), `supabase/migrations/00584_studio_comember_rls_sweep
.sql:896-908` (`project_parties`' UPDATE policy).

**Claim.** The loop is over requests; the body it calls re-fetches the assignee
**by id AND by the request's project_id**. Those agree only because
`_site_request_validate_request()` (`00374:395-411`) enforces it — and that
trigger fires on `site_requests` writes, never on `project_parties`. So moving a
seat to another project (a `PATCH /rest/v1/project_parties?id=eq.X`
`{"project_id":"…"}`, reachable by any authenticated studio co-member, and not on
the freeze trigger's column list) leaves a parked request whose assignee cannot
be found — and from then on every grant transition on that number in that studio
raises inside the trigger and rolls the consent act back.

**Probed** (one rolled-back transaction, one studio, two of its own jobs, one
`awaiting_consent` request):

```
A1 a studio member moved the seat to the studio's other job: <allowed>
A2 record_channel_consent(granted)                         = assignee has not granted SMS consent
A3 the inbound rail's own service_role grant upsert        = assignee has not granted SMS consent
```

**Failure scenario, concrete.** A3 is the one that matters. The rail's
`writeChannelConsent` catches the upsert error and raises `failed` — and the
**START branch deliberately ignores `failed`** (`pipeline.ts:820-826`, on the
reasoning that a short target list only grants fewer studios). So the recipient
texts START, Twilio is answered `200 / resubscribed`, the studio's record stays
`opted_out / refusal_unanswered = true`, and the one door the design says is the
whole way back is silently shut. On the studio side, A2 means the grant door is
permanently broken for that number, and `assignee has not granted SMS consent`
is not one of the four errors `asWrittenConsentRpcError`
(`use-coordination.ts:577-599`) maps, so the designer sees the raw Postgres
string.

**Severity.** MAJOR. It fails closed on the wire (no text goes out) so it is not
BLOCKING, but a recipient's START that is acknowledged and not recorded is the
same class of defect r5's BLOCKING-1 and r7's R7-M3 closed from the other
direction, and the studio-side door is dead with no sentence.

**Fix.** Two lines, and they are independent. (a) Wrap the `PERFORM
site_request_dispatch_after_consent(...)` in its own `BEGIN … EXCEPTION WHEN
OTHERS THEN RAISE WARNING` — a site request that cannot be released must not
take the consent act down with it; the lifecycle sweep is already the backstop
00622's own comment names. (b) Give the loop `AND pp.project_id = sr.project_id`
so a moved seat drops out of it rather than raising. Add the assertion the suite
has no form of: "a parked request the release cannot dispatch does not abort the
consent write".

---

### MINOR-1 — a re-run of the fold now enqueues real site-request dispatch work, and both the report and the function's own COMMENT say it cannot

`00594:758-761`'s COMMENT says the fold is "side-effect-free to re-run: it
writes studio_channel_consent and nothing else, so a folded `pending` reaches no
party row and fires no opt-in dispatch", and report §3 says "a re-run now sends
nothing because it reaches no seat at all". 00622 put an `AFTER INSERT` trigger
on that table. Probed (one rolled-back transaction, one pre-fold `granted` seat,
one parked request):

```
F1 consent-granted outbox rows BEFORE the fold re-run = 0
F2 fold re-run raised = <none>
F3 consent-granted outbox rows AFTER the fold re-run  = 1
F4 consent_granted_dispatch_ready events              = 1
```

service_role-only, so MINOR by the rubric — but the first prod fold runs inside
00594, BEFORE 00622 creates the trigger, so a later operational re-run behaves
differently from the one the migration performed. Worth a sentence in 00622's
banner and a corrected COMMENT.

### MINOR-2 — a repeat add on a number the studio already holds a grant for still texts a duplicate opt-in invite

`record_channel_invite` correctly returns the standing grant untouched
(`00594:2233-2240`), but `useAddProjectParty` still INSERTs the seat at
`pending` with evidence (`use-coordination.ts:495-499`), which fires
`fc_dispatch_optin_invite` (`00432:27-68`). In `sendPartySms` the verdict is
`allow`, so `studioGranted` skips the invite gate (`_shared/sms.ts:755-760`) and
the evidence proof passes off the seat — the invite goes out. 00594's own header
(`:70-82`) is the file that argues duplicate opt-in traffic is what gets a 10DLC
campaign filtered. The report's §2.2 and §4b both describe the standing-grant
case as "nothing is written"; the text is still sent.

### MINOR-3 — the site-request rail is "PAID", but its own way of asking for consent cannot fire

`site_request_send()` on a never-asked assignee now parks `awaiting_consent` and
enqueues a `consent-invite` (`00622:642-659`), which
`site-request-dispatch/core.ts:219-221` sends as `sms_optin_invite` through
`sendPartySms` — where branch 4 of `channelConsentVerdict` refuses it (no
record). Nothing on this rail calls `record_channel_invite`, so the request
parks for ever unless the studio separately records the invite from the party
sheet. In effect this is pre-existing (00374's evidence-less `pending` was
already refused by the invite's evidence proof), which is why it is MINOR — but
§5.1 and §8 present the rail as paid without naming it, and the outbox row now
completes with `last_error = opted_out`.

### MINOR-4 — `channel_value_was_on_sms_rail` is the seat reader nobody counts

`00593:209-229` reads `sms_consent_status` and is absent from §2.3b, §5.1b and
the report's §3 writer table (r6 MINOR-13, carried). It is a "was this number
ever on the rail" test that seeds `sms_capable`, service_role-only and not a
verdict — so MINOR — but the report's own list of frozen-column readers is still
short by one.

### MINOR-5 — 00621's two dispatch gates resolve the org from `NEW.project_id` while fetching the party by id with no same-project constraint

`00621:144`/`:154` and `:212`/`:218` (r6 MINOR-5, unchanged). `client_decisions
.court_party_id` and `project_tasks.owner_party_id` carry only an FK. Bounded:
`resolveRecipient` re-derives the project from the seat, so the gate can cause a
dispatch that is dropped or skip one that would have been allowed, never a wrong
text. `v_party.project_id` is one token per gate.

### MINOR-6 — 00621's seat leg makes both gates dispatch for a number whose record says `opted_out`

`00621:152-157`, `:216-221` (r6 MINOR-7/A, unchanged). With a pre-fold seat at
`granted` and a record at `opted_out`, `NOT COALESCE(record='granted',false)` is
TRUE but `v_party.sms_consent_status <> 'granted'` is FALSE, so the guard does
not fire and `sms-dispatch` is invoked; `sendPartySms` then refuses. R-AW scopes
point 4 to 00594, so 00622 correctly left it — flagged for Kody, and MAJOR-1's
fix retires it.

### MINOR-7 — replaying 00594 alone on a database already at 00622 regresses `record_channel_consent`

Both files `CREATE OR REPLACE` the same function with no version guard, and
00594's body carries the three seat tests 00622 deleted. An ordered
`db reset` / `db push` is unaffected (00622 runs last); a hand replay of 00594
for any other reason is not. One sentence in 00594 would not help (it is
applied); a note in 00622's banner would.

### MINOR-8 — stale live comments now describe a model the code no longer follows

`_shared/sms.ts:7-11` still says the phone-global party-row reduction "stays
behind it as a fail-closed second check (PR-x)" as the design; `:745` and
`:1037` still say "fail-closed until the backfill is proven everywhere (PR-x)",
which R-AY supersedes; `use-coordination.ts:736` names `orgHasOptedOutParty`,
deleted this pass. Most consequentially, `00594:311-313`'s
`refusal_unanswered` COMMENT calls a `pending` seat "a seat state no consent act
can produce since the freeze" — the add path's INSERT produces it on every
invited party, and that sentence is the mis-assessment behind BLOCKING-1.

### MINOR-9 — the report's own numbers are stale

§6 says the SQL file is "4,765 lines"; `wc -l` = **6,061** (r6 MINOR-11/E,
carried). `00621:61` still says "W1b mints from 00622" while 00622 exists and
report §5.3/§8 say 00623 (r6 MINOR-6, carried).

### MINOR-10 — three RPC errcodes still reach a designer as raw Postgres strings

`asWrittenConsentRpcError` (`use-coordination.ts:577-599`) maps
`channel_opted_out`, `invalid_channel_value`, `not_a_studio_member`,
`consent_evidence_required`. `consent_awaiting_recipient` and
`consent_not_recordable` fall through (r6 MINOR-9, carried), and MAJOR-3 adds a
third: `assignee has not granted SMS consent`, raised from inside the consent
write by the release trigger.

### MINOR-11 — `authenticated` still holds EXECUTE on four trigger functions

Probed ACLs: `refuse_legacy_consent_write`, `fc_dispatch_court_assignment`,
`fc_dispatch_task_assignment`, `fc_dispatch_optin_invite` all carry
`authenticated=X/postgres` (r6 MINOR-10, carried). Inert — a plpgsql trigger
function called directly raises — so defence-in-depth only.

### MINOR-12 — `project_consent_org` is an ungated definer oracle

`00594:1080-1094` (r6 MINOR-12/15, carried): any authenticated caller can map
any project id to its studio id. It returns an org id only and the verdict stays
behind `channel_consent_status`'s invoker RLS, and it is the shape
`studio_contact_org` (`00592:65-76`) already took.

### MINOR-13 — the release loop is synchronous, unbounded, and one `pg_net` call per parked request

`00622:848-878` runs inside the consent write with no `LIMIT` and an
`invoke_edge_function` per parked request. A studio with many parked requests
pays for all of them on the transaction that records one grant. The durable half
is deliberately transactional (00622's own comment) — only the wake-up needs
batching.

### MINOR-14 — only a `not_asked` seat's phone number can still be corrected

A phone edit on a `pending` or `granted` seat raises
`consent_legacy_column_frozen` (`use-coordination.ts:715-727` → `00594:869-884`)
and on an `opted_out` seat `consent_opted_out_phone_frozen` (R-AX). Disclosed in
report §8, and the reason W1a does not ship alone — recorded here so the ship
gate cannot lose it.

### MINOR-15 — the fold is still never exercised over real data

After a clean reset `studio_channel_consent` = **0 rows** and `project_parties`
= **0 rows** (r6 MINOR-16, carried). Every fold assertion rests on the test
file's own fixtures; the first prod fold is the first run over the real book,
and since R-AS the record it mints is the only copy there is.

### MINOR-16 — three test-coverage gaps the rounds have now walked past

(a) no YES-after-STOP case anywhere in `_tests/sms-inbound.test.ts` (its four
YES tests all start from a clean `pending`) — BLOCKING-1; (b) no assertion that a
parked site request the release cannot dispatch leaves the consent write intact —
MAJOR-3; (c) SQL block 44c stages the record-granted / seat-refused fixture and
asks the record, the roster and `site_request_send`, but never asks
`sendPartySms` — MAJOR-1.

---

## 5. Things I checked that are clean (so the next round need not re-walk them)

- **Cross-tenant read and write: clean**, re-proved from a fresh fixture (§2).
  `anon` holds EXECUTE on none of the 13 wave functions and no privilege at all
  on `studio_channel_consent`.
- **Every definer pins `search_path`** (catalog sweep, 0 rows without it), and
  none of 00621/00622's bodies calls an unqualified extension function.
- **The grafts are minimal and exact** — diffed by hand against the grep-winners
  (§2). `record_channel_consent`'s 50 non-comment diff lines are all deletions.
- **The release trigger's transition gate works.** A restated grant releases
  nothing twice (`consent_granted_dispatch_ready` stays at 2 across two grants),
  and the `WHEN` clause + the body's `TG_OP = 'UPDATE'` guard are the right split
  given `OLD` does not exist on INSERT. No fan-out: the loop is over requests,
  and two seats on one number with one request each give exactly two dispatches.
- **`_site_request_append_event` dedupes gracefully** (`00374:… RETURN v_id` on a
  matching `dedupe_key`), so a re-release is not a unique-violation abort — the
  only abort path is the one MAJOR-3 names.
- **`site_requests.assignee_party_id` is same-project-constrained on
  `site_requests` writes** (`00374:395-411` + the trigger at `:552-556`), which
  is exactly why MAJOR-3 needs a `project_parties` move to reach it.
- **No view reads the seat's verdict.** `pp.sms_consent_status` appears in the
  definition of none of `v_project_roster`, `people_directory`,
  `field_activity_summary`; `people_directory` keeps `pp.sms_consented_at` /
  `pp.sms_opt_out_at` only (dates, W1b's §5.3).
- **All four consent RPCs are seat-free** (`reads_seat_col = f` for
  `channel_consent_status`, `record_channel_consent`, `record_channel_invite`,
  `record_channel_reconsent`; `t` for the fold alone).
- **The party-SMS senders are exactly two.** `grep -rln "api.twilio.com"` gives
  `_shared/sms.ts` and `sms-dispatch/index.ts`; the latter's own sender is the
  account-holder rail (`profiles.sms_opt_in` + `notification_preferences`), and
  every `partyId` job delegates to `sendPartySms` (`sms-dispatch/index.ts:78-82`).
  `site-request-dispatch` and `field-daily` both import it.
- **The STOP branch's five flags**, `twilio_sid` released before the 500, and
  `writeChannelConsent` checking both its read and its upsert (R-AT / R-AW).
- **The START target filter asks the verdict** (`recordVerdict`, R-AU), and
  R-AJ's narrowing survives: a `not_asked` record with no refusal standing is
  still not a target.
- **`project_site_access_cards` does not exist**, so PR-w is N/A this wave.
- **No `deno.lock`** left at the repo root.

---

## 6. What would make this clean

1. **BLOCKING-1**: filter the YES target set by the record's verdict, the way
   the START branch already does (`recordVerdict`, one `studiosHoldingRecord`
   call). Add the two probes as shipped tests.
2. **MAJOR-3**: wrap the release's `site_request_dispatch_after_consent` call in
   its own `BEGIN/EXCEPTION WHEN OTHERS THEN RAISE WARNING`, and add
   `AND pp.project_id = sr.project_id` to the loop.
3. **MAJOR-1 / MAJOR-2** are the same one-line change, and it is Kody's: delete
   `sendPartySms`'s and `flushDeferredMessages`'s `recipient.consent` legs and
   `mayTextField`'s `"unknown"` leg. If Kody leaves them, §4 and §5.2 of the
   report need the "a frozen column can no longer authorise a text" sentence
   corrected, and SQL block 44c needs the send-rail assertion MINOR-16(c) names.
4. The sixteen MINORs are cheap and six of them are prose: MINOR-1, MINOR-7,
   MINOR-8 and MINOR-9 are comment and report text; MINOR-5 is one token per
   gate; MINOR-10 is three sentences in the hook's error map.
5. Nothing in §2's rule table fails. Two resets, five replays, 46 SQL
   assertions twice, 103 Deno tests, byte-identical legacy grants, no type
   drift, no cross-tenant hole — all green, all pasted above.
