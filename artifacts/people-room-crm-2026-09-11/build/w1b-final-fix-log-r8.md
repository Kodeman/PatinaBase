# W1b — final review round 8, fix log

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`. Local DB only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`); nothing touched on
Strata. Two findings in scope (BLOCKING-1, MAJOR-1); nothing else changed.

---

## BLOCKING-1 — a studio_id IS NULL project admitted a SECOND design studio of the same designer to the site access card (read AND write) and to the money authority grant

**Fix chosen: the reviewer's option (1)** — the two objects that carry the
sensitive text and the money figure require a RECORDED studio, so a studio-less
job refuses BOTH studios rather than admitting both. Option (2) was rejected on
evidence: the walked actor is a plain member of *exactly one* of the designer's
design studios, so a uniqueness test over "the candidate design studios the
CALLER resolves" leaves `gate_passes = t` for that actor and closes nothing (the
reviewer's own sentence — "a caller in exactly one of the designer's studios
still resolves" — is the walked case). Making the second leg record-relative and
unique instead *does* close it, but it answers NULL for every caller on the
ambiguous population and so reverts r6 MAJOR-1's encoded requirement (suite
block 14's `14e`/`14f`: the ADMIN of the studio doing the work must read its own
seat on its own studio-less job). See "the residue" below.

### What changed

`supabase/migrations/00624_project_party_window_and_authority.sql` (edited in
place; unapplied on Strata) — new **§1c**:

- `public.project_recorded_studio(p_project_id uuid)` → `projects.studio_id`,
  no fallback, no caller-relative leg. SECURITY DEFINER, `search_path` pinned,
  `REVOKE ALL … FROM PUBLIC, anon`, `GRANT EXECUTE … TO authenticated,
  service_role`, COMMENT carrying the walk.
- `public.project_party_recorded_studio(p_party_id uuid)` → the same through
  `project_parties`, so the two sensitive objects can never name different
  studios for one seat. Same definer/grant/REVOKE/COMMENT treatment.
- All four `project_party_authority` policies now read
  `is_active_studio_member(project_party_recorded_studio(engagement_id))`, and
  PR-n's money narrowing reads
  `is_org_admin_or_owner(project_party_recorded_studio(engagement_id))` — so
  money and `draw_certify` need the standing **at the recorded studio**, not at
  whichever of the caller's studios a ranking picked.
- Banner, the §1 pre-function comment and `project_tenant_org()`'s COMMENT now
  say in words that the two sensitive objects do NOT ask that function and why,
  and name what deliberately still does.

`supabase/migrations/00625_project_site_access_cards.sql` (in place) — all four
policies read `is_active_studio_member(project_recorded_studio(project_id))`;
the banner, the pre-policy comment and the table COMMENT retire the claim that
the r5 tenant conjunct closed the second-studio read (00625:111-117 described a
live behaviour) and state the cost: a job that names no studio holds no readable
card for ANY studio until R-BD's W3 backfill.

Shipped policy expressions, read back from `pg_policies`:

```
 project_party_authority_studio_select   | (is_active_studio_member(project_party_recorded_studio(engagement_id)) AND is_studio_comember(project_party_designer(engagement_id)))
 project_party_authority_studio_insert   | … AND ((scope <> ALL (ARRAY['money','draw_certify'])) OR is_org_admin_or_owner(project_party_recorded_studio(engagement_id)))
 project_party_authority_studio_update   | … same …
 project_party_authority_studio_delete   | … same …
 project_site_access_cards_studio_select | (is_active_studio_member(project_recorded_studio(project_id)) AND is_studio_comember(project_designer(project_id)))
 project_site_access_cards_studio_insert | … same …
 project_site_access_cards_studio_update | … same …
 project_site_access_cards_studio_delete | … same …
```

### The walk, re-run (`probe147-r8-fix-negative-control.sql/.out`, probe144's own legs)

```
 PREMISE: X is in the OTHER studio only | in_working_studio f | in_other_studio t
   | tenant_org_X_resolves 8a9a0c06-… (Leah Hartwell) | old_gate_still_passes t
   | recorded_studio <null>             | new_gate_passes f

 A.  site access card READ, as X                      cards 0   (was: the lockbox
                                                                version, ALARM-ACCT-99812,
                                                                the hours, the gas line)
 A2. site access cards ANYWHERE, as X                 cards 0
 B.  UPDATE … SET lockbox_version = 'CHANGED BY THE OTHER STUDIO'   → UPDATE 0
 C.  money authority grant, as X                      grants 0  (was: money / 250000)
 I.  stored lockbox version afterwards                'third code, changed 16 Oct'
```

