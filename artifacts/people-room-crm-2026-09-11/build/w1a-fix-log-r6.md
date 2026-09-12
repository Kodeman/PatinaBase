# W1a — fix log, round 6

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`. Local Supabase only — no
`supabase db push`, no `supabase functions deploy`, no Strata contact.
`ls apps/*/.env.local` → `no matches found` (checked before the first reset).

> **Path note.** The brief named `w1a-fix-log-r2.md`. That file is round 2's log
> and is left as it stands; this round follows the branch's own r3/r4/r5
> convention.

Scope: the six findings in the round-6 review (`w1a-review-r2-migrations.md`,
post-r5 pass) — **B6-1**, **M6-1**, **M6-2**, **M6-3**, **M6-4**, **M6-5**.
Nothing else was changed; the sixteen minors are untouched.

## Gates run

```
$ pnpm --dir <worktree> supabase:reset                       # full replay + seeds, twice (after the migration
                                                              # edits, and again after the legacy-grants regen)
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
… 1. … 25. the channel vocabulary is checked, both ways (r6 M6-5): passed
NOTICE:  All W1a assertions passed.
ROLLBACK

$ deno test --config supabase/functions/deno.json --no-check -A supabase/functions/_shared/sms.test.ts
ok | 35 passed | 0 failed (32ms)
$ deno test --config supabase/functions/deno.json --no-check -A supabase/functions/_tests/sms-inbound.test.ts
ok | 35 passed | 0 failed (29ms)
$ deno check --config supabase/functions/deno.json supabase/functions/_shared/sms.ts
Check supabase/functions/_shared/sms.ts

$ SUPABASE_DB_URL=… pnpm --dir <worktree> db:generate
$ git diff --stat packages/supabase/src/database.types.ts
(no output — CHECK constraints, trigger functions and function-body changes do
 not move the generated types)

$ python3 scripts/generate-legacy-grants.py
wrote … — baseline + 2632 replayed statements
$ git diff --stat supabase/seed/00-legacy-grants.sql
 supabase/seed/00-legacy-grants.sql | 6 ++++++     ← only the new
                                                     assert_studio_contact_rule_route() REVOKE
```

No root `deno.lock` was left behind (the first `deno test` run predated the
`--config` flag and minted one; it was removed and the runs repeated with the
shared config).

---

## B6-1 — `pending` was an ungated first hop through the seat-refusal gate

`supabase/migrations/00594_studio_channel_consent.sql`

### What changed

The R-AL seat gate was stated on **which verdict is being written**. It is now
stated on **whether a refusal stands**.

* `:800` (pre-write test `2a`): `IF p_status = 'granted'` → `IF p_status <>
  'opted_out'`.
* the upsert's `DO UPDATE … WHERE`, both legs: `EXCLUDED.status <> 'granted'` →
  `EXCLUDED.status = 'opted_out'` — the refusal-unanswered leg and the seat leg
  alike.
* the `IF NOT FOUND` diagnostic leg that names a seat refusal for what it is:
  `IF p_status = 'granted' AND EXISTS (…)` → `IF p_status <> 'opted_out' AND
  EXISTS (…)`, so a refused `pending` prints `channel_opted_out` with the seat
  hint rather than `consent_awaiting_recipient`.
* the section's prose, the in-body `§2` narrative, the `COMMENT ON FUNCTION`
  and the `refusal_unanswered` column comment all restate the rule as "every
  verdict but `opted_out`".

Recording the refusal stays open from every state — that is the way forward,
not around.

### Consequence deliberately taken

A studio may no longer **re-record `pending`** over a record whose
`refusal_unanswered` is TRUE. Test 16d asserted the old behaviour and was
rewritten to assert the new one (`consent_awaiting_recipient`, the record's
evidence unchanged), plus a new 16d3 showing that re-recording the *refusal* is
still accepted. The studio-side act that survives is reconsent(), which is the
door PR-m names; `granted` stays the recipient's to give.

### Evidence

`probe5.sql`, re-run verbatim, now aborts on its first call:

```
$ psql … -f build/probe5.sql
ERROR:  channel_opted_out
```

`build/probe8-r6.sql` is the same walk with the refusals caught, so the whole
state prints:

```
NOTICE:  PROBE8a: pending refused with channel_opted_out
NOTICE:  PROBE8b: granted refused with channel_opted_out
NOTICE:  PROBE8c: the STOP seat reads status=opted_out opt_out_at=2025-12-03 00:00:00+00
NOTICE:  PROBE8d: consent records minted on the number = 0
```

New SQL test block **22** (22a–22f) covers it in the suite, including B6-1's
required case — a dated `opted_out` seat plus
`record_channel_consent(… 'pending' …)` must raise `channel_opted_out` (22c) —
and 22f proves the gate does not over-refuse a clean number. Block **14** grew
two source-shape assertions: no leg may contain `EXCLUDED.status <> 'granted'`
(14a2) and no seat test may contain `pp.sms_opt_out_at IS NOT NULL` (14a3).
Those two run against a **comment-stripped** `pg_get_functiondef`, since the
body's own prose quotes the wording being asserted gone.

---

## M6-1 — the seat test failed open for a DATELESS refusal

`supabase/migrations/00594_studio_channel_consent.sql`

### What changed

`AND pp.sms_opt_out_at IS NOT NULL` is gone from all three seat tests (the
pre-write test, the `DO UPDATE … WHERE` leg, and the `IF NOT FOUND`
diagnostic). The write door now asks exactly what the read door asks:
`sms_consent_status = 'opted_out'`, scoped to this org.

The reviewer is right that R-AL's "dated" qualifier contradicted r4's own B-1
evidence, and right that `00594:673-677`'s claim was false as written —
`orgHasOptedOutParty` (`supabase/functions/_shared/sms.ts:360-364`) filters on
`sms_consent_status` alone with no date test. That paragraph was rewritten to
say what the test actually does, and to name the population (the shipped
portal's deliberate "opted out, date unknown", every pre-00432 row).

### Evidence

`probe1.sql` (one `granted` call over a dateless `opted_out` seat), re-run:

```
NOTICE:  PROBE1: refused with channel_opted_out
NOTICE:  PROBE1: the dateless-refusal SEAT now reads status=opted_out opt_out_at=<NULL> consented_at=<NULL>
```

Test block 22 carries both shapes side by side: 22a/22b the dateless seat
(grant and pending), 22c the dated one, 22d that neither seat moved and no
record was minted.

---

## M6-2 — the mirror wrote NULL over a real, dated refusal

`supabase/migrations/00594_studio_channel_consent.sql`

### What changed

`mirror_channel_consent_to_parties()` now COALESCEs the two dates exactly as
R-AN made it COALESCE the four evidence columns:

```
sms_consented_at = COALESCE(NEW.consented_at, pp.sms_consented_at),
sms_opt_out_at   = COALESCE(NEW.opt_out_at,   pp.sms_opt_out_at),
```

and the whole-tuple `IS DISTINCT FROM` guard compares against the COALESCEd
values for both dates, so a NULL the COALESCE is not going to write no longer
counts as a difference (the same treatment the evidence columns already had).
The **status** is still copied outright — the verdict is the fact the record
owns.

### Evidence

`build/probe8-r6.sql`, final leg — the inbound rail's own write (status
`granted`, a fresh `consented_at`, **no** `opt_out_at`), which is now the only
writer that can still reach a seat carrying a standing refusal:

```
NOTICE:  PROBE8g: after the inbound START the seat reads status=granted
         opt_out_at=2025-12-03 00:00:00+00 consented_at=2026-06-01 00:00:00+00
```

Before the fix that `opt_out_at` went to NULL (the reviewer's probe5 reading).
New SQL test block **23** asserts both directions of R-Q's pair: a grant that
carries no `opt_out_at` leaves the refusal date standing (23b), and a refusal
that carries no `consented_at` leaves the grant date standing (23d).

---

## M6-3 — the send rail could not see `refusal_unanswered`

`supabase/functions/_shared/sms.ts`

### What changed

`channelConsentVerdict()` selects `status, refusal_unanswered` and refuses
while the flag stands:

```ts
if (status === "opted_out") return "refuse";
if (row.refusal_unanswered === true) return "refuse";
```

The primary of the two options the finding offered was taken — a flat refusal,
not "everything except a rate-limited invite". Nothing in the rulings lets the
studio-side invite through per PR-m, and an unanswered refusal is precisely the
state in which `granted` is the recipient's to give. The door reopens the one
way it is supposed to: the inbound rail writes `refusal_unanswered = (status
=== "opted_out")` (`sms-inbound/pipeline.ts:372`), so a YES/START lowers it.

The function's doc comment now says why `status` is not the whole verdict, and
the "unknown" bullet says "with no refusal standing behind it".

### Evidence

Four new Deno tests in `supabase/functions/_shared/sms.test.ts`, staged on
exactly the state `probe4.sql` produced (record `pending` +
`refusal_unanswered` true, every seat mirrored off `opted_out`):

```
an unanswered refusal refuses the send, whatever the status now says ... ok
the opt-in invite does not slip past an unanswered refusal ... ok
a pending record with no refusal behind it still takes the invite ... ok
the recipient's own START reopens the door ... ok

ok | 35 passed | 0 failed
```

The second is the send the reviewer traced: `templateKey
'sms_optin_invite'`, a `pending` seat carrying reconsent's fresh evidence. It
now returns `{ sent: false, reason: "opted_out" }` with no `sms_messages` row.

---

## M6-4 — `route_to_person_id`, the fourth self-FK, was unguarded

`supabase/migrations/00592_people_cards_affiliations_rules.sql`

### What changed

`assert_studio_contact_rule_route()` — a `BEFORE INSERT OR UPDATE OF
route_to_person_id, subject_id, subject_type` trigger on
`studio_contact_rules`, in the shape of `assert_affiliation_card_kinds()` /
R-AP. A non-NULL route must name a **person** card in the **subject's own**
organization and must not be the subject itself:

* `rule_route_is_self` — "write themselves instead" is not a route;
* `rule_route_not_a_person` — a firm is not a name a designer can write to;
* `rule_route_other_studio` — a route is a fact inside one rolodex;
* `rule_subject_studio_unresolved` — a route that cannot be checked is not a
  route that may be stored.

The subject's org is resolved the way this table's own RLS resolves it:
`studio_contact_org()` for a card subject, and for an `engagement` subject
through the project — `COALESCE(p.studio_id,
public._primary_studio_for(p.designer_id))`, the same expression 00594's mirror
uses. `SECURITY DEFINER`, `SET search_path TO 'public'`, `REVOKE ALL … FROM
PUBLIC, anon, authenticated` (and the regenerated legacy-grants line).

### Evidence

```
$ psql … -f build/probe2.sql
NOTICE:  PROBE2a: refused rule_route_other_studio      (was: ACCEPTED)
$ psql … -f build/probe3.sql
NOTICE:  PROBE3a: refused rule_route_is_self           (was: ACCEPTED)
NOTICE:  PROBE3b: refused rule_route_is_self           (was: ACCEPTED — this probe's
                                                        row is both a self-route and a
                                                        company route; self is tested first)
```

New SQL test block **24** covers all four errors independently and both happy
paths: 24a cross-studio, 24b self, 24c a company card (a distinct row, so the
self-check cannot mask it), 24d a same-studio person accepted, 24e the UPDATE
path, 24f the engagement leg (refused cross-studio, accepted same-studio),
24g a routeless rule untouched.

---

## M6-5 — `channels_allowed` / `channels_forbidden` took anything

`supabase/migrations/00592_people_cards_affiliations_rules.sql`

### What changed

Both columns are now CHECKed with `<@` against 00593's `channel_kind`
vocabulary verbatim — `mobile, office, dispatch, after_hours, email, ap_email,
portal_311` — stated in the `DROP CONSTRAINT IF EXISTS` / `ADD CONSTRAINT`
idiom so a rerun can widen it. Both columns gained a COMMENT saying why: a
value the composer cannot match is not a forbidding, it is a silent permission,
inside the one table Decision 1 made the home of that fact. `'{}'` (the default,
and the ordinary state) stays legal.

### Evidence

`probe3.sql`'s 3c now reports ACCEPTED only because its two preceding INSERTs
are refused, so its UPDATE matches zero rows — a false negative of the probe,
not of the constraint. `build/probe8-r6.sql` runs the same value on an INSERT
that really lands:

```
NOTICE:  PROBE8e: refused new row for relation "studio_contact_rules" violates
         check constraint "studio_contact_rules_channels_forbidden_check" (23514)
NOTICE:  PROBE8f: the real vocabulary ACCEPTED
```

New SQL test block **25**: 25a the reviewer's own `{carrier pigeon,sms}`, 25b
the near-misses `{never_text}` `{SMS}` `{txt}` `{phone}`, 25c the same rule on
`channels_allowed`, 25d the whole real vocabulary accepted on both columns and
the empty array still legal.

---

## Files touched

```
supabase/migrations/00592_people_cards_affiliations_rules.sql   M6-4, M6-5 (+ banner)
supabase/migrations/00594_studio_channel_consent.sql            B6-1, M6-1, M6-2 (+ prose/COMMENTs)
supabase/functions/_shared/sms.ts                               M6-3
supabase/functions/_shared/sms.test.ts                          M6-3 — 4 new Deno tests
supabase/tests/people/w1a_identity_channels_consent_test.sql    blocks 22–25 new; 14a and 16d amended
supabase/seed/00-legacy-grants.sql                              regenerated (1 new REVOKE)
artifacts/.../build/probe8-r6.sql                               new confirmation probe
artifacts/.../build/w1a-report.md                               decisions 12 and 18 restated for B6-1
```

---

# W1a — fix log, R6 round (`w1a-review-r6-migrations.md`)

> **Name note.** This section is appended to `w1a-fix-log-r6.md` by the brief.
> It is NOT the round-6 log above (B6-1 / M6-1…M6-5); it is the round whose
> review file is `w1a-review-r6-migrations.md` and whose findings are
> **R6-M1** and **R6-M2**. Nothing else in that review — the 22 minors — was
> touched.

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`. Local Supabase only — no
`supabase db push`, no `supabase functions deploy`, no Strata contact.
`ls apps/*/.env.local` → `no matches found` (checked before the reset).

## R6-M1 — a refusal with no recorded source no longer reads as the studio's own consent on every seat

**What changed.** `supabase/migrations/00594_studio_channel_consent.sql`,
`mirror_channel_consent_to_parties()`, the refusal branch:

```diff
   IF NEW.status = 'opted_out' THEN
