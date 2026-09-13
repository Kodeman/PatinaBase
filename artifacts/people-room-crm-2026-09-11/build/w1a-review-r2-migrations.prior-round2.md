# W1a — adversarial migration review, round 2 (independent pass)

Reviewer context: fresh, separate from the implementer. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD `4a72eb538`. Local Supabase only. No
`supabase db push`, no `supabase functions deploy`, nothing touched Strata.

> **Path note.** The brief named this file and named `w1a-fix-log-r1.md` as the
> prior fix log, but the branch has since carried r2 and r3 fix rounds
> (`9b570a36f`, `4a72eb538`) and an earlier review already occupied this path.
> That earlier file is preserved verbatim at
> `w1a-review-r2-migrations.prior.md`. Everything below was produced against the
> **post-r3 code**, which is what is on the branch.

Verdict: **NOT clean** — 1 blocking, 3 major, 20 minor.

---

## 0. What was read, and what was run

Read in full: `rulings.md` (all sections, incl. §3 R-A..R-AK and §6 program
rulings), `synthesis/direction.md` §2.2 / §3.8 / §5 / §7 / §8,
`synthesis/crm-model.md` §1 / §2 / §4 / §5, `briefing/current-state.md` §B–§E,
`build/inventory.md`, `briefing/fixture.md`, `build/w1a-report.md`,
`build/w1a-fix-log-r1.md` / `-r2.md` / `-r3.md`, and all three migrations,
both edited edge-function modules and the SQL test.

Commands run by this reviewer, in order (all output pasted in §4):

```
pnpm --dir <worktree> supabase:reset                       # clean, tail in §4.1
psql … -f supabase/tests/people/w1a_identity_channels_consent_test.sql   # 12/12
each migration replayed TWICE inside a rolled-back tx       # idempotent, §4.2
python3 scripts/generate-legacy-grants.py                   # empty diff, §4.3
SUPABASE_DB_URL=… pnpm db:generate                          # empty diff, §4.3
role-scoped RLS probes (anon / alpha member / beta member)  # §4.4
grep-winner lineage diffs for both redefined functions      # §4.5
a control-vs-subject probe of the inbound-grant path        # §4.6 → B-1
a two-session probe of record_channel_consent's gate        # §4.7 → M-1
```

`apps/designer-portal/.env.local` does not exist in this worktree (checked
before the reset), so there was no prod-pointing hazard.

---

## 1. Prior findings, re-checked

Every prior round's finding was re-verified against the current code, not
against the fix log's prose.

| Round | ID | State | Evidence |
|---|---|---|---|
| r1 | B1 — one recorded `pending` became N opt-in SMS | **fixed** | `00594:298-300` guard; SQL test block 6 + 8 pass |
| r1 | M1 — post-push backfill re-run reintroduced B1 | **fixed** | mirror created after the fold (`00594:256` then `:502`); re-run returns 0 and goes through the suppressed mirror (§4.2) |
| r1 | M2 — `channel_kind` omitted `ap_email` / `portal_311` | **fixed** | `00593:47-52`, `:86-93` |
| r1 | M3 — `company_kind` narrower than model + shipped UI | **fixed** | `00592:120-131` (13 model values + `inspector`, `other`; all 5 `COMPANY_KIND_LABELS` present) |
| r1 | M4 — channel `status` CHECK had no `bounced` | **fixed** | `00593:99-104` |
| r1 | M5 — the gate could refuse but never authorise | **fixed** | `_shared/sms.ts:349` `allow` branch; `:630`, `:636`, `:641` |
| r1 | M6 — `grantAllForPhone` defeated per-studio scoping | **fixed** | `sms-inbound/pipeline.ts:338-350` `grantPartiesForStudios` |
| r1 | M7 — rail and SQL resolved the org differently | **fixed** | `_shared/sms.ts:202-231` / `:236-266`, reused at `pipeline.ts:210` |
| r1 | P-1 — number collision / shared stack | **open, by design** | ledger carries this wave's 00592–00594 after my reset; renumber at integration stands (report §5). See m-20 |
| r2 | B-1 — a second unguarded AFTER trigger | **fixed** | `00594:369-371`; SQL test block 8 |
| r2 | B-2 — no transition guard, no evidence requirement | **fixed in the single-writer case, still bypassable under concurrency** — see **M-1** | `00594:597-627` |
| r2 | B-3 — stale `granted` overrode an opted-out row; STOP could not reach a seatless record | **fixed** | `sms.ts:348`; `pipeline.ts:242-259` `studiosHoldingRecord` |
| r2 | M-1 — mirror suppressed every evidence update | **fixed** | `00594:473-481` whole-tuple guard; SQL test block 10 |
| r2 | M-2 — the report outlived the code | **recurs** — see **m-12** | report `:40`, `:453` vs the actual numbers |
| r2 | M-3 — two writers disagreed on origin; two normalisations | **fixed** | one `normalize_channel_value` (`00593:138`) used at `00594:591`, `:744`; origin rule matches at `00594:665` / `pipeline.ts:305` |
| r3 | M3-1 (R-AG) | **fixed** | `00594:581-586`, `:657-661` |
| r3 | M3-2 (R-AH) | **fixed** | `sms.ts:885-914` |
| r3 | M3-3 (R-AI) | **fixed in one direction only** — see **M-3** | `00592:279-374` |
| r3 | M3-4 (R-AJ) | **fixed** | `pipeline.ts:518-533` |
| r3 | F3 (R-AK) | **fixed** | `sms.ts:273-292`, `:355-357` |

