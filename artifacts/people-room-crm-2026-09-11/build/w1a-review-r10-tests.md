# W1a — round 10 review: tests, types, behaviour

Worktree `.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD `6ea4e052d` ("fix(consent): a fresh
consent dates itself, and the fold keeps the group's grant (r9 M1/M2)").
Local Supabase only throughout. No `supabase db push`, no
`supabase functions deploy`, nothing touched on Strata. The local stack was
this wave's sole occupant for the duration of this review; every probe ran
inside a `BEGIN … ROLLBACK` transaction or as an untracked scratch file
(`probe-gate-r10.test.ts`), removed afterward — `git status --short` on the
worktree is clean after this review.

**Verdict: CLEAN.** Zero blocking, zero major findings. Two minor
(informational) notes below, neither a defect in the shipped code.

---

## 0. Prior findings re-checked (fix-log r9, M1/M2)

Both re-verified as **FIXED**, in code and by test:

- **r9 M1** (`record_channel_reconsent` dated the fresh consent against the
  older grant's `consented_at`) — `00594_studio_channel_consent.sql:2000`
  (`consented_at = v_now` in the SET list, immediately above the five evidence
  columns). SQL test block 35 (`w1a_identity_channels_consent_test.sql:4594`)
  passed.
- **r9 M2** (the fold minted an empty consent set when the winning row was a
  sourceless refusal beside a fully evidenced grant) — the `grant_evidence` CTE
  is present at `00594_studio_channel_consent.sql:647-719`, hoisted off the
  single `refusal_words_are_its_own` definition shared with `refusal`
  (line 407). SQL test block 36 (line 4720) and 27i1b passed.

Both are exercised by the full test run in §1 below (blocks 35 and 36 are
"passed" in the transcript). No regression.

---

## 1. SQL tests — `supabase/tests/people/`

Only one file exists in that directory:
`w1a_identity_channels_consent_test.sql` (253 KB).

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
```

Exit code **0**. Every block from 1 through 36 (with sub-letters) printed
`passed`; the file's own final line is:

```
NOTICE:  36. the fold keeps the group's grant evidence when the winning row
carries none, and never invents one for a group that holds none (r9 M2): passed
NOTICE:  All W1a assertions passed.
```