-    v_seat_source      := COALESCE(NEW.opt_out_source,      NEW.source);
-    v_seat_evidence    := COALESCE(NEW.opt_out_evidence,    NEW.evidence);
-    v_seat_recorded_at := COALESCE(NEW.opt_out_recorded_at, NEW.recorded_at);
-    v_seat_recorded_by := COALESCE(NEW.opt_out_recorded_by, NEW.recorded_by);
+    v_seat_source      := NEW.opt_out_source;
+    v_seat_evidence    := NEW.opt_out_evidence;
+    v_seat_recorded_at := NEW.opt_out_recorded_at;
+    v_seat_recorded_by := NEW.opt_out_recorded_by;
```

The first of the finding's two candidate fixes, taken because it is the one that
actually closes the demonstrated case. The second (promote the standing consent
set into the refusal set inside `record_channel_reconsent()`) does **not**: on
the demonstrated record both `opt_out_source` and `source` are NULL at the
moment of promotion, so `COALESCE(scc.opt_out_source, scc.source)` is still
NULL, `source` is then overwritten with the studio's fresh consent, and the
mirror's `COALESCE(NEW.opt_out_source, NEW.source)` fires exactly as before.
Dropping the consent-set terms is also what R-AN asks for — the seat's own
standing value is the fallback, and `COALESCE(v_seat_*, pp.sms_consent_*)` in
the UPDATE (and in the tuple guard) still means no non-null column is ever
overwritten with NULL.

The removed fallback is safe to remove: every writer that mints a refusal WITH
words fills `opt_out_*` — `record_channel_consent`'s `opted_out` branch writes
`CASE WHEN p_status = 'opted_out' THEN p_source END` and its three siblings
(and `p_source`/`p_evidence` are required), and the inbound STOP rail writes all
four (`supabase/functions/sms-inbound/pipeline.ts:394-405`). A NULL there
therefore means the refusal never had words, not that they live on the consent
side. The population the comment claimed the fallback existed for — "legacy rows
minted before `opt_out_*` existed" — cannot exist, because 00594 creates the
table with all four columns.

Prose updated in the same file: the block comment above the branch, and
`COMMENT ON FUNCTION public.mirror_channel_consent_to_parties()`.

**Evidence — the reviewer's own repro, re-run against the fixed stack.**

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
    -f artifacts/people-room-crm-2026-09-11/build/probe11-r6-sourceless-refusal.sql
--- record after the fold (the shipped portal's sourceless, dateless refusal) ---
  status   | refusal_unanswered | source | evidence | opt_out_source | opt_out_evidence
-----------+--------------------+--------+----------+----------------+------------------
 opted_out | t                  |        |          |                |

--- seat BEFORE reconsent ---
 sms_consent_status | sms_consent_source | sms_consent_evidence
--------------------+--------------------+----------------------
 opted_out          |                    |

  status   | source  |                evidence                 | opt_out_source
-----------+---------+-----------------------------------------+----------------
 opted_out | written | Signed a fresh consent form 11 Sep 2026  |

--- seat AFTER the studio reconsent (R-Q reads THIS) ---
 sms_consent_status | sms_consent_source | sms_consent_evidence | sms_consent_recorded_at
--------------------+--------------------+----------------------+-------------------------
 opted_out          |                    |                      |
```

