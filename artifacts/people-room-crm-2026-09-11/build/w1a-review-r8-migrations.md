# W1a — adversarial migration review, round 8

Scope: `supabase/migrations/00592_people_cards_affiliations_rules.sql`,
`00593_studio_contact_channels.sql`, `00594_studio_channel_consent.sql`, the
functions they redefine, `supabase/tests/people/w1a_identity_channels_consent_test.sql`,
and the edge-rail files the report names (`_shared/sms.ts`,
`sms-inbound/pipeline.ts`) where they bear on the migration contract.

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, tip `3ddd0ddc4`. Local stack only —
no `supabase db push`, no `functions deploy`, nothing touched Strata.

**Verdict: NOT CLEAN.** Two MAJOR, seven minor. Nothing blocking: no finding
below opens a send that a STOP should have stopped.

(The previous file at this path was the earlier round-8 review, from 2026-09-11
22:12, three rounds behind the tip; it is preserved as
`w1a-review-r8-migrations.prior.md`.)

---

## 0. What I ran

```
$ pnpm --dir …/agent-people-build supabase:reset
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

(First attempt failed under the tool sandbox — `EPERM … /Users/kody/.supabase/telemetry.json`.
Re-run with the sandbox disabled for that one command; nothing else needed it
except `psql`/`pnpm` writes to the same CLI state.)

`apps/designer-portal/.env.local` does not exist in this worktree, so the
pre-reset prod-pointer check is vacuously safe.

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
…
NOTICE:  30. the fold picks the sibling that HOLDS the refusal … : passed
NOTICE:  30e. a grant's paperwork is never filed as the refusal's own words, and the
         wordless refusal reaches both seats (r4 R4-M1): passed
NOTICE:  31. a rule is filed under the noun its subject actually is (r8 F1): passed
NOTICE:  32. a recorded refusal never speaks for the grant it stands beside (r6 R6-M1): passed
NOTICE:  33. a blank evidence field cannot empty the evidence set (r6 R6-M2): passed
NOTICE:  34. an email refusal is recoverable by a fresh recorded consent and an SMS one is not (r6 R6-M3): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
```

