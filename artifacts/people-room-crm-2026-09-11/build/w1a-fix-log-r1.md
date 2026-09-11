# W1a — r1 review fix log

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, on top of `1970075c2`.

Scope: exactly the eight findings handed over from
`w1a-review-r1-migrations.md` (B1, M1–M7) and `w1a-review-r1-tests.md` (P-1).
Nothing else was touched. Local Supabase only — no `db push`, no
`functions deploy`, no Strata contact.

All three migrations are still unapplied everywhere but local, so they were
edited in place rather than superseded by a 00595.

---

## Gates run after the fixes

```
$ pnpm --dir .../agent-people-build supabase:reset
…
Applying migration 00592_people_cards_affiliations_rules.sql...
Applying migration 00593_studio_contact_channels.sql...
Applying migration 00594_studio_channel_consent.sql...
Applying migration 20260910152111_create_contact_messages.sql...
Seeding data from supabase/seed/00-legacy-grants.sql...   (+28 more seeds)
Finished supabase db reset on branch main.
```

(`apps/designer-portal/.env.local` does not exist in this worktree — checked
before the reset, so nothing could have pointed at Strata.)

```
$ psql … -c "select version, name from supabase_migrations.schema_migrations order by version desc limit 4;"
    version     |              name
----------------+---------------------------------
 20260910152111 | create_contact_messages
 00594          | studio_channel_consent
 00593          | studio_contact_channels
 00592          | people_cards_affiliations_rules

$ psql … -c "select tablename from pg_tables where schemaname='public' and tablename in
             ('studio_channel_consent','studio_contact_channels','studio_contact_rules','studio_person_affiliations');"
 studio_channel_consent / studio_contact_channels / studio_contact_rules / studio_person_affiliations   (4 rows)
```

Objects probed, not the ledger.

```
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
NOTICE:  1. affiliations + RLS: passed
NOTICE:  2. channel normalisation: passed
NOTICE:  3. consent backfill precedence: passed
NOTICE:  4. mirror + 5. record_channel_consent: passed
NOTICE:  6. mirror fan-out (B1) + backfill re-run (M1): passed
NOTICE:  7. widened vocabularies (M2/M3/M4): passed
NOTICE:  All W1a assertions passed.
ROLLBACK

$ deno test --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts
ok | 45 passed | 0 failed (115ms)          # was 40 before this round

$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_tests/ supabase/functions/_shared/
FAILED | 668 passed | 1 failed (3s)        # was 663 passed | 1 failed
  ./supabase/functions/_tests/stripe-rail.test.ts (uncaught error)  — pre-existing,
  unrelated (needs _tests/test.env; imports neither sms.ts nor sms-inbound)

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate
$ git diff --stat packages/supabase/src/database.types.ts      # (empty — CHECK widenings are not type-visible)

$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2619 replayed statements
$ git diff --stat supabase/seed/00-legacy-grants.sql            # (empty — no GRANT/REVOKE changed)

$ pnpm --filter @patina/supabase type-check        → exit 0
$ pnpm --filter @patina/designer-portal type-check → exit 0
$ deno check --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.ts supabase/functions/sms-inbound/{pipeline,index}.ts
Check supabase/functions/_shared/sms.ts
Check supabase/functions/sms-inbound/pipeline.ts
Check supabase/functions/sms-inbound/index.ts     → clean
```

`deno check` on the other three `_shared/sms.ts` importers (`sms-dispatch`,
`field-daily`, `site-request-dispatch`) reports **11 errors, all inside
`sms-dispatch/index.ts`** (supabase-js client-generic mismatch, `TS2345`
`SupabaseClient<any,…>` / `TS2353` `user_id … 'never[]'`). Proven pre-existing
by restoring the committed `_shared/sms.ts` and re-running:

```
$ git show HEAD:supabase/functions/_shared/sms.ts > supabase/functions/_shared/sms.ts
$ deno check … supabase/functions/sms-dispatch/index.ts | grep -cE "^TS.*ERROR"
11                      # identical count at HEAD → untouched by this round
$ (working copy restored; git diff --stat → 72 insertions / 23 deletions, as before)
```

Idempotent rerun — all three files re-executed against the already-migrated DB
inside one rolled-back transaction:

```
 ### rerun 00592
 ### rerun 00593
 ### rerun 00594
 ### all three re-ran clean
ROLLBACK
```

---

## B1 (blocking) — one recorded `pending` became N real opt-in SMS

