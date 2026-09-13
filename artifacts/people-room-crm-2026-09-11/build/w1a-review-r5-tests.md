# W1a — round 5 review: tests, types, behaviour

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, HEAD `6541f1a8e`. Local Supabase
stack only (project `supabase`, container `supabase_db_supabase`, confirmed
this wave's sole DB at `00594` + `20260910152111`, no other migration head
mixed in). No `supabase db push`, no `supabase functions deploy`, no Strata
contact, no `pnpm dev`, no `next build`. `origin/main`'s migration tip is
still `00591_notification_log_delivery` (re-fetched), so 00592–00594 still
collide with nothing.

Prior fix log read: `w1a-fix-log-r4.md` (its three sections: the r4 review's
B-1/M-1/M-2, the W4 round's W4-M1/W4-M2, and the later "Round 4 (r4 review)"
R4-M1/R4-M2). All five-plus-two findings there are **fixed and still fixed** —
every SQL block that regression-tests them (3, 13, 14, 15, 16/16B, 25, 27,
30e) passed in my own fresh run below, not just re-cited from the log. Two
more fix logs exist past r4 in this same directory (`w1a-fix-log-r8.md`, and
the r8 F1 fix folded into `w1a-fix-log-r3.md`) — both are likewise covered by
currently-passing blocks (27, 31) and are part of this review's fresh look,
not skipped.

---

## 1. SQL tests — full run

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
```

```
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
NOTICE:  13. an inbound grant releases its parked site requests (B-1/M-2): passed
NOTICE:  14. the opted_out gate is part of the write (M-1): passed
NOTICE:  15. the card backfill does not invent SMS capability (M-2/M-1): passed
NOTICE:  16. the two consent doors do not compose past a STOP (M-1): passed
NOTICE:  16B. a DATELESS refusal fails closed too (r4 B-1): passed
NOTICE:  17. affiliation and channel kinds are enforced (M-2): passed
NOTICE:  18. the mirror never nulls an evidence column (R-AN): passed
NOTICE:  19. the write door reads the seats too (R-AL): passed
NOTICE:  20. the pointer moves one affiliation, not all of them (R-AO): passed
NOTICE:  21. the designated people are people, in this studio (R-AP): passed
NOTICE:  22. the seat gate is on the refusal, not the verdict (r6 B6-1/M6-1): passed
NOTICE:  23. the mirror keeps both dates (r6 M6-2): passed
NOTICE:  24. the routed person is a person, in this studio (r6 M6-4): passed
NOTICE:  25. the channel vocabulary is checked, both ways (r6 M6-5), and carries the rule-only `sms` token so "phone yes, text no" is writable (r4 R4-M2): passed
NOTICE:  26. no studio-side verdict lowers refusal_unanswered (r7 M7-1): passed
NOTICE:  27. reconsent is evidence-only and re-callable (r7 M7-2), leaves the refusal's own evidence standing (r8 W4-M2), the seat carries the refusal's own words too (r9 R5-M1), and a sourceless refusal is never given the studio's consent as its words (r6 R6-M1) — nor left standing on the sibling seat (r8 R8-M1): passed
NOTICE:  28. a studio-recorded refusal never speaks for a texted one, and the refusal keeps the date it arrived (r7 R7-M1): passed
NOTICE:  29. a held card cannot change what it is or whose it is (r8 R8-M2, R-AR): passed
NOTICE:  30. the fold picks the sibling that HOLDS the refusal, so a dateless portal refusal never erases the STOP's date or words — on the record or on the seats (r2 R2-M1): passed
NOTICE:  30e. a grant's paperwork is never filed as the refusal's own words, and the wordless refusal reaches both seats (r4 R4-M1): passed
NOTICE:  31. a rule is filed under the noun its subject actually is (r8 F1): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
```

**32 blocks (1–31 plus 16B), all passed, whole file rolled back.** This is a
live re-run against the branch tip, not a copy from a report — the
transcript has been caught stale twice before in this wave's own history, so
I ran it myself rather than trusting the pasted copy in `w1a-report.md`.

---

## 2. Generated types — regenerate and diff

```
$ git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build status --short -- packages/supabase/src/database.types.ts
(clean before regen)

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build db:generate
> patina-monorepo@0.1.0 db:generate
> pnpm --filter @patina/supabase generate
> @patina/supabase@0.0.1 generate
> supabase gen types typescript --db-url "$SUPABASE_DB_URL" > src/database.types.ts
Connecting to db 5432
(no schema-diff output — types written)