36 notices, last block 34. (The report's §3 says "31 blocks … 30 notices" — see M2.)

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2633 replayed statements
$ git diff --stat supabase/seed/00-legacy-grants.sql
(empty)

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate
$ git diff --stat packages/supabase/src/database.types.ts
(empty)

$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts
ok | 78 passed | 0 failed (109ms)
```

Idempotent rerun, each file replayed against the already-migrated database
inside a rolled-back transaction:

```
 rerun 00592_people_cards_affiliations_rules ok
 rerun 00593_studio_contact_channels ok
 rerun 00594_studio_channel_consent ok
```

Numbering: head before this wave is `00591`; `00592`–`00594` are held by this
branch and its origin mirror only (scanned every local and remote ref).

---

## 1. Prior round re-checked (w1a-fix-log-r7.md)

| Prior finding | State | Evidence |
|---|---|---|
| M7-1 — a `granted`-on-`granted` call lowered `refusal_unanswered` | **FIXED for SMS**, deliberately amended for email | `00594:1411-1444`: the `OR scc.status='granted'` escape is gone; `refusal_unanswered = CASE WHEN EXCLUDED.status='opted_out' THEN true WHEN EXCLUDED.channel_kind='email' AND EXCLUDED.status='granted' THEN false ELSE scc.refusal_unanswered END`. The email arm is a LATER change (r6 R6-M3) that the report never records — see M2. SQL block 26 passes. |
| M7-2 — `record_channel_reconsent()` landed on a status nothing could move | **FIXED** | `00594:1793-1828` — `SET status='opted_out'`, `refusal_unanswered = true`, no `opt_out_*` in the SET list, gate in the `WHERE`. Block 27 passes. |
| R7-M1 (SQL) — a studio refusal overwrote the inbound STOP's date/source/words/recorder | **FIXED** | `00594:1427-1429` (`LEAST`) and `:1500-1527` (four `inbound_sms` guard arms). Block 28 passes. |
| R7-M1 (rail) — the STOP destroyed the grant's own consent evidence | **FIXED** | `pipeline.ts` `keepsPriorConsent`; Deno cases "a STOP keeps the grant's own evidence…" pass. |
| R7-M2 — the phone-global branch answered "unknown" on a failed read | **FIXED** | `_shared/sms.ts:503-517` destructures `scanError` and refuses. |
| R7-M3 — a STOP that reached no record was still acknowledged 200 | **FIXED** | `pipeline.ts` STOP branch returns 500 / `opt_out_incomplete` and releases `twilio_sid`; three Deno cases pass. |

No prior finding is open. Everything below is fresh.

---

## 2. Findings

### M1 — MAJOR (confidence: HIGH, reproduced). The fold files the GRANT's paperwork as the refusal's own words for the shape the shipped inbound STOP rail actually writes

`supabase/migrations/00594_studio_channel_consent.sql:498-505` (the `refusal`
CTE's four projections) and `:518-520` (its words-preference ordering leg).

The r4 R4-M1 fix says the refusal's words are "only ever taken off a row that is
itself a refusal", and implements that as:

```sql
CASE WHEN sms_consent_status = 'opted_out' THEN sms_consent_source      END AS opt_out_source,
CASE WHEN sms_consent_status = 'opted_out' THEN sms_consent_evidence    END AS opt_out_evidence,
CASE WHEN sms_consent_status = 'opted_out' THEN sms_consent_recorded_at END AS opt_out_recorded_at,
CASE WHEN sms_consent_status = 'opted_out' THEN sms_consent_recorded_by END AS opt_out_recorded_by
```

`status = 'opted_out'` is not the test the comment claims it is. `project_parties`
holds ONE evidence set, and **the shipped inbound STOP rail flips the status
without touching it**:

```ts
// supabase/functions/sms-inbound/pipeline.ts — optOutAllForPhone(), unchanged
// from origin/main, i.e. this is what Strata holds today
await supabase.from("project_parties")
  .update({ sms_consent_status: "opted_out", sms_opt_out_at: now })
  .eq("phone_e164", phone);
```

So a seat that held `(granted, written, "Signed the Lindqvist kickoff form",
recorded 2025-05-02, by member X)` and then received a STOP reads
`(opted_out, opt_out 2025-12-03, written, "Signed the Lindqvist kickoff form",
2025-05-02, member X)` — status `opted_out`, evidence still the grant's. That is
the commonest real refusal on Strata: every seat with a recorded grant that later
texted STOP.

Block 30e tests only the OTHER shape (`status = 'granted'` carrying a stale
opt-out date, `w1a_identity_channels_consent_test.sql:3766-3803`). This shape is
untested and unhandled. Reproduced against the shipped fold:

```
-- seat A: the rail's shape (opted_out + the grant's evidence)
-- seat B: a sibling seat on the same number in the same studio, holding nothing
$ SELECT public.backfill_channel_consent_from_parties();  -- 1

--- the RECORD the fold minted ---
  status   |       opt_out_at       | refusal_unanswered | opt_out_source |         opt_out_evidence          |  opt_out_recorded_at   |    opt_out_recorded_by
-----------+------------------------+--------------------+----------------+-----------------------------------+------------------------+--------------------------------------
 opted_out | 2025-12-03 00:00:00+00 | t                  | written        | Signed the Lindqvist kickoff form | 2025-05-02 00:00:00+00 | d1000000-…-0000000000d1

--- the SEATS after the mirror ---
 …f0b1 | opted_out | 2025-12-03 | written | Signed the Lindqvist kickoff form | 2025-05-02 | d1000000-…-0000000000d1
 …f0b2 | opted_out | 2025-12-03 | written | Signed the Lindqvist kickoff form | 2025-05-02 | d1000000-…-0000000000d1