`old_gate_still_passes = t` is deliberate evidence: the fix is not in the
conjunct — `is_active_studio_member(project_tenant_org(job))` is still true for
that caller — it is that the two sensitive objects stopped asking it.

Positive controls, same probe, as the ADMIN of the studio doing the work:

```
 P1. on the job that RECORDS its studio   cards 1 | grants 11 | seats 24
 P3. on the studio-less job               cards 0 | grants  0 | seat_rows 1
```

### The residue, recorded rather than claimed closed

On the studio-less population three things stay readable by a second design
studio of the same designer, each because narrowing it reintroduces a finding
this program already closed:

| Object | Why it may not ask the record |
|---|---|
| `people_directory_seats` + the Directory's party branch | r6 MAJOR-1: a record-only tenant hid every seat on a studio-less job from the ADMIN of the studio doing the work (5 of 8 local projects). Suite block 14 asserts that side. A seat row carries a name, a trade, a number and a paper word — no lockbox version, no alarm account, no threshold. |
| `identity_phone_numbers()`' seat leg | r7 MAJOR-1: the leg is a deliberate SUPERSET, because a number dropping out of a WORST-FIRST reduction makes the printed word MORE permissive. Probe leg E still echoes the number, and the call requires the caller to already know it. |
| `assert_project_party_cards()` | r7 BLOCKING-1: a record-only tenant there refuses the working studio's OWN firm card and warranty contact on its own studio-less job — the inversion that finding closed. |

Nothing in the record distinguishes the two studios on that population at read
time (`designer_clients` carries no `organization_id`; the walked seats carry no
rolodex pointer yet), so **"0 seat rows for the second studio" and block 14's
"the working studio's admin reads its seat" cannot both hold** — the brief's
suite leg asks for both. The sensitive half is closed; the seat half is asserted
as the documented residue in block 17 (`17l`) so a silent change to it fails the
suite. This is the ruling owed to Kody together with the Strata
`studio_id IS NULL` count that 00624's banner already demands before the chain
runs.

### Suite

`supabase/tests/people/w1b_compliance_authority_directory_test.sql`:

- **block 14** — `14h`/`14i` now assert **0** cards and **0** grants on the
  studio-less job for the working studio's own admin; `14h2` asserts the
  lockbox UPDATE lands on 0 rows; `14h3`/`14i2` assert the card INSERT and the
  money-grant INSERT are refused there (`insufficient_privilege`); and the
  mutation control `14h4`/`14i3` lands both writes on Cedar Lane Study, which
  RECORDS the studio — one field different, nothing else. The NOTICE no longer
  reads as a tenant boundary and names block 17 as the actor it does not test.
