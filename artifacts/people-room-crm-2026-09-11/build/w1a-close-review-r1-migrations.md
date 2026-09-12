# W1a close-out — adversarial migration review, round 1

Reviewer context, separate from the implementer's. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD `c371bc480`
("refactor(consent): the record is the single source; mirror retired (R-AS)").
Local stack only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
Nothing was pushed anywhere.

Read in full: `rulings.md` (all sections), `synthesis/direction.md` §2.2/§3.8/§7/§8,
`synthesis/crm-model.md` §1/§2/§4/§5, `briefing/current-state.md` §B–§E,
`build/inventory.md`, `build/w1a-report.md`, `build/w1a-review-r9-migrations.md`,
`build/w1a-review-r10-tests.md` and the r9/r10 fix logs; then
`supabase/migrations/00592`, `00593`, `00594` line by line, plus
`supabase/functions/_shared/sms.ts`, `supabase/functions/sms-inbound/pipeline.ts`,
`packages/supabase/src/hooks/use-coordination.ts`,
`apps/designer-portal/src/components/document/people/party-profile-sheet.tsx`,
`supabase/migrations/00284`/`00432`/`00374`/`00419`/`00589`/`00315`.

**Verdict: NOT clean — 1 BLOCKING, 4 MAJOR, 8 MINOR.**

---

## 1. What I ran, and what came back

### 1.1 `.env.local` check (required before any destructive local act)

```
$ ls -la .codex/worktrees/agent-people-build/apps/designer-portal/ | grep -i env
.rw-r--r--@ 5.0k kody 11 Sep 13:38 .env.example
```

The worktree carries no `.env.local` at all; the main checkout's points at
`http://127.0.0.1:54321` (`apps/designer-portal/.env.local:19`). No prod exposure.
`supabase db reset` is local-only by construction.

### 1.2 Legacy grants

```
$ python3 scripts/generate-legacy-grants.py
wrote .../supabase/seed/00-legacy-grants.sql — baseline + 2636 replayed statements
$ git -C . status --short supabase/seed/00-legacy-grants.sql
(no output)
```

Already regenerated and committed. ✅

### 1.3 Reset, twice

```
$ pnpm --dir .../agent-people-build supabase:reset          # pass 1
exit=0
548          ← "Applying migration" lines
Restarting containers...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}

$ grep -n "0059[234]" reset1.log
554:Applying migration 00592_people_cards_affiliations_rules.sql...
555:Applying migration 00593_studio_contact_channels.sql...
556:Applying migration 00594_studio_channel_consent.sql...

$ pnpm --dir .../agent-people-build supabase:reset          # pass 2
exit=0
548
Finished supabase db reset on branch main.
```

Both passes replay all 548 migrations. **But see MINOR-8**: three earlier runs on
this machine failed, twice inside `00484_public_rpc_authorization_contract.sql`
with `LegacyMigrationApplyError … effect/sql/SqlError: Connection error`, and on
one of them the CLI printed `Finished supabase db reset` while
`supabase_migrations.schema_migrations` was still short of 00594. Different
failure points and two clean passes afterwards point at the local Docker/CLI, not
at W1a — recorded because a single green reset is not evidence on this box.

### 1.4 SQL tests (both passes)

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
...
NOTICE:  37. the record is the single source: no mirror, the legacy columns frozen,
         both readers on channel_consent_status(), and org isolation through RLS (R-AS): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
exit=0
```

40 `passed` notices, exit 0, run after reset 1 and again after reset 2.
(Operational note: after every reset the GoTrue container must be restarted
before `auth.users.email_confirmed_at` exists, or the fixture at test line 134
fails with `column "email_confirmed_at" of relation "users" does not exist`.)

### 1.5 Deno tests

```
$ deno test --no-check -A --node-modules-dir=auto --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts
ok | 82 passed | 0 failed (121ms)
```

### 1.6 Generated types

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir .../agent-people-build db:generate
$ git -C . diff --stat packages/supabase/src/database.types.ts
(no output)
```

No drift. ✅

### 1.7 My own probe

`artifacts/people-room-crm-2026-09-11/build/probe28-close-review-r1.sql`
(objects and behaviour only, one transaction, ROLLBACKed). Output quoted inline
below.

