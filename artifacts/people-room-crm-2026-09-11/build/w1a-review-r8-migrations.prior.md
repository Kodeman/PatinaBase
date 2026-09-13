# W1a — adversarial migration review, round 8

Scope: `supabase/migrations/00592_people_cards_affiliations_rules.sql`,
`00593_studio_contact_channels.sql`, `00594_studio_channel_consent.sql`, the
functions they create or redefine, `supabase/tests/people/w1a_identity_channels_consent_test.sql`,
and the two edited edge-function files the migrations' invariants rest on
(`supabase/functions/_shared/sms.ts`, `supabase/functions/sms-inbound/pipeline.ts`).

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, HEAD `7c8eed3bd`
("fix(consent): a studio-recorded refusal never speaks for a texted one (r7 R7-M1)").
Local stack only. No `supabase db push`, no `functions deploy`, no Strata.

**Verdict: NOT clean — 2 major, 4 minor new this round, plus 27 minors carried
open from r6/r7.** Nothing blocking. Both majors are demonstrated against the
running database, and both are in objects this wave itself introduces.

---

## 0. Gates run, with output

### Reset — applies clean

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build supabase:reset
… Seeding data from supabase/seed/99-local-edge-settings.sql...
Restarting containers...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
```

(`apps/designer-portal/.env.local` does not exist in this worktree — checked
before the reset; nothing could point at `*.supabase.co`. `supabase/config.toml`
`project_id = "supabase"`, local.)

### SQL suite — 28 blocks, all pass

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
…
NOTICE:  26. no studio-side verdict lowers refusal_unanswered (r7 M7-1): passed
NOTICE:  27. reconsent is evidence-only and re-callable (r7 M7-2), leaves the refusal's own
         evidence standing (r8 W4-M2), the seat carries the refusal's own words too (r9 R5-M1),
         and a sourceless refusal is never given the studio's consent as its words (r6 R6-M1): passed
NOTICE:  28. a studio-recorded refusal never speaks for a texted one, and the refusal keeps the
         date it arrived (r7 R7-M1): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
```

Distinct blocks in the file: 28 (`1–4, 6–28, 16B`; block 5 lives inside block 4).

### Deno — the two suites the migrations' invariants rest on

```
$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts
ok | 71 passed | 0 failed (108ms)
```

### Idempotent re-run — clean

All three files replayed in ONE transaction against the already-migrated
database (including 00594's `SELECT backfill_channel_consent_from_parties()`
with the mirror trigger already live):

```
$ psql … -v ON_ERROR_STOP=1 -f $TMPDIR/rerun_r8.sql
…
       result
--------------------
 rerun all three ok
ROLLBACK
```

### Legacy grants + generated types regenerate identically

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2632 replayed statements
$ git diff --stat supabase/seed/00-legacy-grants.sql
(empty)

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate
$ git diff --stat packages/supabase/src/database.types.ts
(empty)
$ git diff --stat 700261663 -- packages/supabase/src/database.types.ts
 packages/supabase/src/database.types.ts | 508 ++++++++++++++++++++++++++++++++
 1 file changed, 508 insertions(+)     ← zero deletions, as the report claims
```

### Lineage — both redefined bodies ARE the grep-winner, verbatim + one guard

```
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*fc_dispatch_optin_invite" supabase/migrations/*.sql | sort
00284_field_dispatch_wiring.sql · 00432_twilio_activation_hardening.sql · 00594 (this wave)
   → winner excluding this wave: 00432   ✓ matches the banner

$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*_site_request_consent_granted_dispatch" … | sort
00374_field_site_request_loop.sql · 00594 (this wave)
   → winner: 00374                       ✓ matches the banner
