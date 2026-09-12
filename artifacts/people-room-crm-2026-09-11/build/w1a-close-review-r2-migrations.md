# W1a close-out — adversarial migration review, round 2

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, HEAD `1fa758c3c`
("fix(consent): a STOP the record refused is not a STOP that landed, and one
studio answers for one seat"). Local stack only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). No `supabase db
push`, no `supabase functions deploy`, nothing touched on Strata. Every probe
ran inside `BEGIN … ROLLBACK`.

Inputs read in full: `rulings.md` (all sections, R-A..R-AS), `direction.md`
§2.2/§3.8/§7/§8, `crm-model.md` §1/§2/§4/§5, `current-state.md` §B–§E,
`build/inventory.md`, `briefing/fixture.md`, `build/w1a-report.md`,
`build/w1a-review-r10-tests.md`, `build/w1a-close-review-r1-migrations.md`,
`build/w1a-close-review-r1-tests.md`, `build/w1a-close-fix-log-r1.md`; and
`supabase/migrations/00592`, `00593`, `00594` line by line, plus
`_shared/sms.ts`, `sms-inbound/pipeline.ts`, `use-coordination.ts`,
`supabase/tests/people/w1a_identity_channels_consent_test.sql`.

**Verdict: NOT CLEAN — 0 BLOCKING, 2 MAJOR, 11 MINOR.**

Both MAJORs are in the consent verdict the room *prints*, and one of them was
introduced by the close-review r1 MAJOR-2 fix.

---

## 1. What I ran

### 1.1 `.env.local` check (required before any destructive local act)

The worktree carries no `apps/designer-portal/.env.local`; the main checkout's
points at local, and the reset script is unconditionally local:

```
$ grep -n "NEXT_PUBLIC_SUPABASE_URL" .../agent-people-build/apps/designer-portal/.env.local
ugrep: warning: …/apps/designer-portal/.env.local: No such file or directory
$ grep -n "NEXT_PUBLIC_SUPABASE_URL" /Users/kody/Code/patina-merged/apps/designer-portal/.env.local
1:# prod # NEXT_PUBLIC_SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co
19:NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
$ grep -n "supabase:reset" package.json
43:    "supabase:reset": "cd supabase && supabase db reset"
$ cat supabase/.temp/project-ref        # empty — no linked project in this worktree
```

### 1.2 Legacy grants

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2638 replayed statements
$ diff -u <before> supabase/seed/00-legacy-grants.sql
NO DIFF
```

The seed is in sync with the migrations as committed.

### 1.3 Reset, twice

```
$ pnpm --dir .../agent-people-build supabase:reset      # pass 1
548 "Applying migration" lines
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
EXIT=0

$ pnpm --dir .../agent-people-build supabase:reset      # pass 2
548 "Applying migration" lines
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
EXIT=0
```

Both clean on the first attempt. (Close-review r1's MINOR-8 flakiness did not
reproduce here; one caveat — the CLI must run unsandboxed, it writes
`~/.supabase/telemetry.json`.)

### 1.4 SQL tests

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
…
psql:…:4762: NOTICE:  37. the record is the single source: no mirror, the legacy columns frozen,
        both readers on channel_consent_status(), and org isolation through RLS (R-AS): passed
psql:…:4886: NOTICE:  38. one resolver for the seat's studio: reader and writer agree, and no view
        prints another studio's consent word (close-review r1 MAJOR-1): passed
psql:…:4886: NOTICE:  All W1a assertions passed.
ROLLBACK
EXIT=0        # 41 NOTICE lines
```

### 1.5 Deno, vitest, types

```
$ deno test --no-check -A --node-modules-dir=auto --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts
ok | 83 passed | 0 failed (96ms)

$ pnpm --dir .../agent-people-build --filter @patina/supabase test
 Test Files  100 passed (100)
      Tests  1250 passed | 12 skipped (1262)

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir .../agent-people-build db:generate
$ git diff --stat -- packages/supabase/src/database.types.ts
(no output — no drift)

$ pnpm --filter @patina/supabase type-check   → EXIT=0
$ pnpm --filter designer-portal type-check    → EXIT=0
```

### 1.6 My own probes

`build/probe30-close-r2.sql`, `build/probe31-close-r2b.sql`,
`build/probe32-close-r2c.sql` — objects, access and behaviour only, one
transaction each, ROLLBACKed; the ledger is never read or written.

---

## 2. Migration rules — pass/fail

| Rule | Verdict |
|---|---|
| hand-numbered `NNNNN_slug.sql` | PASS — 00592/00593/00594; no number minted this round; 00595–00620 untouched |
| grep-winner graft before redefining a function | PASS — `v_project_roster` from `00419:94-156`, `people_directory` from `00589:696-935`; `fc_dispatch_optin_invite` / `_site_request_consent_granted_dispatch` are **not** redefined at all (probe: `still_guarded = f` on both) |
| banner + lineage | PASS |
| idempotent | PASS — two clean resets; `CREATE TABLE IF NOT EXISTS` + re-stated `ALTER`/named-constraint DROP/ADD idiom; `DROP TRIGGER IF EXISTS` before every `CREATE TRIGGER`; the fold is `ON CONFLICT DO NOTHING` |
| RLS in the same file | PASS |
| explicit grants both directions + REVOKE FROM PUBLIC, anon on definer RPCs | PASS with one exception — `refuse_legacy_consent_write()` revokes `PUBLIC, anon` but not `authenticated` (MINOR-3, carried from r1). Probe 32 confirms `anon_exec = f` on all nine wave functions |
| SECURITY DEFINER pins `search_path` | PASS — probe 32: every definer carries `{search_path=public}` |
| schema-qualify extension fns | PASS — `gen_random_uuid()` is `pg_catalog` on PG13+, matching the rest of the tree |
| guarded crons | N/A — none added |
| CHECK over enum for new vocab | PASS — `company_kind`, `channel_kind`, `status`, `channels_allowed/forbidden`, consent `status`/`source`/`opt_out_source` all CHECKs |
| money integer cents | PASS — `retainage_bps integer`; no float money |
| regenerate `seed/00-legacy-grants.sql` | PASS — regenerated, no diff |
| RLS predicates: `is_active_studio_member(organization_id)` for the `studio_contacts` family | PASS — `studio_channel_consent` on `organization_id`; affiliations/channels/rules on `is_active_studio_member(studio_contact_org(...))` |
| `is_studio_comember(designer_id)` for the `project_parties` family | PASS — `studio_contact_rules`' engagement leg via `project_party_designer()` |
| site access card has NO client branch (PR-w) | PASS — this wave creates no site-access table and no client branch; `show_to_client` untouched |

### The single-source consent model, point by point

| Requirement | Verdict |
|---|---|
| no code path writes party `sms_consent_*` except the guarded legacy path | PASS for UPDATE. `refuse_legacy_consent_write_trg` is `BEFORE UPDATE OF` all eight columns; `grep -rn "UPDATE public.project_parties" supabase/migrations/*.sql` → `00281:142` (replays before the trigger exists), `00374:1266` (raises, documented), `00418:300,322` (`studio_contact_id` only). `useAddProjectParty`'s INSERT still writes the eight columns — disclosed in report §3 and deliberate |
| the send gate refuses on the record or on an org-scoped `opted_out` row | PASS — `_shared/sms.ts:480` (record `opted_out`), `:487` (`refusal_unanswered`), `:490`/`:499` (`orgHasOptedOutParty`, org-scoped, R-AK), `:451-457` (unresolved org refuses, R-AM), `:517-533` (phone-global record scan), `:535-549` (phone-global seat scan). Every read error returns `refuse` |
| START scope (R-AJ) | PASS — `pipeline.ts:732-735`: `studiosHoldingRecord(supabase, from, ["opted_out","pending"])` |
| evidence never nulled on the record | PASS — `00594:1747-1757` COALESCEs over `NULLIF(btrim(…),'')`; the four `opt_out_*` written only on a refusal and never by `record_channel_reconsent` |
| `v_project_roster` and `people_directory` read the record | PASS in *source*, FAIL in *verdict* — see MAJOR-2 |
| RLS / grants | PASS — probe 32 below |
| reset twice | PASS |

Probe 32, verbatim:

```
NOTICE:  alpha owner SELECT on alpha rows: 1 row(s)
NOTICE:  alpha owner channel_consent_status(): opted_out
NOTICE:  beta owner SELECT on alpha rows: 0 row(s)
NOTICE:  beta owner channel_consent_status() for alpha: <null>
NOTICE:  alpha GUEST SELECT on alpha rows: 0 row(s)
NOTICE:  alpha owner direct UPDATE: permission denied for table studio_channel_consent
NOTICE:  alpha owner direct INSERT: permission denied for table studio_channel_consent
NOTICE:  alpha owner direct DELETE: permission denied for table studio_channel_consent
NOTICE:  beta owner record_channel_consent into alpha: not_a_studio_member
NOTICE:  beta owner record_channel_reconsent into alpha: not_a_studio_member
NOTICE:  alpha GUEST record_channel_consent: not_a_studio_member
NOTICE:  alpha refusal intact after every attempt above: t

                proname                | anon_exec | auth_exec | svc_exec | prosecdef |      proconfig
---------------------------------------+-----------+-----------+----------+-----------+----------------------
 backfill_channel_consent_from_parties | f         | f         | t        | t         | {search_path=public}
 channel_consent_status                | f         | t         | t        | f         | {search_path=public}
 channel_value_was_on_sms_rail         | f         | f         | t        | f         | {search_path=public}
 normalize_channel_value               | f         | t         | t        | f         | {search_path=public}
 project_consent_org                   | f         | t         | t        | t         | {search_path=public}
 project_party_designer                | f         | t         | t        | t         | {search_path=public}
 record_channel_consent                | f         | t         | t        | t         | {search_path=public}
 record_channel_reconsent              | f         | t         | t        | t         | {search_path=public}
 studio_contact_org                    | f         | t         | t        | t         | {search_path=public}

          relname           | relrowsecurity | policies |                     relacl
----------------------------+----------------+----------+------------------------------------------------
 studio_channel_consent     | t              |        1 | …,service_role=arwdDxtm,authenticated=r
 studio_contact_channels    | t              |        4 | …,service_role=arwdDxtm,authenticated=arwd
 studio_contact_rules       | t              |        4 | …,service_role=arwdDxtm,authenticated=arwd
 studio_person_affiliations | t              |        4 | …,service_role=arwdDxtm,authenticated=arwd
```

No cross-tenant read or write. No RLS or grant hole.

---

## 3. Prior findings re-checked

### From `w1a-close-review-r1-migrations.md`

| ID | Status |
|---|---|
| BLOCKING-1 (STOP's record write unchecked) | **FIXED.** `pipeline.ts:496-506` destructures `error: writeError`, logs, sets `failed`, `continue`s; the STOP branch at `:694-716` answers 500 / `opt_out_incomplete` and clears `twilio_sid`. Deno test "a STOP whose consent-record WRITE fails is not acknowledged, and the retry completes it" is in the 83 |
| MAJOR-1 (three inlined `_primary_studio_for` copies) | **FIXED.** `public.project_consent_org(uuid)` at `00594:965-979`, SECURITY DEFINER, `search_path=public`, REVOKE PUBLIC+anon / GRANT authenticated+service_role; both views call it (`00594:1034-1043`, `:1236-1239`, `:1247-1250`); the `LEFT JOIN public.projects prj` is gone. SQL block 38 passes |
| MAJOR-2 (add-party leaves the room saying "Not asked") | **FIXED, AND IT INTRODUCED MAJOR-1 BELOW.** `use-coordination.ts:448-472` records a `pending` before the insert — which also demotes a standing `granted` |
| MAJOR-3 / F2 / F3 (raw Postgres error in the designer's face) | **PARTIALLY FIXED.** `asWrittenConsentError` / `asWrittenConsentRpcError` (`use-coordination.ts:550-581`) cover the freeze and four RPC errors; `consent_awaiting_recipient` is not mapped and is reachable — MINOR-8 below |
| MAJOR-4 (owed-work list) | **FIXED.** Report §5.1b names the four rails plus the iOS act; §8 opens "W1a MUST NOT SHIP ALONE" |
| MINOR-1 (the mint leg writes the grant's five on a refusal) | **OPEN** — probe 30 P3 |
| MINOR-2 (`inbound_sms` short-circuits the r10 date test) | **OPEN** — probe 31 P6 |
| MINOR-3 (`refuse_legacy_consent_write` keeps `authenticated` EXECUTE) | **OPEN** — probe 30 P3 |
| MINOR-4 (`p_origin_project_id` not checked against the org) | **OPEN** — `00594:1809` / `:2126` still `COALESCE(...)` with no org test |
| MINOR-5 (`people_directory.meta` mixes record verdict with seat dates) | **OPEN**, documented in report §5.3 |
| MINOR-6 (per-row consent subquery) | **OPEN, AND WORSE** — see MINOR-6 below |
| MINOR-7 (fold's group-wide flag not documented in §5.2) | **OPEN** — §5.2 still lists only the legacy `opted_out`-seat case |
| MINOR-8 (reset flakiness) | **NOT REPRODUCED** here; two clean passes first time |
| F1 (unattributable-send fail-open) | **OPEN by design** — still awaiting Fable's ruling, recorded in report §5.2/§8 |

### From `w1a-review-r10-*` and earlier

Spot-re-checked and still holding: r9 M1 (`consented_at = v_now` in
`record_channel_reconsent`, `00594:2120`), r9 M2 (`grant_evidence` CTE,
`00594:615-634`), r10 M1 (`refusal_words_are_its_own`, `00594:377-383`), r8
W4-M1/W4-M2, r7 M7-1/M7-2, r6 R6-M1/M2/M3, R-AG, R-AL, R-AN, R-AO, R-AP, R-AR.
SQL blocks 1–38 all pass.

---

## 4. Findings

### MAJOR-1 — adding a person to a second job DEMOTES the studio's standing consent, and refiles the grant's date under the new act's words

**Where:** `packages/supabase/src/hooks/use-coordination.ts:461-471`
(`useAddProjectParty`), landing on `supabase/migrations/00594_studio_channel_consent.sql:1690-1706`
(the `DO UPDATE` leg: `status = EXCLUDED.status` with no guard against a
downgrade, and `consented_at = CASE WHEN EXCLUDED.status = 'granted' … ELSE
scc.consented_at END`).

Since close-review r1's MAJOR-2 fix, every add with "text updates" ticked calls
`record_channel_consent(org, 'sms', phone, 'pending', …)` **unconditionally**.
The RPC's transition gate only refuses a move *out of* `opted_out`; a move from
`granted` down to `pending` passes every leg. So the one act the room performs
most often on a repeat sub overwrites the studio's recorded grant.

This is fixture F-11 verbatim — Dana Kowalski, "2025 Lindqvist consent carried
by phone", picked again for Okonkwo — and it is the case `_shared/sms.ts:404-410`
names as *the half of G-3 the per-party ledger cannot do*: "a seat created today
for a number the studio recorded a grant for in 2025 … without this branch the
send is refused as not_consented and the studio has to re-record a consent it
already holds."

Probe 30 P1 (`build/probe30-close-r2.sql`):

```
=== P1 BEFORE: the studio holds a recorded grant for this number ===
 status  | refusal_unanswered |         consented_at          | source  |             evidence              | disclosure_version
---------+--------------------+-------------------------------+---------+-----------------------------------+--------------------
 granted | f                  | 2026-09-12 09:02:41.042112+00 | written | Signed the Lindqvist kickoff form | field-sms-v1

=== P1 AFTER: the same record, once the party was added ===
 status  | refusal_unanswered | source |              evidence               | disclosure_version
---------+--------------------+--------+-------------------------------------+--------------------
 pending | f                  | verbal | Said yes at the Okonkwo walkthrough | field-sms-v1

=== P1: what the send gate would read, and what the room prints ===
 word_printed
--------------
 pending
```

Probe 31 P4, with the grant back-dated the way a real one is:

```
=== P4 BEFORE ===
 status  |      consented_at      | source  |             evidence              | disclosure_version |      recorded_at
---------+------------------------+---------+-----------------------------------+--------------------+------------------------
 granted | 2025-05-02 00:00:00+00 | written | Signed the Lindqvist kickoff form | field-sms-v3       | 2025-05-02 00:00:00+00

=== P4 AFTER: the grant date now stands under the pending act's words ===
 status  |      consented_at      | source |              evidence               | disclosure_version |          recorded_at
---------+------------------------+--------+-------------------------------------+--------------------+-------------------------------
 pending | 2025-05-02 00:00:00+00 | verbal | Said yes at the Okonkwo walkthrough | field-sms-v9       | 2026-09-12 09:03:30.536351+00
```

Three consequences, each independently a defect:

1. **The room prints the wrong word.** `channel_consent_status()` returns
   `pending`, so §3.8's Consent family prints **"Invited"** on
   `v_project_roster` and `people_directory` for a number the studio holds a
   recorded, evidenced grant for.
2. **Sending stops.** `channelConsentVerdict` (`_shared/sms.ts:487-492`) returns
   `"unknown"` instead of `"allow"`, so `studioGranted` is false
   (`sms.ts:810`), and `sms.ts:816-819` refuses every non-invite send with
   `not_consented` unless that *seat's* frozen column happens to read `granted`
   — which the newly inserted seat never does (it is born `pending`). The
   studio's own record is now less useful than the frozen seat it replaced.
3. **R-Q's sentence lies, and the 10DLC artifact is destroyed.** The five
   evidence columns describe the walkthrough while `consented_at` still names
   the 2025 written grant, so the sentence composes to *"Verbal consent, 2 May
   2025, on the Lindqvist kitchen."* — and `disclosure_version` v3, the
   disclosure the person was actually shown at that grant, is gone from the only
   copy there is. That is exactly the failure r6 R6-M1 closed in the RPC and
   r9 M1 closed in `record_channel_reconsent`, arriving through a third door.
   R-AG's "no write may empty the evidence set" is honoured; "no write may file
   one act's words under another act's date" is not.

**Fix:** the add path must not lower a standing verdict. Either (a) read the
record first and skip the call when it already says `granted` (and print
"Texting", not "Invited", for that seat — which is what §3.8 wants), or (b) gate
the RPC itself so `pending` may not be written over `granted`, and give the add
path a named door (`record_channel_invite`) that mints a `pending` only when
there is no standing grant. (a) alone leaves the RPC walkable by the next
caller; (b) is the durable one. No test covers this transition today — neither
`w1a_identity_channels_consent_test.sql` nor
`use-coordination-authority.test.ts:595-625`, which asserts only that the RPC is
called with those eight arguments.

---

### MAJOR-2 — the readers print `granted` for a record every send is refused on

**Where:** `supabase/migrations/00594_studio_channel_consent.sql:903-920`
(`channel_consent_status()` returns `scc.status` — `:913` — and nothing else),
consumed at `00594:1034-1043` (`v_project_roster`) and `00594:1236-1239` /
`:1247-1250` (`people_directory`); the writer is the fold at `00594:666`
(`refusal_unanswered = (f.org IS NOT NULL)`).

`refusal_unanswered` is a *verdict-bearing* fact — `_shared/sms.ts:487` refuses
every send on it, whatever the status says, and `00594:1836-1846` refuses every
studio-side write on it. The fold deliberately mints records where it is TRUE
while `status` is **`granted`** (the r8 W4-M1 shape, ruled at `00594:655-666`:
"the record is minted UNSENDABLE"). Nothing in the read path knows that.

Probe 30 P2:

```
=== P2: the record the fold mints for that group ===
 status  | refusal_unanswered |       opt_out_at
---------+--------------------+------------------------
 granted | t                  | 2025-11-16 00:00:00+00

=== P2: what v_project_roster and people_directory PRINT for that seat ===
 display_name | roster_word
--------------+-------------
 Pete Rusk    | granted

 display_name | directory_word | directory_meta_word
--------------+----------------+---------------------
 Pete Rusk    | granted        | granted
```

`granted` renders as **"Texting"** (`field-config.ts:175-180`, direction §3.8,
R-Q). So the Call Sheet and the Directory tell the designer this number is on
the rail while every `sendPartySms` to it returns `opted_out`, and
`record_channel_consent` refuses every verdict but `opted_out` so the studio
cannot even correct it. That is G-3 restored — *"one row can read 'Texting'
while the same phone is opted out"* (`current-state.md` §E G-3, `fixture.md`
F-12's note) — in the record that was built to end it. The same divergence
applies to a folded `pending` or `not_asked` winner with a refusing sibling.

It is also the *only* surface on which the standing refusal is visible at all:
`opt_out_at` and the four `opt_out_*` columns are on the record, but neither
reader prints them and `people_directory.meta.sms_opt_out_at` reads the frozen
seat (MINOR-5), not the record.

**Fix:** make the one reader carry the one verdict —
`channel_consent_status()` should return `'opted_out'` when
`refusal_unanswered` is true (the honest word: a refusal stands and has not been
answered), or return a distinct word the room can print, e.g. R-Q's "Opted out,
awaiting their reply". Patching the two views instead would put the rule in two
places, which is the thing R-AS exists to stop. Report §5.2 should then carry
the sentence close-review r1's MINOR-7 asked for.

---

### MINOR-1 — the mint leg of `record_channel_consent` still writes a refusal into the grant's five columns (carried, r1 MINOR-1)

`00594:1678` (the `VALUES` leg) writes `p_source, p_evidence, v_now,
p_disclosure_version, auth.uid()` unconditionally, while the header
(`00594:145-153`, `:1723-1727`) and the `DO UPDATE` leg (`:1747-1757`) both say
"A REFUSAL WRITES NONE OF THE CONSENT'S FIVE." Probe 30 P3:

```
  status   | source |      evidence      | recorded_at_set | consented_at | opt_out_source |  opt_out_evidence
-----------+--------+--------------------+-----------------+--------------+----------------+--------------------
 opted_out | verbal | He told me on site | t               |              | verbal         | He told me on site
```

Harmless while `consented_at` is NULL; the header asserts an invariant the code
does not hold.

### MINOR-2 — `inbound_sms` still short-circuits the r10 M1 date test (carried, r1 MINOR-2)

`00594:377-383`. A seat whose evidence describes a GRANT given by text, flipped
to `opted_out` by a later STOP, satisfies the first disjunct and skips the date
comparison. Probe 31 P6:

```
  status   |       opt_out_at       | opt_out_source | opt_out_evidence |  opt_out_recorded_at   | opt_out_recorded_by_set
-----------+------------------------+----------------+------------------+------------------------+-------------------------
 opted_out | 2025-12-03 00:00:00+00 | inbound_sms    | Inbound YES      | 2025-03-01 00:00:00+00 | t
```

The refusal is minted holding the grant's words, a `recorded_at` nine months
before it, and a studio member as `opt_out_recorded_by` — the attribution
r7 R7-M1 / r9 R5-M2 ruled must be NULL on a rail-written STOP. Still not
reachable from any shipped writer (no writer puts `inbound_sms` on a party row),
but the fold is one-shot and the record is the only copy.

### MINOR-3 — `refuse_legacy_consent_write()` is the one wave guard that keeps EXECUTE for `authenticated` (carried, r1 MINOR-3)

`00594:862`. Probe 30 P3:

```
 refuse_legacy_consent_write           | f (invoker) | {postgres=X,authenticated=X,service_role=X}
 assert_studio_contact_identity_stable | t           | {postgres=X,service_role=X}
 assert_channel_owner_kind             | t           | {postgres=X,service_role=X}
```

Every sibling guard (`00592:236`, `:423`, `:976`; `00593:310`, `:587`) revokes
`authenticated` too. Harmless; inconsistent, and the legacy-grants generator
will replay it forever.

### MINOR-4 — neither RPC checks `p_origin_project_id` against the org (carried, r1 MINOR-4)

`00594:1809`, `00594:2126`. A member may stamp another studio's project id onto
their own record; R-Q's sentence then names a job that is not theirs. Not a leak
(`projects` RLS still hides the name).

### MINOR-5 — `people_directory.meta` mixes the record's verdict with the seat's dates (carried, r1 MINOR-5)

`00594:1247-1256`: `meta.sms_consent_status` reads the record,
`meta.sms_consented_at` / `meta.sms_opt_out_at` read the frozen seat.
Acknowledged in report §5.3 and owed to W1b. No UI consumer today.

### MINOR-6 — the consent word now costs a NON-INLINABLE function call per row, twice on the Directory (carried and worsened, r1 MINOR-6)

`00594:1041` (once per roster row) and `00594:1238`, `:1249` (twice per directory
party row). The r1 MAJOR-1 fix replaced an inlined subquery — which the planner
could flatten — with `project_consent_org()`, a **SECURITY DEFINER** SQL
function, which PostgreSQL will not inline; each call does a `projects` lookup
plus `_primary_studio_for()` (itself `organization_members × organizations`),
and `channel_consent_status()` then does the consent lookup. Correctness first —
MAJOR-1's fix was right — but PR-y ships the rebuilt `people_directory` at 100%
with no flag (rulings §6), so an `EXPLAIN ANALYZE` on a studio-sized dataset
belongs in the pre-deploy gate, and the two identical calls per directory row
are worth collapsing into one `LATERAL`.

### MINOR-7 — report §5.2 still does not name the fold's cross-seat `refusal_unanswered` cost (carried, r1 MINOR-7)

`00594:666` + `:570-574`. A studio holding a 2025 refusal on one seat and a
genuine 2026 re-grant on a *different* seat folds to a record that is
permanently unsendable until the recipient texts START. Fails closed, which is
right; §5.2 lists only the legacy `opted_out`-seat case. (With MAJOR-2 unfixed
this population is also the one that prints "Texting".)

### MINOR-8 — `consent_awaiting_recipient` reaches the designer as a raw Postgres string, and takes the whole add with it

`packages/supabase/src/hooks/use-coordination.ts:559-581`.
`asWrittenConsentRpcError` maps `channel_opted_out`, `invalid_channel_value`,
`not_a_studio_member` and `consent_evidence_required`.
`record_channel_consent` also raises `consent_awaiting_recipient`
(`00594:1912-1916`) and `consent_not_recordable`; the first is reachable from
`useAddProjectParty` on exactly the records the first prod fold mints (a
`granted`/`pending` record carrying `refusal_unanswered`), so the party sheet
renders the raw string at `party-profile-sheet.tsx:490` — the defect MAJOR-3
fixed for the other two writers. Worse than cosmetic: the add-party act fails
entirely, so the designer cannot put that person on the roster at all.

### MINOR-9 — an unparseable phone gets a consent record under a key no reader uses

`00593:150-175` (`normalize_channel_value` falls back to trimmed raw text for
phone kinds) + `00594:1512-1515` (the RPC only refuses NULL). A studio marking
such a number `opted_out` gets a success and a record keyed on the raw string,
while both readers and the send gate key on `project_parties.phone_e164`, which
`00281`'s normaliser leaves NULL for the same input. Inert today — a seat with a
NULL `phone_e164` cannot be sent to (`sms.ts:796-798` returns `no_phone_number`)
— but the RPC reports a refusal recorded that nothing can read.

### MINOR-10 — `resolveRecipient`'s phone-only branch still reduces consent phone-globally in the POSITIVE direction

`_shared/sms.ts:569-582`. `reduceConsent` (`:181-189`) returns `granted` if ANY
party row on the number says so, across every tenant, and `sms.ts:816-819` lets
that authorise a non-invite send when `channelConsentVerdict` answered
`unknown`. `flushDeferredMessages` was explicitly narrowed for exactly this
(`:1102-1112`: "an unrelated studio's granted row carried a send for a studio
that had never obtained consent at all … R-AK"); `resolveRecipient` was not.
Unreachable today — both live callers pass a `partyId`
(`sms-dispatch/index.ts:82`, `:360-365`; `site-request-dispatch/index.ts:154-160`)
— and unchanged from `origin/main`, so it is latent, not live. It should be
narrowed the way the flush was, or the branch removed with PR-x.

### MINOR-11 — no test covers the `pending`-over-`granted` transition

Neither `supabase/tests/people/w1a_identity_channels_consent_test.sql` (blocks
1–38; the only mention of the shape is a comment at `:2482`) nor
`packages/supabase/src/hooks/__tests__/use-coordination-authority.test.ts:595-625`
(which asserts the RPC arguments and the insert order, not the record's
resulting status) exercises MAJOR-1. Any fix needs a block that records
`granted`, runs the add-party call, and asserts the record still reads
`granted` with its own evidence intact.

---

## 5. Things I checked that are clean (so the next round need not re-walk them)

- **No cross-tenant read or write, no RLS or grant hole** — probe 32 above, in
  full. `studio_channel_consent` is `authenticated=r` with one member-only
  SELECT policy; both RPCs refuse a non-member and a guest; a Beta owner reads
  `<null>` through `channel_consent_status()` for an Alpha org id; the standing
  refusal survives every attempt byte for byte.
- **The mirror is really gone** — `mirror_channel_consent_to_parties` exists as
  neither function nor trigger; `fc_dispatch_optin_invite` and
  `_site_request_consent_granted_dispatch` carry their shipped bodies with no
  suppression guard; `patina.suppress_consent_dispatch` is read by nothing.
- **The freeze holds** — `refuse_legacy_consent_write_trg` is `BEFORE UPDATE OF`
  the eight columns, compares OLD/NEW as a tuple so a restatement writes, and
  opens only on `app.consent_legacy_write = 'on'`. SQL block 13 passes.
- **One resolver** — `project_consent_org()` is the only org expression in both
  views and agrees with the fold (`00594:384`), the RPC's seat gate
  (`00594:1585`, `:1861`, `:1902`) and the rail (`_shared/sms.ts` `resolveProjectOrg` /
  `orgsOfProjects`). Block 38 passes; I re-ran it.
- **Idempotency and replay** — two clean 548-migration resets; the fold is
  `ON CONFLICT DO NOTHING` and re-running it writes nothing to a party row
  (probe 30/31 both re-ran it against existing records).
- **The refusal's own evidence set** — never written by `record_channel_reconsent`
  (`00594:2115-2126` names none of the four), never overwritten by a
  studio-sourced refusal over an `inbound_sms` one (`00594:1778-1808`), and the
  record keeps the earliest `opt_out_at` (`LEAST`, `00594:1704-1707`).
- **R-AI / R-AO / R-AP / R-AR / R-AJ / R-AK / R-AL / R-AM / R-AN** all behave as
  the report describes; blocks 1–3, 12, 19–21, 26–31, 35–37 pass.
- **PR-w** — no site-access table, no client RLS branch, no `show_to_client`
  change in this wave.
- **Generated types, vitest, Deno, both type-checks** — all green, no drift.

---

## 6. What would make this clean

1. Stop `useAddProjectParty` lowering a standing `granted`, and close the
   downgrade in `record_channel_consent` itself so the next caller cannot
   reopen it — with a SQL block and a vitest case (MAJOR-1, MINOR-11).
2. Make `channel_consent_status()` answer for `refusal_unanswered`, so the one
   reader and the send gate cannot disagree about whether a refusal stands
   (MAJOR-2).
3. The eleven MINORs are cheap and can ride the same round; MINOR-2 first,
   because the fold is one-shot over real data, and MINOR-8 because it is the
   same class MAJOR-3 was raised for.
