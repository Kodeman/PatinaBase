# W1a — fix log, round 10 (M1, M2)

Worktree `.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, base of this round `3ddd0ddc4`.
Local Supabase only — no `supabase db push`, no `supabase functions deploy`,
nothing touched on Strata.

---

## M1 — a STOP over a standing grant was recorded as a refusal IN WRITING

**Finding.** `project_parties` holds ONE evidence set per seat, and it belongs
to whatever wrote the row's CURRENT status. The shipped inbound STOP rail
(`optOutAllForPhone()`, unchanged from `origin/main`) flipped
`sms_consent_status` to `opted_out` and stamped `sms_opt_out_at` while leaving
the GRANT's four evidence columns standing. The fold's `refusal` CTE projected
those four on a status test alone, so for the commonest real refusal on the
books — a seat with a recorded grant that later texted STOP — it minted
`opt_out_source = 'written'`, `opt_out_evidence = 'Signed the … kickoff form'`,
an `opt_out_recorded_at` seven months BEFORE `opt_out_at`, and an
`opt_out_recorded_by` naming the studio member who recorded the GRANT (the
attribution r7 R7-M1 and r9 R5-M2 both ruled must be NULL on a rail-written
STOP). R-Q's sentence became "Opted out IN WRITING, 3 Dec 2025"; and because
`opt_out_source` came out non-NULL, the mirror's R-AQ wordless branch never
fired, so the grant's paperwork was stamped onto every sibling seat in the
studio on that number. Permanent — `ON CONFLICT DO NOTHING` never repairs it,
reconsent never touches `opt_out_*`, and `record_channel_consent`'s protective
arm only guards `inbound_sms`. Not a send-safety hole (`refusal_unanswered`
comes out true either way), but evidence destruction and false carrier-audit
attribution on the first prod fold, with no act by anyone.

### (a) the fold — `supabase/migrations/00594_studio_channel_consent.sql`

The `refusal` CTE no longer trusts a seat's evidence on status alone. A new
inner level computes one boolean and both the projection and the ranking leg
read it (the r4 R4-M1 precedent: the words leg must ask the same question the
projection asks, or the picker prefers the contaminated row):

```sql
SELECT party_org.*,
       (sms_consent_status = 'opted_out'
        AND sms_consent_source IS NOT NULL
        AND (sms_consent_source = 'inbound_sms'
             OR sms_opt_out_at IS NULL
             OR sms_consent_recorded_at IS NULL
             OR sms_consent_recorded_at >= sms_opt_out_at))
         AS refusal_words_are_its_own
  FROM party_org
 WHERE …
```

Either the evidence says so itself (`inbound_sms` — only the rail writes it), or
nothing about it contradicts the refusal (written down no earlier than the
refusal happened, or one of the two dates absent). Otherwise all four project
NULL, together, which is the shape R-AQ reads. The DATE legs are untouched.

`ranked` is deliberately NOT given the test, and the file says why at the line:
its winner supplies the record's status, origin project and CONSENT set, and on
a STOP-flipped seat all three are right — the grant really was signed, so it
belongs on the consent side, and that seat carries the refusal's real date.
`COMMENT ON FUNCTION backfill_channel_consent_from_parties()` restated.

### (b) the rail — `supabase/functions/sms-inbound/pipeline.ts`

`optOutAllForPhone()` now writes the refusal's own set alongside the status —
the same set the record gets above it and the same set 00594's mirror writes
onto these seats for this verdict:

```ts
.update({
  sms_consent_status: "opted_out",
  sms_opt_out_at: now,
  sms_consent_source: "inbound_sms",
  sms_consent_evidence: evidence,     // `Inbound ${upper}` — the keyword as it arrived
  sms_consent_recorded_at: now,
  sms_consent_recorded_by: null,      // nobody in the studio recorded this
})
```

The evidence string is hoisted once at the call site (`const stopEvidence =
\`Inbound ${upper}\``) and passed to both `writeChannelConsent()` and
`optOutAllForPhone()`, so the record and the seats say the same thing about the
same STOP. `sms_consent_disclosure_version` is not touched: which disclosure the
person was shown is a fact about the grant, and the mirror keeps it too.