`00594_studio_channel_consent.sql`

**What changed.** The mirror cannot be narrowed without losing its purpose
(every party row in the studio on that number *must* carry the verdict — that
is what makes `project_parties.sms_consent_*` a cache), and skipping `pending`
would leave the cache lying about the one status the room most needs to show.
So the fix is the reviewer's second option: suppress the *dispatch*, and only
for the mirror's own write.

- New section `3a`: `fc_dispatch_optin_invite()` is redefined with the
  grep-winner body from `00432:27-68` copied verbatim (trigger
  `fc_optin_invite_dispatch`, `00284:254-257`), plus exactly one new statement
  at the top:
  `IF COALESCE(current_setting('patina.suppress_optin_dispatch', true),'') = '1' THEN RETURN NEW; END IF;`
  The lineage is named in the banner and in the section comment.
- `mirror_channel_consent_to_parties()` wraps its own `UPDATE` in
  `set_config('patina.suppress_optin_dispatch','1',true)` … `set_config(…,'',true)`.
  Transaction-local (`is_local = true`), and AFTER-row triggers queued by a
  statement inside a PL/pgSQL function fire at the end of *that* statement, so
  the window is exactly the mirror's write.
- The migration banner now states the runtime hazard and the redefinition;
  both function comments were rewritten to match.

A designer writing an evidenced `pending` onto a party row directly still
dispatches, unchanged.

**Evidence.** Reviewer's exact fixture (three `not_asked` party rows, one
number, one Alpha project, one `record_channel_consent(…,'pending',…)` call),
with `public.invoke_edge_function` stood in for inside a rolled-back
transaction so dispatches are countable:

```
--- AS SHIPPED (00594 guard in place) ---
 sms_consent_status | party_rows | fully_evidenced
--------------------+------------+-----------------
 pending            |          3 |               3

 optin_texts_sent
------------------
                0

--- COUNTERFACTUAL: same act, 00432 body with the guard removed ---
 optin_texts_sent_without_guard
--------------------------------
                              3
```

The mirror still does its whole job (3 rows, fully evidenced); the fan-out of
real texts is 3 → 0, and the counterfactual proves the rail is live rather than
absent.

Locked in by test block 6 in
`supabase/tests/people/w1a_identity_channels_consent_test.sql`, which carries
its own control (`6z`: the fixture's evidenced-pending INSERT dispatches once,
so a zero elsewhere means suppressed, not absent), asserts the direct
party-row write still dispatches (`6c`), and asserts the flag does not survive
the mirror (`6d`).

---

## M1 (major) — the documented post-push backfill re-run reintroduced B1

`00594:199-205`, `artifacts/…/build/w1a-report.md:308-321`

