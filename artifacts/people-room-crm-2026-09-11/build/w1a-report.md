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
| `supabase/migrations/00593_studio_contact_channels.sql` | New table `studio_contact_channels` · `normalize_studio_contact_channel()` trigger · four-part backfill from `studio_contacts.phone/email` and from `project_parties.phone/email` where `studio_contact_id` is set |
| `supabase/migrations/00594_studio_channel_consent.sql` | New table `studio_channel_consent` (PK `(organization_id, channel_kind, channel_value)`) · `backfill_channel_consent_from_parties()` + its one call · `mirror_channel_consent_to_parties()` trigger · RPC `record_channel_consent(...)` |

No function was redefined, so there is no lineage to graft. Every object in all
three files is new or an `ADD COLUMN IF NOT EXISTS`; `grep` for each new name
across `supabase/migrations/*.sql` returned nothing before I wrote them.

`python3 scripts/generate-legacy-grants.py` was re-run after the grants:
`supabase/seed/00-legacy-grants.sql` gained 132 lines ("baseline + 2619 replayed
statements").

### Edge functions

- `supabase/functions/_shared/sms.ts` — new `channelConsentRefuses()`, called in
  `sendPartySms()` **before** the existing gate. It reads
  `studio_channel_consent` for `(projects.studio_id, 'sms', phone)`; refuses on
  `opted_out`; and when no record exists for that studio (or no studio resolves)
  falls back to "any party row on this number is opted out → refuse". The
  existing phone-global `reduceConsent()` reduction stays underneath it,
  untouched, as the fail-closed second check (PR-x).
- `supabase/functions/sms-inbound/pipeline.ts` — `loadPhoneParties()`,
  `studiosHoldingPhone()`, `writeChannelConsent()`. STOP/UNSUBSCRIBE/… upserts
  `opted_out` for every studio holding the number; START/UNSTOP upserts
  `granted`; a `YES` that confirms a pending invite upserts `granted` **only**
  for the studios that actually hold a pending row. Each write happens before
  the existing `project_parties` write, which is kept.
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
8. **The mirror is guarded on a real status change**
   (`sms_consent_status IS DISTINCT FROM NEW.status`), so a re-record of the
   same verdict cannot re-fire the 00432 dispatch.
9. **`record_channel_consent` keeps dates it did not restate.** A later grant
   does not erase `opt_out_at`, and vice versa — the room has to be able to
   print "granted 2 May 2025, opted out 3 Dec 2025" (R-Q).
10. **The org for a project is `projects.studio_id`,** with
    `_primary_studio_for(designer_id)` as the SQL-side fallback (00317 both
    backfilled the column and trigger-maintains it). The edge function uses
    `studio_id` alone and treats NULL as "org unknown", which routes it into the
    fail-closed branch.
11. **An unparseable phone keeps its raw text** in `studio_contact_channels.value`
    (the column is NOT NULL, so it cannot take the normaliser's NULL). The
    number the studio typed is never lost; it simply gets no E.164.

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
                proname                | prosecdef |            proconfig            | proacl
---------------------------------------+-----------+---------------------------------+-----------------------------------------
 backfill_channel_consent_from_parties | t         | {search_path=public}            | postgres=X | service_role=X
 mirror_channel_consent_to_parties     | t         | {search_path=public}            | postgres=X | authenticated=X | service_role=X
 normalize_studio_contact_channel      | f         | {"search_path=public, pg_temp"} | postgres=X | authenticated=X | service_role=X
 project_party_designer                | t         | {search_path=public}            | postgres=X | authenticated=X | service_role=X
 record_channel_consent                | t         | {search_path=public}            | postgres=X | authenticated=X | service_role=X
 studio_contact_org                    | t         | {search_path=public}            | postgres=X | authenticated=X | service_role=X
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
```

### SQL test

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
NOTICE:  1. affiliations + RLS: passed
NOTICE:  2. channel normalisation: passed
NOTICE:  3. consent backfill precedence: passed
NOTICE:  4. mirror + 5. record_channel_consent: passed
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

### Deno tests

```
$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared/sms.test.ts
ok | 16 passed | 0 failed (41ms)

$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/_tests/sms-inbound.test.ts
ok | 24 passed | 0 failed (25ms)

$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_tests/ supabase/functions/_shared/
FAILED | 663 passed | 1 failed (3s)
  ./supabase/functions/_tests/stripe-rail.test.ts (uncaught error)
    error: (in promise) Error: supabaseKey is required.
```

`stripe-rail.test.ts` fails identically with my three edge-function edits
stashed — it wants env from `_tests/test.env`, which the bare `deno test`
invocation does not load. Pre-existing, unrelated.

Six new cases:
`_shared/sms.test.ts` — the studio's `opted_out` record blocks a send the party
row would allow; another studio's opt-out does **not** block the owning
studio's send (the G-3 bug, gone); with no record at all an opted-out sibling
party row still blocks.
`_tests/sms-inbound.test.ts` — STOP writes one `opted_out` record per studio
(two studios, three party rows → two records); YES grants only for the studio
that actually invited; START upserts in place and keeps the earlier `opt_out_at`
and `disclosure_version`.

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
$ git diff --stat packages/supabase/src/database.types.ts
 packages/supabase/src/database.types.ts | 424 ++++++++++++++++++++++++++++++++
 1 file changed, 424 insertions(+)
```

424 insertions, **zero deletions**. New table types `studio_channel_consent`,
`studio_contact_channels`, `studio_contact_rules`,
`studio_person_affiliations`; new function types
`backfill_channel_consent_from_parties`, `project_party_designer`,
`record_channel_consent`, `studio_contact_org`; and the fifteen new
`studio_contacts` columns. Nothing else.

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
  `service_role` without overwriting anything: since the r1 B1 fix the rows it
  folds reach the party rows through the mirror, which stands the opt-in
  dispatch down for its own write, so a re-run sends no SMS either.
- **Out of W1a scope by instruction** (named so the next wave does not assume
  they landed): `studio_compliance_documents`, `project_party_authority`,
  `project_site_access_cards`, `client_households`, `studio_contact_merges`,
  `v_access_grants`, the `people_directory` rebuild, `project_parties`' new
  columns (`stage`, `on_site_from/to`, `site_access_mode`, `contracted_through`,
  `off_job_at/reason`, `company_id`, bid fields), the `create_field_link` expiry
  change (PR-d), and the `client_decisions.court` widening.
- **`project_parties.sms_consent_*` is not yet read-only.** It is a mirror by
  trigger, but the columns still carry their old grants and policies, and
  `sms-inbound` still writes them directly (deliberately: "the existing
  `project_parties` writes may remain"). Retiring those writes, and retiring the
  phone-global reduction in `sms.ts`, is the named follow-up PR-x asks for —
  after the backfill is proven on Strata.
- **No portal hook or UI.** `packages/supabase` gained only the regenerated
  `database.types.ts`; no React Query hook reads any of the new tables yet.
- **No PostHog flag** — per rulings §6 the program ships at 100% with no flag.