### Evidence

Pre-fix behaviour, reproduced against the shipped fold body in a rolled-back
transaction (`build/probe24-r10-M1-prefix-fold.sql` — `git show HEAD:…00594…`
lines 352-580 re-declared inside `BEGIN … ROLLBACK`):

```
  status   | refusal_unanswered |       opt_out_at       | opt_out_source |         opt_out_evidence          |  opt_out_recorded_at   |         opt_out_recorded_by
-----------+--------------------+------------------------+----------------+-----------------------------------+------------------------+--------------------------------------
 opted_out | t                  | 2025-12-03 00:00:00+00 | written        | Signed the Lindqvist kickoff form | 2025-05-02 00:00:00+00 | a0000000-0000-0000-0000-000000000004
```

The same seed against the fixed fold (`build/probe25-r10-M1-postfix-fold.sql`):

```
  status   | refusal_unanswered |       opt_out_at       | opt_out_source | opt_out_evidence | opt_out_recorded_at | opt_out_recorded_by | consent_source |         consent_evidence
-----------+--------------------+------------------------+----------------+------------------+---------------------+---------------------+----------------+-----------------------------------
 opted_out | t                  | 2025-12-03 00:00:00+00 |                |                  |                     |                     | written        | Signed the Lindqvist kickoff form

 sms_consent_status |     sms_opt_out_at     | sms_consent_source | sms_consent_evidence | sms_consent_recorded_at | sms_consent_recorded_by
--------------------+------------------------+--------------------+----------------------+-------------------------+-------------------------
 opted_out          | 2025-12-03 00:00:00+00 |                    |                      |                         |
```

The refusal keeps its date, says nothing it cannot say, the grant's paperwork
survives on the CONSENT side, and the seat is left wordless — so R-AQ's branch
fires where it was being suppressed.

### New SQL block 30f (beside 30e)

`supabase/tests/people/w1a_identity_channels_consent_test.sql`. Four seeded
seats: the STOP-flipped seat, a sibling seat the studio still holds on the same
number, and two controls.

- **30f1/30f2** — still an unanswered refusal, still dated 2025-12-03.
- **30f3** — all four `opt_out_*` NULL.
- **30f4** — the grant's paperwork stands on the record's CONSENT side
  (`written` / "Signed the Lindqvist kickoff form" / 2025-05-02 / recorder /
  `field-sms-v1` / `consented_at`), so nothing is lost, it is filed under the
  right act.
- **30f5/30f6** — both seats, the sibling included, end up saying nothing about
  a refusal they have no words for: R-AQ's branch fires.
- **30f7 (control A)** — the fixed rail's own write (`inbound_sms` / "Inbound
  STOP" / recorded the day of the STOP / recorded_by NULL) keeps every column.
- **30f8 (control B)** — a studio-recorded refusal written down the day AFTER
  it happened (`verbal` / "Told me on site to stop texting" / 2025-12-04) keeps
  its words and its recorder.

```
psql:…w1a_identity_channels_consent_test.sql:4036: NOTICE:  30f. a STOP over a standing grant is recorded wordless, the grant's paperwork stays on the consent side, and a real refusal keeps its words (r10 M1): passed
psql:…:4433: NOTICE:  All W1a assertions passed.
```

### New deno cases

`supabase/functions/_tests/sms-inbound.test.ts`:

- "STOP writes the refusal's own evidence over the grant's on every seat" — the
  seat comes out `inbound_sms` / "Inbound STOP" / `recorded_at = sms_opt_out_at`
  / `recorded_by = null`, `sms_consent_disclosure_version` untouched, and the
  record says the same.
- "an UNSUBSCRIBE stamps its own keyword on the seats, not a generic STOP".

### Dry run re-cut