```

Script: `$TMPDIR/p_stopshape.sql` (fixture inline above; rolled back).

What that record and those seats now assert, all of it false:

1. **R-Q's sentence composes to "Opted out IN WRITING, 3 Dec 2025, on the
   Lindqvist kitchen"** — the studio's own consent document named as the
   refusal. The truth is "Opted out BY TEXT". That noun is the whole point of
   W4-M2's second evidence set.
2. **`opt_out_recorded_at` (2025-05-02) precedes `opt_out_at` (2025-12-03) by
   seven months** — "the refusal written down before it happened", the exact
   absurdity 00594's own R4-M1 comment names, and the inverse of what block 28e
   asserts for the studio-side door (`opt_out_recorded_at > opt_out_at`).
3. **`opt_out_recorded_by` names the studio member who recorded the GRANT as the
   person who wrote down the refusal.** r7 R7-M1 and r9 R5-M2 both rule that a
   rail-written STOP carries NULL there on purpose ("nobody in the studio
   recorded it, the recipient did", `00594:884-886`). The fold mints the
   attribution those two rounds were written to prevent.
4. **Because `opt_out_source` comes out non-NULL, the mirror's R-AQ
   wordless-refusal branch never fires** (`00594:903-914`), so the grant's
   paperwork is stamped onto EVERY seat in the studio on that number — seat B
   above held nothing and now asserts the grant's paperwork as the refusal.
   Verbatim R-AQ's failure, arriving from the fold.
5. **It also wins the pick.** Both `ranked` (`:405-406`) and `refusal`
   (`:518-520`) prefer `status='opted_out' AND sms_consent_source IS NOT NULL`,
   so a contaminated rail seat OUTRANKS the honest, wordless portal refusal in
   the same group. R2-M1 made the picker prefer "words"; on this shape the
   "words" are the grant's.
6. **It is permanent.** `ON CONFLICT DO NOTHING` means no later fold repairs it;
   `record_channel_reconsent()` never touches `opt_out_*` by design; and
   `record_channel_consent`'s protective arm only guards `opt_out_source =
   'inbound_sms'` (`:1503-1505`), so this `'written'` value is not even
   protected from being overwritten by a later studio-side refusal.

Not a send-safety hole — `refusal_unanswered` comes out `true` either way and no
send is opened. It is evidence destruction and false carrier-audit attribution,
on the first prod fold, over real data, with no act by anyone.

Fix direction (both halves, ideally):
(a) in the `refusal` CTE, stop trusting a seat's evidence columns on status
    alone — require evidence that plausibly belongs to the refusal
    (`sms_consent_source = 'inbound_sms'`, or
    `sms_consent_recorded_at >= sms_opt_out_at`), and otherwise project NULL so
    R-AQ's branch does its job; and
(b) make `optOutAllForPhone()` write the refusal's own set alongside the status
    (`sms_consent_source='inbound_sms'`, `sms_consent_evidence='Inbound STOP'`,
    `sms_consent_recorded_at=now`, `sms_consent_recorded_by=null`) — which is
    what the mirror writes for the same verdict and what
    `writeChannelConsent()` already writes on the record side — so the live seat
    stops lying too, not only the folded record.
A SQL block beside 30e, with a seat of exactly this shape, is the regression test.

---

### M2 — MAJOR (confidence: HIGH). `w1a-report.md` is five commits stale and materially misdescribes what ships — including a consent rule it states the opposite of

`artifacts/people-room-crm-2026-09-11/build/w1a-report.md` (mtime 2026-09-11
22:56) predates `6541f1a8e`, `e0df228f9`, `9efdbeb55`, `bc8f4fab8`, `3ddd0ddc4`.
The report is the artifact the orchestrator rules from, and §3 opens by claiming
the opposite: *"Every output below was re-taken after the r2 round … the section
is at the branch tip, not behind it … which is why the re-take now happens AFTER
the round's code lands, never before it."* (`w1a-report.md:543-549`).

What the report does not say, or says wrongly:

1. **The email asymmetry (r6 R6-M3) is absent entirely** (`grep -c R6-M3
   w1a-report.md` → 0). On `channel_kind = 'email'`, a studio member's
   `record_channel_consent(..., 'granted', ...)` now **passes the `opted_out`
   gate and lowers `refusal_unanswered`** — `00594:1442-1443`, `:1548`,
   `:1564`. That is a studio-side write reopening a refused channel. Decision 18
   of the report states the rule in absolute terms that are now false:
   *"refuses every transition OUT of `opted_out`"*, *"lowered by ONE writer: the
   inbound rail's own service_role write"*, *"No RPC in 00594 lowers it (r7
   M7-1)"* (`w1a-report.md:182-346`). It is also an amendment to how PR-m is
   read, which is a ruling-level fact.
2. **The rule-only `sms` token (r4 R4-M2) is absent** (`grep -c R4-M2` → 0), and
   §3's own probe transcript prints a CHECK that no longer ships:

   ```
   report :729-730   CHECK (channels_allowed <@ ARRAY['mobile','office','dispatch','after_hours','email','ap_email','portal_311'])
   shipped           CHECK (channels_allowed <@ ARRAY['mobile','office','dispatch','after_hours','email','ap_email','portal_311','sms'])
   ```
   (`psql … pg_get_constraintdef`, this reset.) A pasted probe output that the
   database contradicts is worse than no probe.
3. **r8 F1** (`assert_studio_contact_rule_route()` now polices `subject_type`
   against the card's own `entity_kind`, `00592:929-937`) is absent; so is the
   r7 second cycle (**R7-M2**, **R7-M3** — including the STOP that now answers
   500 and releases `twilio_sid`, a live behaviour change to a Twilio webhook).
4. **The SQL-test transcript is wrong**: report says "**31 blocks** (1–30 plus
   16B) … 30 notices" (`:781`); the suite emits 36 notices and ends at block 34.
   Blocks 30e, 31, 32, 33, 34 are unlisted.
5. **The counts are wrong**: "gained 210 lines … baseline + 2632 replayed
   statements" (`:41-45`) — actual `+216` on the branch and `2633` from the
   generator this round; "ok | 71 passed" (Deno) — actual 78.

This exact failure has now been raised and "fixed" twice inside this wave (r9
R5-M2, r2 R2-M2, both quoted in the report's own §3). A third recurrence that
hides a behavioural rule change is not a documentation nit.

Fix: re-take §1's table, §2's decision list (add the email door, the `sms`
token, r8 F1, and the r7 second cycle), §3's probes, §5's counts — from the
branch tip, after this round's code lands.

---

### m3 — MINOR (confidence: HIGH that it is missing; MEDIUM that it matters). `reach_preference` is neither built nor declared out of scope

`synthesis/direction.md` §7 row 1 lists `reach_preference` among the person
columns `studio_contacts` gains in P1 (crm-model §2: `enum
text/email/phone/office/app`, "F-13 has no work cell", CS4-5). It is not in the
shipped column list:

```
$ psql … "select column_name from information_schema.columns where table_name='studio_contacts'"
… is_sole_proprietor studio_verdict studio_verdict_at legal_name dba_name company_kind
  trades w9_on_file_at tax_id_last4 remit_to retainage_bps warranty_until
  paperwork_contact_person_id signer_person_id site_contact_person_id