### 1.8 Graft check on the two repointed views

```
$ diff -u <00419 v_project_roster> <00594 v_project_roster>
```
one hunk: `pp.sms_consent_status` → the `COALESCE(channel_consent_status(...))`
expression, plus `LEFT JOIN public.projects prj`. Nothing else moved.

```
$ diff -u <00589 people_directory> <00594 people_directory>
```
two hunks, both the same consent expression (`status_raw` and
`meta.sms_consent_status`). Every other branch byte-identical. ✅ The report's
lineage claim holds.

---

## 2. Migration rules — pass/fail

| Rule | Verdict |
|---|---|
| Hand-numbered `NNNNN_slug.sql` | ✅ 00592/00593/00594; W1b mints from 00621 as instructed; 00595–00620 untouched |
| grep-before-redefine + graft | ✅ `v_project_roster` from `00419:94-156`, `people_directory` from `00589:696-935`, `_primary_studio_for` body copied verbatim from `00315:64-79` (I diffed the live `pg_get_functiondef` against the inline copy — identical text). `fc_dispatch_optin_invite` / `_site_request_consent_granted_dispatch` deliberately NOT redefined, verified live (probe P7 shows both triggers with their shipped bodies) |
| Banner + lineage | ✅ all three files |
| Idempotent | ✅ `CREATE TABLE IF NOT EXISTS` + matching `ALTER … ADD COLUMN IF NOT EXISTS`, DROP/ADD for every named CHECK, `DROP TRIGGER IF EXISTS` before each `CREATE TRIGGER`, `DROP FUNCTION IF EXISTS` for the retired mirror. Proven by two full replays |
| RLS in the same file | ✅ 00592 (affiliations, rules), 00593 (channels), 00594 (consent) |
| Explicit grants both directions + REVOKE FROM PUBLIC, anon | ✅ with one nit — MINOR-3 |
| SECURITY DEFINER pins `search_path` | ✅ every definer in the three files sets `search_path TO 'public'` |
| schema-qualify extension fns | ✅ (`gen_random_uuid()` is `pg_catalog` on PG17; consistent with the rest of the tree) |
| Guarded crons | ✅ none added |
| CHECK over enum for new vocab | ✅ `company_kind`, `channel_kind`, `status`, `source`, `opt_out_source`, the two `channels_*` array CHECKs |
| Money in integer cents | ✅ `retainage_bps integer` |
| `00-legacy-grants.sql` regenerated | ✅ (§1.2) |
| Reset + SQL tests + types | ✅ (§1.3–1.6) |
| Probes hit objects, never the ledger | ✅ |

---

## 3. Findings

### BLOCKING-1 — an inbound STOP whose record write fails is acknowledged anyway, and the record is now the only copy

`supabase/functions/sms-inbound/pipeline.ts:420-486`

```ts
    const keepsPriorConsent = status === "opted_out" && hadRecord;
    await supabase.from("studio_channel_consent").upsert({
      ...
    }, { onConflict: "organization_id,channel_kind,channel_value" });
  }
  return { failed };            // pipeline.ts:486-487
```

`writeChannelConsent()` checks the **prior read** (`:381-389`, `failed = true;
continue;`) and never checks the **write**. `failed` can therefore only ever be
raised by a read error.

The STOP branch was built specifically to refuse to acknowledge a partially
recorded refusal (r7 R7-M3, `pipeline.ts:672-697`):

```ts
    if (
      stopPhoneParties.failed || stopRecordStudios.failed || stopWrite.failed
    ) {
      ... await supabase.from("sms_messages").update({ twilio_sid: null })...
      return { status: 500, twiml: twimlBody(), disposition: "opt_out_incomplete" };
    }
```

`stopWrite.failed` is `false` after a failed upsert, so the branch answers Twilio
**200**, keeps the `twilio_sid` idempotency claim, and Twilio never retries.

Before R-AS this was survivable: `optOutAllForPhone()` had already written
`sms_consent_status='opted_out'` onto every party row on the number, and
`orgHasOptedOutParty()` in `_shared/sms.ts:355-381` read it. R-AS deleted that
write and froze the columns (`00594:870-877`), so there is no second copy. The
failure mode is now: the recipient texts STOP → the upsert errors (transient
PostgREST/DB error, or an FK violation if `origin_project_id` names a project
deleted between the read at `:363` and the write at `:420`) → the pipeline
answers 200 → the record still reads `granted` / does not exist →
`channelConsentVerdict` (`_shared/sms.ts:474-492`) sees a non-refusing record,
`orgHasOptedOutParty` finds nothing on the frozen seats → **the next send goes
out to a number that has said STOP.**