`grep -c "NOTICE:"` on the run = **39** (38 assertion-block notices + the "All
W1a assertions passed" summary line) — matches the count the r9 fix-log
claimed after adding blocks 35/36. Transaction ended in a clean `ROLLBACK`, so
the local DB is unmodified by this run. No errors, no warnings, no unexpected
output.

---

## 2. Type regeneration — `packages/supabase/src/database.types.ts`

```
$ git -C .codex/worktrees/agent-people-build diff --stat packages/supabase/src/database.types.ts
(empty — before regen)

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir .codex/worktrees/agent-people-build db:generate
> supabase gen types typescript --db-url "$SUPABASE_DB_URL" > src/database.types.ts
(exit 0, no errors — only a "CLI update available" notice)

$ git -C .codex/worktrees/agent-people-build diff --stat packages/supabase/src/database.types.ts
(empty — after regen)
```

The builder had already regenerated and committed the types file for this
migration set; a fresh regen against the live local DB produces byte-identical
output. Clean.

---

## 3. Role probes (RLS) — designer, client, anon

Designer account `a0000000-0000-0000-0000-000000000004`
(`designer@patina.dev`) is `owner` of org `b0000000-0000-0000-0000-000000000001`
("Local Dev Studio"). Client account
`a0000000-0000-0000-0000-000000000005` (`client@patina.dev`) holds **zero**
`organization_members` rows anywhere in the seed data.

Fixture (superuser insert, rolled back): a person card + company card in
Local Dev Studio, one `studio_contact_channels` row, one
`studio_channel_consent` row (`granted`), one `studio_person_affiliations`
row, one `studio_contact_rules` row (forbids `sms`).

**As designer** (`SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims`
with the designer's `sub`): `count(*) = 1` on all four new tables for the
fixture rows. Membership-gated read works.

**As client** (same mechanism, client's `sub`, not a member of that org):
`count(*) = 0` on all four new tables — `studio_contact_channels`,
`studio_channel_consent`, `studio_person_affiliations`, `studio_contact_rules`
— and on the underlying `studio_contacts` row itself. Also attempted
`record_channel_consent(...)` as the client role: refused with
`not_a_studio_member` (the RPC's own membership check, confirming report
decision 5 — there is no INSERT/UPDATE/DELETE grant on `studio_channel_consent`
at all, so a portal write must go through the RPC, and the RPC itself
re-checks membership).

**As anon** (`SET LOCAL ROLE anon`, no JWT): every `SELECT` on
`studio_contact_channels`, `studio_channel_consent`,
`studio_person_affiliations`, `studio_contact_rules`, and `studio_contacts`
raised `permission denied for table …` (42501) — anon has no `GRANT` at all on
any of the five, not merely an RLS `USING (false)`. Confirms report decision 5
and the general posture: none of these five surfaces reach the client portal
or an unauthenticated caller.

**"Site access card" (PR-w ruling: "Studio-only table, no client RLS branch,
no `show_to_client` toggle")** — the card's underlying data
(`studio_contacts` designation columns + `studio_person_affiliations` +
`studio_contact_channels`) is confirmed invisible outside the studio at every
layer probed: 0 rows to the client account, permission-denied to anon. No
client-facing RLS branch and no `show_to_client`-style column exist on any of
the three new tables or the extended `studio_contacts` columns — verified by
reading every policy on the four new tables (`pg_policies`), all four of which
are `TO authenticated` only, gated by `is_active_studio_member(...)` /
`is_studio_comember(...)`.

---

## 4. Edge-function tests + gate-logic failure cases

```
$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared
ok | 420 passed | 0 failed (1s)

$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/_tests/sms-inbound.test.ts
ok | 42 passed | 0 failed (26ms)
```

Note: `supabase/functions/sms-inbound` itself carries no `*.test.ts` file
(`deno test … supabase/functions/sms-inbound` reports "No test modules
found" — expected, not a defect); its tests live at
`supabase/functions/_tests/sms-inbound.test.ts`, which is what was run above.
420 (`_shared`, includes `sms.test.ts`'s 38) + 42 (`sms-inbound.test.ts`) = 462
total; the r9 fix-log's own gate transcript reported 80 for the two files it
ran together (`sms.test.ts` + `sms-inbound.test.ts`) — 38 + 42 = 80, consistent.

**Constructed failure case 1 — a phone opted out in org A but granted in
org B.** Read `channelConsentVerdict()` (`supabase/functions/_shared/sms.ts:440-523`)
and `orgHasOptedOutParty()` (`sms.ts:355-378`): the org-scoped consent record
is read first (`org` resolved via `resolveProjectOrg`/`orgsOfProjects`,
never phone-globally), and the same-studio-only party-row backstop resolves
each opted-out party row's own studio via `orgsOfProjects` before comparing it
to the sending studio — so org A's opted-out record/party-rows cannot silence
org B's send, and vice versa. This is already covered by the shipped suite's
`"another studio's opt-out does not block this studio's send"`
(`sms.test.ts:548`), but I built an independent fixture and ran it directly
against the real `sms.ts` (not the shipped test file) as a check of the
review, not a repeat of it:
  - sending **for org B** (B's record `granted`, A's record `opted_out`,
    same phone) → **sent** (as expected — B's own record carries it).
  - sending **for org A** (same fixture) → **refused**, `reason: "opted_out"`
    (as expected — A's own record refuses regardless of B's grant).
Both passed on the current code. **No defect.**

**Constructed failure case 2 — a phone with no consent record but an
opted_out party row.** Built a fixture: no `studio_channel_consent` row at
all for org C; two `project_parties` rows on the number, one in org C
(`opted_out`) and the party actually being sent to (`granted`, so the party's
own status doesn't confound the studio-scoped fallback), also in org C for
one case and in a different org (D) for the control.
  - no record, C's own sibling row `opted_out`, sending in org C → **refused**,
    `reason: "opted_out"` (the `orgHasOptedOutParty` fail-closed fallback at
    `sms.ts:498-499` fires — matches the shipped test at `sms.test.ts:576`).
  - no record, the opted-out sibling belongs to org D instead, sending in org
    C → **sent** (R-AK: the fallback reduces across the studio's own
    projects only, matches `sms.test.ts:600`).
Both passed on the current code. **No defect.**

(Probe file `supabase/functions/_shared/probe-gate-r10.test.ts` was written,
run, and then deleted — it is not part of the shipped diff; `git status
--short` on the worktree confirms nothing was left behind.)

---

## 5. Readers of `people_directory` columns

`grep -rln "people_directory" apps packages` found 20 files (17 in
`apps/designer-portal`, one each in
`packages/supabase/src/hooks/{use-vendors,use-coordination,use-people,use-clients}.ts`,
plus the generated `database.types.ts`).

**Finding: none of them are affected by w1a, because `people_directory` does
not read from any table w1a touches.** `pg_get_viewdef('people_directory')`
shows the view is a five-way `UNION ALL` over `designer_clients`, `leads`,
`vendors`, `project_parties`, and team-membership rows — it never references
`studio_contacts`, `studio_contact_channels`, `studio_channel_consent`,
`studio_person_affiliations`, or `studio_contact_rules`. None of the three
w1a migrations (`00592`/`00593`/`00594`) contain a `CREATE VIEW` or
`CREATE OR REPLACE VIEW` statement at all — `people_directory`'s definition is
byte-for-byte what it was before this wave. The one touch w1a makes to a table
the view selects from is 00594's `COMMENT ON TABLE public.project_parties`
(a comment, no column/definition change) and the mirror trigger's writes to
`project_parties.sms_consent_status`/`sms_consented_at`/`sms_opt_out_at`/etc —
columns that already existed and that the view already selects
(`pp.sms_consent_status` at the view's `project_parties` leg) — so those
readers will, correctly and as intended, start seeing consent data the new
rail writes, not a schema break.

So every one of the 20 readers is unaffected structurally by this wave; the
type-check results in §6 (both clean) are the direct confirmation. This is
informational, not a finding against the wave — flagged only because the task
asked the question directly and "not applicable, here is why" is a real
answer that deserves the citation trail.

---

## 6. Type-checks

```
$ pnpm --dir .codex/worktrees/agent-people-build --filter @patina/supabase type-check
> tsc --noEmit
(exit 0, no output)

$ pnpm --dir .codex/worktrees/agent-people-build --filter @patina/designer-portal type-check
> tsc --noEmit
(exit 0, no output)
```

Both clean. No type breaks from the regenerated `database.types.ts` in either
package.

---

## Findings

| # | Severity | Confidence | File | Claim |
|---|---|---|---|---|
| F1 | minor (informational) | high | `supabase/tests/people/` | Only one SQL test file exists for the whole wave (`w1a_identity_channels_consent_test.sql`, 253 KB, 36 numbered blocks). Not a defect — the file is comprehensive and every block passed — but a single monolithic test file at this size is worth a splitting pass in a later wave for review/diff legibility. Not blocking; no ask in this round's brief to split it. |
| F2 | minor (informational) | high | `supabase/functions/sms-inbound/` | The task's literal instruction ("run `deno test` … on `supabase/functions/sms-inbound`") finds no test file there — sms-inbound's tests live at `supabase/functions/_tests/sms-inbound.test.ts`. Ran the actual file (42 passed/0 failed) as the intent was clearly "the sms-inbound edge-function tests." Flagging only so this isn't mistaken for coverage that doesn't exist. |

No blocking or major findings. `clean = true`.

## Commands run (for the record)

```
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
  -f supabase/tests/people/w1a_identity_channels_consent_test.sql

SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  pnpm --dir .codex/worktrees/agent-people-build db:generate
git -C .codex/worktrees/agent-people-build diff --stat packages/supabase/src/database.types.ts

# role probes: BEGIN; superuser inserts; SET LOCAL ROLE authenticated +
# SET LOCAL request.jwt.claims='{"sub":"<uid>","role":"authenticated"}';
# SELECT counts; SET LOCAL ROLE anon; SELECT counts; ROLLBACK.

deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared
deno test --allow-all --config supabase/functions/deno.json supabase/functions/_tests/sms-inbound.test.ts
deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared/probe-gate-r10.test.ts   # written, run, deleted

pnpm --dir .codex/worktrees/agent-people-build --filter @patina/supabase type-check
pnpm --dir .codex/worktrees/agent-people-build --filter @patina/designer-portal type-check
```