$ git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build diff --stat packages/supabase/src/database.types.ts
(empty)
```

**Empty after regen — the builder actually regenerated the file (not a
no-op check of a pre-existing empty diff): a fresh `db:generate` against the
live local stack produces byte-identical output to the committed file.**

---

## 3. RLS probes — real fixtures, three role shapes

Seed data holds zero rows in all four new tables (`studio_contacts`,
`studio_contact_channels`, `studio_channel_consent`,
`studio_person_affiliations`, `studio_contact_rules` all empty — matches
`w1a-report.md`'s own note that the backfills found nothing locally). I
inserted a real fixture as `postgres` (RLS-exempt) — one card + channel +
consent row in the designer's own studio (`b0000000-0000-0000-0000-000000000001`,
"Local Dev Studio") and an identical set in a studio the designer does **not**
belong to (`cf120000-0000-4000-8000-000000000001`, "Phase One Synthetic
Studio") — then probed with `SET ROLE` + `request.jwt.claim.sub` /
`request.jwt.claims`, all inside one transaction, rolled back
(`/private/tmp/.../scratchpad/rls_probe.sql`, reproduced inline below with the
exact output).

`designer@patina.dev` = `a0000000-0000-0000-0000-000000000004` (seed:
`supabase/seed/dev-accounts.sql:14`), member of `b0000000-…-001` and of
`bd1a71af-…` ("Leah Hartwell") but **not** of `cf120000-…-001`.
`client@patina.dev` = `a0000000-0000-0000-0000-000000000005`
(`dev-accounts.sql:15`) — confirmed via `organization_members` to hold **zero**
studio memberships.

```
=== as designer@patina.dev: studio_contacts visible ===
           organization_id            |     full_name
--------------------------------------+-------------------
 b0000000-0000-0000-0000-000000000001 | Own-Studio Person
(1 row)                                                       -- foreign-studio row absent

=== as designer@patina.dev: studio_contact_channels visible ===
 owner_type |    value     |           organization_id
------------+--------------+--------------------------------------
 person     | +16125551000 | b0000000-0000-0000-0000-000000000001
(1 row)

=== as designer@patina.dev: studio_channel_consent visible ===
           organization_id            | channel_value | status
--------------------------------------+---------------+---------
 b0000000-0000-0000-0000-000000000001 | +16125551000  | granted
(1 row)

=== as designer@patina.dev: direct INSERT into studio_channel_consent ===
NOTICE:  expected: insufficient_privilege (42501) on direct INSERT
           -- confirms decision 5: record_channel_consent() is the only write door, by privilege

=== as client@patina.dev (no studio): studio_contacts / studio_channel_consent / studio_contact_channels / studio_person_affiliations / studio_contact_rules ===
0 rows on every one of the five

=== as anon: studio_contacts / studio_channel_consent / studio_contact_channels / studio_person_affiliations / studio_contact_rules ===
insufficient_privilege (42501) on every one of the five -- no SELECT grant to anon at all

=== confirm project_site_access_cards / any *site_access* object exists ===
0 rows -- no such object anywhere in this schema
```

**Findings from this probe (all confirm correct, isolating) behaviour:**
the designer sees only their own studio's card/channel/consent row and cannot
write the consent table directly; a signed-in user with no studio membership
sees nothing in any of the four tables; anon is refused (no grant) rather
than merely filtered by RLS, on all four. This matches decision 3
(`studio_contact_org()`-gated RLS), decision 5 (RPC-only write door) and the
probe table already in `w1a-report.md` §3, independently reproduced with a
live fixture rather than taken on the report's word.

**Task-instruction note, not a code finding:** step (3) as given asks to
"assert the site access card is invisible outside the studio." **No such
object exists in this codebase yet.** `w1a-report.md` §5 ("Not done")
explicitly lists `project_site_access_cards` as **out of W1a scope**, and the
query above confirms no table or view matching `*site_access*` exists
anywhere in the local schema. There is nothing to probe here; treat this
line of the task as not applicable to W1a rather than as a gap in the
review.

---

## 4. Edge-function tests + the gate-logic failure cases

```
$ deno test --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared supabase/functions/sms-inbound
...
ok | 418 passed | 0 failed (1s)
```

(`supabase/functions/sms-inbound/` itself holds no `*.test.ts` — its suite
lives at `supabase/functions/_tests/sms-inbound.test.ts`, per
`w1a-report.md` §3's own note — so the literal command above only exercises
`_shared`'s 418 tests; it does not error or warn, it simply finds nothing
under `sms-inbound/`. Running the actual inbound suite alongside `_shared`'s
consent file directly:)

```
$ deno test --allow-all --config supabase/functions/deno.json \
    supabase/functions/_tests/sms-inbound.test.ts supabase/functions/_shared/sms.test.ts
