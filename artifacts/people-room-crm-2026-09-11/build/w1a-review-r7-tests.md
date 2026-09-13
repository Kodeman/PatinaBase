# W1a — adversarial review, round 7 (tests, types, behaviour) — RE-RUN

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`. Local Supabase only — no
`supabase db push`, no `supabase functions deploy`, no Strata contact. This
review makes no writes to any table outside its own rolled-back transactions.

**A file with this exact name already exists** (dated 11 Sep 21:39, ending at
SQL-test block 28). This is a fresh, independent re-run of the same brief,
taken against the CURRENT branch tip, which now carries six more test blocks
than that file saw (29–34: r8 R8-M1/R8-M2, r2 R2-M1, r4 R4-M1, r8 F1, and the
r6 "second pass" R6-M1/R6-M2/R6-M3 — all visible in today's NOTICE output
below). Nothing here contradicts that file's verdict; this supersedes it as
the current-state record. `ls apps/*/.env.local` → no matches (checked before
touching the DB).

**Verdict: clean.** Zero blocking, zero major findings. Two informational
notes (not defects) below, both about the review brief's own premises rather
than about the code.

---

## 1. SQL tests — `supabase/tests/people/`

Only one file exists there: `w1a_identity_channels_consent_test.sql`.

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
NOTICE:  25. the channel vocabulary is checked, both ways (r6 M6-5), and carries
         the rule-only `sms` token so "phone yes, text no" is writable (r4 R4-M2): passed
NOTICE:  26. no studio-side verdict lowers refusal_unanswered (r7 M7-1): passed
NOTICE:  27. reconsent is evidence-only and re-callable (r7 M7-2), leaves the
         refusal's own evidence standing (r8 W4-M2), the seat carries the
         refusal's own words too (r9 R5-M1), a sourceless refusal is never
         given the studio's consent as its words (r6 R6-M1) — nor left
         standing on the sibling seat (r8 R8-M1) — and a mirrored refusal
         never lends the seat the GRANT's recorder, words or date (r9 R5-M2): passed
NOTICE:  28. a studio-recorded refusal never speaks for a texted one, and the
         refusal keeps the date it arrived (r7 R7-M1): passed
NOTICE:  29. a held card cannot change what it is or whose it is — including
         the card a contact rule is filed against (r8 R8-M2, R-AR; r9 R5-M1): passed
NOTICE:  30. the fold picks the sibling that HOLDS the refusal, so a dateless
         portal refusal never erases the STOP's date or words — on the record
         or on the seats (r2 R2-M1): passed
NOTICE:  30e. a grant's paperwork is never filed as the refusal's own words,
         and the wordless refusal reaches both seats (r4 R4-M1): passed
NOTICE:  31. a rule is filed under the noun its subject actually is (r8 F1): passed
NOTICE:  32. a recorded refusal never speaks for the grant it stands beside (r6 R6-M1): passed
NOTICE:  33. a blank evidence field cannot empty the evidence set (r6 R6-M2): passed
NOTICE:  34. an email refusal is recoverable by a fresh recorded consent and an
         SMS one is not (r6 R6-M3): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
```

Zero `ERROR` lines anywhere in the output; the file's own final act is
`ROLLBACK`, so this run left no residue. **34 blocks, 0 failures.**

---

## 2. `db:generate` — generated-types diff

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build db:generate
[…]
Connecting to db 5432
$ git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build diff --stat \
    packages/supabase/src/database.types.ts
(no output)
```

`db:generate` needed the sandbox lifted once — the CLI's Docker-daemon
inspection call hits `unix:///Users/kody/.docker/run/docker.sock`, which the
default Bash sandbox denies (`permission denied`, not a real failure); with
the sandbox lifted it connected and regenerated cleanly. Empty diff on the
committed file confirms the builder regenerated after their most recent
migration edit — nothing here is stale.

---

## 3. Role probes — designer / client / anon

Fixture (written as `postgres`, inside a transaction rolled back at the end):
two `studio_contacts` cards, one channel, one rule and one `studio_channel_consent`
row each in **Local Dev Studio** (`b0000000-0000-0000-0000-000000000001`,
`designer@patina.dev`'s studio, found via `organization_members` — the
account itself is `a0000000-0000-0000-0000-000000000004` in
`supabase/seed/dev-accounts.sql:14`) and in a **stranger studio**
(`27375349-1b2d-4b90-9be3-67c16480f115`, "Studio Manager" — the designer
holds no membership there).

```sql
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
SELECT set_config('request.jwt.claim.sub', 'a0000000-...-000004', true);
```

**Designer (in Local Dev Studio):**

```
=== designer: studio_contact_channels visible ===
 id: 22222222-...-201 | owner_id: 11111111-...-101 | value: +16125551201    (1 row — own studio's card only)

=== designer: studio_contact_rules visible ===
 id: 33333333-...-301 | subject_id: 11111111-...-101                        (1 row — own studio's card only)

=== designer: studio_channel_consent visible ===
 organization_id: b0000000-...-0001 | channel_value: +16125559999 | status: opted_out   (1 row — own studio's record only)
```

The stranger studio's card/channel/rule/consent row (same phone number on the
consent table, deliberately, to test the PK's tenant scoping) never appears.
Matches the SQL-suite's own block 1/12/21/24 assertions and the report's
decision 3 (card-owned RLS through `studio_contact_org()` /
`is_active_studio_member`).

**Client (`a0000000-...-000005`, `client@patina.dev`, zero `organization_members`
rows — confirmed by direct query before the probe):**

```
=== client: studio_contact_channels visible (expect 0) === → 0
=== client: studio_contact_rules visible (expect 0) === → 0
=== client: studio_person_affiliations visible (expect 0) === → 0
=== client: studio_channel_consent visible (expect 0) === → 0
```

All four tables: zero rows for a signed-in user with no studio membership at
all — the RLS resolver correctly reads "not yours" rather than leaking any
row shaped like "no studio" would.

**Anon:**

```
SET ROLE anon;
anon refused with insufficient_privilege on studio_contact_channels (expected)
anon refused with insufficient_privilege on studio_channel_consent (expected)
anon refused with insufficient_privilege on studio_contact_rules (expected)
anon refused with insufficient_privilege on studio_person_affiliations (expected)
```

`anon` holds **no grant at all** on any of the four tables
(`information_schema.role_table_grants` returns zero rows for
`grantee = 'anon'` on `studio_channel_consent`, `studio_contact_channels`,
`studio_contact_rules`, `studio_person_affiliations`) — refusal happens at the
privilege layer before RLS is even consulted, which is a stronger guarantee
than "RLS returns zero rows."

**INFORMATIONAL (not a defect) — the brief's item (3) names an object that
does not exist in this wave.** "Assert the site access card is invisible
outside the studio" presumes a `project_site_access_cards` (or similarly
named "site access card") object. It does not exist anywhere in the schema:

```sql
SELECT table_name FROM information_schema.tables
 WHERE table_schema='public' AND table_name = 'project_site_access_cards';
-- 0 rows
```

`w1a-report.md:1104` lists `project_site_access_cards` explicitly under
"Out of W1a scope by instruction" — it is a **future wave's** object, not
something this wave shipped and could have gotten wrong. There is nothing in
W1a to probe for this assertion; the closest analogue, `studio_channel_consent`
(the room's only new per-tenant "who may reach this contact and how" fact),
is probed above and correctly invisible outside the owning studio. Flagging
this so the next review round does not keep re-asking W1a to prove a property
of a table that belongs to a different wave.

---

## 4. Deno tests — `_shared` and `sms-inbound`

```
$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared
ok | 418 passed | 0 failed (1s)
```

The literal command in the brief for the second target —
`deno test --allow-all --config supabase/functions/deno.json supabase/functions/sms-inbound`
— reports:

```
error: No test modules found
```

This is expected, not a failure: `supabase/functions/sms-inbound/` (the
deployable itself) holds no `*.test.ts`; its suite lives at
`supabase/functions/_tests/sms-inbound.test.ts` (`w1a-report.md:880-882`
documents the same). Running the actual suite:

```
$ deno test --allow-all --config supabase/functions/deno.json \
    supabase/functions/_tests/sms-inbound.test.ts
ok | 35 passed | 0 failed (26ms)
```

453 tests total across the two suites, 0 failures.

### Constructed failure cases (the gate logic in `_shared/sms.ts`'s `channelConsentVerdict()`)

**Case A — a phone opted out in org A, granted in org B.** Read the gate
(`_shared/sms.ts:440-499`): the record is keyed
`(organization_id, channel_kind, channel_value)`, and `orgHasOptedOutParty()`
(`:355-381`) scans `project_parties` for that phone **filtered to the
resolving org** (`orgs.get(id) === org`). So a send attributed to org B reads
only org B's own record and org B's own party rows — org A's `opted_out`
record is invisible to it. **By design (R-AK):** the send for org B is
**allowed**. Ran the exact scenario as an isolated test
(`sms.test.ts:548`, `"another studio's opt-out does not block this studio's send"`):

```
$ deno test --allow-all --config supabase/functions/deno.json \
    --filter "another studio's opt-out does not block this studio's send" \
    supabase/functions/_shared/sms.test.ts
another studio's opt-out does not block this studio's send ... ok (19ms)
ok | 1 passed | 0 failed | 35 filtered out
```

Confirmed: org B's send goes out (`sms_outbound_sent` logged), org A's
refusal never crosses the tenant boundary. This is the exact fix G-3 exists
for, and it holds.

**Case B — a phone with no consent record, but an opted_out `project_parties`
row.** The brief's wording is ambiguous about which studio the opted-out
party row belongs to, so both shapes were checked — this is the load-bearing
distinction the code (and R-AK) draws:

*Same-studio opted-out row, no record* (`sms.test.ts:576`):
```
with no studio record, an opted-out sibling party row in the SAME studio still blocks (fail closed) ... ok (9ms)
```
Refused — `reason: "opted_out"`. This is the PR-x fail-closed fallback that
covers the gap before the Strata backfill runs.

*Different-studio opted-out row, no record* (`sms.test.ts:600`):
```
with no studio record, ANOTHER studio's opted-out party row does not block ... ok (19ms)
```
Allowed. An unrelated studio's STOP is not this studio's fact, by the same
R-AK reasoning as Case A.

Both shapes are asserted in the existing suite and both pass on the current
tip; independently re-running them in isolation (above) reproduces the same
verdicts against the live `_shared/sms.ts`, not against a stale snapshot. No
gap found: the two constructed cases land exactly where the report's decision
13 (R-AK) says they should, and the code matches the doc.

---

## 5. Readers of `people_directory` — `apps/` and `packages/`

```
$ grep -rln "people_directory" \
    /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build/apps \
    /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build/packages
```

25 hits (TS/TSX readers, one Swift service under `apps/mobile/Capture` that
reaches the same-named table via a different client and is out of scope for
this SQL view): `desk-reconnect.tsx`, `brief-section.tsx`,
`roster/roster-row.tsx` (+2 test files), `roster/call-sheet-mount.tsx` (+1
test), `overlays/household-sheet.tsx`, `people/person-bits.tsx`,
`people/directory/makers-marketplace.tsx`, `people/party-profile-sheet.tsx`,
`people/profile/maker-profile.tsx`, `people/views/directory-view.tsx`,
`people/outreach/audience-rules.ts`,
`lib/document/{people,desk,roster}-derivation.ts` (+1 test),
`database.types.ts`, and `hooks/{use-vendors,use-coordination,use-people,use-clients}.ts`.

**None of W1a's three migrations touch `people_directory`:**

```
$ grep -ln "people_directory" \
    supabase/migrations/00592_people_cards_affiliations_rules.sql \
    supabase/migrations/00593_studio_contact_channels.sql \
    supabase/migrations/00594_studio_channel_consent.sql
(no output)

$ grep -rn "CREATE OR REPLACE VIEW public.people_directory" supabase/migrations/*.sql | tail -3
00478_people_directory_has_sent_proposal.sql:139:CREATE OR REPLACE VIEW public.people_directory
00583_lead_contact_phone.sql:390:CREATE OR REPLACE VIEW public.people_directory
00589_return_to_lead_hardening.sql:696:CREATE OR REPLACE VIEW public.people_directory
```

The view's live head is `00589`, three migrations before this wave's `00591`
base. Its column list is unchanged
(`person_id, role, display_name, email, phone, profile_id, project_id,
designer_id, status_raw, last_touch_at, meta, scope`). Every one of the 25
readers above is satisfied exactly as before — W1a does not touch this
surface. **Corroborated by the type-checks**, which is the second line of
evidence the brief asked for, not just a grep-level claim:

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build \
    --filter @patina/supabase type-check
> tsc --noEmit
(clean — no errors)

$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build \
    --filter @patina/designer-portal type-check
> tsc --noEmit
(clean — no errors)
```

Both packages compile clean against the regenerated types. **No type break
caused by the regenerated types** — there is nothing to attribute to a
file:line, because the diff in §2 is empty and both gates are green.
`people_directory`'s own out-of-scope status (§0 informational, and
`w1a-report.md:1104`) means this section is a clean bill by construction, not
a coincidence: the rebuild is deferred to a later wave, so today there is
nothing for these 25 readers to break against.

**INFORMATIONAL (not a defect) — second note on scope.** The brief asks
whether "the new view still satisfies" these readers. There is no new view:
`people_directory` is unchanged, and W1a's new objects
(`studio_contact_channels`, `studio_contact_rules`, `studio_person_affiliations`,
`studio_channel_consent`) are not read by any hook or component yet
(`w1a-report.md`'s own §5, "No portal hook or UI" — confirmed independently:
none of the 25 `people_directory` readers reference any of the four new
table names). The question the brief poses will become live only when a
later wave rebuilds the view or wires a hook to the new tables; today it has
no object to be asked of.

---

## 6. Prior findings — re-checked

The brief names `w1a-fix-log-r6.md` as the prior fix log to re-check. Its
three logged rounds are **B6-1/M6-1…M6-5** (six findings), a **R6-M1/R6-M2**
pair (labelled "second pass, quoted numbering"), and a further **second-pass
R6-M1/R6-M2/R6-M3** (the file's third section, driven by
`w1a-review-r6-migrations.md` §2). All are closed and stayed closed on this
re-run:

| Finding | Disposition | Evidence this round |
|---|---|---|
| B6-1 (pending an ungated first hop) | Fixed, holds | block 22 passed |
| M6-1 (seat test failed open, dateless) | Fixed, holds | block 22 passed |
| M6-2 (mirror nulled a dated refusal) | Fixed, holds | block 23 passed |
| M6-3 (send rail blind to `refusal_unanswered`) | Fixed, holds | `_shared/sms.test.ts` (in the 418) |
| M6-4 (`route_to_person_id` unguarded) | Fixed, holds | block 24 passed |
| M6-5 (channel vocab unchecked) | Fixed, holds | block 25 passed |
| R6-M1 (mirror wrote NULL over a dated refusal — appended pair) | Fixed, holds | block 27 (27i–27i5) passed |
| R6-M2 (fold dropped the refusal's own date — appended pair) | Fixed, holds | block 3 (3c6) passed |
| R6-M1 (refusal borrowed the grant's evidence — second pass) | Fixed, holds | block 32 passed |
| R6-M2 (blank string laundered evidence — second pass) | Fixed, holds | block 33 passed |
| R6-M3 (no way back on any channel — second pass) | Fixed, holds | block 34 passed |

No prior finding reopened. Blocks 29–31 and 30e (r8 R8-M1/R8-M2, r9 R5-M1/R5-M2,
r2 R2-M1, r4 R4-M1, r8 F1) postdate `w1a-fix-log-r6.md` and are not in its
scope to re-check, but they pass today as well — nothing regressed between
that log and this tip.

No new blocking or major finding surfaced in this round's fresh look at (1)
SQL tests, (2) generated types, (3) role-based RLS/privilege behaviour, (4)
edge-function tests and the two constructed consent-gate failure cases, or
(5) `people_directory` readers and the two named type-checks.

---

## Findings

**Blocking:** none.
**Major:** none.
**Minor:** none newly opened by this round.

**Informational (not defects, for the next round's context):**

1. §3 — the brief's item (3) asks to assert a "site access card" is invisible
   outside the studio. No such object (`project_site_access_cards` or
   equivalent) exists anywhere in the schema; `w1a-report.md:1104` lists it
   as explicitly out of W1a's scope, owned by a later wave. There is nothing
   in this wave to probe for that specific assertion. `studio_channel_consent`
   — the closest analogous per-tenant fact this wave does ship — was probed
   instead and is correctly invisible outside the owning studio (privilege
   layer, not just RLS: `anon` holds zero grants; a client with no studio
   membership sees zero rows; a stranger studio's record is invisible to a
   studio member of a different org).
2. §5 — the brief asks whether "the new view" (i.e., a rebuilt
   `people_directory`) still satisfies its 25 readers. `people_directory` is
   unmodified by this wave (last touched at `00589`, three migrations before
   this wave's `00591` base) and none of its readers reference any of W1a's
   four new tables — the rebuild is explicitly deferred
   (`w1a-report.md:1104`). Confirmed by grep and corroborated by two clean
   `tsc --noEmit` runs (`@patina/supabase`, `@patina/designer-portal`), so
   this is closed with two independent kinds of evidence, not one.