```

`grep -rn reach_preference supabase/migrations/ w1a-report.md` → nothing. Unlike
`never_text` / `do_not_contact` / `do_not_contact_reason` / `route_to_person_id`,
it is NOT covered by decision 1's ruling (it is a preference, not a forbidding
rule, and `studio_contact_rules` has no column for it), it is not in 00592's
"NOT DONE HERE, DELIBERATELY" header block (`00592:35-43`), and it is not in the
report's §5 out-of-scope list. Either add it or name it; a silently dropped
direction column is how W1b's Reach editor discovers there is nowhere to store
"email first, phone only in an emergency".

---

### m4 — MINOR (confidence: MEDIUM). The rule vocabulary and the channel vocabulary diverge by one token, with nothing but a comment to bind them

`00592:796-841` admits `'sms'` into `channels_allowed` / `channels_forbidden`;
`00593:62-108` does not admit it into `studio_contact_channels.channel_kind`.
The resolution rule — "a composer resolves a forbidden `sms` against the mobile
line's `sms_capable`, not against a channel row of its own" — lives only in the
column COMMENT. W1a ships no reader, so nothing enforces it.

The hazard is the one the CHECK was added to close, one level up: a W1b composer
that resolves rule tokens by joining to `studio_contact_channels.channel_kind`
will silently not match `'sms'`, R-S's blocked clause will not print, and F-10
Sam Rowe's and F-27 Ray Thao's "never texted" will fail OPEN — which is exactly
what `00592:754-766` says an unmatched value does. Worth either a named
constant the composer must import, or a test in W1b's brief that asserts a
`{sms}` forbidding rule blocks a text while permitting the voice call.

---

### m5 — MINOR (confidence: HIGH on the fact; LOW on impact). `mirror_channel_consent_to_parties()` keeps the wave's only un-revoked EXECUTE

`00594:1054` — `REVOKE ALL ON FUNCTION public.mirror_channel_consent_to_parties()
FROM PUBLIC, anon;`. Every other trigger function this wave adds also revokes
`authenticated` (`00592:236`, `:423`, `:505`, `:539`, `:673`, `:976`;
`00593:261`, `:310`, `:587`). The legacy-grants seed then re-grants EXECUTE:

```
 mirror_channel_consent_to_parties | t | {search_path=public} | anon f | auth t | svc t