That is the severity list's first clause verbatim ("a text can be sent to a
number whose studio record says opted_out" — here, should say) and its second
("an opt-out can be lost … without a newly recorded consent").

No test covers it: `_tests/sms-inbound.test.ts` covers a failed *party* read
("a STOP whose party read fails is not acknowledged either") and a failed
*record* read, never a failed record **write**.

**Fix**: capture the upsert result and treat it exactly like the prior read —

```ts
    const { error: writeError } = await supabase
      .from("studio_channel_consent").upsert({...}, { onConflict: ... });
    if (writeError) {
      console.error("writeChannelConsent: the record could not be written", {...});
      failed = true;
      continue;
    }
```

and add a test that stages an upsert error and asserts `status === 500` /
`disposition === "opt_out_incomplete"` / `twilio_sid` cleared.

---

### MAJOR-1 — the views resolve a different studio than every writer, and print the wrong consent word

`00594:972-993` (`v_project_roster`), `00594:1188-1207` and `00594:1216-1235`
(`people_directory`, twice).

Both views inline `_primary_studio_for`'s body instead of calling it, because
00483 revoked EXECUTE from the PostgREST roles. The inlined copy is textually
identical to `00315:64-79` — but the **function is SECURITY DEFINER and the
inlined copy is not**. `organization_members` carries
`"Active members can view co-members" USING is_active_org_member(organization_id)`
(verified live), so the view can only see memberships in orgs the CALLER belongs
to, while `backfill_channel_consent_from_parties()` (`00594:381`),
`record_channel_consent()`'s seat gate (`00594:1570`, `:1846`) and the edge rail
(`_shared/sms.ts` `primaryStudioFor`) all see every membership.

For a project with `studio_id IS NULL` whose designer belongs to more than one
`design_studio`, the two answers diverge. Probe P1 (fixture: designer is a plain
member of Alpha and the OWNER of Beta, so the definer ordering picks Beta; the
project has `studio_id NULL`; Beta records a STOP for `+16125559001`):

```
=== P1a. org resolved by the DEFINER path (backfill / RPC / send rail) ===
             definer_org              |                 beta
--------------------------------------+--------------------------------------
 f1000000-0000-4000-8000-00000000000b | f1000000-0000-4000-8000-00000000000b
 studio_id
-----------
             ← NULL

=== P1b. org resolved by the INLINED subquery in the views, per caller ===
    caller    |             inlined_org
--------------+--------------------------------------
 alpha member | f1000000-0000-4000-8000-00000000000a
 display_name | sms_consent_status
--------------+--------------------
 Ray Thao     | not_asked            ← WRONG

   caller    |             inlined_org
-------------+--------------------------------------
 beta member | f1000000-0000-4000-8000-00000000000b
 display_name | sms_consent_status
--------------+--------------------
 Ray Thao     | opted_out            ← right
```

One seat, one number, two consent words depending on who is looking. The
Alpha-side reader prints **Not asked** for a number the send rail will refuse and
whose record says `opted_out`. `people_directory` carries the same expression
twice, so the Directory row, `status_raw`, and `meta.sms_consent_status` (and
therefore `party-profile-sheet.tsx:258-261`) are wrong the same way.

The migration comment at `:976-982` documents only the *degrade-to-NULL* case
("for anyone else it degrades to NULL"). The case above is worse than a degrade:
the view silently asks **another studio's ledger** and gets a confident answer.
Not a tenancy leak — RLS still restricts the answer to orgs the caller belongs to
— but it is a shipped reader showing a wrong verdict on exactly the
`studio_id IS NULL` population §5.2 already names as this wave's blind spot.

**Fix**: mint one SECURITY DEFINER `public.project_consent_org(uuid)` (the shape
`studio_contact_org(uuid)` already takes in `00592:65-76`), grant EXECUTE to
`authenticated, service_role`, and call it from both views. One function, one
answer, and the views stop carrying 20 lines of duplicated body in three places.