`build/probe10-r9-fold-dry-run.sql` carries the function's CTE chain verbatim,
so its `refusal` CTE was re-cut with the same predicate and its header rewritten.
Checked on the r10 fixture, the dry run and the fold agree row for row
(`+16125550504 | opted_out | refusal_unanswered=t | 2025-12-03 | <blank> …`);
it still runs clean (0 rows) against the seeded local stack.

---

## M2 — the report was five commits stale and concealed a consent rule

**Finding.** `w1a-report.md` was written at `bc8f4fab8`-and-earlier while the
tip was `3ddd0ddc4`, and §3 claimed the opposite ("the section is at the branch
tip, not behind it"). Re-taken from the tip after this round's code landed.

| What was wrong | Now |
|---|---|
| §2 had no entry for the email door (r6 R6-M3) while decision 18 still read "No RPC in 00594 lowers it" and decision 12 "refuses every transition OUT of `opted_out`" | new **decision 27**; decisions 12 and 18 amended in place to name the email exception as a ruling-level amendment to how PR-m reads |
| §2 had no entry for the rule-only `sms` token (r4 R4-M2) | new **decision 28**; §1's 00592 row and §3's block-25 prose now say EIGHT names, not seven |
| §3's CHECK transcript printed a seven-name vocabulary the database contradicts | re-taken from `pg_constraint` — eight names, and the `studio_channel_consent_channel_kind_check` row that was missing entirely |
| §2 had no entry for r8 F1 (the rule-subject guard) | new **decision 29**; §1's 00592 row names it |
| §2 had no entry for the r7 second cycle (R7-M1/R7-M2/R7-M3, including the STOP that now answers 500 and releases `twilio_sid` — a live Twilio-webhook behaviour change) | new **decision 30**, and a paragraph in §1's edge-function bullet |
| "31 blocks … 30 notices", transcript ending at block 30 | **37 blocks** (1–34 plus 16B, 30e, 30f), **36 notices**; full notice list re-pasted, block 25's own changed notice included |
| "+210 lines / 2632 statements" | **216 lines / 2633**, with the `git diff --stat` and generator lines pasted |
| "ok \| 71 passed" (36 + 35) | **80 passed** (38 + 42); whole-suite line **703 passed / 1 failed** (the pre-existing `stripe-rail.test.ts` env failure) |
| §3's preamble claimed the section was current | rewritten to name this as the THIRD staleness recurrence in the wave, with the counts that catch it |

§5's pre-push dry-run paragraph now names the r10 re-cut and what a pre-r10 copy
of the script would tell the operator.

---

## Gates

```
$ pnpm --dir .codex/worktrees/agent-people-build supabase:reset
Applying migration 00592_people_cards_affiliations_rules.sql...
Applying migration 00593_studio_contact_channels.sql...
Applying migration 00594_studio_channel_consent.sql...
Applying migration 20260910152111_create_contact_messages.sql...
[…29 seed files…]
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}

$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql | grep -c NOTICE
37                     # 36 block notices + "All W1a assertions passed."

$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts
ok | 80 passed | 0 failed (307ms)

$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_tests/ supabase/functions/_shared/
FAILED | 703 passed | 1 failed (3s)
  ./supabase/functions/_tests/stripe-rail.test.ts (uncaught error)   # pre-existing, env

$ deno check --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.ts supabase/functions/sms-inbound/pipeline.ts
Check supabase/functions/_shared/sms.ts
Check supabase/functions/sms-inbound/pipeline.ts

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate
$ git diff --stat packages/supabase/src/database.types.ts
(empty — a function body changes no column and no signature)
$ git diff --stat 700261663 -- packages/supabase/src/database.types.ts
 packages/supabase/src/database.types.ts | 508 ++++++++++++++++++++++++++++++++

$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2633 replayed statements
$ git diff --stat -- supabase/seed/00-legacy-grants.sql
(empty — this round adds no GRANT or REVOKE)
```