```

Not exploitable — PostgreSQL refuses a direct call to a `RETURNS TRIGGER`
function — but it is the one place the wave's own posture is not held, and the
report's probe table prints the `t` without remarking on it (`w1a-report.md:614`).

---

### m6 — MINOR (confidence: MEDIUM). Two new SECURITY DEFINER oracles answer for any row id, for any signed-in user

`00592:65-76` `studio_contact_org(uuid)` and `:85-99` `project_party_designer(uuid)`
are `SECURITY DEFINER`, `GRANT EXECUTE … TO authenticated`, and carry no
membership test of their own — by design, since the RLS policies call them. A
signed-in user holding a `studio_contacts.id` therefore learns which
organization owns it, and one holding a `project_parties.id` learns the lead
designer's `auth.uid()`. Both need a uuid the caller should not have, and the
pattern matches `is_active_studio_member` / `_primary_studio_for`; but
`_primary_studio_for` is revoked from every PostgREST role (00483) precisely
because it answers about other people, and `project_party_designer` returns the
same class of fact. Consider narrowing to `is_studio_comember`-gated variants,
or revoking `authenticated` and letting the policies run them as the definer.

---

### m7 — MINOR (confidence: HIGH). Two column-shape nits on the new `studio_contacts` facts

- `00592:119` — `tax_id_last4 char(4)`. crm-model §2 says `text`. `char(n)` is
  blank-padded and its comparisons ignore trailing spaces, so `'417 '` and
  `'417'` compare equal — in a column whose stated job (CS6-11) is *catching
  duplicate vendor cards splitting a 1099 total*. `text` with a
  `CHECK (tax_id_last4 ~ '^[0-9]{4}$')` says what is meant.
- `00592:121` — `retainage_bps integer` with no range CHECK. The comment says
  "1000 = 10%"; nothing refuses `100000`. A `CHECK (retainage_bps IS NULL OR
  retainage_bps BETWEEN 0 AND 10000)` costs one line and this file already uses
  the DROP/ADD idiom for exactly that.

---

### m8 — MINOR (confidence: HIGH). The "line type unconfirmed" label is person-only, so firm lines never ask the studio to confirm them

`00593:407-424` leg (a): the label qualifier is written
`CASE WHEN sc.entity_kind = 'person' AND NOT ev.texted THEN '… — line type
unconfirmed' ELSE 'From the card (00593 backfill)' END`, and `ev.texted` is
hard-false for a company (`:418`). So every company card's backfilled `office`
channel lands `sms_capable = false` with a label that asserts nothing is
unconfirmed — even though nothing on the card said the firm's one number is an
office line either. Decision 17's stated purpose is "so W1b's Reach editor can
show which lines it is asking the studio to type"; firm lines are silently
excluded from that list. One-word fix, or a line in the report saying firm lines
are deliberately not asked about.

---

### m9 — MINOR (confidence: MEDIUM). A channel row can exist that the fold can never mint a consent record for

