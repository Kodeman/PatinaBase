# W1b — final review, round 8 (migrations)

Adversarial review of `00623`–`00627`, `supabase/seed/people_crm_dev.sql`, the two
SQL suites and the functions those files define or redefine, against
`rulings.md` §1–§3 (R-AW/R-AY and R-BD/R-BE included), `synthesis/direction.md`
§2.2/§3.8/§7/§8, `synthesis/crm-model.md` §1/§2/§4/§5,
`briefing/current-state.md` §B–§E, `briefing/fixture.md` and `build/inventory.md`.

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, working tree clean apart from
`artifacts/`. Local Postgres only. **Nothing was pushed to Strata.**

**Verdict: NOT clean — 1 BLOCKING, 1 MAJOR, 13 MINOR (3 new, 10 carried open).**

---

## 0. Before the destructive local act

```
$ grep -n NEXT_PUBLIC_SUPABASE_URL /Users/kody/Code/patina-merged/apps/designer-portal/.env.local
1:# prod # NEXT_PUBLIC_SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co   ← commented
14:# prod # NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321                    ← commented
19:NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321                             ← ACTIVE, local
$ ls .../agent-people-build/apps/designer-portal/.env.local
No such file or directory          (the worktree carries none of its own)
```

**The wave is not the sole owner of the local database.** Between my first suite
run and my first probe, `public` was empty. A second session was mid-`reset`
against the same instance, from this same worktree:

```
$ ps aux | grep "[s]upabase db reset"
kody 42269 … node …/pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build supabase:reset
kody 42283 … sh -c cd supabase && supabase db reset
```

Everything below was re-run after that reset drained and after my own second
reset, so no measurement in this report was taken against a half-built schema.
Recorded as MINOR-r8-4 because the brief asserts sole ownership and the next
round should not trust a bare `psql` result on this box.

---

## 1. What I ran

### 1.1 Legacy grants — no drift

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2715 replayed statements
$ git -C … status --porcelain -- supabase/seed/00-legacy-grants.sql
(empty)
```

### 1.2 Reset, twice; the dev seed replays

```
$ pnpm --dir … supabase:reset                      RESET1_EXIT=0
$ pnpm --dir … supabase:reset                      RESET2_EXIT=0
   # the only /error/i line in either run is a migration FILENAME:
   #   "Applying migration 00458_sms_message_error_capture.sql..."
$ psql … -f supabase/seed/people_crm_dev.sql       SEED_REPLAY_EXIT=0   (0 error lines)
$ psql … -At -c "select version from supabase_migrations.schema_migrations order by version desc limit 7"
20260910152111 00627 00626 00625 00624 00623 00622
```

00595–00620 remain absent and reserved; 00621 and 00622 are untouched; W1b owns
00623–00627. The brief's "mint from 00622" was impossible (00622 exists on this
branch) and 00623 is the correct floor.

### 1.3 Idempotency — all five files applied TWICE in one rolled-back transaction

```
$ psql … -v ON_ERROR_STOP=1 -f /tmp/.../idem.sql        IDEM_EXIT=0
       idempotency
 twice applied, no error
```

### 1.4 Both suites, after the second reset

```
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
W1B_EXIT_AFTER_RESET2=0     16 blocks · "All W1b assertions passed."
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
W1A_EXIT_AFTER_RESET2=0     "All W1a assertions passed."
```

### 1.5 The one RED shipped gate

```
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/rls/people_directory_scope_test.sql
RLS_SCOPE_EXIT=3
psql:…/people_directory_scope_test.sql:308: ERROR:  FAIL a2: expected exactly 12 columns, got 17
```

### 1.6 Generated types — no drift

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --dir … db:generate
GEN_EXIT=0
$ git diff --numstat -- packages/supabase/src/database.types.ts
(empty)
```

### 1.7 The room's own reads, as `designer@patina.dev`

```
  role   | count            entity_kind | count        display_name  | consent_status
---------+-------          -------------+-------      ---------------+----------------
 client  |     7            company     |    21        Amara Osei    | granted
 contact |    49            person      |    28        Dana Kowalski | granted
 lead    |     5                                       Erin Sato     | granted
 sub     |     1                                       Joe Wozniak   | pending
                                                       Luis Ochoa    | granted
 rows_overclaiming | 0                                 Ngozi Eze     | granted
 orphan_seat_rows  | 2   (the two documented by-design dangles)      Pete Rusk   | opted_out
```