---

### MAJOR-2 — the "Invited" consent word is unreachable for every newly added party

`packages/supabase/src/hooks/use-coordination.ts:439-444` writes the seat on
INSERT:

```ts
          sms_consent_status: wantsText ? 'pending' : 'not_asked',
          sms_consent_source: wantsText ? consentSource : null,
          ...
```

The freeze is `BEFORE UPDATE OF` (`00594:871-877`), so this INSERT still lands,
`fc_optin_invite_dispatch` (`00284:254-257`) still fires, and the opt-in SMS
still goes out. **But nothing writes a consent record**, and both readers now
read the record only. `channel_consent_status()` returns NULL → `COALESCE(…,
'not_asked')`.

So: the studio adds a sub, ticks "text updates", records the source and the
words, the invite SMS leaves — and the Call Sheet, the Directory row and the
party sheet all print **"Not asked"** until the recipient replies YES. The
`Invited` word of direction §3.8's consent family (golden/pending) no longer
exists in the room for any new party. Worse for the designer's mental model:
the room says "Not asked" for someone Patina has just texted.

This is a reachable write path that leaves the record and the reader
disagreeing, and it is not in the report's §5 or §8.

**Fix** (W1a-sized): have the INSERT path also call
`record_channel_consent(org, 'sms', phone, 'pending', …)`, or — cheaper and
inside this wave — make the room fall back to the seat's `pending` when the
record is absent. The second is a second source of truth again, so the first is
the right one.

---

### MAJOR-3 — the shipped consent act and every phone edit now raise a raw Postgres error into the designer's face

Probe P4, the exact shape `useRecordPartySmsConsent` writes
(`use-coordination.ts:745-755`):

```
NOTICE:  P4 portal pending write: raised consent_legacy_column_frozen
```

`party-profile-sheet.tsx:475-495` is the only consent act on the party sheet and
it renders the thrown message verbatim (`:490` → `inviteError` → `:854-859`), so
the designer sees the literal string `consent_legacy_column_frozen`.

The report's §3 names `useUpdateProjectParty`'s "`revertsToOptedOut` branch". It
is broader than that: `use-coordination.ts:558-620` applies
`NOT_ASKED_CONSENT_COLUMNS` on **every** phone edit of a seat whose current
status is `granted` or `pending`, refusal or not — so renaming a number on a
consented party also raises. Same for `site_request_send()`
(`00374:1265-1269`), which is `GRANT EXECUTE … TO authenticated`
(`00374:3546`) and is called from the portal and from Patina Field
(`apps/mobile/Capture/.../SiteRequestContract.swift:15`), so the iOS
"send a site request" act fails for any `not_asked` assignee.

I accept this is deliberate and W2-owed (rulings §6 deploys one chain at the
end). It is recorded as MAJOR because §8 "Not done" does not say the room ships
a hard error and an opaque error string in the meantime, and because a reviewer
reading §8 alone would not know that W1a must never land on its own.

---

### MAJOR-4 — the owed-work list misses three rails that still read the frozen seat

§5.1/§8 name the site-request rail and the two portal UPDATE writers. These are
also on the seat and are not listed:

1. `_shared/sms.ts:827-845` — the `sms_optin_invite` evidence proof reads
   `pp.sms_consent_source / _evidence / _recorded_at / _disclosure_version` off
   the party row. A consent recorded through `record_channel_consent()` leaves
   those NULL, so the invite returns `consent_evidence_required`.
2. `sms-inbound/pipeline.ts:745` — the inbound `YES` branch gates on
   `parties.some(p => p.sms_consent_status === "pending")`, a seat state no
   consent act can produce any more.
3. `_shared/sms.ts:552-568` / `:1070-1085` — `resolveRecipient` and the flush
   still take `recipient.consent` off the seat, which is now frozen at whatever
   it was at fold time.

Consequence for W2 planning: "replace the portal's two UPDATE writers with the
RPCs" (§5.3) is **not sufficient** to restore the double opt-in. The invite
dispatch fires on a party row and the YES gate reads a party row; both have to
move to the record too. Today the opt-in survives only through the INSERT path
of MAJOR-2 — which is the very thing R-AS says nothing should do.

---

