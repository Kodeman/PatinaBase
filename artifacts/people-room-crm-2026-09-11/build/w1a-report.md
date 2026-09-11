# W1a — the data layer: identity, channels, consent

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.
Local Supabase only. Nothing was pushed to Strata; no `supabase db push`, no
`supabase functions deploy`.

---

## 1. What shipped

### Migrations (three, minted after this worktree's head `00591`)

| File | Carries |
|---|---|
| `supabase/migrations/00592_people_cards_affiliations_rules.sql` | `studio_contact_org()` + `project_party_designer()` helpers · `studio_contacts` person columns (`is_sole_proprietor`, `studio_verdict`, `studio_verdict_at`) and company columns (`legal_name`, `dba_name`, `company_kind` + CHECK, `trades`, `w9_on_file_at`, `tax_id_last4`, `remit_to`, `retainage_bps`, `warranty_until`, `paperwork_contact_person_id`, `signer_person_id`, `site_contact_person_id`) · new table `studio_person_affiliations` · new table `studio_contact_rules` |
| `supabase/migrations/00593_studio_contact_channels.sql` | New table `studio_contact_channels` · **`normalize_channel_value(kind, value)`** — the one channel-key rule, shared with 00594's consent RPCs · `normalize_studio_contact_channel()` trigger (defers to it) · four-part backfill from `studio_contacts.phone/email` and from `project_parties.phone/email` where `studio_contact_id` is set |
| `supabase/migrations/00594_studio_channel_consent.sql` | New table `studio_channel_consent` (PK `(organization_id, channel_kind, channel_value)`) · `backfill_channel_consent_from_parties()` + its one call · `mirror_channel_consent_to_parties()` trigger · RPC `record_channel_consent(...)` · RPC `record_channel_reconsent(...)` (PR-m's named way back) · **REDEFINES two existing trigger functions**: `fc_dispatch_optin_invite` (lineage `00432:27-68`) and `_site_request_consent_granted_dispatch` (lineage `00374:3399-3444`) · `COMMENT ON TABLE public.project_parties` restating the mirror invariant (lineage `00212:46`) |

**Two functions are redefined, both grafted from their grep-winner bodies
verbatim** (`grep -rln "CREATE OR REPLACE FUNCTION[^(]*<name>" supabase/migrations/*.sql | sort | tail -1`):

| Redefined in 00594 | Grep-winner (lineage) | Delta |
|---|---|---|
| `public.fc_dispatch_optin_invite()` | `00432_twilio_activation_hardening.sql:27-68`; trigger `fc_optin_invite_dispatch` created `00284:254-257` | one guard, first statement — `patina.suppress_consent_dispatch` |
| `public._site_request_consent_granted_dispatch()` | `00374_field_site_request_loop.sql:3399-3444`; trigger `site_request_consent_granted_dispatch` created `00374:3446-3455` (untouched) | the same one guard, first statement |

Both are the two outward-facing AFTER-row triggers on `project_parties`; a
mirror write must fire neither. The `COMMENT ON TABLE public.project_parties`
in 00594 restates 00212:46's text and appends that invariant, so a third such
trigger cannot land unguarded.

Every other object in all three files is new or an `ADD COLUMN IF NOT EXISTS`;
`grep` for each new name across `supabase/migrations/*.sql` returned nothing
before I wrote them (`normalize_channel_value`, `record_channel_reconsent`,
`studio_contact_org`, `project_party_designer`,
`normalize_studio_contact_channel`, `backfill_channel_consent_from_parties`,
`mirror_channel_consent_to_parties`, `record_channel_consent`).

`python3 scripts/generate-legacy-grants.py` was re-run after the grants:
`supabase/seed/00-legacy-grants.sql` gained 156 lines ("baseline + 2623 replayed
statements"). It regenerates with an empty diff.

### Edge functions

- `supabase/functions/_shared/sms.ts` — new `channelConsentVerdict()`
  (`"refuse" | "allow" | "unknown"`), called in `sendPartySms()` **before** the
  existing gate, plus `resolveProjectOrg()` / `orgsOfProjects()`, which resolve
  a project's studio exactly as the SQL side does
  (`COALESCE(studio_id, _primary_studio_for(designer_id))`). It reads
  `studio_channel_consent` for `(org, 'sms', phone)`; refuses on `opted_out`;
  **refuses on a stale record** — any party row on this number belonging to the
  SAME studio that says `opted_out` outranks a `granted` record; allows on
  `granted` (the F-11 case: a seat created today for a number the studio
  recorded a grant for in 2025); and when no record exists for that studio falls
  back to "a party row on this number **in that same studio** is opted out →
  refuse". Both scans are studio-scoped on purpose: phone-globally they would
  re-open G-3, since an inbound STOP opts out every party row on the number in
  every studio, and a studio's first-ever outreach to a number it has never
  contacted would be silently blocked by a STOP it never received (R-AK). The
  fallback stays phone-global in exactly one place — when NO studio resolves for
  the send at all, where there is nothing to scope to and an unattributable send
  must not outrun a STOP. Underneath, the legacy `reduceConsent()` reduction
  stays as the fail-closed second check (PR-x); on the `partyId` path it reads
  that one party row, and on the phone-only path it reduces across the rows the
  caller could not attribute. `flushDeferredMessages()` runs the SAME two gates
  in the same order, keyed off the deferred row's own `party_id` (R-AH) — a
  second send path with a second consent gate is two answers to one question.
- `supabase/functions/sms-inbound/pipeline.ts` — `loadPhoneParties()`,
  `studiosHoldingPhone()` (now over the shared `orgsOfProjects()`),
  `studiosHoldingRecord()`, `withRecordOnlyStudios()`, `writeChannelConsent()`,
  `grantPartiesForStudios()`. STOP/UNSUBSCRIBE/… upserts `opted_out` for every
  studio holding the number **by seat or by record** — a studio that holds a
  consent record but no party row (a removed seat today, a card-level consent
  once W2 lands) was invisible to the seat-only derivation, so its record sat at
  `granted` for ever while the number had said STOP. START/UNSTOP is a
  RE-subscription, so it upserts `granted` only for the studios whose own record
  for that number is currently `opted_out` (the refusal it lifts) or `pending`
  (the invite it answers). A studio at `not_asked`, or with no record at all, is
  left untouched **even when it holds a seat on the number** — holding a seat is
  not having asked (R-AJ). In practice nothing is lost: a STOP writes an
  `opted_out` record for every studio holding the number, so the studios a START
  can be answering always have one. A `YES` that confirms a
  pending invite upserts `granted` **only** for the studios that actually hold a
  pending row — no record-only union there. `origin_project_id` follows the
  CURRENT verdict in both writers (`t.projectId ?? prior`), matching
  `record_channel_consent`'s `COALESCE(EXCLUDED..., scc....)`. Each write
  happens before the existing `project_parties` write, which is kept.
- `supabase/functions/_tests/fake-supabase.ts` — `upsert({onConflict})` now
  accepts a composite key (`"a,b,c"`). It previously treated the whole string as
  one column name, so a composite upsert matched the first row in the table.

---

## 2. Decisions taken (and why)

1. **The contact rule has exactly one home.** `studio_contacts` did **not** gain
   `never_text` / `do_not_contact` / `do_not_contact_reason` / `route_to_person_id`,
   as `direction.md` §7 listed. Per the orchestrator ruling the rule lives only
   in `studio_contact_rules`. Two homes for the same forbidding fact is how one
   of two readers misses it.
2. **`contact_kind` left alone.** Still free TEXT, no CHECK (`00417:82-87`).
   `company_kind` is the new, narrow vocabulary and takes a **CHECK, not an
   enum** — an enum `ADD VALUE` cannot be used in the transaction that adds it,
   and PD-4 keeps kind vocabularies code-resident.
3. **Card-owned RLS through a SECURITY DEFINER resolver.** Affiliations,
   channels and card-scoped rules gate on
   `is_active_studio_member(studio_contact_org(<card>))`. Resolving the org
   through a plain subquery on `studio_contacts` would make one table's RLS
   depend on another's, and a card the caller cannot see would read as "no org"
   rather than "not yours". `studio_contact_rules`' engagement leg gates on
   `is_studio_comember(project_party_designer(subject_id))`, matching
   `project_parties`' own posture (`00584:884-921`).
4. **Affiliations cannot straddle studios.** The INSERT/UPDATE `WITH CHECK` also
   requires `studio_contact_org(person_id) = studio_contact_org(company_id)`.
5. **`studio_channel_consent` grants `authenticated` SELECT and nothing else.**
   There is no INSERT/UPDATE/DELETE policy at all. `record_channel_consent()` is
   therefore the only door for the portal, by privilege — not by convention.
   Probed below.
6. **The backfill is a function, not a bare statement.**
   `backfill_channel_consent_from_parties()` is `SECURITY DEFINER`, revoked from
   `PUBLIC, anon, authenticated`, granted to `service_role`, and idempotent
   (`ON CONFLICT DO NOTHING` — re-running never overwrites a later decision). It
   is a function so the precedence rule the whole room now rests on can be
   tested directly rather than inferred from whatever happened to be in the
   database when the migration ran.
7. **Order inside 00594 is load-bearing.** The mirror trigger is created
   *after* the backfill runs. Created first, the backfill would push a studio's
   verdict down onto sibling party rows, and a row moving to evidenced-`pending`
   fires 00432's `fc_dispatch_optin_invite` — a real opt-in SMS, out of a
   migration. Noted in the file's banner.
8. **The mirror is guarded on the whole cached tuple**
   (status AND consented_at/opt_out_at/source/evidence/recorded_at/
   disclosure_version/recorded_by `IS DISTINCT FROM` the record's), so a
   re-record leaves already-identical rows alone but DOES refresh the evidence.
   Guarding on the status alone suppressed every evidence update too, which let
   a party row sit at `granted` with a NULL source, recorded_at and evidence —
   the 10DLC evidence for the send. Re-firing is held off by
   `patina.suppress_consent_dispatch`, not by the narrow status test.
9. **`record_channel_consent` keeps dates it did not restate.** A later grant
   does not erase `opt_out_at`, and vice versa — the room has to be able to
   print "granted 2 May 2025, opted out 3 Dec 2025" (R-Q).
10. **The org for a project is `projects.studio_id`,** with
    `_primary_studio_for(designer_id)` as the fallback (00317 both backfilled
    the column and trigger-maintains it) — **on both sides**. `sms.ts`'
    `resolveProjectOrg()` / `orgsOfProjects()` and `pipeline.ts`'
    `studiosHoldingPhone()` apply the same COALESCE the migration does, so the
    gate and the table cannot disagree about which studio a NULL-`studio_id`
    project belongs to (r1 M7).
11. **An unparseable phone keeps its raw text** in `studio_contact_channels.value`
    (the column is NOT NULL, so it cannot take the normaliser's NULL). The
    number the studio typed is never lost; it simply gets no E.164. The consent
    record keys on the SAME value, because both callers go through one function,
    `normalize_channel_value()` (00593) — stated twice, the rule drifted: the
    RPC refused what the trigger kept, leaving channel rows no consent record
    could be written for.
12. **The write door is a transition gate, not a value check.**
    `record_channel_consent()` requires source + evidence + disclosure_version
    for `pending`/`granted` and source + evidence for `opted_out` (PR-m), and
    refuses every transition OUT of `opted_out` — including to `not_asked`,
    which would erase the only stored record of the refusal. **`not_asked` is
    refused outright as a target status** (`consent_not_recordable`, R-AG):
    there is nothing to record — it is the absence of a consent, not a verdict —
    and taking it was the one evidence-free door into the table, where four
    arguments erased a recorded grant, its source, its words and its disclosure
    version, from the record and, through the mirror, from every seat in the
    studio on that number. **No write may empty the evidence set**: source,
    evidence, disclosure_version and recorded_by keep what stands when the new
    verdict does not restate them. Laundering is closed by the evidence gate
    rather than by nulling — every status the door still accepts must supply its
    own source and evidence, so a status change has already restated them by the
    time it reaches the write. PR-m's way back
    ("always a fresh recorded consent or an inbound START") is a separate named
    door, `record_channel_reconsent()`, landing on `pending` — `granted` stays
    the recipient's to give by replying YES or START. The optional half of the
    review's suggestion — capping the sms RPC at `pending` outright — was NOT
    taken: it would retire the `allow` branch M5 exists for and fixture F-11
    needs (a studio holding auditable prior express written consent).

13. **The no-record fallback reduces across the studio's own projects, never
    across tenants** (R-AK). `channelConsentVerdict()`'s fail-closed second
    check — the one PR-x keeps until the backfill is proven everywhere — now
    scans the resolving studio's own party rows. Phone-globally it blocked a
    studio's first-ever outreach to a number it had never contacted, because
    some unrelated studio once received a STOP from it, with no
    operator-visible reason and no expiry. The one surviving phone-global read
    is the case where no studio resolves at all.

14. **One consent gate, both send paths** (R-AH). `flushDeferredMessages()`
    reads `channelConsentVerdict()` keyed off the deferred row's `party_id`
    before the legacy reduction, exactly as `sendPartySms()` does. Before this
    a studio's `granted` record died at quiet hours (the flush refused the send
    as `not_consented`) and a studio's `opted_out` record could be overruled on
    the flush by another studio's granted party row.

15. **`studio_person_affiliations` is the home of person-at-firm;
    `studio_contacts.company_id` is a derived pointer** (R-AI). 00592 backfills
    an open affiliation (`to_date` NULL) for every person already linked
    through `company_id`, and the two are bound **in both directions**:
    `sync_studio_contact_company_pointer()` re-derives `company_id` from the
    open affiliation, and `sync_person_affiliation_from_pointer()` opens (or
    closes) that affiliation when `company_id` is written directly. Without the
    backfill the company card's crew list (R-W) would have rendered empty for
    exactly the firms a studio has been using longest. Bound one way only — as
    this wave first shipped it — the hooks that still write `company_id`
    (`use-studio-contacts.ts:202, :234`) produced a card with a firm and **no
    affiliation row**, invisible to that same crew list, and the firm the
    designer chose was silently discarded by the next affiliation write (r2
    review M-3). The reverse trigger stands down for a cross-studio pointer
    (which the affiliation RLS refuses anyway) and holds
    `patina.suppress_affiliation_sync` while it writes, so the two halves
    cannot ping-pong. The COMMENT on both says which is the fact and which the
    pointer.

16. **A START is a re-subscription, not a first grant** (R-AJ). The inbound
    grant is scoped to studios whose record is `opted_out` or `pending`; a seat
    on the number is not an invitation.

---

## 3. Probes

### Reset applies clean

```
$ pnpm --dir .codex/worktrees/agent-people-build supabase:reset
Applying migration 00591_notification_log_delivery.sql...
Applying migration 00592_people_cards_affiliations_rules.sql...
Applying migration 00593_studio_contact_channels.sql...
Applying migration 00594_studio_channel_consent.sql...
Applying migration 20260910152111_create_contact_messages.sql...
Seeding data from supabase/seed/00-legacy-grants.sql...
[...29 seed files...]
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
```

### Objects, RLS, policies

```
 relname                    | rls | policies
----------------------------+-----+----------
 studio_channel_consent     | t   |        1
 studio_contact_channels    | t   |        4
 studio_contact_rules       | t   |        4
 studio_person_affiliations | t   |        4
```

```
 studio_channel_consent_pkey | PRIMARY KEY (organization_id, channel_kind, channel_value)
```

### The RPC is the only write door

```
=== EXECUTE on record_channel_consent, by role ===
    rolname    | can_execute
---------------+-------------
 anon          | f
 authenticated | t
 service_role  | t

=== privileges on studio_channel_consent, by role ===
    rolname    | sel | ins | upd
---------------+-----+-----+-----
 anon          | f   | f   | f
 authenticated | t   | f   | f
 service_role  | t   | t   | t
```

### Functions: SECURITY DEFINER + pinned search_path

```
                proname                 | prosecdef |            proconfig            | anon_exec | auth_exec
----------------------------------------+-----------+---------------------------------+-----------+-----------
 _site_request_consent_granted_dispatch | t         | {search_path=public}            | f         | f
 backfill_channel_consent_from_parties  | t         | {search_path=public}            | f         | f
 fc_dispatch_optin_invite               | t         | {search_path=public}            | f         | t
 mirror_channel_consent_to_parties      | t         | {search_path=public}            | f         | t
 normalize_channel_value                | f         | {search_path=public}            | f         | t
 normalize_studio_contact_channel       | f         | {"search_path=public, pg_temp"} | f         | t
 record_channel_consent                 | t         | {search_path=public}            | f         | t
 record_channel_reconsent               | t         | {search_path=public}            | f         | t
 studio_contact_org                     | t         | {search_path=public}            | f         | t
 project_party_designer                 | t         | {search_path=public}            | f         | t
 _sync_person_company_pointer           | t         | {search_path=public}            | f         | f
 sync_studio_contact_company_pointer    | t         | {search_path=public}            | f         | f
```

(The two pointer functions added by R-AI hold EXECUTE for nobody: the trigger
runs as the definer owner, and `_sync_person_company_pointer(uuid)` takes a
caller-supplied person id, so its REVOKE names `authenticated` too.)

The two REDEFINED trigger functions keep the ACL `CREATE OR REPLACE` preserved:
`_site_request_consent_granted_dispatch` still holds nothing for `authenticated`
(00374's posture), `fc_dispatch_optin_invite` still holds the local
`00-legacy-grants.sql` baseline's EXECUTE. `anon` holds EXECUTE on none of them.

Both AFTER triggers on `project_parties` read the one guard:

```
$ psql … -Atc "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
               where n.nspname='public' and p.prokind='f'
                 and pg_get_functiondef(p.oid) like '%patina.suppress_consent_dispatch%'"
_site_request_consent_granted_dispatch
fc_dispatch_optin_invite
mirror_channel_consent_to_parties

$ psql … -c "select tgname, p.proname from pg_trigger t join pg_proc p on p.oid=t.tgfoid
             where tgrelid='public.project_parties'::regclass and not tgisinternal;"
 fc_optin_invite_dispatch              | fc_dispatch_optin_invite                ← guarded
 normalize_phone_project_parties       | normalize_party_phone_e164              (BEFORE, pure)
 set_updated_at_project_parties        | update_updated_at_column                (BEFORE, pure)
 site_request_consent_granted_dispatch | _site_request_consent_granted_dispatch  ← guarded
```

(`authenticated=X` on the two trigger functions is the local
`00-legacy-grants.sql` baseline re-granting EXECUTE on every routine; the
migrations' own `REVOKE ... FROM PUBLIC, anon` is what governs on Strata. Same
posture as 00281's `normalize_party_phone_e164`. `backfill_...` shows the
explicit `REVOKE ... FROM authenticated` held.)

### Triggers

```
 studio_channel_consent     | mirror_channel_consent_to_parties_trg
 studio_channel_consent     | set_updated_at_studio_channel_consent
 studio_contact_channels    | normalize_studio_contact_channel_trg
 studio_contact_channels    | set_updated_at_studio_contact_channels
 studio_contact_rules       | set_updated_at_studio_contact_rules
 studio_person_affiliations | set_updated_at_studio_person_affiliations
 studio_person_affiliations | sync_studio_contact_company_pointer_trg
```

### SQL test

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
NOTICE:  1. affiliations + RLS: passed
NOTICE:  2. channel normalisation: passed
NOTICE:  3. consent backfill precedence: passed
NOTICE:  4. mirror + 5. record_channel_consent: passed
NOTICE:  6. mirror fan-out (B1) + backfill re-run (M1): passed
NOTICE:  7. widened vocabularies (M2/M3/M4): passed
NOTICE:  8. mirror fan-out, site-request leg (B-1): passed
NOTICE:  9. record_channel_consent transition gate (B-2): passed
NOTICE:  10. mirror evidence refresh (M-1): passed
NOTICE:  11. one normalisation + origin rule (M-3): passed
NOTICE:  12. affiliations are the home, company_id the pointer (R-AI): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
```

What it asserts: a studio member writes and reads an affiliation; a cross-studio
pair is refused; a stranger studio sees none and cannot write one. Phones
normalise to E.164 from three spellings, emails lowercase and trim, an
unparseable phone keeps its raw text. Two studios hold `+16125550142`: inside
Alpha the older STOP beats the newer grant, while Beta's `not_asked` is
untouched — and a second Alpha number proves the most-recent grant wins between
two grants. Re-running the fold does not overwrite a later decision. The mirror
writes the verdict onto both Alpha party rows and onto neither of Beta's. The
RPC normalises `(612) 555-0142` onto the existing record rather than minting a
second, keeps the earlier opt-out date through a new grant, refuses a member of
another studio and a user in no studio (`not_a_studio_member`), and
`authenticated` gets `42501` on a direct INSERT while still reading its own
studio's two records.

Blocks 6–7 are the r1-round regressions (B1/M1 and the widened vocabularies).
Blocks 8–11 are the r2 round: a mirrored `granted` fires neither of
`project_parties`' outward AFTER triggers while a direct party-row write still
fires both (8); the RPC's evidence requirement, its refusal of every transition
out of `opted_out`, the absence of evidence-laundering across a status change,
and `record_channel_reconsent()`'s behaviour including `no_opt_out_to_supersede`
and a non-member refusal (9); a same-status re-record refreshing the mirrored
evidence, plus a whole-table assertion that NO party row sits at `granted` with
a hollow evidence set (10); and one normalisation rule plus one origin rule
(11). Block 12 is the r3 round: opening an affiliation sets
`studio_contacts.company_id`, a direct legacy write to that column does not
survive the next affiliation write, closing or deleting the affiliation clears
it, 00592's fold statement leaves exactly one open row and is a no-op on a
re-run, and no person card anywhere points at a firm it has no open affiliation
with. Block 9 also gained the R-AG pair: the four-argument `not_asked` call is
refused (`consent_not_recordable`) with the grant and its whole evidence set
left standing, and an opt-out that restates its own words keeps the disclosure
version rather than nulling it.

### Deno tests

```
$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared/sms.test.ts
ok | 26 passed | 0 failed (42ms)

$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/_tests/sms-inbound.test.ts
ok | 32 passed | 0 failed (26ms)

$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_tests/ supabase/functions/_shared/
FAILED | 681 passed | 1 failed (3s)
  ./supabase/functions/_tests/stripe-rail.test.ts (uncaught error)
    error: (in promise) Error: supabaseKey is required.
```

(The suite for `sms-inbound` lives at `supabase/functions/_tests/sms-inbound.test.ts`;
`supabase/functions/sms-inbound/` itself holds no `*.test.ts`, so a literal
`deno test … supabase/functions/sms-inbound` reports "No test modules found".)

`stripe-rail.test.ts` fails identically with my three edge-function edits
stashed — it wants env from `_tests/test.env`, which the bare `deno test`
invocation does not load. Pre-existing, unrelated.

Cases added across the three rounds:
`_shared/sms.test.ts` — the studio's `opted_out` record blocks a send the party
row would allow; another studio's opt-out does **not** block the owning
studio's send (the G-3 bug, gone); with no record at all an opted-out sibling
party row still blocks; the studio's `granted` record carries a send the party
row would refuse (M5/F-11); a `granted` record never overrides an opted-out
party row; a NULL-`studio_id` project resolves through `_primary_studio_for`
(M7). **r2 B-3**: a stale `granted` record does not carry a send past this
studio's own STOP; another studio's opted-out party row does **not** block this
studio's `granted` record (the scan stays studio-scoped, or G-3 re-opens); the
stale-record scan resolves a NULL-`studio_id` project through
`_primary_studio_for` too.
`_tests/sms-inbound.test.ts` — STOP writes one `opted_out` record per studio
(two studios, three party rows → two records); YES grants only for the studio
that actually invited; START upserts in place and keeps the earlier `opt_out_at`
and `disclosure_version`; YES does not grant a party row in a studio that never
invited (M6); STOP reaches a NULL-`studio_id` project through
`_primary_studio_for` (M7). **r2 B-3(b)/M-3**: STOP reaches a studio that holds
a consent record but no party row; START lifts a seatless `opted_out` record but
leaves a seatless `not_asked` one alone; a STOP re-homes `origin_project_id`
onto the job it came from.

**r3**: `_shared/sms.test.ts` — with no record, an opted-out sibling party row
**in the same studio** still blocks, another studio's does not, and with no
resolvable studio at all any opted-out row on the number still blocks (R-AK);
the flush honours the studio's `granted` record for a party row that has not
caught up, and suppresses on the studio's `opted_out` record even when the
party-row reduction would allow it (R-AH). `_tests/sms-inbound.test.ts` — START
does not grant a seat-holding studio whose record never left `not_asked`, does
grant one whose record is `pending`, and mints no record at all for a
seat-holding studio that has none (R-AJ).

Type check of the two files I edited:

```
$ deno check --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.ts supabase/functions/sms-inbound/pipeline.ts
Check supabase/functions/_shared/sms.ts
Check supabase/functions/sms-inbound/pipeline.ts
```

(`sms-dispatch/index.ts` reports 11 type errors and `fulfillment-po/core.ts` one;
both reproduce on HEAD with my edits stashed. Pre-existing — the suites run
`--no-check` by their own header instructions.)

### Generated types

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate
$ git diff --stat 700261663 -- packages/supabase/src/database.types.ts
 packages/supabase/src/database.types.ts | 461 ++++++++++++++++++++++++++++++++
 1 file changed, 461 insertions(+)
```

465 insertions, **zero deletions**. New table types `studio_channel_consent`,
`studio_contact_channels`, `studio_contact_rules`,
`studio_person_affiliations`; new function types
`backfill_channel_consent_from_parties`, `normalize_channel_value`,
`project_party_designer`, `record_channel_consent`, `record_channel_reconsent`,
`studio_contact_org`; and the fifteen new `studio_contacts` columns. Nothing
else. (Redefining `fc_dispatch_optin_invite` and
`_site_request_consent_granted_dispatch` changes no signature, so neither
appears in the diff.)

---

## 4. Importers of `_shared/sms.ts` — all redeploy in W7

`grep -rl "_shared/sms" supabase/functions --include=index.ts`:

1. `supabase/functions/site-request-dispatch/index.ts`
2. `supabase/functions/sms-dispatch/index.ts`

The wider `grep -rl "_shared/sms" supabase/functions` also reaches three
non-`index.ts` files that are bundled into their own deployables, so the real
redeploy list is **four functions**:

| Function | How it reaches `_shared/sms.ts` |
|---|---|
| `sms-dispatch` | `index.ts` imports it directly |
| `site-request-dispatch` | `index.ts` imports it directly |
| `field-daily` | `field-daily/core.ts` imports it; `index.ts` imports `core.ts` |
| `sms-inbound` | `sms-inbound/pipeline.ts` imports it (and is itself edited here) |

(`_shared/sms.test.ts` and `_tests/field-daily.test.ts` also import it; neither
deploys.)

---

## 5. Not done

- **Not applied to Strata.** No `supabase db push`, no `supabase functions
  deploy`, no `.env.local` repoint. Local only.
- **Migration numbers are provisional, and there is a live collision.** The
  local Postgres arrived carrying `00592_time_entry_claim_and_source`,
  `00593_project_unbilled_time_repair` and `00594_time_entry_auto_roster` in
  `supabase_migrations.schema_migrations` — another wave's branch has already
  minted 00592–00594 somewhere. Those files do not exist in this worktree, so
  this worktree's head really is 00591 and the reset replaced them wholesale.
  **At integration, expect to renumber this wave's three files** (filename plus
  the internal banner number and cross-references) against the target tip, per
  patina-parallel-work. Nothing here is applied to prod, so this side is the one
  that moves.
- **The backfills found nothing locally (0 channels, 0 consent rows).**
  Migrations run before seeds, so `studio_contacts` and `project_parties` were
  empty when 00593/00594 executed. The fold logic is proven by the SQL test
  against its own fixture, not by seed data. On Strata the backfills will do
  real work on first push. **Before that push, dry-run the fold** — run the
  `ranked` CTE from `backfill_channel_consent_from_parties()` as a bare
  `SELECT org, phone_e164, sms_consent_status FROM ranked WHERE rn = 1` against
  prod and read it, so the fold is seen before it is taken (r1 review m14).
  `backfill_channel_consent_from_parties()` can then be re-run afterwards as
  `service_role` without overwriting anything: the rows it folds reach the party
  rows through the mirror, which stands BOTH of `project_parties`' outward
  AFTER triggers down for its own write — 00432's opt-in invite and 00374's
  site-request consent dispatch — so a re-run sends no SMS and mints no dispatch
  work either (r2 B-1).
- **Out of W1a scope by instruction** (named so the next wave does not assume
  they landed): `studio_compliance_documents`, `project_party_authority`,
  `project_site_access_cards`, `client_households`, `studio_contact_merges`,
  `v_access_grants`, the `people_directory` rebuild, `project_parties`' new
  columns (`stage`, `on_site_from/to`, `site_access_mode`, `contracted_through`,
  `off_job_at/reason`, `company_id`, bid fields), the `create_field_link` expiry
  change (PR-d), and the `client_decisions.court` widening.
- **A studio with a seat but no consent record cannot be re-subscribed by a
  START** (R-AJ, by ruling). In practice a STOP writes an `opted_out` record for
  every studio holding the number, so the studios a START can answer always have
  one; the case with no record at all is a number that never received a STOP
  through this rail.
- **`project_parties.sms_consent_*` is not yet read-only.** It is a mirror by
  trigger, but the columns still carry their old grants and policies, and
  `sms-inbound` still writes them directly (deliberately: "the existing
  `project_parties` writes may remain"). Retiring those writes, and retiring the
  phone-global reduction in `sms.ts`, is the named follow-up PR-x asks for —
  after the backfill is proven on Strata.
- **No portal hook or UI.** `packages/supabase` gained only the regenerated
  `database.types.ts`; no React Query hook reads any of the new tables yet.
- **No PostHog flag** — per rulings §6 the program ships at 100% with no flag.