ok | 71 passed | 0 failed (94ms)
```

### Gate logic read

`supabase/functions/_shared/sms.ts:440-512` (`channelConsentVerdict`) — the
send-time gate. Per-org lookup key is `studio_channel_consent`'s own PK
`(organization_id, channel_kind, channel_value)` (`00594`), so two studios'
records for the same phone are structurally separate rows; `orgHasOptedOutParty`
(`sms.ts:355-381`) scopes its `project_parties` fallback scan to the resolving
org's own projects via `orgsOfProjects()`, never phone-globally except when no
org resolves at all (`sms.ts:502-511`).

### Failure case 1 — opted out in org A, granted in org B

Constructed and confirmed passing, `supabase/functions/_shared/sms.test.ts`:
- `another studio's opt-out does not block this studio's send` (line 548) —
  Alpha `granted` record + Beta `opted_out` record on the same number; Alpha's
  send still goes out.
- `another studio's opted-out party row does not block this studio's granted
  record` (line 977) — Alpha holds a `granted` record while Beta's own party
  row on the number reads `opted_out`; Alpha's send is unaffected (the exact
  G-3 regression this table exists to close).

Both ran green in the 71-passed line above.

### Failure case 2 — no consent record, but an opted_out party row

Constructed and confirmed passing, same file:
- `with no studio record, an opted-out sibling party row in the SAME studio
  still blocks (fail closed)` (line 576) — `studio_channel_consent` is empty
  (pre-backfill state), a sibling party row on the number in the caller's
  own studio reads `opted_out`; the send refuses (`reason: "opted_out"`).
- `with no studio record, ANOTHER studio's opted-out party row does not
  block` (line 600) — same shape, but the opted-out sibling belongs to a
  different studio; the send goes out (R-AK: the no-record fallback is
  studio-scoped, not phone-global).

Both ran green above. The SQL-side analogue of case 2 (the *write* door
reading the seats, not the send gate) is block 19 ("the write door reads the
seats too", R-AL), also green in §1.

I read both test bodies in full
(`supabase/functions/_shared/sms.test.ts:548-624`, `:975-999`) rather than
trusting their names; the fixtures genuinely construct the two stated
scenarios (two `studio_channel_consent` rows keyed to different orgs on one
phone; an empty consent table with `project_parties` rows split across two
orgs) and the assertions genuinely check the send outcome (`res.sent`,
`res.reason`), not just that the call didn't throw.

---

## 5. `people_directory` readers and the type-level check

**`people_directory` is untouched by W1a.** `grep -n "people_directory"` over
all three of this wave's migrations (`00592`, `00593`, `00594`) returns
nothing. The view is defined at `00221`, redefined at `00281` and `00420`
(studio-scope + `scope` column), and W1a's own report lists "the
`people_directory` rebuild" under §5 "Out of W1a scope" — this wave does not
touch it, so **there is no new view for readers to satisfy**; the task's
premise for this step does not hold for W1a's actual scope. Recorded so the
absence is a stated fact, not a silently skipped check.

The only direct query against it is
`packages/supabase/src/hooks/use-people.ts:125,161`
(`supabase.from('people_directory').select('*')`, twice). Everything else the
earlier `grep -rl` turned up in `apps/designer-portal` (roster/desk/people
components, `people-derivation.ts`, `desk-derivation.ts`,
`roster-derivation.ts`) and in `packages/supabase` (`use-vendors.ts`,
`use-coordination.ts`, `use-clients.ts`) consumes that hook's typed rows or
mentions the view in comments/tests — none issues its own independent
`.from('people_directory')` query with a different column shape.

Since the view's SQL is unchanged and `database.types.ts` regenerates
byte-identical (§2), `people_directory`'s `Row` type in the generated types
is unchanged too, so every one of those readers is structurally unaffected
by this wave regardless of how many of them there are. Confirmed at the
type level:

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build \
    --filter @patina/supabase type-check
> @patina/supabase@0.0.1 type-check
> tsc --noEmit
(exit 0, no output)

$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build \
    --filter @patina/designer-portal type-check
> @patina/designer-portal@0.1.0 type-check
> tsc --noEmit
(exit 0, no output)
```