### MINOR-1 — the mint leg of `record_channel_consent` writes a refusal into the grant's five columns

`00594:1658-1672`. The header states the rule twice (`:142-153`, `:1708-1723`):
"A REFUSAL WRITES NONE OF THE CONSENT'S FIVE." The `DO UPDATE` leg honours it
(`:1732-1742`); the `VALUES` leg writes `p_source, p_evidence, v_now,
p_disclosure_version, auth.uid()` unconditionally. Probe P3:

```
=== P3. does an opted_out MINT write the GRANT-side five columns? ===
  status   | source |      evidence      | recorded_at_set | consented_at | opt_out_source |  opt_out_evidence
-----------+--------+--------------------+-----------------+--------------+----------------+--------------------
 opted_out | verbal | He told me on site | t               |              | verbal         | He told me on site
```

Harmless today — R-Q's grant sentence composes from `consented_at`, which is
NULL — and the fold's comment at `:596-599` says this is deliberate parity with
the rail. But the header asserts an invariant the code does not hold, and a
future reader that prints the grant from `source` alone will print the refusal.
Either state the exception in the header, or guard the five in the VALUES leg the
way the UPDATE leg does.

### MINOR-2 — `inbound_sms` short-circuits the date test the r10 M1 fix added

`00594:374-380`:

```sql
           (pp.sms_consent_status = 'opted_out'
            AND pp.sms_consent_source IS NOT NULL
            AND (pp.sms_consent_source = 'inbound_sms'
                 OR pp.sms_opt_out_at IS NULL
                 OR pp.sms_consent_recorded_at IS NULL
                 OR pp.sms_consent_recorded_at >= pp.sms_opt_out_at))
             AS refusal_words_are_its_own,
```

A seat whose evidence describes a GRANT **given by text** and which a later STOP
flipped to `opted_out` satisfies the first disjunct and skips the date test.
Probe P2 (seat: `opted_out`, source `inbound_sms`, evidence "Inbound YES",
recorded 2025-03-01, `sms_opt_out_at` 2025-12-03, recorded_by a studio member):

```
=== P2. the fold, and an inbound_sms GRANT left standing on a STOP-flipped seat ===
  status   |       opt_out_at       | opt_out_source | opt_out_evidence |  opt_out_recorded_at   | opt_out_recorded_by_set
-----------+------------------------+----------------+------------------+------------------------+-------------------------
 opted_out | 2025-12-03 00:00:00+00 | inbound_sms    | Inbound YES      | 2025-03-01 00:00:00+00 | t
```

The refusal is minted holding the grant's words, a `recorded_at` nine months
*before* the refusal, and an `opt_out_recorded_by` naming a studio member for a
refusal the recipient made — the attribution r7 R7-M1 / r9 R5-M2 ruled must be
NULL on a rail-written STOP. Exactly the class r10 M1 closed, surviving in the
one branch that bypasses the test.

**Not reachable from any shipped writer**: `grep -rn "inbound_sms"` over
`packages apps services supabase/functions supabase/migrations` shows no writer
of that value onto a party row (`00432:6` only permits it; the portal offers
`verbal | written | web_form | other` at `party-profile-sheet.tsx:247` and
`add-person-sheet.tsx:225`; the pre-R-AS rail wrote no source at all —
`git show origin/main:supabase/functions/sms-inbound/pipeline.ts:159-178`). So
this is latent, not live. It is worth closing anyway because the fold is one-shot
(`ON CONFLICT DO NOTHING`) and irreversible, and the record is now the only copy:
apply the same date clause to the `inbound_sms` leg.

### MINOR-3 — the freeze trigger function is the only guard in the wave that keeps EXECUTE for `authenticated`

`00594:859` revokes from `PUBLIC, anon` only. Probe P5:

```
 refuse_legacy_consent_write           | f         | {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
 assert_studio_contact_identity_stable | t         | {postgres=X/postgres,service_role=X/postgres}
```

Every sibling guard revokes `authenticated` too (`00592:236`, `:423`, `:976`;
`00593:310`, `:587`). Harmless — a trigger function called directly raises — but
inconsistent with the wave's own posture and with what the legacy-grants
generator will replay forever.

### MINOR-4 — neither RPC checks that `p_origin_project_id` belongs to the org