```

`diff -u` of each grep-winner body against 00594's:

```
+  IF COALESCE(current_setting('patina.suppress_consent_dispatch', true), '') = '1' THEN
+    RETURN NEW;
+  END IF;
```

— that plus its comment is the ONLY delta in each. Nothing else differs.

Every other function in the three files is new: for each of the sixteen names,
`grep -rl "FUNCTION[^(]*<name>" supabase/migrations/*.sql` excluding
00592/00593/00594 returns nothing.

### Numbering

```
$ for each local+remote ref: git ls-tree --name-only <ref> supabase/migrations/ | grep 0059[234]
refs/heads/build/people-room-crm-2026-09-11        : 00592 00593 00594
refs/remotes/origin/build/people-room-crm-2026-09-11: 00592 00593 00594
(no other ref)

$ git ls-tree --name-only origin/main supabase/migrations/ | sort | tail -3
00590_engagement_subject.sql · 00591_notification_log_delivery.sql · 20260910152111_create_contact_messages.sql
```

Head is 00591, the wave mints 00592–00594, nothing collides. (The report's §5
narrative about which numbers the hour-tracking branches hold is stale again —
see **R8-m4**.)

### Objects, RLS, policies, grants

```
          relname           | rls | policies
----------------------------+-----+----------
 studio_channel_consent     | t   |        1
 studio_contact_channels    | t   |        4
 studio_contact_rules       | t   |        4
 studio_person_affiliations | t   |        4
```

Predicates, read off `pg_policy`, match the brief exactly:
`studio_contact_channels` and `studio_person_affiliations` gate on
`is_active_studio_member(studio_contact_org(<card>))` (affiliations' INSERT /
UPDATE `WITH CHECK` additionally pins both cards to one studio);
`studio_contact_rules` branches `is_studio_comember(project_party_designer(subject_id))`
for `engagement` and `is_active_studio_member(studio_contact_org(subject_id))`
otherwise; `studio_channel_consent` is SELECT-only on
`is_active_studio_member(organization_id)`.

Grants both directions, probed:

```
 table                      | anon | authenticated            | service_role
 studio_channel_consent     | —    | SELECT                   | ALL
 studio_contact_channels    | —    | SELECT INSERT UPDATE DEL | ALL
 studio_contact_rules       | —    | SELECT INSERT UPDATE DEL | ALL
 studio_person_affiliations | —    | SELECT INSERT UPDATE DEL | ALL
```

The write door holds, probed as `authenticated` with a real JWT claim:

```
NOTICE:  direct insert refused: 42501 / permission denied for table studio_channel_consent
NOTICE:  member RPC accepted (expected)
NOTICE:  non-member RPC refused: not_a_studio_member
NOTICE:  non-member SELECT sees 0 record(s)
```

### SECURITY DEFINER + pinned search_path — 18 functions

All eighteen pin `search_path` (`{search_path=public}`, or
`{"search_path=public, pg_temp"}` for `normalize_studio_contact_channel`);
`anon` holds EXECUTE on none; the eight trigger-only / backfill-only helpers
hold EXECUTE for nobody but `service_role`. `channel_value_was_on_sms_rail` is
SECURITY INVOKER by design and granted only to `service_role`.
`normalize_channel_value` is marked IMMUTABLE and the one function it calls,
`normalize_phone_e164`, is genuinely `provolatile = i` — the marking is honest,
and it round-trips (`normalize_channel_value('mobile', normalize_channel_value('mobile','(612) 555-0142'))
= '+16125550142'`).

### The mirror cannot loop, and its release path is durable-only

`mirror_channel_consent_to_parties()` writes only `project_parties`; nothing on
`project_parties` writes `studio_channel_consent`. `site_request_dispatch_after_consent()`,
the one thing the release loop calls, contains no `invoke_edge_function`, no
`net.*` and no write to `project_parties` — read back from `pg_get_functiondef`:
two `UPDATE`s (`site_requests`, `site_request_dispatch_outbox`) plus
`_site_request_append_event` / `_site_request_enqueue_dispatch`. Block 8 asserts
that a mirrored verdict fires neither outward party trigger while a direct
party write still fires both, and it passes.

### The send gate

`channelConsentVerdict()` refuses on: a failed org resolve, a failed record
read, `status = 'opted_out'`, `refusal_unanswered = true`, a studio-scoped
opted-out seat (record present or absent), and — with no studio resolvable at
all — any opted-out row on the number. `sendPartySms()` then still applies the
legacy party-row reduction, and `flushDeferredMessages()` runs the same two
gates keyed off the deferred row's own party. One branch remains fail-open and
is unchanged from r6: `sms.ts:504-512` destructures only `data`, so a failed
read in the no-studio branch reads as "nobody opted out" (**R6-m3**, still open).

### Vocabulary, money, crons, prod

No enum `ADD VALUE` anywhere (the string appears only inside comments
explaining why a CHECK was used). No `cron.*`. No money column but
`retainage_bps`, integer basis points. `grep -niE "db push|functions deploy|bkvcixdmuyejfzcijpdg|strata|supabase\.co"`
over the three migrations, the SQL test and the two edge files: no match.
`people_directory` is not touched by any of the three files and still carries
its twelve columns.

---

## 1. Prior findings — re-checked

| Finding | Status | Evidence |
|---|---|---|
| r7 **R7-M1** (the instructed `opted_out` door destroyed the inbound STOP's date, source, words, recorder) | **CLOSED** | `00594:1220-1222` (`LEAST` on `opt_out_at`), `:1255-1282` (the four `inbound_sms` middle arms); block 28 passes; `probe14-r7-M1-negative-control.sql` |
| r7 **R7-m1** (fold takes `opt_out_at` from the winner, the words from a different row) | **OPEN — re-demonstrated** | `00594:428`, unchanged; probe below |
| r7 **R7-m2** (`studio_contact_org` / `project_party_designer` answer for any id) | **OPEN — re-demonstrated** | `NOTICE: stranger sees 0 card(s); studio_contact_org() answers b5000000-…` |
| r7 **R7-m3** (`tax_id_last4` is `char(4)`, unchecked) | **OPEN** | `information_schema`: `tax_id_last4 | character | 4`; no CHECK on the table |
| r7 **R7-m4** (`retainage_bps` has no range CHECK) | **OPEN** | `pg_constraint` → 0 rows matching `%retainage%` |
| r7 **R7-m5** (`studio_channel_consent.channel_value` has no normalising trigger) | **OPEN** | the table carries 2 non-internal triggers: the mirror and `set_updated_at` |
| r7 **R7-m6** / r6 R6-m19 (report §5 migration survey stale) | **OPEN — now wrong again** | see **R8-m4** |
| r6 **R6-m2 … R6-m22** (the other 21 minors) | **all still OPEN** | re-read at the cited lines; four re-demonstrated by `probe13-r6-open-minors.sql` |
| r8 W4-M1/W4-M2, r9 R5-M1/R5-M2, r7 M7-1/M7-2, r6 B6-1/M6-1…M6-5, r5 B5-1…M5-4, r4, r3, r2, r1 | closed, re-verified | blocks 3–27; lineage diff; policy + grant dump |

`probe13`, re-run against this reset:

```
NOTICE:  refused: 42501 / permission denied for table studio_channel_consent   ← the write door holds
NOTICE:  stored value = [] (length 0)                     ← R6-m8 open
NOTICE:  preferred mobiles on one card = 2                ← R6-m9 open
NOTICE:  escalation_by_class accepted unmatched channel names   ← R6-m17 open
NOTICE:  trades accepted a non-FieldTrade value           ← R6-m6 open
```

`grep -rn "reach_preference" supabase/migrations/0059[234]*.sql artifacts/…/w1a-report.md`
→ no match in either. **R6-m10 is open for the fifth round**: `direction.md` §7
lists `reach_preference` on the person card, and the report's §5 "Not done" list
still does not say it was dropped.

---

## 2. Findings

### MAJOR — R8-M1. A mirrored SOURCELESS refusal makes a sibling seat name the studio's own consent document as the refusal

**Confidence: high (demonstrated end to end).**
`00594:722-732` (the `v_seat_*` choice), `:780-784` (the COALESCE onto the seat).

r9's R5-M1 fix made the mirror carry `NEW.opt_out_*` onto the seat whenever the
verdict is a refusal, and r6's R6-M1 fix removed the fallback to the record's
CONSENT set, "so a NULL here means there were never any refusal words, and the
seat's own standing value is the fallback (never NULL over non-null, R-AN)"
(`00594:716-719`).

That reasoning holds only while the seat's standing value is itself about the
refusal. It is not, for the seat next door. `project_parties` has ONE evidence
set, and a sibling seat in the same studio on the same number routinely holds
the GRANT's evidence. When the record's refusal is sourceless — the shape the
shipped portal writes on purpose (`use-coordination.ts` writes `opted_out`
beside the not-asked columns) and **the shape the fold mints verbatim** — all
four `v_seat_*` are NULL, every COALESCE keeps what the sibling seat holds, and
the seat is left asserting the studio's own consent document as the refusal.

One studio, one number, two seats — a granted seat carrying the studio's
paperwork, and a sourceless `opted_out` seat:

```
--- BEFORE the fold: the two seats ---
                  id      | sms_consent_status | sms_consent_source |      sms_consent_evidence
 e1…a1                    | granted            | written            | Signed consent form at kickoff
 e1…a2                    | opted_out          |                    |

 folded = 1

--- the record the fold minted ---
  status   | refusal_unanswered | opt_out_at | source | evidence | opt_out_source | opt_out_evidence
 opted_out | t                  |            |        |          |                |

--- AFTER the fold: the two seats (mirror has run) ---
                  id      | sms_consent_status | sms_consent_source |      sms_consent_evidence      | sms_consent_recorded_at
 e1…a1                    | opted_out          | written            | Signed consent form at kickoff | 2026-01-02 00:00:00+00
 e1…a2                    | opted_out          |                    |                                |
```

Seat `e1…a1` now reads `(opted_out, written, "Signed consent form at kickoff",
recorded 2 Jan 2026)`. R-Q's one sentence, composed off the seat — which is what
every shipped surface reads, since W1a ships no hook for the new table — prints
**"Opted out in writing, 2 Jan 2026"**, naming the studio's own consent form as
the refusal and dating the refusal to the day of the GRANT. That is precisely
the false assertion r9 R5-M1 and r6 R6-M1 were raised to stop; it survives
because the fallback was narrowed to the record and not to the seat.

It bites on the first prod fold, over real `project_parties` data — the same
population W4-M1 was about (a studio holding more than one seat on one number),
and it needs no later act by anyone.

**Fix (one branch):** when the verdict being mirrored is `opted_out` AND the
record carries no refusal words of its own (`NEW.opt_out_source IS NULL`), write
NULL into the seat's four evidence columns rather than COALESCEing — the honest
state, and exactly what the shipped portal writes for the same verdict
(`use-coordination.ts`). R-AN's "never NULL over non-null" was written about a
verdict that simply did not restate its evidence; a refusal with no words is not
that case, it is a refusal whose evidence is known to be absent. The alternative
— giving `project_parties` its own `sms_opt_out_source/evidence/...` set — is a
bigger change and belongs to PR-x's retirement of these columns, not here.
Whichever is taken, block 27's sourceless-refusal case (27i–27i5) needs a
SIBLING seat added to it: today it proves only that the seat that carried the
refusal is left NULL, never what happens to the seat beside it.

---

### MAJOR — R8-M2. The three new card guards are one-sided: flipping the REFERENCED card's `entity_kind` (or `organization_id`) breaks every one of them

**Confidence: high (demonstrated).**
`00592:249-254` (`assert_studio_contact_designations_trg`),
`00592:899-904` (`assert_studio_contact_rule_route_trg`),
`00593:311-315` (`assert_channel_owner_kind_trg`).

All three triggers fire on the REFERENCING row only — the `studio_contacts` row
that holds the designation, the `studio_contact_rules` row that holds the route,
the `studio_contact_channels` row that holds `owner_type`. Nothing fires when
the card being pointed AT changes what it is or whose it is. Both are ordinary
member-writable columns on `studio_contacts` (00417's member UPDATE policy), and
`entity_kind` is one the shipped data layer already writes on update
(`packages/supabase/src/hooks/use-studio-contacts.ts:232` —
`if (input.entityKind !== undefined) updates.entity_kind = input.entityKind`).

```
=== (1) flip the designated / routed / channel-owning PERSON card into a COMPANY card ===
UPDATE 1
 channels_owner_type_wrong | designation_names_a_firm | route_to_a_firm
                         1 |                        1 |               1

=== (2) move that card to ANOTHER studio ===
UPDATE 1
 cross_studio_designation | cross_studio_route | channels_still_there
                        1 |                  1 |                    1
```

So, after one ordinary `UPDATE studio_contacts`:

* a **company card carries a channel with `owner_type = 'person'`** — the exact
  state `assert_channel_owner_kind()` exists to prevent ("a company card could
  carry `owner_type='person'` and be offered an SMS invite as a person",
  `00593:272-278`);
* a firm's **`paperwork_contact_person_id` names a firm**, and after the org
  move names **a card in another studio** — which 00592's own comment calls "a
  cross-tenant paperwork link waiting for a SECURITY DEFINER reader that does
  not re-check" (`00592:184-187`), i.e. exactly what P3's PR-a upload door will
  mint a token against;
* a contact rule **routes to a firm, in another studio** — and R-L / R-S print
  that routed person's email and office phone as the one line telling a designer
  how to reach a do-not-contact person.

Affiliations are accidentally safe from the `entity_kind` half, and only by
luck: flipping a person card that holds an affiliation first trips 00417's
`studio_contacts_company_link_check` because the pointer trigger has set
`company_id`. The org half is not covered at all.

Today no shipped UI takes the path — `add-person-sheet` deliberately omits
`entityKind` on edit, asserted at
`apps/designer-portal/src/components/document/people/directory/__tests__/add-person-sheet-edit.test.tsx:112`
— so reachability is through the hook, `service_role`, an ops fix, or P2's
Compare & merge sheet (PR-o lets the studio flip which card survives;
`is_sole_proprietor` exists precisely for a firm/person merge). It is the
guarantee that is broken, not yet the data.

**Fix:** one more BEFORE trigger on `studio_contacts`, `UPDATE OF entity_kind,
organization_id`, that refuses the change while any dependent row still points
at the card (or re-asserts the three invariants for the dependents) — the same
shape as the three guards already in the file. Cheapest correct version: refuse
`entity_kind` / `organization_id` changes on a card that is named by a channel,
a designation, a rule route or an affiliation, with a hint naming what holds it.

---

### MINOR — R8-m1. The fold writes the REFUSAL's source and words into the record's CONSENT evidence set

**Confidence: high (demonstrated); impact low.** `00594:444-446`.

`ins` takes `source`, `evidence`, `recorded_at`, `disclosure_version`,
`recorded_by` from the winning row `r` whatever that row's status is. When the
winner is the refusing seat — the ordinary single-seat STOP, the commonest shape
in the fold — the CONSENT half of the record is minted out of the refusal:

```
  status   | consented_at | consent_source | consent_evidence |  consent_recorded_at   | opt_out_source | opt_out_evidence
 opted_out |              | inbound_sms    | Replied STOP     | 2025-12-03 00:00:00+00 | inbound_sms    | Replied STOP
```

The record now says a consent was recorded, by text, in the words "Replied
STOP". `consented_at` is NULL, so R-Q's consent sentence should not print, and
`record_channel_reconsent()` overwrites the set on its first call — which is why
this is minor rather than major. But it is the mirror image of the split W4-M2
built the second evidence set to end, and it is the set a 10DLC audit reads as
"the consent we hold". The fix is one `CASE`: only carry `r.sms_consent_*` into
the consent columns when `r.sms_consent_status <> 'opted_out'`.

---

### MINOR — R8-m2. Two writers, two rules for `opt_out_at` on a repeat refusal

**Confidence: high; impact low.**
`00594:1220-1222` against `supabase/functions/sms-inbound/pipeline.ts:369`.

r7's R7-M1 ruled that "a second refusal recorded over a standing one is not a
new refusal: it has stood since the day it arrived", and implemented it as
`LEAST(scc.opt_out_at, EXCLUDED.opt_out_at)`. The inbound rail, writing the same
column for the same event, does the opposite:
`opt_out_at: status === "opted_out" ? now : (prior.opt_out_at ?? null)` — a
second STOP on the same number walks the date forward to today. The rail is
arguably the better authority (the carrier is speaking again, which is the
rationale the same fix uses for the four `opt_out_*` columns), but the two
writers should not disagree silently about one column: either the rail takes
`LEAST` too, or 00594's comment stops claiming the record keeps the earliest
date in general. One line either way.

---

### MINOR — R8-m3. `record_channel_consent`'s `email` refusals are a permanent dead end, and the file does not say so

**Confidence: high; a restatement of R6-m14, unchanged.**
`00594:168` (`channel_kind IN ('sms','email')`), `:1192`, `:1229-1230`,
`:1508`.

An `opted_out` write on `channel_kind = 'email'` sets
`refusal_unanswered = true`. Nothing lowers it: only the inbound SMS rail does,
and it writes `channel_kind: 'sms'` unconditionally
(`pipeline.ts` `writeChannelConsent`). So every later verdict on that address is
refused (`consent_awaiting_recipient`), `record_channel_reconsent()` leaves it
at `opted_out` by design, and there is no email START. The email leg is P3
(`direction.md` §7), so nothing is broken today — but the door is open now, the
CHECK accepts it, and a studio that marks an email refusal in W2 has made an
irreversible record. Either refuse `channel_kind = 'email'` in both RPCs until
P3 ships the answering rail, or say in the banner that an email refusal is
final.

---

### MINOR — R8-m4. The report does not contain this wave's most recent fix, and §3 / §5 are stale for the fourth round

**Confidence: high.**

```
$ grep -c "R7-M1" artifacts/people-room-crm-2026-09-11/build/w1a-report.md
0
```

HEAD is `7c8eed3bd`, "a studio-recorded refusal never speaks for a texted one
(r7 R7-M1)" — 84 changed lines of `00594` and a whole new SQL block. The report
mentions it nowhere: not in §1's file table, not as a decision in §2 (which
stops at 22), not in §3's test transcript (which stops at block 27), and §3
still says "**28 blocks** (1–27 plus 16B)" when the file now carries blocks
1–28 plus 16B.

§5's migration survey is wrong again, third round running:

```
report:  hour-tracking/server carries 00598_studio_member_rates and 00599_resolve_time_rate_cents
actual:  origin/hour-tracking/server → …00600_time_entry_rate_provenance, 00601_classifier_rate_resolver
         origin/hour-tracking/integration → …00596, 00597   (the report's 00595–00597 still holds)
```

The load-bearing claim survives — 00592–00594 are held only by this wave's
branch and its mirror, `origin/main` is at 00591 — which is exactly why the
paragraph should be the COMMAND and the rule ("re-run at merge"), not a snapshot
of numbers. R5-M2 was raised about this; it has now recurred twice since.

---

### The twenty-seven minors carried open from r6 and r7

Re-read at their cited lines this round; none was touched. Listed with their
original ids so they stay trackable.

| id | one line | cite |
|---|---|---|
| R7-m1 | the fold dates the refusal off the WINNING row while taking its words from another (probe below) | `00594:428` |
| R7-m2 | `studio_contact_org()` / `project_party_designer()` answer for any id, to any signed-in user | `00592:63-74`, `:83-97` |
| R7-m3 | `tax_id_last4` is `char(4)` (blank-padding) and unchecked | `00592:117` |
| R7-m4 | `retainage_bps` has no range CHECK | `00592:119` |
| R7-m5 | `studio_channel_consent.channel_value` has no normalising trigger | `00594:166-205` |
| R7-m6 / R6-m19 | see **R8-m4** | report §5 |
| R6-m2 | `p_origin_project_id` is never checked against the studio | `00594:1202`, `:1286`, `:1524` |
| R6-m3 | the one fail-open read left in `channelConsentVerdict` (no-studio branch drops the error) | `sms.ts:504-512` |
| R6-m4 | the fold's tiebreak ranks a `granted` row by its opt-out date | `00594:355-356` |
| R6-m5 | the mirror fans studio-private consent evidence onto client-visible seats (`00420:373-383` is row-wide) | `00594:774-784` |
| R6-m6 | `studio_contacts.trades` takes any string (re-demonstrated) | `00592:115` |
| R6-m7 | `studio_contact_rules` engagement rows orphan invisibly and undeletably | `00592:718-719` |
| R6-m8 | a channel row can be stored with an empty value (re-demonstrated) | `00593:245-248` |
| R6-m9 | nothing enforces one preferred channel per kind (re-demonstrated) | `00593:69` |
| R6-m10 | `reach_preference` neither built nor listed as not built — **fifth round** | direction §7; grep empty in both files |
| R6-m11 | the rule vocabulary cannot say "never text, calling is fine" (F-27, F-10) | `00592:777-786` |
| R6-m12 | 00593 leg (c) is non-sargable and calls the evidence test twice per row | `00593:430-442` |
| R6-m13 | the seat gate is a read-then-write on the INSERT path (the file admits it at `:1303`) | `00594:1095-1120` |
| R6-m14 | an `email` refusal is a one-way door — restated with the mechanism as **R8-m3** | `00594:168`, `:1229` |
| R6-m15 | dropped-error reads on the send path | `sms.ts:517-521`, `:536-540`; `pipeline.ts:333-341` |
| R6-m16 | 00593's channel vocabulary drops four kinds crm-model §2 lists, and the report still does not say so | `00593:54-60`, `:87-90` |
| R6-m17 | `escalation_by_class` takes channel names nothing can match (re-demonstrated) | `00592:728` |
| R6-m18 | the fold's `opt_out_recorded_by` names whoever recorded the *consent* | `00594:398` |
| R6-m20 | the mirror has no DELETE branch; `service_role` holds DELETE | `00594:894-896` |
| R6-m21 | `studio_verdict` has no recorder ("who decided", crm-model §5) | `00592:109-110` |
| R6-m22 | a seat-only refusal is still destroyed by removing the seat, and the report's §5 still does not say so | `use-coordination.ts:808`; report §5 |

R7-m1, re-demonstrated this round — winner carries an ANSWERED opt-out
(2026-08-01, consented 2026-09-01), sibling carries the unanswered one
(2025-11-16):

```
 status  | refusal_unanswered |       opt_out_at       | opt_out_source |        opt_out_evidence         |  opt_out_recorded_at   | recorded_before_it_happened
 granted | t                  | 2026-08-01 00:00:00+00 | inbound_sms    | Replied STOP on the Rusk thread | 2025-11-16 00:00:00+00 | t
```

The record says the refusal arrived by text on 1 Aug 2026 and was written down
nine months earlier. Sendability is right; R-Q's date is not, and
`opt_out_recorded_at < opt_out_at` is self-contradictory. This wave's own mirror
now COALESCEs both dates onto the seats (`00594:776-777`), so seats will
routinely carry both and the shape becomes ordinary after this ships.

---

## 3. Checks that came back clean

- Numbering; both grafted bodies verbatim from their grep-winners; banner
  headers on all three files naming lineage, RLS, and the grants regeneration.
- Idempotent re-run of all three files in one transaction, mirror trigger live.
- RLS enabled with policies in the SAME file for all four new tables, the right
  predicate per table per the brief, explicit grants both directions,
  `REVOKE … FROM PUBLIC, anon` on every definer RPC (plus `authenticated` on the
  eight only triggers call), and `00-legacy-grants.sql` regenerating byte-identical.
- All SECURITY DEFINER bodies pin `search_path`; no unqualified extension
  function (`gen_random_uuid()` only).
- Backfill precedence (`opted_out` over `granted` over `pending` over
  `not_asked`) and per-org isolation — blocks 3, 6; probed again here.
- The mirror cannot loop; its suppression window is exactly its own UPDATE; its
  release path is durable-only and calls no edge function.
- The send gate fails closed in every branch but R6-m3's, in both send paths,
  and no studio-side sequence composes back past a refusal (blocks 14, 16, 16B,
  22, 26, 27).
- No client-portal read path to any new table (`grep` over `apps/client-portal`,
  `apps/mobile`, `packages` → nothing but `database.types.ts`); the site access
  card (PR-w) is not built in W1a, by instruction.
- `people_directory` untouched, all twelve columns intact; no reader's selected
  column moved.
- Vocabulary matches the direction and crm-model: `company_kind` is
  crm-model §2 verbatim plus the two documented additions, the consent statuses
  are §3.8's four words, the channel-kind CHECK and the rule's two `<@` CHECKs
  are one seven-name list. No enum `ADD VALUE`, no cron, money in integer basis
  points, no prod command or Strata reference anywhere in the wave.
- Generated types and the legacy-grants seed both regenerate with an empty diff;
  508 insertions and zero deletions against the wave's base commit.

## 4. Recommendation

Two majors, both in objects this wave introduces, both one narrow branch of SQL
to close:

1. **R8-M1** is the one to take first — it is wrong data on the surface every
   shipped reader uses, minted by the first prod fold with no later act by
   anyone, and it is the third round in a row that this same sentence ("R-Q read
   off the seat") has had to be repaired. Take the fix WITH the sibling-seat
   case added to block 27; the block as written cannot see this.
2. **R8-M2** costs one trigger and closes the other half of two rulings
   (R-AP, r6 M6-4) that currently hold only against writes to the referencing
   table.

Of the minors, **R8-m1** is worth taking alongside R8-M1 (same fold, same
confusion of the two evidence sets), and **R7-m1** alongside them for the same
reason the last round gave: the mirror's two-date COALESCE is what makes it
ordinary in production. **R6-m10** is now in its fifth round and costs one line
of §5 either way, and **R8-m4** says the report itself no longer describes the
branch it documents.