28 + 21 = 49, R-F's five granted numbers, Pete's refusal and Joe's invite all
read as the fixture. No Directory row claims a `seat_count` it cannot nest.

### 1.8 My own probes

`/tmp/.../probe200`, `probe201`, `probe202`, `probe203b`, `probe204-final.sql`
(→ `probe204.out`). `probe204` is the consolidated, replayable one: it resolves
the re-minted `Leah Hartwell` org id at runtime rather than hard-coding it (the
trap `w1b-final-fix-log-r7.md` records), so it survives a reset.

---

## 2. Migration rules — pass/fail

| Rule | Verdict |
|---|---|
| hand-numbered `NNNNN_slug.sql` | PASS — 00623–00627, no `supabase migration new` names |
| grep-winner before redefining | PASS — `create_field_link` ← `00284:37` (guard + supersede verbatim, only the expiry changed); `people_directory` ← `00594:1211-1458` (all twelve carried columns in position and type, five appended) |
| banner + lineage | PASS — every file carries its lineage and every fix round r1–r7 |
| idempotent | PASS — §1.3 |
| RLS in the same file | PASS — all three new tables |
| explicit grants both directions + REVOKE FROM PUBLIC, anon | **PASS except `people_directory`** (MINOR-7): `00626:1453` restates `GRANT SELECT … TO authenticated` with no `REVOKE … FROM anon`, and `anon_select = t` survives from the local blanket. Every other new object measures `anon_select = f`. Every new function is `REVOKE`d from `PUBLIC, anon` |
| SECURITY DEFINER pins search_path | **PASS except two** (MINOR-33): `party_identity_key` (`00626:211-229`) and `party_kind_in_directory` (`00626:265-272`) pin none — both are IMMUTABLE and resolve only to `pg_catalog`, so nothing is hijackable today. All 17 others carry `search_path=public` (or the `public, extensions, pg_temp` graft on `create_field_link`) |
| schema-qualify extension fns | PASS — `extensions.gen_random_bytes`, `extensions.digest` (`00627:552-553`) |
| guarded crons | N/A — no cron in this wave (the expiry sweep is P2) |
| CHECK over enum | PASS — `stage`, `site_access_mode`, `contracted_through`, `doc_type`, `held_by`, `source`, `blocks`, `scope`, all named and drop-and-re-added |
| money integer cents | PASS — `threshold_cents integer`, Chidi's line seeded `250000` |
| regenerate 00-legacy-grants | PASS — §1.1 |
| probe objects, never the ledger | PASS |

### 2.1 The predicates the brief names

| Asked for | Found |
|---|---|
| `compliance_state` incl. the 30-day window | `00623:547-568` — `< CURRENT_DATE` lapsed, `<= CURRENT_DATE + 30` lapses_soon, worst-first, gating paper only, `count(*) = 0` → `not_on_file`; SECURITY INVOKER. PASS |
| authority policy by role (PR-n) | `00624:616-662` — `scope NOT IN ('money','draw_certify') OR is_org_admin_or_owner(project_party_org(engagement_id))` on INSERT, UPDATE (USING **and** WITH CHECK) and DELETE. PASS, walked by suite block 5 |
| stage/window backfill | `00624:437-446` — `completed` projects, `COALESCE(completed_at, updated_at)`, twelve-month ladder, guarded by `stage = 'active'`. PASS |
| site access card: no client policy, no code column | `00625` — four policies, all `TO authenticated`, no client leg, no `show_to_client`; `code_like_columns = 0`. PASS |
| `people_directory` v4: one row per identity, every branch predicate carried, every reader column kept | `00626` — twelve columns in position, five appended, `anon` aside (MINOR-7). PASS |
| `v_access_grants` union shapes | `00627` — eleven tiers, twelve identical columns on every branch, no token and no hash, `grant_id` TEXT. PASS |
| `create_field_link` grafted with the window expiry | `00627:475-606` — both signatures, one body, `field_link_window_closed` before the supersede. PASS |
| the dev seed replays; reset twice | PASS — §1.2 |