Before the fix that last row read
`opted_out | written | Signed a fresh consent form 11 Sep 2026 | 2026-09-12 …`.
The studio's fresh consent still lands on the RECORD (middle result, `source =
written`), which is what `record_channel_reconsent()` is for; it no longer
travels onto the seat as the refusal's own words.

**Assertion added** — SQL test block 27, sub-cases 27i–27i5
(`supabase/tests/people/w1a_identity_channels_consent_test.sql`). A new seat
`e…a9` (Ola Nyquist, `612-555-0433`) carries the portal's sourceless refusal;
the block folds it, asserts the record is minted `opted_out` /
`refusal_unanswered` with `opt_out_source`, `opt_out_evidence`, `source` and
`evidence` all NULL, asserts the seat says nothing about the refusal, then calls
`record_channel_reconsent(...,'written','Signed a fresh consent form at the
walkthrough','field-sms-v1')` and asserts the record took the studio's consent
while the seat's `sms_consent_source` / `sms_consent_evidence` stayed NULL and
its status stayed `opted_out`.

## R6-M2 — the fold keeps the refusal's date as well as its words

**What changed.** Same file, `backfill_channel_consent_from_parties()`:

```diff
   refusal AS (
     SELECT org, phone_e164,
+           sms_opt_out_at,
            sms_consent_source      AS opt_out_source,
 ...
     SELECT r.org, 'sms', r.phone_e164, r.sms_consent_status,
-           r.sms_consented_at, r.sms_opt_out_at,
+           r.sms_consented_at,
+           COALESCE(r.sms_opt_out_at, f.sms_opt_out_at),
```

Exactly the finding's fix. Prose updated above the CTE and in
`COMMENT ON FUNCTION public.backfill_channel_consent_from_parties()`.

**Evidence — the reviewer's own repro, re-run against the fixed stack.**

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
    -f artifacts/people-room-crm-2026-09-11/build/probe12-r6-fold-refusal-date.sql
 status  | refusal_unanswered |       opt_out_at       | opt_out_source |        opt_out_evidence         |  opt_out_recorded_at   |      consented_at
---------+--------------------+------------------------+----------------+---------------------------------+------------------------+------------------------
 granted | t                  | 2025-11-16 00:00:00+00 | inbound_sms    | Replied STOP on the Rusk thread | 2025-11-16 00:00:00+00 | 2026-02-02 00:00:00+00
```

`opt_out_at` was empty in that column before the fix. Sendability is unchanged
(`refusal_unanswered = t` either way); what is restored is R-Q's date and the
second strand of the write gate's belt-and-braces pair.

**Assertion added** — SQL test block 3, sub-case 3c6, on the fixture the block
already carries (seat `e…0006` reads `granted` while holding an unanswered
2025-11-16 opt-out, and the clean 2026 grant wins the ranking):

```sql
ASSERT r.opt_out_at = '2025-11-16T00:00:00Z'::timestamptz,
  'FAIL 3c6: the refusing sibling''s own opt-out date must land on the record, got ' …
```

**Dry run and report.** `artifacts/.../build/probe10-r9-fold-dry-run.sql` now
selects `sms_opt_out_at` in its `refusal` CTE and prints
`COALESCE(r.sms_opt_out_at, f.sms_opt_out_at) AS opt_out_at` beside
`opt_out_recorded_at`; §5 of `w1a-report.md` carries the same shape and says why
the two dates are printed together. Run locally it is still 0 rows (no seeded
party phones); run over the W4-M1 fixture it now agrees with the fold:

```
                 org                  |  phone_e164  | sms_consent_status | refusal_unanswered |       opt_out_at       | opt_out_source |        opt_out_evidence         |  opt_out_recorded_at
--------------------------------------+--------------+--------------------+--------------------+------------------------+----------------+---------------------------------+------------------------
 b2000000-0000-4000-8000-00000000000a | +16125550777 | granted            | t                  | 2025-11-16 00:00:00+00 | inbound_sms    | Replied STOP on the Rusk thread | 2025-11-16 00:00:00+00
```

## Gates run, with output

```
$ pnpm --dir <worktree> supabase:reset
…
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}