---

## 2. Findings

Severity: **blocking** = must not ship; **major** = must be answered before the
program's single deploy chain; **minor** = record and rule. Confidence is mine,
not the implementer's.

### B-1 (blocking, confidence HIGH — reproduced with a control)

**An inbound `YES` or `START` no longer releases a site request parked in
`awaiting_consent`. The request is stuck for ever.**

`supabase/functions/sms-inbound/pipeline.ts:528-533` (START) and `:559-564`
(YES) now call `writeChannelConsent()` **before** `grantPartiesForStudios()`.
`writeChannelConsent` upserts `studio_channel_consent`, which fires
`mirror_channel_consent_to_parties_trg`
(`supabase/migrations/00594_studio_channel_consent.sql:502-504`). The mirror
sets `patina.suppress_consent_dispatch` (`00594:450`) and flips that studio's
party rows to `granted` — so `_site_request_consent_granted_dispatch` returns at
its new first statement (`00594:369-371`) and never runs.

By the time `grantPartiesForStudios()` executes, the rows are already
`granted`: on YES it filters `.eq("sms_consent_status","pending")` and matches
nothing; on START it matches but `OLD.sms_consent_status = 'granted'`, so
00374's trigger `WHEN` clause
(`00374_field_site_request_loop.sql:3451-3454`) is false. Either way the
trigger never fires a second time.

`_site_request_consent_granted_dispatch` is the **only** path out of
`awaiting_consent`: it is the sole caller of
`site_request_dispatch_after_consent()` (`00374:3426`, and now `00594:390`),
which is what mints the `consent-granted` outbox row and stamps
`consent_status_snapshot='granted'` (`00374:1430-1455`). The lifecycle sweep
(`00374:3097`) only promotes requests that already have an outbox row. No
outbox row, no release.

Reproduced (§4.6): control = the pre-wave direct party flip → **1** outbox row,
snapshot `granted`. Subject = the shipped order (record first, then the party
write) → **0** outbox rows, snapshot still `pending`.

Why the wave's own tests miss it: the deno suites run against
`_tests/fake-supabase.ts`, which has no triggers; the SQL suite's block 8
asserts precisely that *"a mirrored `granted` fires neither of
`project_parties`' outward AFTER triggers"* — which is the bug once the mirror
is the first writer on a **real** inbound grant. The migration header reasoned
about the new studio-side path to `granted` (`00594:70-77`) and did not notice
that the inbound rail now routes through the mirror first.