### 2.2 Record-only consent (R-AY / R-AW)

PASS, re-verified independently of r7:
`grep -nE "sms_consent|studio_channel_consent" supabase/migrations/0062[3-7]*.sql
supabase/seed/people_crm_dev.sql` returns only banner prose, the three `meta`
JSON **key names** at `00626:1133-1135` (whose values are `q.consent_word`,
`q.record_consented_at`, `q.record_opt_out_at` — the record's), one READ of
`studio_channel_consent` at `00626:898`, and the seed's INSERT **into
`studio_channel_consent`** at `people_crm_dev.sql:489`. No frozen
`project_parties.sms_consent_*` column is read or written anywhere in the wave.
The freeze trigger still names exactly the eight consent columns plus
`phone`/`phone_e164` and none of 00624's ten new columns.

`v_project_roster` and `field_activity_summary` also read the record, not the
seat — but see MAJOR-1 for what the roster does with an unreadable one.

---

## 3. `w1b-final-fix-log-r7.md`'s findings, re-checked

| r7 finding | Status |
|---|---|
| BLOCKING-1 — the card guard resolved through `project_consent_org()` | **FIXED.** `00624:350` is `project_tenant_org(NEW.project_id)`; the COMMENT at `00624:398-414` no longer names two resolvers as one and states the caller-relative/`NULL` consequence for a uid-less writer. Suite block 14 now lands four writes and refuses two foreign cards |
| MAJOR-1 — `identity_phone_numbers()`' seat leg dropped a refused number | **FIXED.** `00626:666-687` is "belongs to": recorded `studio_id`, else `project_consent_org()` **OR** the designer/lead/creator's own membership in `p_organization_id` as a SET. The banner and COMMENT retire the "fail-closed" claim in those words. Suite block 16 carries probe138's control both ways |
| MAJOR-2 — the party-profile sheet | **HANDLED per R-BE.** Named in `w1b-report.md` §8 as W2's third owed reader, and the interim guard at `party-profile-sheet.tsx:512` renders no chip when `person` is null. I re-walked the fail-closure the guard rests on: with `person` null, `phone` falls to `meta.phone_e164` on an empty `meta` → `null`, so the composer (`granted` false), the invite branch (`consent === 'not_asked' && phone`) and `saveParty` (early return on `!person?.project_id`) are all shut. The sheet is empty, not dangerous |
| MINOR-r7-1 — `blocks` outside the compliance guard's `UPDATE OF` list | **OPEN.** Re-walked, §4 MINOR-r7-1 |
| MINOR-r7-2 — the shipped scope test is red | **OPEN.** §1.5 |
| MINOR-r7-3 — ungated definer oracles | **OPEN** |
| MINOR-r7-4 — the studio-less "tenant conjunct" is not a tenant gate | **OPEN, and PROMOTED.** r7 asked for one sentence in a banner. Walking it produced the site access card read **and** write by a studio that is not doing the work — §4 BLOCKING-1 |
| MINOR-r7-5 — tenant-less populations in the definer readers | **OPEN** |
| MINOR-35 — `w1b-report.md` stale | **OPEN AND WORSE (eighth round).** Re-measured, §4 |
| MINOR-42 — `identity_seat_count()` vs the seats view | **OPEN**, `rows_overclaiming = 0` on the fixture (§1.7) |
| MINOR-7, 12, 13, 16, 27, 31/2/36/41, 33 and the carried list | **OPEN**, unchanged |

---

## 4. Findings

### BLOCKING-1 — on a `studio_id IS NULL` project every tenant gate in this wave admits a SECOND design studio of the same designer, and the site access card is read AND written by a studio that is not doing the work

**The mechanism.** `project_tenant_org()` (`00624:129-159`) is caller-relative
where the record names no studio: its second leg returns **the caller's own**
active, non-guest `design_studio` whenever the job's `designer_id`,
`lead_designer_id` or `created_by` also actively belongs to it
(`00624:139-155`). `is_active_studio_member(project_tenant_org(p))` is therefore
self-satisfying on that population — it can only be false when the caller shares
no design studio with the job's designer. So the tenant conjunct r5 MAJOR-3
added narrows `is_studio_comember(designer)` from *any* organization to a
*design-studio* organization and does nothing else there.

Every gate in the wave rests on it:

- `project_site_access_cards` — all four policies (`00625:216`, `:226`, `:236-241`, `:250`)
- `project_party_authority` — all four policies through `project_party_org()` (`00624:607`, `:620`, `:634-647`, `:656`; `00624:187-197`)
- `people_directory`'s party branch (`00626:1246`)
- `people_directory_seats` (`00626:1566`)
- `identity_phone_numbers()`' seat leg, third clause (`00626:672-684`)

**Walked** (`probe204-final.sql` → `probe204.out`, on a freshly reset database).
`designer@patina.dev` is an owner of BOTH `Local Dev Studio` and `Leah Hartwell`;
5 of the 8 local projects carry `studio_id IS NULL`. X is a plain `member` of
`Leah Hartwell` only. The seat, the site access card and the money grant are the
*working* studio's facts, on the studio-less `Aspen Loft Refresh`:

```
 PREMISE: X is in the OTHER studio only | in_working_studio f | in_other_studio t
        | tenant_org_x_resolves ff212803-…-e76386 (Leah Hartwell) | gate_passes t

 A. site access card READ, as X | third code, changed 16 Oct | ALARM-ACCT-99812
                                | 07:00-17:00 weekdays
                                | [{"name":"CenterPoint","label":"gas","phone":"+16125550911"}]
 UPDATE 1
 B. site access card WRITE, as X | CHANGED BY THE OTHER STUDIO
 C. money authority grant, as X  | money | 250000
 D. seats view + directory row, as X | seat_rows 1 | directory_rows 1
 E. identity_phone_numbers naming X's OWN org | {+16125557001}
 F. CONTROL — the same objects on a project that RECORDS the working studio
                                      | site_cards 0 | seats 0
```

That is `00625`'s own COMMENT, verbatim, as a live behaviour rather than as a
closed defect: *"a second studio that same designer works for read the lockbox
version, the alarm account, the hours, the key holder and six emergency lines —
and an UPDATE of lockbox_version landed"* (`00625:111-117`). The file says the
tenant conjunct closed it; on the studio-less population it did not.
Direction §7 rates this table risk **High** and PR-w rules it studio-only.

**Why I graded it BLOCKING rather than r7's MINOR.** r7 recorded the mechanism
(MINOR-r7-4) as a comment gap and asked for one sentence in the 00624 banner. It
did not walk the read, and did not walk the write at all. The severity classes
this round binds me to make "any cross-tenant read or write" and "an RLS or
grant hole" BLOCKING, and both studios here are real, distinct tenants with
distinct rolodexes.

**The counterargument Fable is owed.** On that population no tenant is
*recorded*, so "cross-tenant" is a judgement about which studio is doing the
work, not a fact the row carries — and R-BD rules the population LEGACY. But
R-BD also says the ambiguous projects "stay NULL and are listed": locally all
five are ambiguous (their designer owns two design studios, so nothing in the
record chooses), so for them the exposure is permanent after W3's backfill, not
transitional. The W7 preflight counts the NULLs; nothing in the chain narrows
who reads them.

**Three fixes, cheapest first.**
1. Require a recorded studio on the two objects that carry the sensitive text
   and the money figure: make the `project_site_access_cards` and
   `project_party_authority` policies read
   `is_active_studio_member((SELECT studio_id FROM projects WHERE id = …))`, so
   a studio-less job refuses both studios rather than admitting both. It costs
   the studio-less population those two features until W3 backfills, which is
   PR-w's own posture ("studio-only, in writing").
2. Make `project_tenant_org()`'s second leg answer NULL when the caller resolves
   MORE THAN ONE candidate design studio — replace the
   `ORDER BY … LIMIT 1` pick with a uniqueness test. A caller in exactly one of
   the designer's studios still resolves; the ambiguous case refuses. This also
   removes the oddity that the resolver's answer depends on an
   `organization_id` sort.
3. Rule it accepted and say so where a reader will see it: one sentence in the
   `00624` banner and the `00625` COMMENT, the block-14 NOTICE reworded (it
   currently reads as a tenant boundary — "the admin of the studio doing the
   work reads its seat…" — while only testing a NON-design co-member), plus the
   Strata `studio_id IS NULL` count in front of Kody before the chain runs.

Cite: `00624:129-159`, `00624:139-155`, `00625:216-252`, `00624:607-662`,
`00626:672-684`, `00626:1246`, `00626:1566`; walk `probe204.out` A–F.

---

### MAJOR-1 — `v_project_roster` prints `not_asked` over a recorded `opted_out` for a caller who cannot read the record: the one reader r6's gate was not applied to, and the one R-AV repoints Patina Field onto

`00626` gates the consent COALESCE in both of its readers, because r6 MAJOR-1
established that rendering an unreadable record as the affirmative word is a
fail-open on a send door:

```
00626:1197-1202   CASE WHEN public.is_active_studio_member(
                          public.project_consent_org(q0.project_id))
                       THEN COALESCE(public.identity_consent_status(…), 'not_asked')
                  END                                   AS consent_word
00626:1532-1537   CASE WHEN public.is_active_studio_member(
                          public.project_consent_org(pp.project_id))
                       THEN COALESCE(public.channel_consent_status(…), 'not_asked')
                  END                                   AS consent_status
```

`v_project_roster` carries the same COALESCE with **no** membership test
(`00594:1145-1158`), and its own comment says the resolver is definer so a
caller "who belongs to a different studio than the one the seat's consent lives
under — still gets the studio this seat's ledger actually belongs to". It does:
and then `channel_consent_status()` returns NULL under that caller's own RLS and
the COALESCE turns the unknown into the affirmative word.

**Walked** (`probe204.out` G/H, `probe202`). X — a plain member of the
designer's second design studio, reading `studio_channel_consent` **0 rows** —
on the `Okonkwo residence`, which DOES record `Local Dev Studio`:

```
 G. v_project_roster consent word, as X    H. what the record at the working studio says
 Joe Wozniak  | not_asked                   +16125550106 | granted   |
 Ngozi Eze    | not_asked                   +16125550112 | opted_out | 2025-12-03 21:00:00+00
 Pete Rusk    | not_asked                   +16125550118 | pending   |

 people_directory_seats, as X (the r6-gated reader)  →  0 rows
```

Pete Rusk's row prints **"Not asked"** over the studio's own dated refusal —
G-3's defect verbatim, and the fixture row (F-12) the whole program exists to
fix. `people_directory_seats`, gated, correctly shows the same caller nothing.

**Readers.** `roster-row.tsx:95` (`const consent = row.sms_consent_status ?? 'not_asked'`),
`roster-derivation.ts:390` (the Call Sheet vitals' "reachable by text" count),
the Call Sheet, the letterhead instrument, the kickoff band, `ProjectTeamRoster`
— and, per **R-AV**, the Patina Field roster screen this program ships, whose
repoint target is exactly `v_project_roster.sms_consent_status`.

**Why MAJOR and not BLOCKING.** The send rail is record-only and fail-closed
(R-AY): the gate resolves `channel_consent_status()` server-side at the
project's studio, so a text to +16125550112 is refused whatever the roster
printed. The defect is a shipped and W2-planned reader showing a verdict
different from the record, which is the MAJOR class exactly.

**The file is 00594 (W1a), not a W1b file** — but it is unapplied on Strata, it
is in this program's single deploy chain, `w1b-report.md` §8 already owes R-AV
against it, and the fix is the one line r6 wrote twice in 00626. Wrapping
`00594:1149-1158` in the same `CASE WHEN is_active_studio_member(
project_consent_org(pp.project_id))` closes it; the readers already tolerate a
null (`?? 'not_asked'` at `roster-row.tsx:95` would then print the same word,
so `roster-row.tsx` wants the R-V "no record" treatment in the same W2 pass, or
`field_activity_summary`'s posture — `= 'pending'` against a NULL, which
under-counts rather than over-promises — adopted instead).

Cite: `00594:1145-1158`, `00626:1197-1202`, `00626:1532-1537`,
`roster-row.tsx:95`, `roster-derivation.ts:390`; walk `probe204.out` G/H.

---

### MINOR findings

| ID | Finding | Cite | Evidence |
|---|---|---|---|
| MINOR-r8-1 (new) | **One ordinary DELETE is the cheapest `lapsed` → `current` door, and it leaves no evidence at all.** Four review rounds (r1 MAJOR-4, r2 MAJOR-1 a+b, r3 MAJOR-1, r4 MAJOR-1) closed five supersede doors to this consequence, while `DELETE` is granted to `authenticated` with a plain member policy. Walked as `studio_manager@patina.dev`, a non-owner admin: `DELETE FROM studio_compliance_documents WHERE holder_id = <Northgate> AND expires_on < CURRENT_DATE` → `DELETE 1` → `compliance_state` goes `lapsed` → `current`, and Dana Kowalski's Directory row reads `current`. The table's own COMMENT says "A renewal sets superseded_by on its predecessor; **nothing is deleted**" and crm-model §4 says documents "keep their original holder id and are marked superseded, **never deleted**". Graded MINOR on r7's own rationale — after the delete the record genuinely holds no lapse, so `compliance_state()` still agrees with the record as written — but it makes the five supersede guards a speed bump rather than a defence. Fix: drop the DELETE policy and grant (a mistaken row is corrected by an UPDATE, retired by a supersede, or removed by an owner/admin-only policy), or amend both COMMENT and crm-model §4 to say members may delete | `00623:509-520`, `00623:184-194` | `probe203b` door A |
| MINOR-r7-1 (carried, OPEN) | **The compliance supersede invariants are still one-shot.** `blocks` is absent from `assert_compliance_holder_trg`'s `UPDATE OF` list, and the guard never re-validates a chain from the successor's side. Re-walked as the same plain admin: record a CORRECT renewal (gates carried, in force, dated) → retire the lapse → `current` (right) → `UPDATE … SET blocks = '{}'` (trigger silent) → `current` → `UPDATE … SET expires_on = CURRENT_DATE - 1` (trigger fires, passes: the row's own `superseded_by` is NULL) → **still `current`**, over a card whose general-liability papers are one retired 2026-03-31 lapse and one expired gateless row. Dana's Directory row reads `current` with it. One line: add `blocks` to the `UPDATE OF` list and re-assert when a row that is somebody's `superseded_by` target is edited | `00623:477-478`, `00623:424-433`, `00623:414-422` | `probe203b` door B |
| MINOR-r7-2 (carried, OPEN) | **A shipped SQL gate is red.** `expected exactly 12 columns, got 17`, exit 3. One line. It matters beyond its severity because `integration.yml` runs this file and a verification pass would run it | `supabase/tests/rls/people_directory_scope_test.sql:308` | §1.5 |
| MINOR-r7-3 (carried, OPEN) | **`project_tenant_org()` is a third ungated definer oracle** (MINOR-12's family). Its first COALESCE leg returns `projects.studio_id` with no membership test, so any authenticated caller learns which studio owns any project uuid. A uuid→uuid mapping, no PII | `00624:129-159` | carried from r7's `probe140` |
| MINOR-r7-4 (carried; the documentation half) | The banners and the suite's block-14 NOTICE read as a tenant boundary on a population where the conjunct is not one. Promoted to BLOCKING-1 above for the behaviour; the wording is still owed, and block 14 tests only a **non-design** co-member, never a second design studio | `00624:110-128`, `00625:189-207`, suite block 14 | §4 |
| MINOR-r7-5 (carried, OPEN) | **The definer readers' tenant-less populations are gated on `is_design_studio_comember` alone** — `proposals.project_id IS NULL` and an invoice naming neither `studio_id` nor `project_id`. Each COMMENT says so, which is why it is MINOR; for `invoice_links` the table was service-role-only before this file, so that population is new exposure | `00627:122-125`, `00627:251-259` | read |
| MINOR-7 (carried, OPEN) | `people_directory` restates `GRANT SELECT` with no `REVOKE … FROM anon`; measured `anon_select = t` while every other new object is `f`. Reads nothing (`security_invoker`, and every appended function is revoked from anon), so it fails at the function grant rather than leaking | `00626:1453` | §2 |
| MINOR-16 (carried, OPEN) | `people_crm_dev.sql` is in `[remotes.staging.db.seed].sql_paths`, so the Okonkwo fixture reaches staging. Added to satisfy `config.toml`'s own derivation invariant; still owed a ruling | `supabase/config.toml:60`, `:88` | read |
| MINOR-33 (carried, OPEN) | `party_identity_key()` and `party_kind_in_directory()` pin no `search_path` (`proconfig` NULL) while all 17 other new functions do. Both bodies resolve only to `pg_catalog` | `00626:211-229`, `00626:265-272` | read |
| MINOR-35 (carried, OPEN AND WORSE — eighth round) | **`w1b-report.md` is not a usable input for W2's brief, and the brief makes it one.** `grep -c` over the report returns **0** for all nine of: `identity_paper_state`, `identity_phone_numbers`, `identity_consent_status`, `identity_consent_evidence`, `reach_state_for_identity`, `party_kind_in_directory`, `field_link_window_closed`, `project_tenant_org`, `is_active_studio_member`. Four statements in it are now false: §2 says the card guard resolves "in the studio `project_consent_org()` resolves" (`:68`); §3 says the site-access policies are "all `is_studio_comember(project_designer(project_id))`" (`:94`, and the pasted probe at `:435-438`); §4 presents `paper_state` as `compliance_state(COALESCE(company_id, id))` (`:131`); §7 claims `passed=12` (`:356`) and a `654 7` type diff (`:383`) where the suite has 16 blocks and `db:generate` produces no diff | `w1b-report.md:68`, `:94`, `:131`, `:356`, `:383`, `:435-438` | grep + §1.4/§1.6 |
| MINOR-42 (carried, OPEN) | `identity_seat_count()` has no tenant leg and counts under `project_parties`' looser `is_studio_comember(designer)` policies, while `people_directory_seats` carries the tenant conjunct — so `seat_count` is computed over a strictly broader population than a row can nest. `rows_overclaiming = 0` on the fixture, because every seeded seat sits on a project whose `studio_id` is set; reachable through a manufacturer-org co-membership or a card stamped onto another studio's seat | `00626:333-346` | §1.7 |
| MINOR-r8-2 (new) | **`create_field_link(uuid, timestamptz)` is now EXECUTE-granted to `authenticated` and PostgREST-published, with no ceiling on the caller's date.** The shipped one-argument form could only take the table's 90-day default; the designer of record can now mint a no-auth trade door dated any distance into the future on any windowless seat (`p_expires_at` is honoured whenever no live window exists). PR-d/PR-l give the studio the choice and name no ceiling, so this is a gap in the ruling rather than a contradiction of it — worth one sentence, or a `p_expires_at <= now() + interval '1 year'` clamp | `00627:475-482`, `00627:533`, `00627:580-581` | read |
| MINOR-r8-3 (new) | **The identity precedence leaves one residual duplicate the head count will show.** `party_identity_key()` puts the lineage stamp FIRST, so a carded human who ALSO holds an unstamped seat carrying a different number is two identities: one contacts-branch row keyed on the card and one party-branch row keyed on the phone, each with its own consent word. crm-model §4 rule 2 (exact phone, "auto-link within one studio") never fires behind rule 6. The precedence is the documented one and each row's word agrees with the record for its own number, so this is not a wrong verdict — but G-9's over-count is what the wave closes, and this is the shape in which a slice of it survives. Worth naming in the view's COMMENT so W2's head count does not read as a bug | `00626:211-229`, `00626:1226`, `00626:1347` | read |
| MINOR-r8-4 (new, process) | **The local database had a second owner during this review.** A concurrent session ran `pnpm --dir …/agent-people-build supabase:reset` at 14:46 and emptied `public` between my first suite run and my first probe. Everything in this report was re-measured afterwards. The brief's "this wave is its sole owner" was not true; `feedback_shared_local_postgres_across_sessions.md`'s reset-window coordination applies | — | `ps aux`, §0 |

---

## 5. Checked and clean, so round 9 need not re-walk them

- Legacy grants regenerate to no diff; generated types regenerate to no diff.
- All five files apply twice in one transaction with zero errors; reset twice; the dev seed replays against an already-seeded database.
- Both suites green after the second reset (W1b 16 blocks, W1a 49 passes).
- Record-only consent (R-AY/R-AW) re-verified independently: no frozen `sms_consent_*` column is read or written by any of the five files or by the seed; the freeze trigger names exactly the ten columns and none of 00624's new ten.
- `anon` is `false` on every new table, view and function of the wave (`people_directory` excepted, MINOR-7).
- `compliance_state`'s four words on the fixture's real firms; the 30-day boundary; `not_on_file` as a distinct fact from no gating paper.
- PR-r: `code_like_columns = 0` on the site access card. PR-w: four policies, `TO authenticated`, no client leg, no `show_to_client` column.
- PR-n in INSERT/UPDATE (both halves)/DELETE; suite block 5 walks it as three roles.
- `create_field_link` is a faithful graft of `00284:37` — the ownership guard and the supersede verbatim, the raise before the supersede, both signatures callable, one body.
- The claim/nest invariant: `rows_overclaiming = 0`; the 2 orphan seat rows are the two documented by-design dangles.
- The fixture reads as the fixture: 28 + 21 = 49 contacts, five granted numbers, Pete `opted_out`, Joe `pending`.
- `project_parties`' ten new columns are outside the freeze; the stage backfill is guarded by `stage = 'active'`.
- Every `v_access_grants` source has RLS enabled with at least one policy, or is one of the four grant-closed tables reached only through its definer reader; no bearer credential and no hash in the view.
- The party-profile sheet's interim guard fails closed all the way (no chip, no composer, no invite branch, no save) when `person` is null.
- `v_project_roster` and `field_activity_summary` read the record, not the seat (R-AS) — MAJOR-1 is about the COALESCE, not about the source.
- Reserved numbers: 00595–00620 absent; 00621 and 00622 untouched; W1b owns 00623–00627; W2 mints from 00628.

## 6. What would make this clean

1. **BLOCKING-1** — pick one of the three fixes in §4. Suite leg: on a
   studio-less job, a plain member of the designer's SECOND DESIGN STUDIO reads
   0 site access cards, 0 authority grants and 0 seat rows and cannot UPDATE the
   lockbox version, while the working studio's own admin reads all three.
   Block 14's current negative actor (a non-design co-member) does not reach it.
2. **MAJOR-1** — wrap `00594:1149-1158` in the r6 gate, and decide in the same
   pass what `roster-row.tsx:95` prints for a null (R-V's "no record" line, not
   `?? 'not_asked'`). Suite leg: the probe204 G/H pairing.
3. The two one-liners that cost nothing and are now in their fourth and third
   round: `blocks` into the compliance trigger's `UPDATE OF` list
   (MINOR-r7-1), and the column count at
   `supabase/tests/rls/people_directory_scope_test.sql:308` (MINOR-r7-2).
4. Decide MINOR-r8-1: either the DELETE policy goes, or the table COMMENT and
   crm-model §4 stop saying documents are never deleted.
5. **Rewrite `w1b-report.md` against the code as it now stands before W2's brief
   is written from it** (MINOR-35). Five rounds of fixes are invisible in it and
   four of its statements are false.

## 7. Not a finding, for the record

- Every ruling in `rulings.md` §3 is settled and none is contradicted by
  00623–00627, R-AW/R-AY, R-BD and R-BE included. R-BE's W2 repoint is named in
  the report and the interim guard holds.
- The four designer-scoped Directory branches (client, lead, maker, team) are
  r6 MAJOR-2's recorded ruling; suite block 15 pins the residual against
  `designer_clients`' own posture.
- Every carded human moving to `role='contact'` is settled (rulings §6, no flag,
  one chain). The deploy-sequencing constraint at `00626:91-105` is stated
  correctly.
- `field_activity_summary`'s `= 'pending'` test against an unreadable record
  under-counts rather than over-promises, so it is not MAJOR-1's sibling.
- The `md5(token)` handle on the evidence-upload branch (`00627:416`) is a
  32-hex digest of a 256-bit random token, and that table's RLS admits only
  platform admins and `agent_reader`; not a credential exposure.