**What changed.** B1's fix makes the re-run genuinely side-effect-free, so the
instruction survives — but it is now stated with the reason, and the report
gained the dry-run the reviewer asked for (m14's suggestion, adopted here
because M1's fix names it):

- The report's "Not done" bullet now reads: **before** the Strata push,
  dry-run the fold as a bare `SELECT … FROM ranked WHERE rn = 1`; the
  re-run afterwards is safe *because* folded rows reach the party rows through
  the mirror, which stands the dispatch down.
- `backfill_channel_consent_from_parties()`'s own `COMMENT` says the same, so
  the fact travels with the function rather than only with the report.

**Evidence.** Test block 6e/6f: with the trigger live, a maintenance re-run
folds one new number, the mirror flips both of that number's party rows to
`pending` (`n = 2`) — and the dispatch count does not move.

```
NOTICE:  6. mirror fan-out (B1) + backfill re-run (M1): passed
```

---

## M2 (major) — `channel_kind` omitted `ap_email` and `portal_311`

`00593_studio_contact_channels.sql`

**What changed.** The vocabulary is now
`mobile | office | dispatch | after_hours | email | ap_email | portal_311`, both
in the `CREATE TABLE` and — the load-bearing half — as a re-stated named
constraint (`DROP CONSTRAINT IF EXISTS` / `ADD CONSTRAINT`, the 00592 idiom),
because `CREATE TABLE IF NOT EXISTS` would skip the inline version on a rerun.

`normalize_studio_contact_channel()` gained the matching branches: `ap_email`
lowercases like `email`; `portal_311` keeps the trimmed raw text (a portal
handle is neither a phone nor an address).

`app` / `account` / `field_link` / `paper` are **deliberately not** kinds here;
the column comment records why (they are reach tiers derived from an access
grant, E9, not addresses a studio member types onto a card). That is the
explicit decision M2's fix asked for.

**Evidence.**

```
$ psql … "select conname, pg_get_constraintdef(oid) from pg_constraint
          where conrelid='public.studio_contact_channels'::regclass and contype='c';"
 studio_contact_channels_channel_kind_check | CHECK ((channel_kind = ANY (ARRAY['mobile'::text,
   'office'::text, 'dispatch'::text, 'after_hours'::text, 'email'::text, 'ap_email'::text,
   'portal_311'::text])))
```

Test block 7a: `'  AP@Northgate.COM '` stores as `ap@northgate.com`;
`'  MPLS-311 / acct 88213  '` stores verbatim-but-trimmed. 7c: an unknown kind
still raises `23514`.

---

## M3 (major) — `company_kind` was narrower than the model and the shipped UI

`00592_people_cards_affiliations_rules.sql:116-128`

**What changed.** The CHECK is now `crm-model.md` §2 verbatim —
`gc, sub, architect, engineer, lender, authority, showroom, vendor, workroom,
supplier, stager, photography, maker` — plus `inspector` and `other`, the two
the room already uses that the model does not list. `authority` is the AHJ
(F-27's city department) and is kept distinct from `inspector`, which stays for
§3.8's paper-exempt lender/inspector pair.

The `photography` / `photographer` reconciliation M3 asked for: the trade noun
`photography` (crm-model §2) wins. Nothing writes either value today —
`photographer` in this repo is a *person's* `PartyKind`
(`document/coordination/party.ts:113`, roster and person-bits maps), never a
company card's kind — and `company_kind` is a brand-new column, so there is no
data to break.

The column comment now states the binding constraint: the list must stay a
superset of the shipped UI's `COMPANY_KIND_LABELS`
(`company-row.tsx:33-39` — `gc / workroom / showroom / vendor / supplier`) so
folding 00417's free-text `contact_kind` into this column cannot raise `23514`.

**Evidence.**

```
$ psql … "select pg_get_constraintdef(oid) from pg_constraint
          where conname='studio_contacts_company_kind_check';"
 CHECK (((company_kind IS NULL) OR (company_kind = ANY (ARRAY['gc','sub','architect','engineer',
   'lender','authority','showroom','vendor','workroom','supplier','stager','photography',
   'maker','inspector','other']))))
```

Test block 7d walks a card through `workroom`, `showroom`, `supplier`,
`authority` and then asserts an unknown kind still raises `23514`.

---

## M4 (major) — the channel `status` CHECK had no `bounced`

`00593_studio_contact_channels.sql`

**What changed.** `status` is now `active | bounced | unsubscribed | dead`
(`ok` stays spelled `active` — a harmless rename, noted in the comment), in the
`CREATE TABLE` and as a re-stated named constraint for the same rerun reason as
M2. The comment cites crm-model §2 and CS6-10's dated bounce; `status_at`
already existed to carry the date.

**Evidence.**

```
 studio_contact_channels_status_check | CHECK ((status = ANY (ARRAY['active'::text,
   'bounced'::text, 'unsubscribed'::text, 'dead'::text])))
```

Test block 7b writes a dated `bounced` onto the AP channel and reads it back.

---

## M5 (major) — the primary consent gate could refuse but never authorise

`supabase/functions/_shared/sms.ts`

**What changed.** `channelConsentRefuses()` (boolean) became
`channelConsentVerdict()` returning `"refuse" | "allow" | "unknown"`:

- own-org record `opted_out` → `refuse`
- own-org record `granted` → `allow`
- own-org record `not_asked`/`pending`, or none → fall through; the
  phone-global party-row scan can still return `refuse`, otherwise `unknown`

In `sendPartySms`, `verdict === "allow"` sets `studioGranted`, which lifts only
the two POSITIVE gates (`!isInvite && recipient.consent !== 'granted'` and the
invite's `pending`/`granted` test). Every opt-out path is untouched and still
refuses first, from either ledger — the gate stays fail-closed on refusal and
only stops refusing a send the studio has already been granted (fixture F-11:
a seat created today for a number the studio recorded a grant for in 2025).

The doc comment was rewritten to describe what now ships, rather than what the
reviewer correctly found it only claimed.

**Evidence.** Two new tests in `_shared/sms.test.ts`:

```
the studio's granted record carries a send the party row would refuse ... ok
a granted record does not override an opted-out party row ... ok
```

The first has a `not_asked` party row plus a `granted` studio record and
asserts `res.sent`; the second has an `opted_out` party row under the same
`granted` record and asserts `{sent:false, reason:"opted_out"}`.

---

## M6 (major) — `grantAllForPhone` defeated the wave's own per-studio scoping

`supabase/functions/sms-inbound/pipeline.ts`

**What changed.** `studiosHoldingPhone()` now returns
`{ org, projectId, partyIds[] }` — the studio's own party rows travel with the
target. `grantAllForPhone(phone)` is replaced by
`grantPartiesForStudios(targets)`, which updates `.in("id", ids)` instead of
`.eq("phone_e164", phone)`. Both the YES and START branches compute the target
set **once** and hand the same set to `writeChannelConsent` and to the party-row
write, so the record and its mirror cannot disagree by construction.

`optOutAllForPhone` is deliberately left phone-global, with a comment saying
why: a STOP is a carrier-level act against the sending number, it can only ever
*refuse* a send, and the only extra rows it reaches are rows whose org cannot be
resolved at all — which have no consent record either, so nothing is left
disagreeing. The asymmetry is now stated in the file rather than implied.

**Evidence.** New test in `_tests/sms-inbound.test.ts`:

```
YES does not grant a party row in a studio that never invited ... ok
```

Two studios hold one number; only org-alpha's row is `pending` at the moment of
the YES. After: `p1` (alpha) `granted`, `p2` (beta) still `not_asked`, and
exactly one consent record, `organization_id = org-alpha`.

---

## M7 (major) — the inbound rail and the SQL side resolved the org differently

`supabase/functions/sms-inbound/pipeline.ts`, `supabase/functions/_shared/sms.ts`

**What changed.** Both edge-function resolvers now use the SQL side's rule,
`COALESCE(projects.studio_id, _primary_studio_for(projects.designer_id))`
(`00594:153` and `:308`):

- `sms.ts` gained an exported `resolveProjectOrg(supabase, projectId)` that
  reads `studio_id, designer_id` and falls back to the
  `_primary_studio_for` RPC; `channelConsentVerdict` calls it instead of
  reading `studio_id` alone.
- `pipeline.ts`'s `studiosHoldingPhone` selects `designer_id` too and resolves
  the fallback once per designer (memoised), so a NULL-`studio_id` project is
  no longer skipped.

`_primary_studio_for(uuid)` already holds `GRANT EXECUTE … TO authenticated,
service_role` (`00315:82`), so no grant change was needed — confirmed by the
empty `00-legacy-grants.sql` diff above.

**Evidence.** Two new tests, one per side:

```
a NULL-studio_id project resolves its org through _primary_studio_for ... ok   (sms.test.ts)
STOP reaches a NULL-studio_id project through _primary_studio_for ... ok       (sms-inbound.test.ts)
```

The first: a `granted` party row on a NULL-`studio_id` project whose designer's
primary studio holds an `opted_out` record — the send is refused
(`reason: "opted_out"`), which the old `studio_id`-only read could not do. The
second: a STOP on that project writes the opt-out record under
`org-alpha`, the designer's primary studio — the record the migration would
otherwise have created and this rail could never have reached.

---

## P-1 (major, process — no code fix)

Not a defect in the reviewed diff, and nothing in the wave's files was changed
for it. Recorded here for the orchestrator, and confirmed again this round:
the local Postgres was found **wiped** at the start of this session
(`supabase_migrations.schema_migrations` did not exist at all), so every probe
above required a fresh `pnpm supabase:reset` from this worktree first.

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
    -Atc "select version from supabase_migrations.schema_migrations order by version desc limit 5;"
ERROR:  relation "supabase_migrations.schema_migrations" does not exist
```

That is the third disturbance of this shared stack across the build and its
review (the reviewer restored it twice from another wave's `time_entry_*`
00592–00594). Two things are owed, neither of them a code change:

1. **Serialize or isolate the other wave** — it is running against the same
   local Postgres during a task scoped as sole-owner. Anything it or this wave
   proves against that stack is only as good as the last reset.
2. **Renumber at integration.** This wave's `00592`/`00593`/`00594` collide by
   number with a live `time_entry_*` trio. The report's "Not done" section
   already carries the plan (filename plus the internal banner number and
   cross-references, against whichever tip wins); nothing here is on prod, so
   this side is the one that moves.
