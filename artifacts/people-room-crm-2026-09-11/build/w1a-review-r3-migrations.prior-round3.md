# W1a — adversarial migration review, round 3 (independent pass over HEAD `77fac9f90`)

Reviewer context: fresh, separate from the implementer and from every prior
reviewer. Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, HEAD `77fac9f90`
(`fix(people): W1a r2-review round 4 — B-1, M-1, M-2, M-3 (+F-3 answered)`).

Local Supabase only. No `supabase db push`, no `supabase functions deploy`, no
Strata contact, no `.env.local` repoint. `apps/designer-portal/.env.local` does
not exist in this worktree — checked before the first reset:

```
$ ls -la .../apps/designer-portal/.env.local
"…/apps/designer-portal/.env.local": No such file or directory (os error 2)
$ ls .../apps/*/.env.local
(eval):1: no matches found: …/apps/*/.env.local
```

> **Path note.** The brief named this file. A round-3 review already occupied
> this path (written against HEAD `9b570a36f`, the review that produced the
> `M3-1..M3-4` fixes). It is preserved verbatim at
> `w1a-review-r3-migrations.prior.md`, following the existing
> `w1a-review-r2-migrations.prior.md` convention. Everything below is a fresh
> pass over the **post-round-4** code, which is what is on the branch.

**Verdict: NOT clean — 0 blocking, 3 major, 24 minor.** (Counting the seven new `n-*` and the seventeen still-open `m-*`; r2 m-5 is upgraded to M-2, and r2 m-12 & m-20 are folded into M-3.)

---

## 0. What was read, and what was run

Read in full: `rulings.md` (all five sections plus §6 program rulings),
`synthesis/direction.md` §2.2 / §3.8 / §5 / §7 / §8, `synthesis/crm-model.md`
§1 / §2 / §4 / §5, `briefing/current-state.md` §B–§E, `build/inventory.md`,
`briefing/fixture.md`, `build/w1a-report.md`, `build/w1a-fix-log-r2.md`
(including its "Round 4" section) and `-r3.md`, and all three migrations
(`00592`, `00593`, `00594`) plus `supabase/tests/people/w1a_identity_channels_consent_test.sql`,
`supabase/functions/_shared/sms.ts`, `supabase/functions/sms-inbound/pipeline.ts`,
and the cited bodies of `00212`, `00281`, `00284`, `00374`, `00417`, `00432`,
`00584`.

Run by this reviewer, all against `postgresql://postgres:postgres@127.0.0.1:54322/postgres`:

### Reset (full replay + seeds)

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build supabase:reset
…
Applying migration 00591_notification_log_delivery.sql...
Applying migration 00592_people_cards_affiliations_rules.sql...
Applying migration 00593_studio_contact_channels.sql...
Applying migration 00594_studio_channel_consent.sql...
Applying migration 20260910152111_create_contact_messages.sql...
Seeding data from supabase/seed/00-legacy-grants.sql...
… 28 more seed files …
Restarting containers...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
```

The stack this wave owns is `supabase_db_supabase` on `54322` (kong `54321`);
the hour-tracking wave is on its own `supabase_db_patina-hours` at `54422`
(kong `54421`). F-3's contamination is not reproducible from here.

### SQL suite

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
NOTICE:  13. an inbound grant releases its parked site requests (B-1): passed
NOTICE:  14. the opted_out gate is part of the write (M-1): passed
NOTICE:  15. the card backfill does not invent SMS capability (M-2): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
```

### Deno

```
$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    --node-modules-dir=auto supabase/functions/_shared/sms.test.ts \
    supabase/functions/_tests/sms-inbound.test.ts
ok | 58 passed | 0 failed (89ms)

$ deno check --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.ts supabase/functions/sms-inbound/pipeline.ts
Check supabase/functions/_shared/sms.ts
Check supabase/functions/sms-inbound/pipeline.ts
```

### Idempotency — each migration replayed TWICE in one rolled-back transaction

```
$ for f in 00592… 00593… 00594…; do
    { echo BEGIN;; cat $f; cat $f; echo ROLLBACK;; } | psql -v ON_ERROR_STOP=1
  done
=== 00592 … === (only "already exists, skipping" NOTICEs)
=== 00593 … === (only "already exists, skipping" NOTICEs)
=== 00594 … === (only "already exists, skipping" NOTICEs)
```