- **block 17 (new)** — the leg the brief asks for: block 13's ordinary member of
  `Test Studio B` (a DESIGN studio whose owner is the job's designer of record),
  never a member of the studio doing the work. `17d`/`17e` assert the premise
  (the caller-relative resolver still names that caller's own studio and the
  membership test still passes); `17f`/`17g` 0 cards on the job and
  platform-wide; `17h` 0 rows changed on the lockbox version; `17i` the INSERT
  refused; `17j`/`17k` 0 authority grants; `17l`/`17m` the recorded residue and
  its NULL consent word; `17n`–`17q` the other half — the working studio's admin
  reads the card, the grants and the seats on the job that RECORDS its studio;
  `17r` the stored lockbox version is untouched.

---

## MAJOR-1 — `v_project_roster` printed `not_asked` over a recorded `opted_out` for a caller who cannot read the record

`supabase/migrations/00594_studio_channel_consent.sql` (in place; the
grep-winning definition of the view, `tail -1` = 00594) — the party branch's
consent word now carries the same gate 00626 ships in both of its readers:

```sql
  CASE WHEN public.is_active_studio_member(
              public.project_consent_org(pp.project_id))
       THEN COALESCE(
              public.channel_consent_status(
                public.project_consent_org(pp.project_id),
                'sms', pp.phone_e164),
              'not_asked')
  END                                                            AS sms_consent_status,
```

Read back from `pg_views`:

```
 CASE
     WHEN is_active_studio_member(project_consent_org(pp.project_id)) THEN COALESCE(channel_consent_status(project_consent_org(pp.project_id), 'sms'::text, pp.phone_e164), 'not_asked'::text)
     ELSE NULL::text
 END AS sms_consent_status,
```

Walk (`probe147` legs G/H — the same three humans as probe144's G/H):

```
 G. v_project_roster consent word, as X   H. what the record at the working studio says
 Joe Wozniak  | <null>                     +16125550106 | granted   |
 Ngozi Eze    | <null>                     +16125550112 | opted_out | 2025-12-03 21:00:00+00
 Pete Rusk    | <null>                     +16125550118 | pending   |

 P2. the same three, as the working studio's own admin:
 Joe Wozniak pending · Ngozi Eze granted · Pete Rusk opted_out
```

**The reader, decided in the same pass (R-V).**
`apps/designer-portal/src/components/document/roster/roster-row.tsx:95` no longer
coalesces: `const consent = row.sms_consent_status;`. `ConsentChip`
(`components/document/people/person-bits.tsx`) gains one explicit branch — a
null/empty status renders the pearl dot with the words **"No record"**
(`data-consent-dot="no_record"`), so the absence can never print the affirmative
word through the reader's own fallback. `SMS_CONSENT_DISPLAY` in
`@patina/types` is untouched (it is read by other surfaces), and every non-null
status renders exactly as before. `canText` was already
`consent === 'granted'`, so a null cannot open the composer;
`roster-derivation.ts:390` counts `=== 'granted'`, so a null UNDER-counts
"reachable by text" rather than over-promising — left as it is, per the review's
own note.

The party-profile sheet's local `ConsentChip` (`party-profile-sheet.tsx:103-106`)
still coalesces; that reader is R-BE's W2 repoint and is out of scope here.

**Suite legs updated for the new, honest degrade** (both were asserting the
fail-open word as correct):

- `w1a…test.sql` **38c** — Alpha's owner reading Beta's seat now asserts
  `v_alice IS NULL`, not `= 'not_asked'`; the comment and block 38's NOTICE say
  why.
- `w1a…test.sql` **44c5** — the "record-granted prints Texting" leg was reading
  the view with `reset_role()` (no JWT, so the new gate is false); it now reads
  as a member of the studio whose ledger it is. The service-role/JWT-less
  posture is now identical to 00626's two readers, which have carried this gate
  since r6 MAJOR-1. No server-side reader of
  `v_project_roster.sms_consent_status` exists (`sms-inbound/pipeline.ts` only
  names it in a comment; `use-coordination.ts` is a user-JWT hook whose
  `ProjectRosterRow.sms_consent_status` was already `string | null`).

---

## Verification

```
$ pnpm --dir …/agent-people-build supabase:reset
…
Seeding data from supabase/seed/people_crm_dev.sql...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}

$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
NOTICE:  38. one resolver for the seat's studio: … and an unreadable record degrades to NULL rather than to the affirmative `not_asked` (w1b final review r8 MAJOR-1): passed
NOTICE:  44. the site-request rail asks the record and writes no seat … (R-AW): passed
NOTICE:  All W1a assertions passed.

$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
NOTICE:  14. a studio-less job: … the two SENSITIVE objects ask the RECORD … (r8 BLOCKING-1) …: passed
NOTICE:  17. the designer's SECOND DESIGN STUDIO on a studio-less job: … 0 site access cards, 0 authority grants, 0 rows changed on the lockbox version and a refused INSERT … : passed
NOTICE:  All W1b assertions passed.

$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2719 replayed statements
   (+24 lines: the two new REVOKE/GRANT pairs)

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --dir … db:generate
   packages/supabase/src/database.types.ts | 8 ++++++++   (the two new functions only)

$ pnpm --dir … --filter @patina/supabase       type-check   → tsc --noEmit, EXIT 0
$ pnpm --dir … --filter @patina/designer-portal type-check   → tsc --noEmit, EXIT 0
$ pnpm exec jest src/components/document/people src/components/document/roster src/lib/document
   Test Suites: 130 passed, 130 total · Tests: 2524 passed, 2524 total
```

Deno edge tests: not relevant — no edge function reads either object or the
roster view's consent column (grep above).