Note the same root cause makes the studio-side door inert too: a
`record_channel_consent(..., 'granted')` on a number whose seat has a parked
site request will not release it either. That half is arguably new behaviour
rather than a regression (the header says sending for a record is W2's hook),
but it is the same fix.

Fix options, implementer's choice: (a) run `grantPartiesForStudios()` **before**
`writeChannelConsent()` on YES/START, so the real transition fires the trigger
and the record write only refreshes evidence under suppression; (b) narrow the
guard so only the opt-in-invite leg stands down, and let the site-request leg
fire on a mirrored flip to `granted`; (c) have the mirror itself call
`site_request_dispatch_after_consent()` for the rows it moves to `granted`.
Whichever is taken, the SQL suite needs a block that asserts an outbox row
exists after an inbound grant.

---

### M-1 (major, confidence HIGH — reproduced)

**`record_channel_consent`'s "nothing leaves `opted_out`" gate is bypassable
for the first record on a channel.**

`00594:615-620` reads the prior status with `SELECT … FOR UPDATE`. When no row
exists yet that statement locks nothing, so a concurrent writer (the inbound
STOP rail, which upserts directly as `service_role` —
`pipeline.ts:286-306`) can insert `opted_out` between the read and the
`INSERT … ON CONFLICT DO UPDATE` at `:636-666`. The upsert then takes the
`DO UPDATE` branch and writes `granted` over the refusal; only `opt_out_at`
survives, and the mirror pushes `granted` onto every seat in the studio on that
number.

Reproduced in §4.7: session A read (no row) → session B recorded the STOP →
session A's upsert committed → final state `status=granted`,
`stop_on_record=t`, `evidence='kickoff'`.

Fix: make the gate part of the write, e.g.
`… DO UPDATE SET … WHERE scc.status IS DISTINCT FROM 'opted_out'` and
`RAISE EXCEPTION 'channel_opted_out'` when `RETURNING` yields no row. The same
applies to `record_channel_reconsent`'s `no_opt_out_to_supersede` check
(`00594:749-760`), which has the mirror-image window.

---

### M-2 (major, confidence MEDIUM-HIGH)

**00593's card-phone backfill marks every person-card number as an
SMS-capable mobile, which is exactly the fact `sms_capable` exists to deny.**

`00593:254-263`:

```sql
CASE WHEN sc.entity_kind = 'person' THEN 'mobile' ELSE 'office' END,
COALESCE(sc.phone_e164, sc.phone),
sc.entity_kind = 'person',     -- sms_capable
```

`crm-model.md` §2 Reach channel: *"sms_capable | bool | yes | … an office line
must not be offered an SMS invite | CS4-7"*, and `direction.md` §5.1 carries the
same rule into the Channels section. In the fixture, F-13 Ingrid ("email only;
no cell for work" — office line), F-14 Rosa ("email + office phone"), F-17 Jim
("office dispatch by phone"), F-20 Claire ("showroom phone") and F-27 Ray
("office", never text, 311 only) all carry an office number on a **person**
card. The backfill types all five as `mobile` and marks them SMS-capable.

The column default is already `false` (`00593:58`), i.e. the safe value. The
backfill overrides it with `true` on a statement that runs **once** on Strata,
and the studio then has to correct every card by hand. The party-row leg
(`00593:274-281`) is different and defensible — those numbers really were on an
SMS rail — but the card leg has no such evidence.

Fix: leave `sms_capable` at its default for the card leg (or set it only where
a party row on the same normalised number exists), and stop asserting `mobile`
for a card whose number the studio never typed as a mobile.

---

### M-3 (major, confidence MEDIUM)

**`studio_contacts.company_id` is declared a derived pointer, but nothing
derives it from the only writer that exists today.**

00592 backfills affiliations from `company_id` (`:279-288`) and adds a trigger
that pushes the open affiliation down onto `company_id`
(`:334-366`). The COMMENT states the contract plainly: *"a direct write to this
column is overwritten by the next affiliation write"* (`:368-374`).

But the shipped hooks still write `company_id` directly —
`packages/supabase/src/hooks/use-studio-contacts.ts:202`, `:234`, named in the
report's own decision 15 — and **no trigger opens an affiliation from that
write**. So after this wave:

- a designer who sets a person's firm through the shipped UI produces a card
  with `company_id` set and **no affiliation row**, which the company card's
  crew list (R-W, which reads affiliations) cannot see; and
- the moment any affiliation is written for that person, the trigger silently
  discards the firm the designer chose.

R-AI's "one fact, one home" is bound in one direction only, and the report's
§5 "Not done" does not name the gap — so W1b has nothing telling it this is
owed.

Fix: either add the reverse binding (a `studio_contacts` trigger that opens /
closes the affiliation when `company_id` changes on a person card), or repoint
the two hook call sites in this wave, or — at minimum — record it explicitly in
the report's "Not done" as a W1b obligation with the split-brain named.

---

### Minor findings

| ID | Finding | Confidence |
|---|---|---|
| m-1 | `reach_preference` is listed for `studio_contacts` (person) in `direction.md` §7 and `crm-model.md` §2 (CS4-5), is not added, and is **not** in 00592's deliberate-omission list (`00592:20-28`, which names only `never_text` / `do_not_contact` / `do_not_contact_reason` / `route_to_person_id`) nor in the report's §5. Arguably superseded by `studio_contact_channels.preferred`, but nothing says so. | HIGH |
| m-2 | `channel_kind` omits `app`, `account`, `field_link`, `paper`, which `direction.md` §5.1 lists among the Channels-section row kinds. 00593:80-83 argues they are E9 access tiers — a sound call, but it is a direction deviation W1b's Reach component must be told about. | HIGH |
| m-3 | `status` spells `crm-model` §2's `ok` as `active` (`00593:64-65`, `:95-98`). The generated TS union now says `active`; the UI dictionary and any copy table must follow. | HIGH |
| m-4 | `crm-model` §2 Consent carries `evidence_file` (CS4-18); `studio_channel_consent` has `evidence` text only and no file column or bucket. Not recorded in the report's §5. | HIGH |
| m-5 | `studio_person_affiliations` has no guard that `person_id` is a person card and `company_id` a company card. Reproduced (§4.4): a studio member inserted an affiliation whose `person_id` is a **company** card. Only `_sync_person_company_pointer` filters `entity_kind='person'` (`00592:318`); the crew list would render a firm as crew. | HIGH |
| m-6 | `studio_contact_channels.owner_type` is not tied to `studio_contacts.entity_kind`. Reproduced (§4.4): `owner_type='company'` accepted on a person card. | HIGH |
| m-7 | `crm-model` §2 requires "one preferred channel per kind"; there is no partial unique index on `(owner_id, channel_kind) WHERE preferred`, and the backfill sets `preferred` on nothing, so no card has a preferred channel after the fold. | HIGH |
| m-8 | Every new PostgREST call in `_shared/sms.ts` and `sms-inbound/pipeline.ts` destructures `{ data }` and ignores `error`. Most branches then fail closed, but one does not: with a `granted` record, a transient failure inside `orgHasOptedOutParty()` (`sms.ts:273-292`) returns `false`, the verdict becomes `allow` (`:349`), and `studioGranted` lifts the positive gate at `:636` / `:641` even though the studio's own party row says `opted_out`. Narrow (a STOP normally writes an `opted_out` *record*, caught one line earlier), but it is a consent gate failing open on an unchecked error. | MEDIUM |
| m-9 | On the phone-only path (`resolveRecipient`, `sms.ts:390-404`) and inside `flushDeferredMessages` (`:918-933`) the legacy reduction stays **phone-global even when a project resolves a studio**, so another tenant's STOP still refuses the owning studio's send there. PR-x sanctions the fail-closed secondary check, so this is not a deviation — but R-AK's scoping is applied in `channelConsentVerdict` only, and the PR-x retirement follow-up should name these two sites. | HIGH |
| m-10 | The inbound STOP is still phone-global on party rows (`optOutAllForPhone`, `pipeline.ts:325-333`) and writes an `opted_out` **record** for every studio holding the number (`:489-497`). So 00594's header claim at `:9-11` — *"Pete Rusk's STOP on one studio's job silences him for a studio he never heard from"* — describes a bug the file does not actually stop for **new** STOPs; it fixes only the historical per-row storage. `pipeline.ts:320-324` argues the carrier-level case and is probably right on one shared 10DLC number, but the migration header and the report should say so rather than claim the cure. | HIGH |
| m-11 | `grantPartiesForStudios` writes `sms_opt_out_at: null` onto party rows (`pipeline.ts:346`) while `writeChannelConsent` deliberately keeps `opt_out_at` on the record (`pipeline.ts:290`). The cache and its source then disagree until the next consent write re-mirrors the date — a direct write to columns the same wave declares a read-only mirror (`00594:425-426`). | HIGH |
| m-12 | r2's M-2 class recurs: the report's §1 says the legacy-grants seed *"gained 156 lines ('baseline + 2623 replayed statements')"* (`w1a-report.md:40`); the branch shows **168** added lines and the regenerator prints **2625** (§4.3). §3's pasted `git diff --stat` says **461** insertions (`:453-454`) while the prose two lines later says 465 (`:457`); the real number is **465**. | HIGH |
| m-13 | `backfill_channel_consent_from_parties`' tiebreak is `COALESCE(sms_opt_out_at, sms_consented_at, sms_consent_recorded_at, updated_at) DESC` (`00594:217-218`) — `opt_out_at` is preferred even on a `granted` row, so a granted row still carrying a stale `sms_opt_out_at` can outrank a genuinely newer grant inside the same org. | MEDIUM |
| m-14 | `WHERE org IS NOT NULL` (`00594:221`) silently drops party rows whose project resolves to no studio: those numbers get no consent record at all and stay governed only by the party ledger. Not named in the report's §5. | HIGH |
| m-15 | `supabase/functions/field-daily/core.ts:155-157` and `:252-255` pre-filter recipients on `sms_consent_status = 'granted'` before calling `sendPartySms`, so the new "the studio's own record grants it" branch (r1 M5 / fixture F-11) can never reach the daily digest. Not introduced by this wave, but the wave's gate and this pre-filter now answer the same question differently. | HIGH |
| m-16 | `studio_contact_rules.set_by` is nullable with `DEFAULT auth.uid()` (`00592:397`); `crm-model` §2 marks Contact rule `set_by` and `set_at` required. A `service_role` write records no author, and the room's "Set by Priya Natarajan, 12 Oct 2026" line (direction §5.1) would render blank. | HIGH |
| m-17 | `origin_project_id` is not constrained to the recording org (`00594:125`, RPC `:647`), so a member can stamp another studio's project id. No read leak (projects RLS hides it), but R-Q's sentence would print with a blank job. | MEDIUM |
| m-18 | The mirror's UPDATE re-fires `normalize_party_phone_e164` (`00281:135-138`), which recomputes `phone_e164` from the raw `phone` on **every** update. A row whose raw `phone` no longer normalises would have its `phone_e164` nulled by a cache write, unlinking it from its own consent record. Pre-existing trigger behaviour, newly reachable from a write the studio did not make. | LOW |
| m-19 | `mirror_channel_consent_to_parties()` revokes only `PUBLIC, anon` (`00594:489`) and so keeps EXECUTE for `authenticated` on the local stack (probe §4.3). Harmless — plpgsql refuses a direct call of a trigger function — but inconsistent with `_sync_person_company_pointer`'s stricter posture (`00592:326-327`), which the report explains and this one does not. | HIGH |
| m-20 | Migration numbers 00592–00594 remain provisional and collide with another live wave's `time_entry_*` trio; `refs/heads/hour-tracking/server` also holds 00595–00597. Carried in the report's §5 and r3's "Still open"; re-confirmed here — my reset re-applied this wave's files over that ledger. Renumbering must happen at integration, against whichever tip wins. | HIGH |

---

## 3. What was checked and found correct

Stated so the next round does not re-walk it.

- **Lineage.** Both redefined functions are the grep-winner body verbatim plus
  one guard, diffed mechanically (§4.5). `fc_dispatch_optin_invite` ← `00432:27-68`;
  `_site_request_consent_granted_dispatch` ← `00374:3399-3444`. No other
  function in the wave redefines anything: `normalize_channel_value`,
  `record_channel_consent`, `record_channel_reconsent`, `studio_contact_org`,
  `project_party_designer`, `normalize_studio_contact_channel`,
  `backfill_channel_consent_from_parties`, `mirror_channel_consent_to_parties`,
  `_sync_person_company_pointer`, `sync_studio_contact_company_pointer` all
  grep to 00592–00594 only.
- **RLS.** All four new tables carry `ENABLE ROW LEVEL SECURITY` in the same
  file as their `CREATE TABLE`, with the predicates the brief names:
  `is_active_studio_member(studio_contact_org(<card>))` for the
  studio_contacts-family tables, `is_studio_comember(project_party_designer(...))`
  for the engagement leg of `studio_contact_rules`,
  `is_active_studio_member(organization_id)` for `studio_channel_consent`.
  Probed by role (§4.4): a Beta member sees 0 of Alpha's rows in all four
  tables; anon is refused at the grant layer; cross-studio and
  bogus-subject writes are all refused. Both helper predicates are NULL-safe
  (`00417:…` / `00556:…`), so an unresolvable subject fails closed.
- **Grants.** Explicit in both directions on every new object
  (`REVOKE ALL … FROM PUBLIC, anon[, authenticated]` then a named `GRANT`), and
  `supabase/seed/00-legacy-grants.sql` regenerates with an **empty diff** (§4.3).
  `studio_channel_consent` holds `SELECT` for `authenticated` and nothing else;
  a direct INSERT as `authenticated` is refused `42501` (§4.4), so
  `record_channel_consent()` really is the only portal door, by privilege.
- **SECURITY DEFINER.** Every definer in the wave pins
  `SET search_path TO 'public'`; `anon` holds EXECUTE on none of them (§4.3).
- **Idempotency.** All three files replay twice inside one transaction with no
  error — `ADD COLUMN IF NOT EXISTS`, named-constraint drop-and-re-add,
  `CREATE … IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP TRIGGER IF EXISTS` /
  `DROP POLICY IF EXISTS` throughout, and both backfills are
  `ON CONFLICT DO NOTHING` (§4.2).
- **Backfill precedence and per-org isolation.** `PARTITION BY org, phone_e164`
  with `opted_out → granted → pending → not_asked` (`00594:207-222`); the SQL
  suite's block 3 proves the older STOP beats the newer grant inside one studio
  while a second studio's `not_asked` is untouched, and that a re-run overwrites
  nothing.
- **The mirror cannot loop.** `project_parties` carries exactly four
  non-internal triggers; none writes `studio_channel_consent`. Both AFTER ones
  read the guard; the two BEFORE ones are row shaping.
  `patina.suppress_consent_dispatch` is set with `set_config(..., true)` around
  the mirror's own UPDATE only, and the inner statement's AFTER-row triggers
  fire inside that window (empirically: SQL suite blocks 6 and 8).
- **Enum / vocabulary rules.** No `ADD VALUE` anywhere; every new vocabulary is
  TEXT + a named CHECK, re-stated outside `CREATE TABLE` so a rerun can widen
  it. `company_kind` is the `crm-model` §2 list verbatim plus `inspector` /
  `other`, and is a superset of the shipped `COMPANY_KIND_LABELS`.
  `contact_kind` is untouched (PD-4).
- **Money.** No money column lands in this wave. `retainage_bps` is basis
  points, integer (`00592:106`, `:154-156`). `tax_id_last4` stores four digits,
  never the full TIN.
- **Views.** Neither `people_directory` nor `v_project_roster` is touched, and
  both still expose exactly the column lists `current-state.md` §B1 records
  (probed, §4.3) — nothing an existing reader selects has moved.
- **PR-w.** No site-access object, no `show_to_client` branch, no client-portal
  RLS leg appears anywhere in the wave (grep, §4.3). Out of scope and stayed out.
- **No prod command.** `db push`, `functions deploy`, the Strata ref and any
  `*.supabase.co` host are absent from every file in the wave (grep, §4.3).
- **Generated types** regenerate against the local DB with an **empty diff**
  (§4.3): the committed `database.types.ts` matches the schema.

---

## 4. Evidence

### 4.1 Reset

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build supabase:reset
…
Applying migration 00591_notification_log_delivery.sql...
Applying migration 00592_people_cards_affiliations_rules.sql...
Applying migration 00593_studio_contact_channels.sql...
Applying migration 00594_studio_channel_consent.sql...
Applying migration 20260910152111_create_contact_messages.sql...
Seeding data from supabase/seed/00-legacy-grants.sql...
… 29 seed files …
Restarting containers...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
```

SQL suite, immediately after:

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
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

Deno suites and type check, re-run by this reviewer:

```
$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared/sms.test.ts
ok | 26 passed | 0 failed (39ms)
$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/_tests/sms-inbound.test.ts
ok | 32 passed | 0 failed (24ms)
$ deno check --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.ts supabase/functions/sms-inbound/pipeline.ts
Check supabase/functions/_shared/sms.ts
Check supabase/functions/sms-inbound/pipeline.ts
```

### 4.2 Idempotency — each file replayed twice in a rolled-back transaction

```
=== RERUN 00592_people_cards_affiliations_rules (twice, in a rolled-back tx) ===
NOTICE:  column "site_contact_person_id" of relation "studio_contacts" already exists, skipping
NOTICE:  relation "studio_person_affiliations" already exists, skipping
NOTICE:  relation "studio_contact_rules" already exists, skipping
exit=0
=== RERUN 00593_studio_contact_channels (twice, in a rolled-back tx) ===
NOTICE:  relation "studio_contact_channels" already exists, skipping
NOTICE:  relation "idx_studio_contact_channels_owner_kind_value" already exists, skipping
exit=0
=== RERUN 00594_studio_channel_consent (twice, in a rolled-back tx) ===
NOTICE:  relation "studio_channel_consent" already exists, skipping
 backfill_channel_consent_from_parties
---------------------------------------
                                     0
 backfill_channel_consent_from_parties
---------------------------------------
                                     0
exit=0
```

### 4.3 Grants, types, views, scans

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2625 replayed statements
$ git diff --stat -- supabase/seed/00-legacy-grants.sql
(empty)

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate
$ git diff --stat -- packages/supabase/src/database.types.ts
(empty)

$ git diff --numstat 700261663..HEAD -- supabase/seed/00-legacy-grants.sql
168     0
$ git diff --numstat 700261663..HEAD -- packages/supabase/src/database.types.ts
465     0
```

```
        relname            | rls | force | policies
---------------------------+-----+-------+----------
 studio_channel_consent    | t   | f     |        1
 studio_contact_channels   | t   | f     |        4
 studio_contact_rules      | t   | f     |        4
 studio_person_affiliations| t   | f     |        4

        table_name         |    grantee    |                  privs
---------------------------+---------------+------------------------------------------
 studio_channel_consent    | authenticated | SELECT
 studio_channel_consent    | service_role  | DELETE,INSERT,…,UPDATE
 studio_contact_channels   | authenticated | DELETE,INSERT,SELECT,UPDATE
 studio_contact_rules      | authenticated | DELETE,INSERT,SELECT,UPDATE
 studio_person_affiliations| authenticated | DELETE,INSERT,SELECT,UPDATE
(no anon row on any of the four)

                proname                 | prosecdef |            proconfig            | anon_x | auth_x
----------------------------------------+-----------+---------------------------------+--------+--------
 _site_request_consent_granted_dispatch | t         | {search_path=public}            | f      | f
 _sync_person_company_pointer           | t         | {search_path=public}            | f      | f
 backfill_channel_consent_from_parties  | t         | {search_path=public}            | f      | f
 fc_dispatch_optin_invite               | t         | {search_path=public}            | f      | t
 mirror_channel_consent_to_parties      | t         | {search_path=public}            | f      | t
 normalize_channel_value                | f         | {search_path=public}            | f      | t
 normalize_studio_contact_channel       | f         | {"search_path=public, pg_temp"} | f      | t
 project_party_designer                 | t         | {search_path=public}            | f      | t
 record_channel_consent                 | t         | {search_path=public}            | f      | t
 record_channel_reconsent               | t         | {search_path=public}            | f      | t
 studio_contact_org                     | t         | {search_path=public}            | f      | t
 sync_studio_contact_company_pointer    | t         | {search_path=public}            | f      | f
```

```
$ psql … -Atc "select string_agg(column_name,',' order by ordinal_position)
               from information_schema.columns
               where table_schema='public' and table_name='people_directory';"
person_id,role,display_name,email,phone,profile_id,project_id,designer_id,status_raw,last_touch_at,meta,scope

$ psql … (same, v_project_roster)
roster_id,source,project_id,kind,display_name,company_name,email,phone,trade,job_title,staff_role,
studio_contact_id,profile_id,show_to_client,has_active_field_link,sms_consent_status,updated_at

$ grep -rn "db push\|functions deploy\|bkvcixdmuyejfzcijpdg\|supabase\.co\|Strata" \
    supabase/migrations/0059{2,3,4}*.sql supabase/tests/people/*.sql \
    supabase/functions/_shared/sms.ts supabase/functions/sms-inbound/pipeline.ts
(none)

$ grep -rn "site_access\|show_to_client\|client_portal" supabase/migrations/0059{2,3,4}*.sql
(no hits — only the REVOKE … anon lines match 'anon')
```

### 4.4 Role-scoped RLS probes

Fixture: studios Alpha and Beta, one owner each, an Alpha person card, an Alpha
company card, a Beta person card, plus one row in each of the four new tables
under Alpha.

```
=== ANON ===
ERROR:  permission denied for table studio_contact_channels

=== BETA MEMBER ===                      === ALPHA MEMBER ===
      o       | count                          o       | count
--------------+-------                   --------------+-------
 channels     |     0                     channels     |     1
 affiliations |     0                     affiliations |     1
 rules        |     0                     rules        |     1
 consent      |     0                     consent      |     1

--- ALPHA member, direct write to consent ---
ERROR:  permission denied for table studio_channel_consent

--- normalisation on the way in ---
 channel_kind |    value
--------------+--------------
 mobile       | +16125550142      ← typed as "(612) 555-0142"

--- the affiliation trigger set the derived pointer ---
 company_id
--------------------------------------
 c0000000-0000-4000-8000-00000000000b
```

Adversarial writes as the Alpha member:

```
--- affiliation with person_id pointing at a COMPANY card ---
INSERT 0 1          ← accepted (m-5)
--- channel with owner_type=company on a PERSON card ---
INSERT 0 1          ← accepted (m-6)
--- rule with subject_type=person, subject_id a random uuid ---
ERROR:  new row violates row-level security policy for table "studio_contact_rules"
--- rule for a BETA card ---
ERROR:  new row violates row-level security policy for table "studio_contact_rules"
--- cross-studio affiliation ---
ERROR:  new row violates row-level security policy for table "studio_person_affiliations"
--- channel on a BETA card ---
ERROR:  new row violates row-level security policy for table "studio_contact_channels"
```

### 4.5 Grep-winner lineage, diffed

```
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*fc_dispatch_optin_invite" supabase/migrations/*.sql | sort | tail -3
supabase/migrations/00284_field_dispatch_wiring.sql
supabase/migrations/00432_twilio_activation_hardening.sql     ← winner
supabase/migrations/00594_studio_channel_consent.sql

$ diff -u <(sed -n '27,68p' …/00432_twilio_activation_hardening.sql) \
          <(sed -n '289,336p' …/00594_studio_channel_consent.sql)
@@ -5,6 +5,12 @@
 BEGIN
+  -- 00594: the mirror is maintaining the cached copy …
+  IF COALESCE(current_setting('patina.suppress_consent_dispatch', true), '') = '1' THEN
+    RETURN NEW;
+  END IF;
+
   IF NEW.sms_consent_status <> 'pending' OR NEW.phone_e164 IS NULL THEN
```

```
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*_site_request_consent_granted_dispatch" …/*.sql | sort | tail -3
supabase/migrations/00374_field_site_request_loop.sql         ← winner
supabase/migrations/00594_studio_channel_consent.sql

$ diff -u <(sed -n '3399,3444p' …/00374_field_site_request_loop.sql) \
          <(sed -n '356,408p' …/00594_studio_channel_consent.sql)
@@ -8,6 +8,13 @@
 BEGIN
+  -- 00594: the mirror is maintaining the cached copy …
+  IF COALESCE(current_setting('patina.suppress_consent_dispatch', true), '') = '1' THEN
+    RETURN NEW;
+  END IF;
+
   IF NEW.sms_consent_status <> 'granted'
```

Both are the winner body verbatim, delta = one guard as the first statement.
Nothing else in either body moved.

### 4.6 B-1 — control vs subject

One studio, one project, two subs each with a site request parked in
`awaiting_consent`.

```
-- CONTROL: the pre-wave behaviour — a direct party-row flip to granted
UPDATE public.project_parties SET sms_consent_status='granted' WHERE id=<c1>;

--- CONTROL (direct party flip): outbox + events ---
 outbox_rows | snapshot
-------------+----------
           1 | granted

-- SUBJECT: the shipped order — writeChannelConsent() first, then the party write
INSERT INTO public.studio_channel_consent (…) VALUES (<org>,'sms','+16125550192','granted',…)
  ON CONFLICT (…) DO UPDATE SET status=EXCLUDED.status;

--- after the mirror: party status ---      --- after the mirror: site_request status ---
 sms_consent_status                               status
--------------------                        ------------------
 granted                                     awaiting_consent

UPDATE public.project_parties SET sms_consent_status='granted', …
 WHERE id=<c2> AND sms_consent_status='pending';
UPDATE 0

--- SUBJECT (mirror first, then party write): outbox + events ---
 outbox_rows | snapshot
-------------+----------
           0 | pending
```

### 4.7 M-1 — the transition gate under concurrency

Session A models `record_channel_consent`'s body (`SELECT … FOR UPDATE`, then
the upsert) with a pause in between; session B records the STOP in the gap.

```
[A]  status
[A] --------
[A] (0 rows)          ← FOR UPDATE locks nothing: the row does not exist yet
[A]  pg_sleep
[B] STOP recorded     ← service_role inserts opted_out
[A] (upsert commits)

== final state ==
 status  | stop_on_record | source  | evidence
---------+----------------+---------+----------
 granted | t              | written | kickoff
```

---

## 5. What this review did NOT cover

- The `w1a-review-r2-tests.md` / `-r3-tests.md` lane (test-quality review) —
  a separate brief.
- Portal hooks and UI: none exist yet in this wave.
- Strata: nothing was applied, probed or read there.
- `sms-dispatch/index.ts`'s 11 pre-existing type errors and
  `stripe-rail.test.ts`'s env-dependent failure — both reproduce on HEAD with
  the wave stashed, per the report, and were not re-verified here.