No ERROR on any of the six replays. The `DROP CONSTRAINT IF EXISTS` /
`ADD CONSTRAINT` idiom for `studio_contacts_company_kind_check`,
`studio_contact_channels_channel_kind_check` and `…_status_check` really does
make the vocabularies re-widenable, which `CREATE TABLE IF NOT EXISTS` alone
would not.

### Seed regeneration and generated types — both re-run, both no-ops

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2626 replayed statements
$ git -C … diff --stat supabase/seed/00-legacy-grants.sql
(empty)
$ git -C … diff --numstat 1970075c2~1 HEAD -- supabase/seed/00-legacy-grants.sql
174     0

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir … db:generate
$ git -C … diff --stat packages/supabase/src/database.types.ts
(empty)
$ git -C … diff --numstat 1970075c2~1 HEAD -- packages/supabase/src/database.types.ts
465     0
```

465 insertions, **zero deletions**: four new table types, six new function
types, and the fifteen new `studio_contacts` columns. Nothing surprising, and
nothing removed — no existing reader loses a column.

---

## 1. Prior findings, re-checked

Round 4's five (from `w1a-fix-log-r2.md` §"Round 4"):

| ID | Verdict | Evidence |
|---|---|---|
| **B-1** inbound YES/START no longer released a parked site request | **FIXED** | `pipeline.ts:546` (`grantPartiesForStudios`) precedes `:547` (`writeChannelConsent`) on START; `:578` precedes `:579` on YES. The ordering constraint is now in the `grantPartiesForStudios` doc comment (`pipeline.ts:339-350`), so a later edit has to read it. Suite block 13 passes on my own reset. |
| **M-1** the `opted_out` gate was bypassable for the first record | **FIXED** as stated | The gate is inside the write in both doors: `00594:670-671` (`ON CONFLICT … DO UPDATE … WHERE scc.status IS DISTINCT FROM 'opted_out' OR EXCLUDED.status = 'opted_out'`, then `IF NOT FOUND` at `:674`) and `00594:783` (`AND scc.status = 'opted_out'`, `IF NOT FOUND` at `:786`). No `SELECT … FOR UPDATE` remains. Suite block 14 passes. **But see M-1 below: the gate is defeated by composing the two doors.** |
| **M-2** the card backfill invented SMS capability | **FIXED** | `00593:276-296`: `sms_capable` now comes from the `ev.texted` LATERAL (`:286-294`), which requires a folded `project_parties` row on the same normalised number; the unevidenced rows carry the `line type unconfirmed` label (`:282-284`). Suite block 15 passes, including its global sweep. |
| **M-3** `company_id` was a derived pointer nothing derived | **FIXED** | `sync_person_affiliation_from_pointer()` + its trigger exist (`00592:410-488`); `sync_studio_contact_company_pointer()` carries the `patina.suppress_affiliation_sync` guard (`00592:354-356`). Probed live: `select tgname … where tgrelid='public.studio_contacts'::regclass` returns `sync_person_affiliation_from_pointer_trg`. Suite block 12 passes. **New side effect — see M-2 below.** |
| **F-3** shared-stack contamination | **CLEAN** | Two independent Supabase projects in `docker ps`; this wave owns `54322`. My reset is a clean replay; nothing of another wave's is in the ledger (`00592/00593/00594` are this wave's files, `20260910152111` above them). |

Older rounds, spot-re-checked and still holding: the mirror suppresses **both**
outward AFTER triggers (probe below); `record_channel_consent` refuses
`not_asked` (`consent_not_recordable`, `00594:585-590`); the inbound START is
scoped to `opted_out`/`pending` records (`pipeline.ts:531-540`);
`channelConsentVerdict`'s no-record fallback is studio-scoped
(`sms.ts:348`, `:357`) with the one phone-global read only when no studio
resolves (`sms.ts:362-372`); `flushDeferredMessages` runs the same two gates in
the same order (`sms.ts:899-952`).

**Open minors carried from `w1a-review-r2-migrations.md`** (that review's m-1 …
m-20). Re-checked here: **m-1, m-2, m-3, m-4, m-5, m-6, m-7, m-8, m-9, m-10,
m-12, m-13, m-14, m-15, m-16, m-17, m-18, m-19 are still open.** **m-11 is
narrowed to near-nothing** and **m-20 is resolved on the collision half but
stale in the report** — both explained in §3.

---

## 2. Findings

### M-1 (major, confidence HIGH — reproduced) — the "nothing leaves `opted_out`" gate is defeated by composing the two doors

`00594:531-535` and the `record_channel_reconsent` header at `00594:717-721`
state the invariant twice and in the strongest terms:

> Nothing leaves `opted_out` through this door. Not to granted (that is the
> recipient's to give), not to pending, and not to not_asked …
> It lands on `pending`, never `granted`. … `granted` stays the recipient's to
> give, by replying YES or START.

Both statements are true of each door taken alone. Taken together they are not.
`record_channel_reconsent` moves the row `opted_out → pending` (`00594:771`),
and `record_channel_consent`'s gate only refuses when `scc.status` **is**
`'opted_out'` at write time (`00594:670`). One call later the row is `granted`.
Both doors are granted to `authenticated` (`00594:687-688`, `:798-799`), so any
active studio member holds both.

Reproduced end-to-end as an authenticated studio member, RLS on, in one
rolled-back transaction (`/tmp/claude/rev_bypass.sql`):

```
NOTICE:  STEP1 direct grant: refused -> channel_opted_out
NOTICE:  STEP2a reconsent -> status=pending
NOTICE:  STEP2b grant-after-reconsent -> status=granted consented_at_set=t opt_out_at_kept=t

 status  | source  |   evidence
