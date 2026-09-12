# W1a close-out — adversarial migration review, round 3

Reviewer context: fresh, separate from the implementer. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD `8132a1a20`
("fix(consent): an invite is not news about a grant, and one reader carries one
verdict"). Local Postgres only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). No prod act of any
kind.

**Verdict: NOT clean — 0 BLOCKING, 4 MAJOR, 18 MINOR.**

The consent model itself holds. I could not find a path — SQL or edge — by which
a text reaches a number whose studio record says `opted_out`, or whose own
studio's party row says `opted_out` with no newer record; I could not find a way
to lose or overwrite a refusal without a newly recorded consent; and I found no
cross-tenant read or write, no RLS hole and no grant hole. Both resets replay
clean, all three migrations replay clean inside a rolled-back transaction, the
43-block SQL suite passes, the 83 Deno tests pass, generated types show no
drift, and the regenerated legacy-grants seed is byte-identical.

What is not clean is the **blast radius of the freeze on readers nobody has
counted yet**. Close-review r1's MAJOR-4 asked for the owed list; the report's
§5.1b names four rails plus the site-request rail. There are at least three
more, two of them *in migrations* and one a shipped cron, and one of them is
designer-facing and prints a false number on the Desk today. Plus one reachable
portal write path — an ordinary phone correction — that now leaves both readers
and the send gate disagreeing, with no door out.

---

## 1. What I ran

### 1.1 `.env.local` check (before any destructive local act)

The worktree has no `.env.local` of its own; the shared checkout's is what is
read.

```
$ ls .codex/worktrees/agent-people-build/apps/designer-portal/.env.local
"…/.env.local": No such file or directory (os error 2)

$ grep -n NEXT_PUBLIC_SUPABASE_URL /Users/kody/Code/patina-merged/apps/designer-portal/.env.local
1:# prod # NEXT_PUBLIC_SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co
14:# prod # NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
19:NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
```

Local. Not Strata.

### 1.2 Reset, twice

```
$ pnpm --dir .../agent-people-build supabase:reset      # pass 1
…
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}

$ pnpm --dir .../agent-people-build supabase:reset      # pass 2
EXIT=0
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
# the only "error" string in the pass-2 log is a migration FILENAME:
#   448:Applying migration 00458_sms_message_error_capture.sql...
```

Both clean, first attempt. (r1's MINOR-8 reset flakiness did not reproduce here
either.)

### 1.3 SQL tests

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
…
NOTICE:  38. one resolver for the seat's studio: reader and writer agree, and no view
         prints another studio's consent word (close-review r1 MAJOR-1): passed
NOTICE:  39. the add path never lowers a standing grant: pending over granted is
         refused by name and the invite door returns the grant untouched
         (close-review r2 MAJOR-1): passed
NOTICE:  40. one reader, one verdict: an unanswered refusal reads opted_out
         everywhere the room prints it (close-review r2 MAJOR-2): passed
NOTICE:  All W1a assertions passed.
ROLLBACK

PSQL_EXIT=0
43 lines matching "passed"
1 line matching /ERROR|FAIL/i — and it is a block TITLE:
  "16B. a DATELESS refusal fails closed too (r4 B-1): passed"
```

### 1.4 Replay / idempotency

Each migration re-run against the already-migrated database inside
`BEGIN; … ROLLBACK;`:

```
=== REPLAY 00592_people_cards_affiliations_rules ===  exit=0  (only "already exists, skipping" NOTICEs)
=== REPLAY 00593_studio_contact_channels ===          exit=0  (same)
=== REPLAY 00594_studio_channel_consent ===           exit=0
  NOTICE: relation "studio_channel_consent" already exists, skipping
  NOTICE: column "opt_out_source" … already exists, skipping
  NOTICE: trigger "mirror_channel_consent_to_parties_trg" … does not exist, skipping
  NOTICE: function public.mirror_channel_consent_to_parties() does not exist, skipping
```

### 1.5 Legacy grants, types, Deno

```
$ cp supabase/seed/00-legacy-grants.sql /tmp/legacy-before.sql
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2640 replayed statements
$ diff -u /tmp/legacy-before.sql supabase/seed/00-legacy-grants.sql
LEGACY_GRANTS_IDENTICAL

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir … db:generate
$ git diff --stat packages/supabase/src/database.types.ts
(no output — no drift)

$ deno test --no-check -A --node-modules-dir=auto --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts
ok | 83 passed | 0 failed (109ms)
$ ls deno.lock
"deno.lock": No such file or directory     # no stray root lockfile
```

### 1.6 My own probes

Objects and access only, or fixtures inside `BEGIN; … ROLLBACK;`. Never the
ledger.

- `build/probe34-close-r3-objects-access.sql` — function/table/trigger/ACL/policy inventory.
- `build/probe35-close-r3-readers-and-rails.sql` — R-AL org scoping · the three shipped readers on one
  seat · field-daily's filter · the freeze · the phone-move · the direct
  trigger-function call · an unparseable phone · a stranger studio.
- `build/probe36-close-r3-phone-correction.sql` — the phone correction on an `opted_out` seat, all three
  write doors, and the send gate's own predicate.
- `build/probe37-close-r3-reader-cost.sql` — `EXPLAIN ANALYZE` on both readers at 600 party rows.
- `build/probe38-close-r3-poisoned-grant.sql` — the same phone correction where the target number
  already holds a recorded grant.

Plus a byte-level graft diff of both redefined views against their grep-winners.

---

## 2. Migration rules — pass/fail

| Rule | Verdict |
|---|---|
| hand-numbered `NNNNN_slug.sql` | PASS — 00592/00593/00594; 00595–00620 untouched; W1b mints from 00621 |
| grep-winner before redefining a function/view | PASS, and verified by diff. `grep -rln "CREATE OR REPLACE VIEW[^(]*v_project_roster" \| sort \| tail -1` → `00419`(+00594); `…people_directory…` → `00589`(+00594). Every one of the seven new functions has 00594 as its only definition site — nothing was redefined |
| grafted from that body | PASS. A comment-stripped, whitespace-normalised diff of both views against their winners shows **exactly one hunk each** for `v_project_roster` (`pp.sms_consent_status` → the COALESCE) and **three** for `people_directory` (`status_raw`, `meta.sms_consent_status`, both through the same expression). No other line moved |
| banner + lineage | PASS — all three carry a numbered banner, the lineage of every reader, the rulings they answer, and the "regenerate legacy grants" line |
| idempotent | PASS — §1.4 above; `CREATE TABLE IF NOT EXISTS` + restated `ALTER … ADD COLUMN IF NOT EXISTS` + a named-constraint `DO` block + `DROP TRIGGER/FUNCTION IF EXISTS` for the retired mirror + `ON CONFLICT DO NOTHING` in the fold |
| RLS in the same file | PASS — `ENABLE ROW LEVEL SECURITY` + the member-select policy for `studio_channel_consent` at `00594:334-344`; 00592/00593 likewise |
| explicit grants both directions + `REVOKE … FROM PUBLIC, anon` on definer RPCs | PASS with one exception — `refuse_legacy_consent_write()` revokes `PUBLIC, anon` but not `authenticated` (MINOR-3, carried from r1/r2). Probe 1b: `anon_exec = f` on all eight wave RPCs |
| SECURITY DEFINER pins `search_path` | PASS — probe 1a: every wave function carries `search_path=public` (one carries `public, pg_temp`; it is INVOKER — MINOR-14) |
| schema-qualify extension fns | PASS — the only extension-shaped call is `gen_random_uuid()` in column DEFAULTs (built-in since PG13, resolved at DDL time); no `crypt`/`digest`/`uuid_generate_v4` anywhere in the three files |
| guarded crons | N/A — no cron in this wave |
| CHECK over enum for new vocab | PASS — `channel_kind`, `status`, `source`, `opt_out_source` are all CHECKs, restated as named constraints so a rerun widens them; 00592's banner states the reason (`ADD VALUE` cannot be used in the transaction that adds it) |
| money integer cents | N/A — no money column in this wave (`retainage_bps` is basis points, 00592) |
| regenerate `seed/00-legacy-grants.sql` | PASS — §1.5, byte-identical after regeneration |
| apply with `supabase:reset` | PASS — twice, §1.2 |
| `db:generate` after the schema change | PASS — no drift, §1.5 |
| SQL tests under `supabase/tests/people/` | PASS — §1.3 |
| probe objects, never the ledger | PASS — every probe is object-level or `ROLLBACK`ed |

### The single-source consent model, point by point

| Claim | Verdict |
|---|---|
| no code path writes party `sms_consent_*` except the guarded legacy path | PASS. Probe 1f: the only DB function whose body UPDATEs those columns is `site_request_send` — which now raises (probe D). `fns_reading_suppress_flag = 0`; the only function mentioning `consent_legacy_write` is the guard itself. The mirror function and its trigger are gone. In TypeScript the two portal UPDATE writers remain and raise in a sentence; `sms-inbound/pipeline.ts` writes the record only |
| the send gate refuses on the record or on an org-scoped `opted_out` row | PASS. `_shared/sms.ts:459-500` — refuse on a failed org resolve (`:451-457`), on `status = 'opted_out'` (`:487`), on `refusal_unanswered` (`:489`), on `orgHasOptedOutParty` (`:490`), and again when there is no record (`:499`); the phone-global branch (`:511-548`) refuses on any studio's recorded refusal before it reads a single seat, and on either read erroring |
| START scope (R-AJ) | PASS. `pipeline.ts:732-737` targets only `studiosHoldingRecord(from, ['opted_out','pending'])`; `withRecordOnlyStudios` reaches a studio with a record and no seat. A studio at `not_asked`, or with no record, is untouched even when it holds a seat |
| evidence never nulled on the record | PASS on every UPDATE leg (`00594:1795-1807` — `COALESCE(NULLIF(btrim(…),''), scc.…)`), and `record_channel_reconsent` never touches the four `opt_out_*` (`:2313-2354`). FAILS the header's own wording on the INSERT/mint leg only (MINOR-1, carried) |
| `v_project_roster` and `people_directory` read the record | PASS in source AND in verdict. Probe 1g: `reads_record = t`, `still_reads_seat = f`, `restates_rule = f`, `inlines_resolver = f` for both. The `refusal_unanswered` rule lives in `channel_consent_status()` alone (`00594:940-956`) |
| RLS / grants | PASS. `studio_channel_consent`: RLS on, one SELECT policy `is_active_studio_member(organization_id)`, `authenticated=r` and nothing else, `anon_sel = f`, `anon_ins = f`. Probe H: a Beta member reads `NULL` from `channel_consent_status()` for an Alpha org and `0` rows from the table |
| reset twice | PASS — §1.2 |

---

## 3. Prior findings re-checked

### From `w1a-close-review-r2-migrations.md`

| Finding | Now |
|---|---|
| MAJOR-1 (`pending` demotes a standing grant) | **FIXED.** `00594:1934` — `AND NOT (EXCLUDED.status = 'pending' AND scc.status = 'granted')` inside the write; the named refusal at `:1994-2006` carries the sibling's refusal leg word for word; `record_channel_invite` at `:2113-2190`; `use-coordination.ts:474-483` calls it with no `p_status`. SQL block 39 passes; I re-ran it |
| MAJOR-2 (readers print `granted` for an unsendable record) | **FIXED.** `channel_consent_status` at `00594:948-956` returns `'opted_out'` when `refusal_unanswered IS TRUE`; neither view restates the rule (probe 1g `restates_rule = f`). Block 40 passes |
| MINOR-1 (mint leg writes a refusal into the grant's five) | **OPEN** — `00594:1723` still writes `p_source, p_evidence, v_now, p_disclosure_version, auth.uid()` unconditionally |
| MINOR-2 (`inbound_sms` short-circuits the r10 date test) | **OPEN** — `00594:387-393`, first disjunct unchanged |
| MINOR-3 (`refuse_legacy_consent_write` keeps `authenticated` EXECUTE) | **OPEN** — `00594:872`; probe 1a `authenticated=X`. Probe F shows a direct call raises `0A000 trigger functions can only be called as triggers`, so it is inert |
| MINOR-4 (`p_origin_project_id` not org-checked) | **OPEN** — `00594:1519`, `:2120`, `:2261`; no org test on any of the three |
| MINOR-5 (`meta` mixes record verdict with seat dates) | **OPEN** — `00594:1292` (record) beside `:1296-1297` (seat). No UI consumer: a grep of `apps` + `packages` for `sms_consented_at`/`sms_opt_out_at` finds only `use-coordination.ts`'s own writers |
| MINOR-6 (non-inlinable call per row) | **OPEN, and now measured.** See MINOR-6 below — the cost is real but small at studio scale |
| MINOR-7 (§5.2 does not name the cross-seat flag cost) | **FIXED** — report §5.2 bullet 2 now states it, with the "the room now SAYS so" note |
| MINOR-8 (`consent_awaiting_recipient` reaches the designer raw) | **OPEN** — `asWrittenConsentRpcError` (`use-coordination.ts:573-592`) still maps four errors; `consent_awaiting_recipient` (`00594:2008`) and `consent_not_recordable` are not among them, and both are reachable through `record_channel_invite`'s fall-through |
| MINOR-9 (unparseable phone, unreadable key) | **OPEN** — probe G: `record_channel_invite(org,'sms','123',…)` returns `channel_value = 123, status = pending`, while `normalize_phone_e164('123')` is NULL, so the seat's `phone_e164` is NULL and no reader ever looks that record up |
| MINOR-10 (`resolveRecipient` positive phone-global reduction) | **OPEN** — `_shared/sms.ts:562-582` unchanged |
| MINOR-11 (no test for `pending` over `granted`) | **FIXED** — block 39, 12 legs, passes |

### From `w1a-close-review-r1-migrations.md`

| Finding | Now |
|---|---|
| BLOCKING-1 (STOP's record write unchecked) | **FIXED, and still fixed.** `pipeline.ts:487-506` destructures `error: writeError`, logs, sets `failed`, `continue`s; the STOP branch at `:690-716` answers 500 / `opt_out_incomplete` and clears `twilio_sid`. The Deno test is in the 83 I ran |
| MAJOR-1 (three inlined `_primary_studio_for` copies) | **FIXED.** `project_consent_org` at `00594:1010-1020`; the views call it at `:1086`, `:1282`, `:1294`; probe 1g `inlines_resolver = f` |
| MAJOR-2 (add-party leaves the room saying "Not asked") | **FIXED**, and r2's MAJOR-1 regression is fixed with it |
| MAJOR-3 / F2 / F3 (raw Postgres error) | **PARTIALLY FIXED** — see MINOR-8 |
| MAJOR-4 (owed-work list) | **STILL INCOMPLETE** — this is MAJOR-1/2/3 below. The list names five rails; there are at least eight |

---

## 4. Findings

### MAJOR-1 — the Desk prints "N parties haven't opted in" for parties the record says are texting, and no owed list mentions it

`supabase/migrations/00282_sms_core.sql:578-582` —
`field_activity_summary.awaiting_reply_count` counts
`project_parties.sms_consent_status = 'pending'` for the field kinds. That view
is live and designer-facing: `packages/supabase/src/hooks/use-field-activity.ts:48-55`
reads it and `apps/designer-portal/src/components/document/field/field-desk.tsx:44-52`
renders `"${a.awaiting_reply_count} parties haven’t opted in"`.

After the freeze no consent act moves a seat, so the count never clears. The
Call Sheet and the Directory now print the record; the Desk still prints the
seat. Probe 2 §B, one seat, one number, one studio:

```
     surface      | display_name |  word
------------------+--------------+---------
 v_project_roster | Joe Wozniak  | granted
 people_directory | Joe Wozniak  | granted    (meta_word: granted)

        surface         | awaiting_reply_count
------------------------+----------------------
 field_activity_summary |                    1

     surface     | sms_consent_status
-----------------+--------------------
 the frozen seat | pending
```

The room says "Texting". The Desk says they have not opted in. Both are reading
the same person. A reader showing a wrong verdict is MAJOR by the rubric, and
`field_activity_summary` appears in no review round and in no section of
`w1a-report.md` — I grepped every `build/*.md`: zero hits for
`field_activity_summary` and zero for `awaiting_reply_count`.

**Fix.** Either repoint that subquery at `channel_consent_status(project_consent_org(pp.project_id),'sms',pp.phone_e164) = 'pending'`
in a 006xx migration grafted from `00282`, or add the view to §5.1b's owed list
in the same breath as the four rails. It is one expression.

---

### MAJOR-2 — `field-daily` texts nobody the record granted: the daily digest and the delivery confirms are dead for every consent recorded after the freeze

`supabase/functions/field-daily/core.ts:154-157` and `:251-255` both pre-filter
recipients with `.eq("sms_consent_status", "granted")` on `project_parties`
before `sendPartySms` is ever called. Nothing writes that column to `granted`
any more — the mirror is gone, the rail writes the record only, and
`useAddProjectParty`'s INSERT is born `pending`, never `granted`
(`use-coordination.ts:495`). So the cron's recipient set can only ever contain
pre-fold rows, and it shrinks to nothing as the book turns over.

Probe 2 §C, same studio, same number, immediately after a recorded grant:

```
 field_daily_would_text
------------------------
                      0

 record_says_granted
---------------------
                   1
```

It fails CLOSED — nobody gets a text they did not consent to — but a shipped,
un-flagged pg_cron-driven feature silently stops working for every party from
here on, and the send gate's whole `"allow"` branch (`_shared/sms.ts:497`, the
half of G-3 this record exists to provide, fixture F-11) can never be reached
through this caller.

This was raised twice in earlier rounds as `m-15`
(`w1a-review-r2-migrations.prior-round2.md:250`,
`w1a-review-r3-migrations.prior-round3.md:335`, both HIGH) and is **absent from
the close-out report**: §5.1b names `_shared/sms.ts:830-845`, the inbound YES
gate, `resolveRecipient` and `flushDeferredMessages`, and §5.1 names the
site-request rail. `field-daily` is neither.

**Fix.** W2 must repoint the two filters at the record (or drop the pre-filter
and let `sendPartySms`'s own gate decide, which is the shape that cannot drift).
Until then §5.1b owes the row, and §8's "MUST NOT SHIP ALONE" owes the sentence.

---

### MAJOR-3 — two shipped 00284 dispatch triggers gate on the frozen column, so court and task assignment texts stop reaching consented parties

`supabase/migrations/00284_field_dispatch_wiring.sql:118-123`
(`fc_dispatch_court_assignment`) and `:176-181` (`fc_dispatch_task_assignment`)
each read the party row and `RETURN NEW` early when
`v_party.sms_consent_status <> 'granted'`. Same mechanism as MAJOR-2, but these
are *migration objects* — SECURITY DEFINER trigger functions on
`client_decisions` and `project_tasks` — so they are squarely inside this
review's lane and a W2 repoint needs a new migration grafted from 00284, not a
TypeScript edit.

Consequence: assigning a coordination item or a task to a sub whose consent the
studio holds **on the record** now dispatches no `sms_court_assignment`. Fails
closed, silently, on a live un-flagged path. Neither function appears in any
review round (grep of `build/*.md` for `fc_dispatch_court_assignment` /
`fc_dispatch_task_assignment`: zero hits) or in the report.

**Fix.** Same as MAJOR-1/2: repoint at
`channel_consent_status(project_consent_org(NEW.project_id),'sms',v_party.phone_e164)`,
or name them in the owed list. Note that `fc_dispatch_optin_invite` (00432) and
`_site_request_consent_granted_dispatch` (00374) were deliberately left as
shipped — correctly — but these two were simply not looked at.

---

### MAJOR-4 — correcting a typo'd phone number transplants a frozen refusal onto a number that never refused, and the room and the rail then disagree with no door out

`useUpdateProjectParty` reverts consent only when the current seat status is
`pending` or `granted` (`packages/supabase/src/hooks/use-coordination.ts:665`).
On an `opted_out` seat it adds **no** consent column to the patch — deliberately,
and documented at `:620-639` — so the UPDATE names only `phone` / `phone_e164`,
the `BEFORE UPDATE OF` freeze (`00594:997-1004`) does not fire, and the edit
lands. The refusal rides along to the new number, where
`orgHasOptedOutParty` (`_shared/sms.ts:355-380`) and both write doors' seat gates
(`00594:1628`, `:1904`, `:1972`) read it.

Probe 3 — a studio records Pete's real inbound STOP, then a designer fixes a
digit:

```
=== the studio records the refusal, then a designer CORRECTS the number ===
  status
 opted_out
UPDATE 1

--- what the ROOM prints for the corrected number ---
 display_name |    phone     | roster_word
 Pete Rusk    | 612-555-0200 | not_asked
 display_name | directory_word
 Pete Rusk    | not_asked

--- what the WRITE gate says about the corrected number ---
NOTICE:  record_channel_consent(granted) on the CORRECTED number -> channel_opted_out
NOTICE:  record_channel_invite   on the CORRECTED number         -> channel_opted_out
NOTICE:  record_channel_reconsent on the CORRECTED number        -> no_opt_out_to_supersede

--- and what the send gate (orgHasOptedOutParty, org-scoped) would find ---
 send_gate_refuses_corrected_number
 t
 records_for_corrected_number
 0
```

The room prints **"Not asked"** with a live "Text" act; every send is refused;
all three write doors refuse; there is no record to reconsent against. The
number is dead for that studio, permanently, and nothing on any surface says so.

The other leg is worse-looking. Probe 5 — the corrected number is one the studio
*already* holds a recorded, evidenced grant for (the commonest typo: two seats,
one real number):

```
=== the designer corrects Pete's typo: 612-555-2222 -> 612-555-1111 (Dana's number) ===
 display_name  | roster_word
 Dana Kowalski | granted
 Pete Rusk     | granted

 record_status | refusal_unanswered
 granted       | f

 send_gate_orgHasOptedOutParty_refuses
 t
```

Both rows print **"Texting"**. The record says `granted` with no unanswered
refusal, so `channel_consent_status` — correctly, by its own rule — says
`granted`. And every `sendPartySms` to that number comes back `opted_out`,
because PR-x's second check finds the transplanted seat. That is G-3's sentence
verbatim ("one row can read 'Texting' while the same phone is opted out"),
restored inside the record built to end it, on a path a designer reaches by
fixing a digit.

Part of this is pre-existing (PR-x's seat check has always been able to refuse a
send the seat-reading room called "Texting"). What is **new in this wave** is
that the seat is now unreadable and unrepairable: pre-freeze Pete's own row
printed "Opted out", which was the visible clue and the thing a designer could
act on, and `revertsToOptedOut` could at least put the two in agreement. Now
both readers take the word from a record that knows nothing about the
transplanted seat, and §5.2's "a legacy `opted_out` seat is now permanent"
describes only the *un-grantable* half — it does not say that an ordinary phone
edit can create one on a number that never refused, nor that the room will print
`not_asked`/`granted` over it.

**Fix, smallest first.** Make the phone-edit path refuse while the seat is
`opted_out` (it already refuses for `pending`/`granted` via the freeze, so this
is one more branch in `useUpdateProjectParty` plus a sentence), and state the
population in §5.2. The durable fix is W2 retiring PR-x's seat check, which
`rulings.md` PR-x already contemplates ("then retire it in a named follow-up").

---

### MINOR-1 — the mint leg of `record_channel_consent` still writes a refusal into the grant's five columns (carried, r1/r2 MINOR-1)

`00594:1723`. The header (`:145-153`), the `DO UPDATE` leg (`:1795-1807`) and the
`COMMENT` all say "A REFUSAL WRITES NONE OF THE CONSENT'S FIVE"; the `VALUES`
leg writes all five unconditionally. Harmless while `consented_at` stays NULL
(R-Q's grant sentence has no date to compose), and the fold and the rail both
mint the same way on purpose (`00594:626-631`) — but the invariant the header
states is not the invariant the code holds, and the record is now the only copy.
Either narrow the `VALUES` leg with the same `CASE` the UPDATE leg uses, or
amend the three comments to say "except on a mint".

### MINOR-2 — `inbound_sms` still short-circuits the r10 M1 date test (carried)

`00594:387-393`. `refusal_words_are_its_own` is true as soon as
`sms_consent_source = 'inbound_sms'`, without comparing
`sms_consent_recorded_at` to `sms_opt_out_at`. A seat holding a grant given *by
text* (`inbound_sms` + `Inbound YES`) and later flipped by a STOP therefore folds
with the grant's words, the grant's `recorded_at`, and a studio member in
`opt_out_recorded_by` — the attribution r7 R7-M1 ruled must be NULL on a
rail-written STOP. Unreachable from any shipped writer today (nothing puts
`inbound_sms` on a party row; the rail writes only the record), but the fold is
one-shot over real prod data and `ON CONFLICT DO NOTHING` means no later fold
repairs it. Adding `AND (sms_consent_recorded_at IS NULL OR sms_opt_out_at IS NULL
OR sms_consent_recorded_at >= sms_opt_out_at)` to the `inbound_sms` disjunct costs
nothing.

### MINOR-3 — `refuse_legacy_consent_write()` is the one wave guard that keeps `authenticated` EXECUTE (carried)

`00594:872` revokes `PUBLIC, anon`; every sibling guard also revokes
`authenticated` (`00592:236`, `:423`, `:976`; `00593:310`, `:587`). Probe F
confirms it is inert:

```
NOTICE:  F1 direct call as authenticated -> 0A000 trigger functions can only be called as triggers
```

Inconsistent, and the legacy-grants generator will replay the row forever.

### MINOR-4 — no door checks `p_origin_project_id` against the org (carried)

`00594:1519`, `:2120`, `:2261`. A member may stamp another studio's project id
onto their own record; R-Q's sentence then names a job that is not theirs. Not a
leak — `projects` RLS still hides the name — but the org resolver
`project_consent_org()` now exists and makes the check one line.

### MINOR-5 — `people_directory.meta` still mixes the record's verdict with the seat's dates (carried)

`00594:1292` reads the record; `:1296-1297` (`sms_consented_at`,
`sms_opt_out_at`) read the frozen seat. Acknowledged in report §5.3 and owed to
W1b's v4 rebuild. Confirmed no UI consumer: a grep of `apps` + `packages` for
either name (excluding `database.types.ts` and tests) returns only
`use-coordination.ts`'s own writers.

### MINOR-6 — the consent word costs three non-inlinable definer calls per party row, and now it is measured (carried, quantified)

`00594:1086`, `:1282`, `:1294`. `project_consent_org()` is SECURITY DEFINER and
`channel_consent_status()` carries `SET search_path`, so PostgreSQL inlines
neither. Probe 4, one studio, 20 projects, 600 party rows, 600 consent records,
`ANALYZE`d, as `authenticated`:

```
=== v_project_roster over one project (30 party rows) ===
 Planning Time: 2.723 ms      Execution Time: 3.705 ms

=== people_directory, selecting status_raw + meta->>'sms_consent_status' (600 rows) ===
 Planning Time: 3.047 ms      Execution Time: 72.847 ms
   (the same query with the consent columns pruned: 9.804 ms)
```

≈0.1 ms per party row of pure function-call overhead. Fine at Leah's studio;
worth a `LATERAL` that resolves the org once per row and calls the status
function once, since PR-y ships the rebuilt directory at 100% with no flag
(rulings §6). Not a risk — downgraded from r2's framing.

### MINOR-7 — `consent_awaiting_recipient` and `consent_not_recordable` still reach the designer as raw Postgres strings, and take the whole add with them (carried as r2 MINOR-8)

`asWrittenConsentRpcError` (`use-coordination.ts:573-592`) maps
`channel_opted_out`, `invalid_channel_value`, `not_a_studio_member` and
`consent_evidence_required`. `record_channel_invite` deliberately does **not**
swallow `consent_awaiting_recipient` — a `granted` record carrying an unanswered
refusal falls through its standing-grant test (`00594:2160-2166`) and
`record_channel_consent` raises at `:2008`. That population is exactly what the
first prod fold mints (`00594:666`), so the add-party act fails with a raw
string rendered at `party-profile-sheet.tsx:490`, and the designer cannot put
that person on the roster at all. Two more `if (message.includes(...))` branches.

### MINOR-8 — an unparseable phone gets a consent record under a key no reader uses (carried)

Probe G:

```
 channel_value | status
---------------+---------
 123           | pending

 rpc_key | seat_key
---------+----------
 123     |            ← normalize_phone_e164('123') is NULL
```

`normalize_channel_value` falls back to the trimmed raw text for phone kinds
(`00593:169-172`) while `00281`'s `normalize_party_phone_e164` leaves
`phone_e164` NULL for the same input, so both readers and the send gate look up
NULL. Inert (a NULL `phone_e164` cannot be sent to — `sms.ts:795-797` returns
`no_phone_number`) but the RPC reports success for a fact nothing can read.

### MINOR-9 — `resolveRecipient`'s phone-only branch still reduces consent phone-globally in the POSITIVE direction (carried)

`_shared/sms.ts:562-582`. `reduceConsent` (`:181-189`) returns `granted` if any
party row on the number says so, across every tenant, and `:815-818` lets that
authorise a non-invite send when `channelConsentVerdict` answered `unknown`.
`flushDeferredMessages` was narrowed for exactly this (`:1106-1118`, citing
R-AK); `resolveRecipient` was not. Unreachable today — both live callers pass a
`partyId` — and unchanged from `origin/main`, so latent, not live.

### MINOR-10 — a frozen `pending` seat turns a bare inbound "YES" into an unbounded re-subscription door

`sms-inbound/pipeline.ts:766` gates the YES branch on
`parties.some(p => p.sms_consent_status === 'pending')`. Pre-freeze, a STOP
flipped every seat on the number to `opted_out`, which closed that gate. Now
nothing moves the seat, so a seat that was ever invited stays `pending` for ever
and any later "YES" from that number re-grants the studio — including years
after a STOP, and including after the number has been reassigned to a different
human (crm-model §4, "A phone is reassigned to a new human"). It is the
recipient's own reply, and Twilio treats YES as an opt-in keyword, so this is
not a lost opt-out — but the gate now rests on a seat state no act can clear,
which is the shape R-AS exists to remove. The record-based question is "does
this studio's record read `pending`", and `studiosHoldingRecord(from,['pending'])`
already exists two branches up (`:732-735`).

### MINOR-11 — the add path still sends a fresh opt-in invite to a number the studio already holds an evidenced grant for

`use-coordination.ts:474-505`: when `record_channel_invite` returns a standing
`granted` untouched, the INSERT that follows still writes
`sms_consent_status: 'pending'` (`:495`), which fires `fc_optin_invite_dispatch`
(00284:254-257 → 00432:27-68) and sends the opt-in SMS. `sendPartySms` lets it
through because `studioGranted` is true (`_shared/sms.ts:820-826`) and the
evidence proof reads the seat the INSERT just wrote (`:830-845`). So every repeat
add produces one duplicate opt-in text — which is precisely the harm 00594's own
header cites as the reason the mirror had to go ("one recorded `pending` became
one real opt-in text per seat on the number, on a 10DLC campaign where duplicate
opt-in traffic is what gets a campaign filtered", `00594:70-80`). Pre-existing
behaviour, not introduced here; the r2 fix removed the record-side demotion and
left the text.

### MINOR-12 — `project_consent_org()` is an ungated SECURITY DEFINER oracle

`00594:1010-1024`, `REVOKE … FROM PUBLIC, anon` + `GRANT … TO authenticated`,
with no membership check. Probe H, as a Beta member asking about an Alpha
project:

```
    beta_member_learns_alphas_org
 c2000000-0000-4000-8000-00000000000a

 beta_member_reads_alphas_verdict
 (null)
 beta_member_sees_alpha_records
 0
```

No consent word and no row leaks — `channel_consent_status` stays INVOKER and
the table's RLS holds — but any authenticated caller (a homeowner included) can
map a known project UUID to its owning studio UUID. Identical posture to
`studio_contact_org` (`00592:65-77`) and `project_party_designer`
(`00592:85-96`), both shipped in this same wave and both needed by RLS policies,
so this is a house-wide convention rather than a new hole. Worth one sentence in
the function comment saying it is deliberate.

### MINOR-13 — the fold keys on the raw `phone_e164` column, not through `normalize_channel_value`

`00594:652` inserts `channel_value = r.phone_e164` while both RPCs insert
`normalize_channel_value('sms', …)`. They agree today only because 00281's
trigger already normalises the column (and re-normalises a direct set). A row
whose `phone_e164` was written non-canonically by any future path would fold
onto a key no RPC ever touches, and `ON CONFLICT DO NOTHING` would then make the
divergence permanent. Wrapping the fold's projection in the shared normalizer
costs one function call per row and makes the one-key invariant structural rather
than incidental.

### MINOR-14 — one 00593 function pins `search_path = public, pg_temp` where every sibling pins `public`

`00593:248` (`normalize_studio_contact_channel`). It is SECURITY INVOKER, so
this is not an escalation path, and `public` is listed first — but the file's
other four functions (`:161`, `:213`, `:291`, `:506`) all pin `'public'` alone.
Make it consistent so a future reader does not have to work out why one differs.

### MINOR-15 — the email/phone seat gate runs a `project_parties` scan for email records

`00594:1626-1631` and `:1902-1907` test `pp.phone_e164 = v_value` (resp.
`scc.channel_value`) with no `channel_kind` guard, so recording an email consent
pays for a `project_parties × projects` scan that can never match an E.164
value, and the code reads as though a phone seat could refuse an email grant.
`AND p_channel_kind = 'sms'` in front of both makes the intent explicit.

### MINOR-16 — a local reset never exercises the fold

`00594:751` runs `SELECT public.backfill_channel_consent_from_parties();` inside
the migration, and Supabase applies migrations **before** seeds, so on a fresh
stack the fold sees zero party rows:

```
 consent_records
 0
 sms_consent_status | count
 (0 rows)             ← no seeded project_parties carries a phone_e164 at all
```

Every fold assertion therefore rests on the test file's own fixtures; nothing
ever folds the seed. Since the fold is one-shot over real prod data and
`ON CONFLICT DO NOTHING` makes a wrong mint permanent, a seed fixture with two
seats on one number (or an explicit `SELECT backfill…()` step in a seed file
after `project_parties` is populated) would be cheap insurance before the Strata
push.

### MINOR-17 — `w1a-report.md` is stale in four places after the r2 fixes

- `:310` — "*baseline + 2638 replayed statements*". The real number is **2640**
  (§1.5 above); r2's fix log already says 2640.
- `:381` — "9 changed lines, all additions: the two new functions". Three
  functions were added; `record_channel_invite` accounts for 38 more lines, per
  r2's own fix log.
- `:147` — the `useAddProjectParty` row still says the act records the invite
  "through `record_channel_consent(…, 'pending', …)`". It calls
  `record_channel_invite` (`use-coordination.ts:474`); r2's MAJOR-1 is the reason.
- §6's per-block table (`:331-332`) stops at blocks 37 and 38; blocks 39 and 40
  exist and pass.

Also `:70` describes `record_channel_invite` as being refused as
`consent_awaiting_recipient` on an unsendable `granted` — correct, and it is the
sentence MINOR-7 says must reach the designer in words.

### MINOR-18 — `record_channel_invite` routes control flow on `SQLERRM` text

`00594:2176-2180` — `IF SQLERRM <> 'consent_already_granted' THEN RAISE; END IF;`.
Correct today, and the `RAISE` with no arguments re-raises faithfully. But it
couples the add path's success to the exact wording of a `RAISE EXCEPTION` 250
lines up: re-word that message and every repeat-sub add starts failing with a
raw string instead of returning the standing grant. A dedicated SQLSTATE (or a
shared constant in the hint) would make the coupling visible.

---

## 5. Things I checked that are clean (so the next round need not re-walk them)

- **No cross-tenant read or write.** Probe 1c/1d/H: `studio_channel_consent` has
  RLS on, exactly one SELECT policy (`is_active_studio_member(organization_id)`),
  `authenticated=r` and nothing else — no INSERT/UPDATE/DELETE policy and no
  write grant, so the RPCs really are the only doors. `anon` has neither SELECT
  nor INSERT on any of the four new tables. A Beta member reads NULL from
  `channel_consent_status()` for an Alpha org and zero rows from the table.
  Probe 2 §A: Beta holding an `opted_out` *seat* on a number does not block
  Alpha's grant (R-AK/R-AL scoping holds).
- **The freeze fires.** Probe D: `UPDATE project_parties SET sms_consent_status
  = 'pending'` → `P0001 consent_legacy_column_frozen`. Probe 1e: the trigger is
  `BEFORE UPDATE OF` all eight columns; the three other BEFORE triggers on the
  table (`normalize_phone_project_parties`, `set_updated_at_project_parties`)
  touch none of them, and alphabetical ordering puts none of them after the
  guard in a position to rewrite `NEW`.
- **The mirror is gone.** Probe 1e/1f: no `mirror_channel_consent_to_parties`
  function, no trigger, `fns_reading_suppress_flag = 0`, and
  `fc_dispatch_optin_invite` / `_site_request_consent_granted_dispatch` carry
  their shipped bodies with their shipped trigger definitions.
- **The grafts are faithful.** One hunk in `v_project_roster`, three in
  `people_directory`, all of them the consent expression; every other branch,
  column, `WHERE` and `COMMENT` byte-identical to `00419` / `00589`.
- **`channel_consent_status` is the one verdict.** Probe 1g: both views call it,
  neither restates `refusal_unanswered`, neither inlines
  `_primary_studio_for`.
- **The edge rail's org resolution matches the SQL side.**
  `_primary_studio_for` (`ORDER BY (role='owner') DESC, joined_at NULLS LAST,
  created_at`) and `primaryStudioFor` in `_shared/sms.ts:214-263` rank
  identically, over the same `status='active'` + `type='design_studio'` filters.
- **Every wave definer pins `search_path`**, and `anon` holds EXECUTE on none of
  the eight RPCs.
- **The reserved range is respected**: 00592/00593/00594 only; nothing in
  00595–00620.

---

## 6. What would make this clean

1. Repoint (or explicitly owe, in §5.1b and §8) the three readers MAJOR-1/2/3
   name: `field_activity_summary.awaiting_reply_count` (00282:582),
   `field-daily/core.ts:154-157` + `:251-255`, and 00284's two dispatch triggers
   (`:118-123`, `:176-181`). MAJOR-1 is the only one a designer can see today,
   so it is the one that must not ship as-is.
2. Close MAJOR-4's write path: refuse the phone edit while the seat is
   `opted_out`, and state the transplanted-refusal population in report §5.2
   beside the existing "permanent legacy seat" bullet.
3. The eighteen MINORs are cheap. Take MINOR-2 first (the fold is one-shot over
   real data and unrepairable), then MINOR-7 (same class MAJOR-3 was raised for,
   and it kills the add), then MINOR-16 (fold coverage before the Strata push),
   then MINOR-17 (the report is the artifact Fable reads).