$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
NOTICE:  1. affiliations + RLS: passed
…
NOTICE:  3. consent backfill precedence: passed          # now carries 3c6
…
NOTICE:  27. reconsent is evidence-only and re-callable (r7 M7-2), leaves the
         refusal's own evidence standing (r8 W4-M2), the seat carries the
         refusal's own words too (r9 R5-M1), and a sourceless refusal is never
         given the studio's consent as its words (r6 R6-M1): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
                                                          # 28 blocks, all pass

$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts
ok | 71 passed | 0 failed (116ms)

$ psql … -v ON_ERROR_STOP=1 -f artifacts/.../build/rerun.sql   # all three files re-executed, rolled back
 rerun 00592 ok
 rerun 00593 ok
 backfill_channel_consent_from_parties
                                     0
 rerun 00594 ok

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir <worktree> db:generate
$ git diff --stat packages/supabase/src/database.types.ts
                                                          # (empty — bodies only, no signature or column change)
```

No GRANT or REVOKE line changed in this round
(`git diff 00594 | grep -c '^[+-].*GRANT\|^[+-].*REVOKE'` → `0`), so
`scripts/generate-legacy-grants.py` was not re-run and
`supabase/seed/00-legacy-grants.sql` is untouched.

## Files touched

```
supabase/migrations/00594_studio_channel_consent.sql            R6-M1 (mirror branch + COMMENT),
                                                                R6-M2 (refusal CTE + INSERT + COMMENT)
supabase/tests/people/w1a_identity_channels_consent_test.sql    3c6 (R6-M2); 27i–27i5 + new seat e…a9 (R6-M1)
artifacts/.../build/probe10-r9-fold-dry-run.sql                 prints opt_out_at (R6-M2)
artifacts/.../build/w1a-report.md                               §5 dry-run shape, decisions 21(b) and 22,
                                                                the pasted block-27 notice, the block prose
artifacts/.../build/rerun.sql                                   regenerated from the edited migrations
```