---------+---------+--------------
 granted | written | Kickoff form
```

The consequence is not confined to the record. The mirror
(`00594:457-486`) pushes each of those two writes onto every party row in the
studio on that number, so the party-row backstop `sendPartySms` relies on
(`sms.ts:636`, and `channelConsentVerdict`'s `orgHasOptedOutParty` at
`sms.ts:348`) is cleared by the same two calls. A number that replied STOP is
then sendable, with `opt_out_at` the only surviving trace — the exact shape
round 4's own M-1 control called out as the bug.

Note what this is and is not. PR-m says only "the way back is always a fresh
recorded consent or an inbound START"; it does not say the fresh consent must
land on `pending`. So this is not a ruling violation — it is the file's own
stated invariant, and the report's decision 12, being unenforceable. The fix is
a ruling, not obviously a code change: either tighten (make
`record_channel_consent` refuse `granted` whenever `opt_out_at IS NOT NULL` and
no inbound START has since been recorded) or soften both comment blocks and
decision 12 to say what the code actually guarantees. Leaving the code claiming
a guarantee it does not make is the part that is wrong, because W2's hook and
the portal copy will be written against the claim.

`00594:531-535`, `00594:670-671`, `00594:717-721`, `00594:771`.

---

### M-2 (major, confidence HIGH — reproduced) — no entity-kind guard on affiliations, and the round-4 reverse binding now writes the malformation into `studio_contacts.company_id`

`studio_person_affiliations.person_id` and `.company_id` both point at
`studio_contacts(id)` with no constraint that the first is a person card and
the second a company card (`00592:185-186`). The r2 review raised this as m-5
(minor, "the crew list would render a firm as crew"). Round 4's reverse binding
raises the stakes: `sync_studio_contact_company_pointer()` →
`_sync_person_company_pointer()` now copies the affiliation's `company_id`
straight into `studio_contacts.company_id` (`00592:317-328`), the column
00592's own COMMENT declares the legacy pointer every pre-affiliation reader
follows (`00592:490-500`).

Reproduced as an authenticated studio member, RLS on:

```
INSERT INTO studio_person_affiliations (person_id, company_id)
VALUES ('…101','…101');          -- the SAME person card on both sides

                  id                  |              company_id              | self_pointer
--------------------------------------+--------------------------------------+--------------
 f0000000-0000-4000-8000-000000000101 | f0000000-0000-4000-8000-000000000101 | t