`00594:1459`, `00594:2019`. `origin_project_id` is FK'd to `projects` and nothing
else. A studio member may stamp another studio's project id onto their own
record; R-Q's sentence then names a job that is not theirs (the *name* stays
hidden behind `projects` RLS, so this is a wrong-fact problem, not a leak). One
`EXISTS (SELECT 1 FROM projects WHERE id = p_origin_project_id AND
COALESCE(studio_id, _primary_studio_for(designer_id)) = p_organization_id)`
closes it.

### MINOR-5 — `people_directory.meta` mixes the record's verdict with the seat's dates

`00594:1216-1237`: `meta.sms_consent_status` reads the record while
`meta.sms_consented_at` / `meta.sms_opt_out_at` in the same JSON object read the
frozen seat, so one object can say `granted` beside a 2025 seat opt-out date.
Acknowledged in the report §5.3 and owed to W1b's v4 rebuild. Confirmed harmless
today: `grep -rn "sms_consented_at\|sms_opt_out_at\|smsConsentedAt\|smsOptOutAt"
packages apps` finds no UI consumer — only `use-coordination.ts`'s own
`project_parties` row type and the generated types.

### MINOR-6 — the consent word now costs a correlated subquery per row, twice on the Directory

`00594:972-993` (once per roster row) and `00594:1188-1235` (twice per directory
party row): each `channel_consent_status()` call wraps an inlined
`organization_members × organizations` subquery. Previously both were a plain
column read. PR-y ships the rebuilt `people_directory` at 100% with **no flag**
to fall back to (rulings §6), so an EXPLAIN ANALYZE on a real-sized studio
belongs in the pre-deploy gate. Also: the two calls in `people_directory` are
textually identical, so the planner may or may not CSE them — worth confirming.

### MINOR-7 — the fold's group-wide `refusal_unanswered` does not compare dates across seats

`00594:663` sets `refusal_unanswered = (f.org IS NOT NULL)`, and the `refusal`
population (`:567-570`) tests each row against **its own** `sms_consented_at`
only. A studio holding a 2025 refusal on one seat and a genuine 2026 re-grant on
a *different* seat therefore folds to a `granted` record that is permanently
unsendable until the recipient texts START. Fails closed, consistent with r8
W4-M1's ruling — but §5.2's "what this costs" lists only the legacy
`opted_out`-seat case, not this one. Worth one sentence there so W2 knows the
shape.

### MINOR-8 — the local reset is not reproducibly green on this machine

Three failures before the first clean pass:

```
Applying migration 00484_public_rpc_authorization_contract.sql...
{"_tag":"Error","error":{"code":"LegacyMigrationApplyError",
 "message":"effect/sql/SqlError: Connection error\nAt statement: 79\nGRANT EXECUTE ON FUNCTION public.enqueue_agent_task(...)"}}

Applying migration 00310_reseed_onboarding_templates_branded.sql...
{"_tag":"Error","error":{"code":"LegacyMigrationApplyError","message":"effect/sql/SqlError: Connection error"}}
```

and once the CLI printed `Finished supabase db reset` while
`select count(*) from supabase_migrations.schema_migrations` still read 393 of
548. Two clean passes followed with no code change, and the failure points
differ, so this is the local Docker/CLI (`supabase 2.114.0` CLI vs `2.77.0`
pinned in the `db:generate` script — the two disagree) rather than anything in
00592–00594. Recorded so the next run does not read a single green reset as
proof. Also: GoTrue needs a container restart after every reset before
`auth.users` carries `email_confirmed_at`, which the SQL test's fixture requires.

---

## 4. Things I checked that are clean

Stated so the next round does not re-walk them.

- **No cross-tenant read or write.** Probe P5/P6:
  `studio_channel_consent` is `relrowsecurity=t` with
  `{postgres=arwdDxtm,service_role=arwdDxtm,authenticated=r}` and a single
  member-only SELECT policy; a member's direct `UPDATE`/`INSERT` both come back
  `permission denied for table studio_channel_consent`. `channel_consent_status`
  is SECURITY INVOKER (`prosecdef=f`), so the table's own RLS is the whole rule
  — test block 37e/37e2 already proves Beta's member reads NULL for Alpha's org,
  and I re-ran it. The three 00592/00593 tables gate on
  `is_active_studio_member(studio_contact_org(...))` with a WITH CHECK that pins
  both cards of an affiliation to one studio.