Both clean. No type break anywhere caused by the regenerated types (there is
none to cause one — §2's diff is empty).

---

## 6. Fresh look at the two newest commits (past the r4 fix log)

The r4 fix log's own findings are re-verified fixed above (block 3/13/14/15/
16/16B/25/27/30e all pass live). Two commits sit at HEAD, past even the r8
fix logs already in this directory, and I read both in full rather than only
citing their own fix-log write-ups:

- **`e0df228f9`** (r8 F1) — `assert_studio_contact_rule_route()` used to
  `RETURN NEW` at its very first line whenever `route_to_person_id IS NULL`,
  so a **routeless** rule (a plain "never text" with no reroute) skipped the
  subject-kind check entirely and `subject_type` could name the wrong kind of
  card. The fix moves a new subject test (`subject_type` must match the named
  card's `entity_kind`, or the `engagement` id must exist in
  `project_parties`) above the route's early return, and folds the subject's
  org resolution into that same lookup (`sc.organization_id` directly) rather
  than a second call to `studio_contact_org()` — verified those two are
  definitionally identical (`studio_contact_org(p) = SELECT organization_id
  FROM studio_contacts WHERE id = p`), so this is a pure refactor-in, not a
  behaviour change on the route leg. Test block 31 (live, passing) covers
  both crossings, both matching pairs, the UPDATE path, and both dangling
  subjects. No issue found.
- **`6541f1a8e`** (R4-M1/R4-M2) — the fold's `refusal` CTE now takes all four
  `opt_out_*` evidence columns only from a sibling row whose **status** is
  actually `opted_out` (a `CASE WHEN sms_consent_status = 'opted_out' THEN …
  END` per column), so a `granted` row's own consent paperwork can no longer
  be filed as if it were the refusal's words; and `sms` was added to
  `channels_allowed`/`channels_forbidden` as a **rule-only** token, deliberately
  kept out of `studio_contact_channels.channel_kind`'s own seven-name
  vocabulary (block 25f asserts inserting a channel row with
  `channel_kind = 'sms'` is refused). Read the SQL directly; the CASE guard is
  correctly total (covers all four columns symmetrically) and the ordering
  leg's tiebreak (`CASE WHEN sms_consent_status = 'opted_out' AND
  sms_consent_source IS NOT NULL THEN 0 ELSE 1 END`) is NULL-safe against
  `sms_consent_status`'s `NOT NULL DEFAULT 'not_asked'`. No issue found.

---

## Findings

None reach blocking or major. Two informational/process notes, not code
defects:

| id | severity | confidence | file | claim |
|---|---|---|---|---|
| F1 | minor | high | task instructions (this review) | Step (3)'s "assert the site access card is invisible outside the studio" names an object that does not exist anywhere in this schema — `project_site_access_cards` is explicitly out of W1a's scope per `w1a-report.md:1101-1107`. Confirmed via `information_schema.tables … ILIKE '%site_access%'` → 0 rows. Not a code gap; the instruction's premise doesn't hold for this wave. |
| F2 | minor | high | task instructions (this review) / `w1a-report.md:1104` | Step (5)'s "whether the new view still satisfies it" presumes W1a rebuilt `people_directory`. It did not — none of `00592`/`00593`/`00594` mention it, and the report itself lists that rebuild under "Out of W1a scope." The existing view, its one direct reader (`use-people.ts:125,161`) and every downstream consumer are unaffected by this wave (confirmed structurally: `database.types.ts` regenerates byte-identical, and both `@patina/supabase` and `@patina/designer-portal` type-check clean). |

No blocking or major findings survived this pass. Every prior-round finding
I could locate a regression test for (r1 through r9, r2r2, r3r2, r4, r6, r7,
r8, and the two HEAD commits past the last fix log) is currently green in a
live, from-scratch run — not a re-paste of an old transcript. RLS was
exercised with real fixtures across all three role shapes (studio member,
signed-in non-member, anon) and behaved exactly as documented. Both named
consent-gate failure cases were traced to their exact test bodies, read in
full, and reconfirmed passing.

## Clean

**Zero blocking, zero major → clean.**