```

`studio_contacts_company_link_check` (`CHECK (entity_kind = 'person' OR
company_id IS NULL)`) does not catch it, and nothing else does. The person card
now names itself as its firm; the company card's crew list (R-W), the person
card's firm line (direction §2.2 E2) and every legacy reader of `company_id`
read a card that is its own employer. The same insert with a *company* card as
`person_id` is accepted too (probe below), which is m-5's original shape.

Two cheap guards close both: a CHECK/trigger asserting
`studio_contacts(person_id).entity_kind = 'person'` and
`studio_contacts(company_id).entity_kind = 'company'` (a trigger, since a CHECK
cannot subquery), plus `CHECK (person_id <> company_id)`. The same class of
guard is owed on `studio_contact_channels.owner_type` (r2 m-6, still open).

`00592:185-186`, `00592:317-328`, `00592:490-500`.

---

### M-3 (major, confidence HIGH) — the report restates the pre-fix ordering that round 4's blocking finding was about, and its transcripts predate the round

Round 2's own M-2 finding was "the report denied the lineage rule applied, and
carried the pre-fix transcripts", and it was fixed. It has recurred, on a
sharper line.

**(a) The load-bearing sentence is now wrong.** `w1a-report.md:87` still reads:

> Each write happens before the existing `project_parties` write, which is kept.

Round 4's blocking B-1 reversed exactly that on two of the three keyword
branches: `grantPartiesForStudios()` now runs **before** `writeChannelConsent()`
on START (`pipeline.ts:546-551`) and on YES (`pipeline.ts:578-583`), because the
record write consumed the `pending → granted` transition that 00374's trigger
needs. The code comment at `pipeline.ts:339-350` says the order is load-bearing
and must not be swapped back; the report, three files away, tells the next
reader the opposite. That is the failure mode the comment exists to prevent.

**(b) The 00593 `sms_capable` rule is absent from the report entirely.**
`grep -n sms_capable w1a-report.md` → no match. §1's 00593 row still describes
only "a four-part backfill", and §2's decision list has no entry for the
evidence rule round 4's M-2 introduced (`00593:260-275`). A later wave reading
§5 will not know that unevidenced card numbers carry
`sms_capable = false` and a `line type unconfirmed` label.

**(c) Stale transcripts and counts.**

| Report | Says | Actually (re-run by me) |
|---|---|---|
| `:40` | legacy-grants "gained 156 lines … baseline + **2623** replayed statements" | **174** lines; regenerator prints **2626** |
| `:336-352` | SQL suite transcript ends at block 12 | blocks **13, 14, 15** exist and pass |
| `:461` vs `:465` | diffstat pastes **461** insertions, prose says 465 | **465** |
| `:273-291` | function/search_path probe table lists 12 functions; the parenthetical says "the two pointer functions added by R-AI" | there are **three** — `sync_person_affiliation_from_pointer` is missing from the table |
| `:504-513` | "there is a live collision … another wave's branch has already minted 00592–00594" | **no longer true**: `hour-tracking/server` and `hour-tracking/integration` both hold `00595/00596/00597_time_entry_*`; nothing else on any branch holds 00592–00594 |

None of (c) changes behaviour, but the report is the artifact the orchestrator
and W1b read instead of the diff, and (a) actively contradicts a blocking fix.

`w1a-report.md:40`, `:87`, `:273-291`, `:336-352`, `:461`, `:504-513`.

---

### Minor findings

New in this round (n-*), then the r2 minors re-checked (m-*).

| ID | Finding | Confidence |
|---|---|---|
| n-1 | A whitespace-only channel value is accepted and stored as `''`. The trigger `COALESCE(normalize_channel_value(...), '')`s because the column is NOT NULL (`00593:184-187`), and there is no `CHECK (btrim(value) <> '')`. Reproduced: `blank-value channel: ACCEPTED, stored value=''`. Worse, it is the one case the "one rule, both callers" argument (`00593:28-32`) does not actually cover: `record_channel_consent` raises `invalid_channel_value` on the same input (`00594:596-598`), so a blank channel row is precisely a channel row no consent record can ever be written for — the drift 00593's header says the shared function prevents. | HIGH |
| n-2 | `tax_id_last4` is `char(4)` (`00592:109`), which blank-pads: `'12'` round-trips as `'12  '`. `crm-model` §2 types it `text`, and the dedupe use (CS6-11, "duplicate vendor rows split the 1099 total") is an equality compare. `varchar(4)`/`text` + a CHECK would behave. | HIGH |
| n-3 | Both halves of the R-AI binding pick "the" open affiliation with `ORDER BY from_date DESC NULLS LAST, created_at DESC LIMIT 1` and no id tiebreak (`00592:321`, `:429`). Two affiliations opened in one statement share `created_at` and (via the reverse trigger) `from_date = CURRENT_DATE`, so the two functions can disagree about which one wins. Terminates either way (the suppression flag and the `IS DISTINCT FROM` guard see to that), but the pointer becomes non-deterministic. Add `, id DESC`. | MEDIUM |
| n-4 | Both suppression flags are cleared to `''` rather than restored to their prior value: `mirror_channel_consent_to_parties` (`00594:455` / `:488`) and `sync_person_affiliation_from_pointer` (`00592:436` / `:464`). Harmless today — neither nests — but `00594:432-438`'s COMMENT on `project_parties` invites future AFTER triggers to rely on `patina.suppress_consent_dispatch`, and a nested mirror write would then clear a parent's flag mid-flight. `current_setting` into a local, `set_config` back at the end. | MEDIUM |
| n-5 | `_sync_person_company_pointer(uuid)` appears in the generated `Database["public"]["Functions"]` union (confirmed in the 465-line diff) even though it is revoked from `PUBLIC, anon, authenticated` (`00592:335-336`). Cosmetic, but it puts a definer-only helper's name and signature in the client type surface where a hook author will find it. | HIGH |
| n-6 | The mirror's UPDATE fires `set_updated_at_project_parties`, so one consent write re-dates `project_parties.updated_at` on every seat in the studio on that number. Anything ordering or diffing on `updated_at` (the Desk, "last touched") now moves for a cache write the studio did not make. | MEDIUM |
| n-7 | `mirror_channel_consent_to_parties_trg` is `AFTER INSERT OR UPDATE` only (`00594:507-509`). A `service_role` DELETE of a consent record leaves every mirrored party row frozen at the deleted verdict, with nothing left to correct it. No caller deletes today; the asymmetry is undocumented. | HIGH |
| m-5 / m-6 | Still open, both reproduced this round: an affiliation whose `company_id` is a **person** card is accepted, and `owner_type='company'` on a **person** card is accepted. m-5 is upgraded to **M-2** above on the strength of the new pointer consequence; m-6 is unchanged. | HIGH |
| m-7 | Still open, reproduced: two `preferred = true` channels on one `(owner_id, 'mobile')` are accepted. `crm-model` §2 requires "one preferred channel per kind"; there is no partial unique index, and the backfill sets `preferred` on nothing, so after the fold no card has a preferred channel at all. | HIGH |
| m-1 | Still open: `reach_preference` (direction §7, `crm-model` §2 CS4-5) is neither added nor named in 00592's deliberate-omission list (`00592:25-33`) nor in the report's §5. | HIGH |
| m-2 | Still open, and deliberate: `channel_kind` omits `app` / `account` / `field_link` / `paper`, argued at `00593:84-87` as E9 access tiers. A sound call that W1b's Reach component must be told about, since direction §5.1 lists them as Channels rows. | HIGH |
| m-3 | Still open: `status` spells `crm-model` §2's `ok` as `active` (`00593:68-69`, `:99-108`). The generated TS union now says `active`; the copy dictionary must follow. | HIGH |
| m-4 | Still open: `crm-model` §2 Consent carries `evidence_file` (CS4-18); `studio_channel_consent` has `evidence text` only, no file column and no bucket. Not in the report's §5. | HIGH |
| m-8 | Still open: every new PostgREST call in `sms.ts` / `pipeline.ts` destructures `{ data }` and drops `error`. One branch fails open — a transient failure inside `orgHasOptedOutParty` (`sms.ts:273-292`) returns `false`, so with a stale `granted` record the verdict is `allow` (`sms.ts:349`) and `studioGranted` lifts the positive gates at `sms.ts:636`/`:641`. Narrow (the target row's own `opted_out` still refuses at `:634`), but it is a consent gate failing open on an unchecked error. | MEDIUM |
| m-9 | Still open: the legacy reduction stays phone-global on `resolveRecipient`'s phone-only path (`sms.ts:390-404`) and inside `flushDeferredMessages` (`sms.ts:917-924`) even when a project resolves a studio. PR-x sanctions the fail-closed secondary check, so not a deviation — but R-AK's scoping landed in `channelConsentVerdict` only, and the PR-x retirement follow-up should name these two sites. | HIGH |
| m-10 | Still open: the inbound STOP is still phone-global on party rows (`pipeline.ts:325-333`) and writes an `opted_out` **record** for every studio holding the number (`pipeline.ts:502-510`). 00594's header at `:9-11` claims the cure for "Pete Rusk's STOP silences him for a studio he never heard from"; the file fixes the historical per-row storage, not new STOPs. `pipeline.ts:321-324` argues the carrier-level case and is probably right on one shared 10DLC number — the header and report should say so rather than claim the cure. | HIGH |
| m-11 | **Narrowed to near-nothing.** `grantPartiesForStudios` still writes `sms_opt_out_at: null` onto party rows (`pipeline.ts:346`) while `writeChannelConsent` keeps `opt_out_at` on the record (`pipeline.ts:300`), but the mirror's guard is now the *whole* cached tuple (`00594:478-486`), so the record write that immediately follows restores the date on the same rows. Reasoned from the code, not re-reproduced. Residual: the divergence survives if the record write fails (see m-8's error-dropping). | MEDIUM |
| m-12 | **Recurs** — folded into **M-3** above. | HIGH |
| m-13 | Still open: the fold's tiebreak is `COALESCE(sms_opt_out_at, sms_consented_at, sms_consent_recorded_at, updated_at) DESC` (`00594:222-223`), so within the `granted` bucket a row carrying a stale-but-newer `sms_opt_out_at` outranks a genuinely newer grant. | MEDIUM |
| m-14 | Still open: `WHERE org IS NOT NULL` (`00594:226`) silently drops party rows whose project resolves to no studio — those numbers get no consent record and stay governed only by the party ledger. Not in the report's §5. | HIGH |
| m-15 | Still open: `supabase/functions/field-daily/core.ts` pre-filters recipients on `sms_consent_status = 'granted'` before calling `sendPartySms`, so the new "the studio's own record grants it" branch (F-11) can never reach the daily digest. Not introduced by this wave; the two now answer the same question differently. | HIGH |
| m-16 | Still open: `studio_contact_rules.set_by` is nullable with `DEFAULT auth.uid()` (`00592:523`); `crm-model` §2 marks it required. A `service_role` write records no author and direction §5.1's "Set by Priya Natarajan, 12 Oct 2026" renders blank. | HIGH |
| m-17 | Still open: `origin_project_id` is not constrained to the recording org (`00594:130`, RPC `:651`), so a member can stamp another studio's project id. No read leak (projects RLS hides it), but R-Q's sentence prints with a blank job. | MEDIUM |
| m-18 | Still open: the mirror's UPDATE re-fires `normalize_party_phone_e164`, which recomputes `phone_e164 := normalize_phone_e164(COALESCE(phone, phone_e164))` on every update (probed body). A row whose raw `phone` no longer normalises has its `phone_e164` nulled by a cache write, unlinking it from its own consent record. Fails closed (`sendPartySms` then returns `no_phone_number`), and the pre-00281 shape needed to reach it is unlikely. | LOW |
| m-19 | Still open: `mirror_channel_consent_to_parties()` revokes only `PUBLIC, anon` (`00594:494`), so `authenticated` keeps EXECUTE on the local stack (probe §3). Harmless — plpgsql refuses a direct call of a trigger function — but inconsistent with `_sync_person_company_pointer`'s stricter posture, which the report explains and this one does not. | HIGH |
| m-20 | **Collision half resolved, report half stale** — folded into **M-3(c)**. `refs/heads/hour-tracking/{server,integration}` now hold `00595–00597`; this wave's `00592–00594` no longer collide with anything on any branch. The numbers are still provisional until the integration tip is re-checked at merge (patina-parallel-work). | HIGH |

---

## 3. What was checked and found correct

**Grafted bodies — both verbatim, diffed mechanically.** The grep-winners,
found by running the rule myself:

```
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*fc_dispatch_optin_invite" supabase/migrations/*.sql | sort | tail -1
  → 00594 (this wave); the prior winner is 00432_twilio_activation_hardening.sql
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*_site_request_consent_granted_dispatch" … | sort | tail -1
  → 00594 (this wave); the prior winner is 00374_field_site_request_loop.sql