`00593:439` mints a channel from `COALESCE(pp.phone_e164, pp.phone)` — the raw
text survives when the number will not parse (decision 11, deliberate). The
fold's `party_org` CTE filters `WHERE pp.phone_e164 IS NOT NULL`
(`00594:376`), so those same seats are dropped before precedence is computed:
an unparseable number that a seat has RECORDED A REFUSAL on contributes nothing
to any record. The send rail keys on `phone_e164` too, so nothing is sent to it
either and no refusal is lost operationally — but decision 11 claims the shared
normaliser means "a channel row and its consent record always land on the same
key", and for this population there is no consent record at all. Worth one
sentence in the fold's comment, or a `COALESCE(pp.phone_e164,
normalize_channel_value('mobile', pp.phone))` in `party_org` to match 00593.

---

## 3. What I verified and found correct

- **Both redefined functions are their grep-winner bodies verbatim + one guard.**
  `grep -rln "CREATE OR REPLACE FUNCTION[^(]*<name>" supabase/migrations/*.sql | sort | tail -1`
  → `00432` for `fc_dispatch_optin_invite`, `00374` for
  `_site_request_consent_granted_dispatch` (00594 excluded). Diffed line by line
  against `00432:27-68` and `00374:3399-3444`: identical apart from the
  `patina.suppress_consent_dispatch` early return. `COMMENT ON TABLE
  public.project_parties` restates 00212:46 and appends the invariant.
- **RLS present with the right predicate on all four new tables.**
  `studio_person_affiliations` / `studio_contact_channels` →
  `is_active_studio_member(studio_contact_org(<card>))` on all four verbs, with
  the affiliation INSERT/UPDATE `WITH CHECK` also pinning both cards to one org;
  `studio_contact_rules` → the same for `person`/`company` and
  `is_studio_comember(project_party_designer(subject_id))` for `engagement`;
  `studio_channel_consent` → SELECT-only for members. No client-portal branch on
  any of them (PR-w's posture holds by construction; the site access card is not
  in this wave).
  ```
   studio_channel_consent     | t |  1
   studio_contact_channels    | t |  4
   studio_contact_rules       | t |  4
   studio_person_affiliations | t |  4
  ```
- **Grants explicit both directions**, and the consent table is write-closed to
  the portal by privilege:
  ```
   studio_channel_consent | authenticated | SELECT
   studio_channel_consent | service_role  | DELETE,INSERT,…,UPDATE
  ```
  `generate-legacy-grants.py` regenerates with an empty diff.
- **Every SECURITY DEFINER pins `search_path`** (19/19 rows, `{search_path=public}`
  or `{public, pg_temp}`); `anon` holds EXECUTE on none of the wave's functions.
- **Idempotent reruns**: all three files replay cleanly against the migrated DB.
  `ON CONFLICT … DO NOTHING` handles intra-statement duplicates in 00593 leg (c)
  — probed directly with two seats on one number folded to one card: one channel
  row, no `duplicate key` error.
- **The mirror cannot loop**: it writes only `project_parties`; that table's
  non-internal triggers are two pure BEFORE shapers plus the two guarded AFTER
  dispatchers; `site_request_dispatch_after_consent()` only READS
  `project_parties` (`pg_get_functiondef` grep). The suppression window is
  exactly the mirror's own UPDATE — AFTER-row triggers queued by an SPI
  statement fire before the function's next statement.
- **Backfill precedence and per-org isolation**: `PARTITION BY org, phone_e164`,
  `opted_out` → `granted` → `pending` → `not_asked`, the two R2-M1 refusal legs
  inert outside the refusal bucket. Blocks 3, 4, 30, 30e pass. (What the fold
  gets from the refusing sibling is M1's subject.)
- **The send gate fails closed in every branch of `channelConsentVerdict`**: a
  failed org resolve, a failed record read, a failed `orgHasOptedOutParty` read,
  a failed `orgsOfProjects` and a failed phone-global scan all return
  `refuse`/`true` with a log. `flushDeferredMessages` runs the same two gates,
  narrowed to the deferred row's own party.
- **Vocabularies match crm-model §2**: `company_kind` (its 13 names + the two
  documented additions), `channel_kind` (the addresses, minus the four
  access-tier pseudo-kinds, documented), consent `status` / `source` /
  `channel_kind`, rule `subject_type`. Direction §3.8 is a display-word table
  and constrains none of them. `company_kind` is TEXT + CHECK, not an enum —
  correct per PD-4 and the no-`ADD VALUE`-in-transaction rule.
- **Money**: no cents column is added; `retainage_bps` is integer basis points
  (see m7 for its missing range).
- **No prod command anywhere** in the migrations, the SQL tests or the two edge
  files (`db push`, `functions deploy`, the Strata ref, `*.supabase.co` — all
  absent).
- **`people_directory` is untouched** by this wave (grep over
  `supabase/migrations/0059[234]*.sql`), so no reader's column set is at risk;
  the rebuild is correctly listed as out of scope.
- **Generated types are in sync** and were regenerated with an empty diff.