- **The send gate refuses on the record OR on an org-scoped `opted_out` seat.**
  `_shared/sms.ts:480` (record `opted_out`), `:487` (`refusal_unanswered`),
  `:490` and `:499` (`orgHasOptedOutParty`, org-scoped per R-AK), `:451-457`
  (unresolved org refuses, R-AM), `:517-533` (the phone-global RECORD scan added
  for the unattributable branch), `:535-549` (the phone-global seat scan behind
  it). Every read error returns `refuse`. `flushDeferredMessages` runs the same
  gate in the same order (`:1086-1134`, R-AH).
- **START scope (R-AJ).** `pipeline.ts:713-716`:
  `studiosHoldingRecord(supabase, from, ["opted_out", "pending"])` — a studio at
  `not_asked` or with no record is untouched even when it holds a seat.
- **Evidence is never nulled on the record.** `00594:1732-1742` COALESCEs over
  `NULLIF(btrim(…), '')` for source/evidence/disclosure_version and COALESCEs
  `recorded_by`; the four `opt_out_*` columns are written only when the verdict
  is the refusal and an `inbound_sms` refusal is never overwritten by a
  studio-sourced one (`:1763-1790`); `record_channel_reconsent` does not name
  them at all (`:2065-2111`). Test blocks 18, 32, 33, 35 assert it and pass.
- **The mirror is really gone.** Probe P7: `project_parties` carries exactly five
  triggers — `fc_optin_invite_dispatch`, `normalize_phone_project_parties`,
  `refuse_legacy_consent_write_trg` (BEFORE UPDATE OF the eight columns),
  `set_updated_at_project_parties`, `site_request_consent_granted_dispatch` —
  and `mirror_channel_consent_to_parties` does not exist as a function or a
  trigger. Neither shipped trigger function carries a suppression guard.
- **No writer of the frozen columns survives except the guarded path.**
  `grep -rn "UPDATE public.project_parties" supabase/migrations/*.sql` →
  `00281:142`, `00374:1266`, `00418:300`, `00418:322`; the two 00418 statements
  set `studio_contact_id` only, `00281:142` replays long before the trigger
  exists, and `00374:1266` raises (documented). `grep -rn "sms_consent"
  supabase/seed/*.sql` → nothing. The portal's two UPDATE paths raise (probe P4).
- **The value keys cannot drift.** `normalize_channel_value` (00593) and
  `normalize_party_phone_e164` (00281) both bottom out in
  `public.normalize_phone_e164`, and all three are IMMUTABLE — so
  `record_channel_consent`'s seat gate (`pp.phone_e164 = v_value`) compares like
  with like. `sms_consent_status` is `NOT NULL DEFAULT 'not_asked'`, so the
  fold's three-valued-logic edges (`NOT refusal_words_are_its_own`) cannot go
  NULL.
- **R-AI / R-AO / R-AP / R-AR** (00592 affiliations + pointer binding, N×N
  siblings, the three designated people, the held-card freeze in 00593) all
  behave as the report describes; test blocks 1–3, 27–31 cover them and pass.
- **PR-w** — nothing in this wave creates a site-access table or a client RLS
  branch; the only client-visible surface touched is `show_to_client`, unchanged.

---

## 5. What would make this clean

1. Check the upsert result in `writeChannelConsent()` and cover it with a test
   (BLOCKING-1).
2. Replace the twice-inlined `_primary_studio_for` body with one SECURITY
   DEFINER `project_consent_org(uuid)` and call it from both views (MAJOR-1).
3. Decide MAJOR-2 in this wave: either the add-party path records a `pending`
   consent record, or the room's `not_asked` for a just-invited party is ruled
   acceptable in writing.
4. Expand §5/§8 of `w1a-report.md` to name the opt-in invite rail, the inbound
   YES gate, `resolveRecipient`, the whole phone-edit path, and the iOS
   site-request act — and state plainly that W1a must not deploy without W2
   (MAJOR-3, MAJOR-4).
5. The MINORs are cheap and can ride the same fix round; MINOR-2 in particular,
   because the fold cannot be re-run over a record it already minted.