```

```
=== fc_dispatch_optin_invite: 00432:27-68 vs 00594:294-341 minus the guard ===
7a8
> (one blank line, an artifact of my extraction)
=== _site_request_consent_granted_dispatch: 00374:3399-3443 vs 00594:361-413 minus the guard ===
10a11
> (blank line)
45a47
> $$;
```

No semantic difference. The delta really is one guard as the first statement in
each, and 00374's own trigger definition (`00374:3446-3455`) is untouched.
Every other function name in the three files is new — `grep` over
`supabase/migrations/*.sql` excluding 00592–00594 returns zero prior files for
all eleven (`normalize_channel_value`, `record_channel_consent`,
`record_channel_reconsent`, `studio_contact_org`, `project_party_designer`,
`normalize_studio_contact_channel`, `backfill_channel_consent_from_parties`,
`mirror_channel_consent_to_parties`, `sync_studio_contact_company_pointer`,
`_sync_person_company_pointer`, `sync_person_affiliation_from_pointer`).

**RLS is on, with the right predicate per table, and the grants are explicit
both directions.**

```
          relname           | rls | policies
----------------------------+-----+----------
 studio_channel_consent     | t   |        1
 studio_contact_channels    | t   |        4
 studio_contact_rules       | t   |        4
 studio_person_affiliations | t   |        4

         table_name         |    grantee    | privileges
----------------------------+---------------+------------------------------
 studio_channel_consent     | authenticated | SELECT
 studio_channel_consent     | service_role  | ALL
 studio_contact_channels    | authenticated | DELETE,INSERT,SELECT,UPDATE
 studio_contact_rules       | authenticated | DELETE,INSERT,SELECT,UPDATE
 studio_person_affiliations | authenticated | DELETE,INSERT,SELECT,UPDATE
 (anon: nothing on all four; has_table_privilege('anon', …) = f for SELECT and INSERT)
```

The predicates match the brief: `is_active_studio_member(studio_contact_org(…))`
for the three card-owned tables and for `studio_contact_rules`' person/company
legs, `is_studio_comember(project_party_designer(subject_id))` for the
engagement leg (`00592:558`, matching `project_parties`' 00584 posture). Both
helpers return `f` for a NULL argument, so a subject id of the wrong kind fails
closed in either direction (an `engagement` rule pointing at a card resolves no
designer; a `person` rule pointing at a party row resolves no org).

**Role-scoped probes, as `authenticated` with `request.jwt.claims` set:**

```
--- member of Alpha sees (expect 1 each) ---
 ch | ru | co | af
----+----+----+----
  1 |  1 |  1 |  0
--- Alpha member direct INSERT into consent ---
  refused -> 42501 / permission denied for table studio_channel_consent
--- Alpha member writes a channel on a BETA card ---
  refused -> 42501 / new row violates row-level security policy for "studio_contact_channels"
--- Alpha member writes a rule on a BETA card ---
  refused -> 42501 / new row violates row-level security policy for "studio_contact_rules"
--- OUTSIDER (authenticated, member of no studio — the client-portal shape) ---
 ch | ru | co | af | sc
----+----+----+----+----
  0 |  0 |  0 |  0 |  0
```

The RPC really is the only write door: `authenticated` holds EXECUTE on
`record_channel_consent` / `record_channel_reconsent` and **no** DML on the
table. **PR-w holds vacuously and positively:** W1a mints no site access card
(correctly out of scope), and no client-portal identity — `anon`, or an
`authenticated` user who is not an active studio member — can read a row of any
of the four new tables.

**SECURITY DEFINER search_path is pinned everywhere.** All ten definer
functions carry `{search_path=public}`; the two non-definer trigger/pure
helpers carry `{search_path=public}` and `{"search_path=public, pg_temp"}`.
`normalize_channel_value` is declared IMMUTABLE and is honestly so —
`normalize_phone_e164` probes as `provolatile = i`.

**The mirror cannot loop, and cannot fire an outward trigger.**
`project_parties` carries exactly four non-internal triggers; the two BEFORE
ones are pure row shaping, and both AFTER ones read the guard:

```
                tgname                 |                proname
---------------------------------------+----------------------------------------
 fc_optin_invite_dispatch              | fc_dispatch_optin_invite                ← guarded
 normalize_phone_project_parties       | normalize_party_phone_e164              (BEFORE, pure)
 set_updated_at_project_parties        | update_updated_at_column                (BEFORE, pure)
 site_request_consent_granted_dispatch | _site_request_consent_granted_dispatch  ← guarded

$ select proname from pg_proc … where pg_get_functiondef(oid) like '%patina.suppress_consent_dispatch%'
 _site_request_consent_granted_dispatch
 fc_dispatch_optin_invite
 mirror_channel_consent_to_parties
```

Nothing the mirror writes writes back to `studio_channel_consent`, so there is
no cycle. The affiliation binding terminates structurally, not probabilistically:
`sync_person_affiliation_from_pointer` only makes affiliations agree with the
pointer it was handed and holds `patina.suppress_affiliation_sync` while it
does; `_sync_person_company_pointer`'s UPDATE is `IS DISTINCT FROM`-guarded and
re-derives with the same ORDER BY, so the reverse trigger's first test
short-circuits (subject to n-3's tiebreak).

**Order inside 00594 is as the header claims** — the backfill call is at `:261`
and the mirror trigger at `:506-509`, so the fold cannot dispatch. **Backfill
precedence and per-org isolation** are what the file says: `opted_out` → most
recent `granted` → `pending` → `not_asked`, `PARTITION BY org, phone_e164`
(`00594:212-227`), asserted by suite block 3 (Alpha's older STOP beats its newer
grant; Beta's `not_asked` on the same number is untouched) and block 4 (the
mirror reaches both Alpha rows and neither Beta row). **Re-running the fold
never overwrites a later decision** (`ON CONFLICT DO NOTHING`, block 6).

**Vocabulary matches direction §3.8 / crm-model §2, and none of it is an
enum.** `company_kind` is a named CHECK carrying crm-model's thirteen plus
`inspector` and `other`, and — checked against `use-studio-contacts.ts` /
`company-row.tsx` — it is a superset of the shipped UI's
`gc/workroom/showroom/vendor/supplier`, so folding the free-text `contact_kind`
later cannot raise 23514. `channel_kind`, channel `status`, consent `status`,
`source`, `subject_type` and `owner_type` are all CHECKs. `contact_kind` is
correctly left alone. No `ADD VALUE` anywhere. **Money is integer**: the only
numeric money-adjacent column added is `retainage_bps integer` (basis points,
COMMENTed as such); nothing carries a float or a dollar.

**No prod command anywhere.** `grep -rn "db push|functions deploy|bkvcixdmuyejfzcijpdg|supabase\.co|--linked|db:push"` over the
three migrations, `supabase/tests/people/`, `sms.ts` and `pipeline.ts` →
nothing. The SQL suite is one `BEGIN` / one `ROLLBACK`, with no `COMMIT`,
no `DROP TABLE`, no `TRUNCATE`; its `CREATE OR REPLACE FUNCTION
public.invoke_edge_function` stub and `public._w1a_dispatch_log` table are
uncommitted DDL — invisible to other sessions and gone on rollback.

**`people_directory` is untouched and intact.** The three migrations do not
mention it (`grep` → no match), and the view still exposes all twelve columns
current-state §B1 lists: `person_id, role, display_name, email, phone,
profile_id, project_id, designer_id, status_raw, last_touch_at, meta, scope`.
The generated-types diff has **zero deletions**, so no existing reader loses a
column anywhere. The rebuild is correctly deferred (report §5).

**The send gate fails closed in every branch I could construct.**
`channelConsentVerdict` returns `refuse` on the studio's own `opted_out`
record, on a stale `granted` contradicted by one of that studio's own party
rows, and on the no-record-plus-refusal case; when no studio resolves it falls
back phone-globally. `sendPartySms` then refuses on the target row's own
`opted_out` regardless of `studioGranted` (`sms.ts:634-635`), and
`flushDeferredMessages` repeats both gates in the same order
(`sms.ts:899-952`). A dropped error in `resolveProjectOrg` or the record read
degrades to the more conservative branch. The one exception is m-8.

---

## 4. What this review did NOT cover

- The portal/hook layer (none exists yet for these tables) and W1b's Reach
  component.
- The `w1a-review-r3-tests.md` surface — SQL-suite and Deno-suite *design*
  (coverage, fixture realism). I ran both suites and read the SQL suite's
  fixtures and transaction boundaries, but did not audit assertion quality.
- Strata. Nothing here was applied, probed or deployed against prod, and the
  report's §5 pre-push dry-run of the fold remains owed.
- Performance at Strata scale. The 00593 leg-(a) correlated `EXISTS` over
  `project_parties` and the per-row AFTER trigger on 00592's affiliation
  backfill both have supporting indexes (`idx_project_parties_studio_contact`,
  `idx_project_parties_phone_e164`), but neither was timed against a
  production-sized table.
