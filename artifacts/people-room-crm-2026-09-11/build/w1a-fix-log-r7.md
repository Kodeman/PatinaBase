# W1a fix log — round 7 (M7-1, M7-2)

Scope: exactly the two round-7 MAJOR findings. Nothing else in the wave was
touched. Local stack only — no `supabase db push`, no `functions deploy`, no
Strata.

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`
(branch `build/people-room-crm-2026-09-11`).

---

## M7-1 — a `granted`-on-`granted` call lowered `refusal_unanswered`

**Finding.** The upsert's `DO UPDATE … WHERE` exempted a record already at
`granted` (`OR scc.status = 'granted'`), and the write that got through then set
`refusal_unanswered = false`. Since r6's M6-3 fix that flag is what
`channelConsentVerdict()` refuses on, so one ordinary
`record_channel_consent(org,'sms',number,'granted',…)` by any studio member
turned sending back on with no recipient involved. Reachable from the first prod
fold: `backfill_channel_consent_from_parties()` raises the flag for ANY winning
row carrying an opt-out no later consent answered, whatever its status, so a
legacy `granted` seat with a stale `sms_opt_out_at` and no `sms_consented_at`
folds to `granted` + flag true.

**Ruling taken (finding's option (a) + (b), both halves).**

1. `OR scc.status = 'granted'` is **gone**. A standing refusal now behaves the
   same at every status; only `EXCLUDED.status = 'opted_out'` is exempt
   (recording the refusal is the way forward).
2. The door **never lowers the flag** on any verdict. The `SET` is now
   `CASE WHEN EXCLUDED.status = 'opted_out' THEN true ELSE scc.refusal_unanswered END`.
   Only the inbound rail's own `service_role` write (YES/START,
   `sms-inbound/pipeline.ts writeChannelConsent`) lowers it.
3. **The fold's flag expression stands** (the finding asked for a ruling on the
   non-`opted_out` winner): a legacy seat reading `granted` while carrying a
   dated opt-out no later consent answered is contradictory data, and the
   refusal is the half that fails closed. The record is minted UNSENDABLE and
   the recipient's own answer is what reopens it. That ruling is now stated in
   the fold's own comment (`00594`, `ins` CTE).
4. A folded row of that shape is not stranded: recording the refusal is always
   open, and from there `record_channel_reconsent()` puts the studio's fresh
   consent on the record.

**Prose restated** (the finding's third requirement): the migration banner, the
`COMMENT ON COLUMN studio_channel_consent.refusal_unanswered`, the in-body
justification that used to read *"the number is sendable either way"*, the
`COMMENT ON FUNCTION record_channel_consent`, the comment above the WHERE leg,
and `sms.ts`'s `channelConsentVerdict()` doc block + the line comment at the
flag check.

**Files.**
- `supabase/migrations/00594_studio_channel_consent.sql`
- `supabase/functions/_shared/sms.ts` (comments only — the r6 gate is unchanged)
- `supabase/functions/_shared/sms.test.ts` (new test)
- `supabase/tests/people/w1a_identity_channels_consent_test.sql` (blocks 14, 26)

**Evidence — the shipped SQL.**

```
$ psql … -tAc "SELECT substring(… pg_get_functiondef … 'WHERE (scc.status IS DISTINCT' …) FROM pg_proc …"
WHERE (scc.status IS DISTINCT FROM 'opted_out' OR EXCLUDED.status = 'opted_out')
  AND (EXCLUDED.status = 'opted_out' OR (scc.refusal_unanswered IS NOT TRUE
       AND (scc.opt_out_at IS NULL OR (scc.consented_at IS NOT NULL
            AND scc.consented_at > scc.opt_out_at)))) AND (EXCLUDED.status = 'opted_out' OR NOT …

$ psql … -tAc "… 'refusal_unanswered = CASE' …"
refusal_unanswered = CASE WHEN EXCLUDED.status = 'opted_out' THEN true ELSE scc.refusal_unanswered END, source = COALESCE(EXCLUDED…
```

**Evidence — behaviour.** New SQL block 26 replays the reviewer's probe end to
end: a legacy `granted` party row on `+16125550430` with `sms_opt_out_at
2025-12-03` and no `sms_consented_at` → fold → `granted | refusal_unanswered t`
→ `record_channel_consent(…'granted'…)` is refused
(`consent_awaiting_recipient`), the flag still stands, no `consented_at` and no
new evidence are stamped; `pending` is refused too; recording the refusal is
accepted; only the rail's own write lowers the flag, after which the studio's
grant is accepted. Deno: `a granted record carrying an unanswered refusal still
refuses` (the send side of the same row).

---

## M7-2 — `record_channel_reconsent()` landed in a state nothing could move

**Finding.** The door moved the record `opted_out → pending` while keeping
`refusal_unanswered = true`. After M6-3 that flag refuses EVERY send including
the opt-in invite (the wave's own Deno test asserts it), so nothing could
follow; `record_channel_consent` refused `granted` and `pending`; and
`reconsent()` could not be called again because it requires `opted_out`, which
it had just left. The mirror had meanwhile stamped `pending` over the party-row
refusal the send rail falls back on. Three in-file comments, the error HINT and
the `COMMENT ON FUNCTION` all still promised the double opt-in would run.

**Ruling taken: option (c) — the door is evidence-only and honest about it.**
Option (a) was rejected: letting one `sms_optin_invite` out to a number that
replied STOP is exactly the 10DLC/CTIA act M6-3 was written to stop, and no
studio-held paperwork licenses it. Option (b) (delete the door) throws away the
one place PR-m's fresh recorded consent can live.

So `record_channel_reconsent()` now:
- writes `source`, `evidence`, `recorded_at`, `disclosure_version`,
  `recorded_by`, `origin_project_id`;
- **leaves `status = 'opted_out'`**, `opt_out_at` and `refusal_unanswered`
  exactly as they stand (status is restated rather than left alone so a row a
  prior writer left odd is normalised, and so the `WHERE` remains the gate);
- therefore leaves the mirrored refusal on every seat — the party-row backstop
  is never cleared;
- stays **re-callable**, because it no longer moves the row off the status it
  requires;
- dispatches nothing (`fc_dispatch_optin_invite` fires on a mirrored `pending`,
  which this no longer writes).

PR-m is read on the record as: *the fresh recorded consent is what the studio
may WRITE; the inbound START is what reopens SENDING.* That amendment is stated
in the migration banner, the section comment, the `COMMENT ON FUNCTION`, and the
report's decision 18.

**Prose restated:** `00594` banner item 5, the `THE WRITE DOOR IS A TRANSITION
GATE` bullet, the section-5 header block (which used to say "landing on
`pending` so the double opt-in still runs"), the two `channel_opted_out` HINTs,
the `consent_awaiting_recipient` HINT, both `COMMENT ON FUNCTION`s, and the
historical narratives inside `record_channel_consent` that asserted the old
behaviour in the present tense. `sms.ts` and `sms.test.ts` comments likewise.

**Files.** Same four as above, plus `artifacts/…/build/w1a-report.md`
(decisions 17 and 18).

**Evidence — the shipped SQL.**

```
$ psql … -tAc "… 'UPDATE public.studio_channel_consent' …"
UPDATE public.studio_channel_consent scc SET status = 'opted_out', refusal_unanswered = true,
  source = p_source, evidence = p_evidence, recorded_at = v_now,
  disclosure_version = p_disclosure_version, recorded_by = auth.uid(), origin_pro…
```

**Evidence — behaviour.** New SQL block 27: refusal recorded and mirrored onto
the seat → `reconsent()` → record reads `opted_out | refusal_unanswered t` with
the studio's fresh evidence on it; the SEAT still reads `opted_out` and carries
the fresh evidence; a second `reconsent()` succeeds and restates the evidence
(re-callable); a `granted` after it is refused (`channel_opted_out`); the rail's
own answer then opens the studio's door. Blocks 9h/9h4, 16b–16d, 16Bc–16Bd,
19c3 and 22e were updated to the new expectations (a grant after reconsent is
now refused by the `opted_out` leg itself, so `channel_opted_out` rather than
`consent_awaiting_recipient`); block 14 gained source-shape assertions for both
r7 changes so neither can quietly come back.

---

## Verification run

```
$ pnpm --dir …/agent-people-build supabase:reset
… Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}

$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
NOTICE:  1. affiliations + RLS: passed
… (blocks 2–25 unchanged, all passed) …
NOTICE:  26. no studio-side verdict lowers refusal_unanswered (r7 M7-1): passed
NOTICE:  27. reconsent is evidence-only and re-callable (r7 M7-2): passed
NOTICE:  All W1a assertions passed.
ROLLBACK

$ cd supabase/functions && deno test --allow-all _shared/sms.test.ts
ok | 36 passed | 0 failed (44ms)

$ cd supabase/functions && deno test --allow-all _tests/sms-inbound.test.ts
ok | 35 passed | 0 failed (28ms)

$ SUPABASE_DB_URL=… pnpm --dir …/agent-people-build db:generate
$ git -C … diff --stat packages/supabase/src/database.types.ts
(no diff — no signature or column changed)
```

No `GRANT`/`REVOKE` was added or removed, so `scripts/generate-legacy-grants.py`
was not re-run (`supabase/seed/00-legacy-grants.sql` is untouched).

## Test-harness note (found while verifying, inside the scope of these fixes)

Four rail-simulating `UPDATE`s in the SQL test wrote `consented_at = now()`.
`now()` is frozen at transaction start, so the simulated YES/START carried the
same timestamp as the refusal it answered and the surviving date leg
(`consented_at > opt_out_at`) refused the studio's next grant. The old
`OR scc.status = 'granted'` escape had been hiding that. They now use
`clock_timestamp()`, which is what a real deployment produces (the rail's write
is a later transaction). Block 4 also needed `r RECORD` declared for the new
assertion.

---

## R7-M1 — the instructed door destroyed the inbound STOP's own date, source, words and recorder

**Finding (r7 migrations review, MAJOR).** `record_channel_consent`'s
`opted_out` branch stamped `v_now` into `opt_out_at` and wrote the caller's
`p_source` / `p_evidence` / `auth.uid()` straight over `opt_out_source` /
`opt_out_evidence` / `opt_out_recorded_at` / `opt_out_recorded_by`. Since r6's
B6-1 made "record that refusal here first" the only path past a seat refusal —
and both `channel_opted_out` hints now say so in words — one ordinary call by
any studio member turned `(inbound_sms, 'Inbound STOP', 3 Dec 2025, NULL)` into
`(verbal, 'He told me on site', today, that member)`, on the record and,
through the mirror, on every seat.

**What changed** — `supabase/migrations/00594_studio_channel_consent.sql`, five
`CASE` arms in the upsert's `DO UPDATE`, in the idiom already standing there:

- `opt_out_at = CASE WHEN EXCLUDED.status = 'opted_out' THEN LEAST(scc.opt_out_at, EXCLUDED.opt_out_at) ELSE scc.opt_out_at END`
  — the refusal keeps the date it arrived. `LEAST` skips NULLs, so a DATELESS
  refusal (what the shipped portal writes on purpose, and what the fold mints)
  does take the date of the refusal being recorded now: dating a refusal that
  had none, not overwriting one.
- `opt_out_source` / `opt_out_evidence` / `opt_out_recorded_at` /
  `opt_out_recorded_by` each grew a middle arm:
  `WHEN scc.opt_out_source = 'inbound_sms' AND EXCLUDED.opt_out_source IS DISTINCT FROM 'inbound_sms' THEN scc.<col>`.
  A studio-sourced refusal never speaks for a texted one. A second INBOUND
  refusal still restates all four (the carrier speaking again), and a studio
  refusal over a studio refusal still restates itself — the guard is about who
  said it, not about freezing the column.

The studio's own account is not lost: it lands on the CONSENT side (`source`,
`evidence`, `recorded_at`, `recorded_by`), which is where "we also heard it
verbally, and here is when we were told" belongs. Nothing here touches
`refusal_unanswered` (r7 M7-1 still holds) and no send is opened either way.

Header invariant (`:139-` bullet) and the function `COMMENT` both restate the
new rule.

**Test** — `supabase/tests/people/w1a_identity_channels_consent_test.sql`,
new block 28 (two new seats on the r6 seat-gate project, phones
`612-555-0435` / `612-555-0436`):

- 28a the inbound rail's own write (dated 3 Dec 2025, `inbound_sms`,
  'Inbound STOP', recorder NULL) reaches the seat;
- 28b one studio-side `opted_out` re-record (`verbal`, 'He told me on site') is
  ACCEPTED and leaves `opt_out_at`, `opt_out_source`, `opt_out_evidence`,
  `opt_out_recorded_at` and `opt_out_recorded_by` exactly as they stood, while
  the studio's account lands on the consent side;
- 28c the same assertions ON THE SEAT;
- 28d a second `inbound_sms` refusal restates the words and keeps the earliest
  date;
- 28e a studio refusal over a studio refusal restates itself, keeps the earliest
  date, and `opt_out_recorded_at > opt_out_at` (no refusal written down before
  it happened); the seat follows.

### Evidence

```
$ pnpm --dir …/agent-people-build supabase:reset
…
Restarting containers...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}

$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
…
NOTICE:  27. reconsent is evidence-only and re-callable (r7 M7-2), leaves the refusal's own
         evidence standing (r8 W4-M2), the seat carries the refusal's own words too (r9 R5-M1),
         and a sourceless refusal is never given the studio's consent as its words (r6 R6-M1): passed
NOTICE:  28. a studio-recorded refusal never speaks for a texted one, and the refusal keeps the
         date it arrived (r7 R7-M1): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
```

Negative control — the SAME scenario run first against the PRE-FIX body
(restored inside the transaction from `git HEAD`) and then against the shipped
one (`artifacts/people-room-crm-2026-09-11/build/probe14-r7-M1-negative-control.sql`):

```
--- the refusal as the carrier rail recorded it ---
       opt_out_at       | opt_out_source | opt_out_evidence |  opt_out_recorded_at   | opt_out_recorded_by
------------------------+----------------+------------------+------------------------+---------------------
 2025-12-03 00:00:00+00 | inbound_sms    | Inbound STOP     | 2025-12-03 00:00:00+00 |

--- PRE-FIX: after one studio-side opted_out re-record (record) ---
          opt_out_at           | opt_out_source |  opt_out_evidence  |      opt_out_recorded_at      |         opt_out_recorded_by
-------------------------------+----------------+--------------------+-------------------------------+--------------------------------------
 2026-09-12 02:55:18.424342+00 | verbal         | He told me on site | 2026-09-12 02:55:18.424342+00 | a0000000-0000-4000-8000-0000000000f1

--- PRE-FIX: and on the seat ---
        sms_opt_out_at         | sms_consent_source | sms_consent_evidence
-------------------------------+--------------------+----------------------
 2026-09-12 02:55:18.424342+00 | verbal             | He told me on site

--- SHIPPED: after the same studio-side opted_out re-record (record) ---
       opt_out_at       | opt_out_source | opt_out_evidence |  opt_out_recorded_at   | opt_out_recorded_by | consent_source |  consent_evidence  |         consent_recorded_by
------------------------+----------------+------------------+------------------------+---------------------+----------------+--------------------+--------------------------------------
 2025-12-03 00:00:00+00 | inbound_sms    | Inbound STOP     | 2025-12-03 00:00:00+00 |                     | verbal         | He told me on site | a0000000-0000-4000-8000-0000000000f1

--- SHIPPED: and on the seat ---
     sms_opt_out_at     | sms_consent_source | sms_consent_evidence | sms_consent_recorded_by
------------------------+--------------------+----------------------+-------------------------
 2025-12-03 00:00:00+00 | inbound_sms        | Inbound STOP         |
```

Idempotent re-run of 00594 against the already-migrated database:

```
$ psql … -v ON_ERROR_STOP=1 -f $TMPDIR/rerun_00594.sql
…
 rerun 00594 ok
ROLLBACK
```

No `GRANT`/`REVOKE` changed, but the generator was run to prove it:

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2632 replayed statements
$ git diff --stat supabase/seed/00-legacy-grants.sql
(empty)

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir …/agent-people-build db:generate
$ git diff --stat packages/supabase/src/database.types.ts
(empty — no signature or column changed)

$ git diff --stat
 supabase/migrations/00594_studio_channel_consent.sql   |  84 +++++++++--
 supabase/tests/people/w1a_identity_channels_consent_test.sql | 161 +++++++++++++++++++++
 2 files changed, 231 insertions(+), 14 deletions(-)
```

No edge-function file was touched, so the Deno suites were not re-run.

---

# W1a fix log — round 7, SECOND CYCLE (R7-M1, R7-M2, R7-M3)

Scope: exactly the three findings of `w1a-review-r7-migrations.md` §2. Nothing
else in the wave was touched. All three live in the edge rail — **no migration,
no SQL test, no grant and no generated type changed**, so no reset was needed;
the SQL suite was re-run anyway as a regression check and is unchanged. Local
stack only — no `supabase db push`, no `functions deploy`, no Strata.

Files: `supabase/functions/sms-inbound/pipeline.ts`,
`supabase/functions/_shared/sms.ts`, plus the two Deno suites.

---

## R7-M1 — the rail's STOP destroyed the grant's own 10DLC evidence

**Finding.** `writeChannelConsent()` wrote `source: "inbound_sms"`, `evidence`
and `recorded_at: now` unconditionally, outside any status test — unlike the
four `opt_out_*` columns directly below it. r6's R6-M1 rule ("a refusal writes
none of the consent's five", `00594:159-170`) was closed only in
`record_channel_consent` (`00594:1469-1479`). So an ordinary inbound STOP over a
number the studio held a *written* grant for restated that grant as "arrived by
text, today".

**Changed.**

1. `source, evidence, recorded_at` added to the `prior` select
   (`pipeline.ts` ~:361).
2. The three columns made conditional, split on the same leg
   `record_channel_consent` splits on — because the RPC is not uniform either:
   its **UPDATE** leg carries the prior through (`00594:1469-1479`), its
   **INSERT** leg writes the act's own source/words/date (`00594:1396`). The
   rail now matches leg for leg:

```ts
const keepsPriorConsent = status === "opted_out" && hadRecord;
...
source:      keepsPriorConsent ? (prior.source ?? null)      : "inbound_sms",
evidence:    keepsPriorConsent ? (prior.evidence ?? null)    : evidence,
recorded_at: keepsPriorConsent ? (prior.recorded_at ?? null) : now,
```

   Taking the reviewer's literal `prior.source ?? null` instead would have made
   a STOP that MINTS a record write a NULL source, which is neither what the RPC
   writes on that leg nor what the suite already asserted (the existing case
   "STOP writes an opted_out consent record for every studio holding the phone"
   asserts `source === 'inbound_sms'`). Both legs are now asserted separately.
3. The `seatConsentEvidence()` fallback for `disclosure_version` / `recorded_by`
   is now taken **only on a grant** — R-AN scopes it to the inbound YES/START,
   and on a refusal it would have put a grant's disclosure version on the
   consent side of a record the same write was refusing. On a refusal those two
   columns now carry only what already stood (`prior.x ?? null`).
4. **The prior read is no longer swallowed** (R-AM). It is load-bearing for all
   of the above: a denied read looks exactly like "no record yet", which is the
   one leg on which a refusal may write the consent side — so a 42501 would have
   reproduced this very finding. An unreadable prior now logs, SKIPS that
   studio's write, and reports `{ failed: true }` to the caller, which the STOP
   branch folds into R7-M3's retry decision below.

**Evidence — new Deno case, and the negative control against the pre-fix file.**

```
$ deno test --config supabase/functions/deno.json --no-check -A \
    --filter "/STOP keeps the grant|not acknowledged|mints the record/" \
    supabase/functions/_tests/sms-inbound.test.ts
a STOP keeps the grant's own evidence and restates only the refusal's ... ok
a STOP that mints the record writes itself onto the consent side ... ok
a STOP whose consent-record read fails is not acknowledged, and the retry completes it ... ok
a STOP whose party read fails is not acknowledged either ... ok

# same tests, with `git show HEAD:…/pipeline.ts` put back in place:
a STOP keeps the grant's own evidence and restates only the refusal's ... FAILED
a STOP that mints the record writes itself onto the consent side ... ok      # unchanged leg
a STOP whose consent-record read fails is not acknowledged, and the retry completes it ... FAILED
a STOP whose party read fails is not acknowledged either ... FAILED
error: AssertionError: the consent still says how it arrived
error: AssertionError: Twilio must not be told a STOP landed when it did not
FAILED | 1 passed | 3 failed
```

The new case seeds the reviewer's own repro — `(granted, written, "Signed the
Lindqvist kickoff form", consented 2025-05-02, recorded 2025-05-02)` — texts
STOP, and asserts the five consent columns are byte-identical afterwards while
`opt_out_source/opt_out_evidence/opt_out_recorded_at` are stamped and
`opt_out_recorded_by` stays NULL.

I took the reviewer's "**or** add a Deno case in `_tests/sms-inbound.test.ts`"
branch rather than transcribing the rail's upsert into SQL beside block 32: the
Deno case exercises the rail's actual code, where a SQL transcription can drift
from it silently — which is how this finding came to exist.

---

## R7-M2 — the last phone-global branch answered "unknown" on a failed read

**Finding.** `channelConsentVerdict()`'s final branch — the one scan the design
keeps phone-global (R-AK, decision 13), the last line between an unattributable
send and a STOP — did not destructure `error`. A denied read gave `data: null` →
`rows ?? []` → `anyOptedOut === false` → `"unknown"`, which lifts the primary
gate; the legacy party-row check then carried the send on the seat's own
`granted`, past another studio's standing STOP on the same number.

**Changed** (`_shared/sms.ts` ~:504), matching its four siblings exactly:

```ts
const { data: rows, error: scanError } = await supabase
  .from("project_parties").select("sms_consent_status").eq("phone_e164", phone);
if (scanError) {
  console.error("channelConsentVerdict: refusing, the phone-global scan failed", scanError);
  return "refuse";
}
```

**Evidence.** Two new cases in `_shared/sms.test.ts` — the refusal and its
control, so the assertion cannot pass for the wrong reason. The denial is
surgical: only the `phone_e164`-keyed `project_parties` reads are denied, so
`resolveRecipient()`'s id-keyed read still returns a `granted` seat.

```
a failed phone-global scan refuses the send instead of reading as no refusal ... ok
the unattributable send still goes when the phone-global scan reads clean ... ok

# negative control — the `if (scanError)` block removed:
a failed phone-global scan refuses the send instead of reading as no refusal ... FAILED
the unattributable send still goes when the phone-global scan reads clean ... ok
FAILED | 1 passed | 1 failed | 36 filtered out
```

**Not changed, with reason.** The finding also names the two reads in
`flushDeferredMessages` (`:1048-1052`, `:1077`). Both already fail closed: a
denied party read leaves `deferredPartyConsent` at `"not_asked"` (the
`?? "not_asked"` default), and a denied phone-global read reduces `[]` to
`"not_asked"` — neither is `granted`, so neither carries a send. They are cited
in the review as the path a failed `channelConsentVerdict` takes to a real send,
not as separate defects, and that path is closed above.

---

## R7-M3 — a STOP that reached no record was still acknowledged 200

**Finding.** `loadPhoneParties()` and `studiosHoldingRecord()` both swallowed
their reads while `studiosHoldingPhone()` between them checked and logged, so
one failed query gave an empty target list, **no** consent record, and a 200 to
Twilio. A seat-holding studio has `optOutAllForPhone()` as its backstop; a
**record-only** studio has none by construction — its record then sits at
`granted` while the number has said STOP, which is `channelConsentVerdict`'s
positive branch.

**Changed.**

1. Both helpers now check and log, and return `{ parties | orgs, failed }`.
   Call sites updated (STOP branch, START branch).
2. `writeChannelConsent()` returns `{ failed }` (see R7-M1 item 4).
3. The STOP branch does every write it can — the partial result is monotonic
   toward refusal — and then, if any of the three says `failed`, refuses to
   acknowledge:

```ts
if (stopPhoneParties.failed || stopRecordStudios.failed || stopWrite.failed) {
  console.error("sms-inbound STOP: refusing to acknowledge — the refusal was not fully recorded", {...});
  await supabase.from("sms_messages").update({ twilio_sid: null }).eq("id", messageId);
  return { status: 500, twiml: twimlBody(), disposition: "opt_out_incomplete" };
}
```

   **A 5xx alone would not have done it.** The idempotency claim at step (c) is
   `upsert(…, { onConflict: "twilio_sid", ignoreDuplicates: true })`, so Twilio's
   retry of the same `MessageSid` would have returned `duplicate` and the branch
   would never have run again. The claim is therefore released first — by
   clearing `twilio_sid` (`TEXT UNIQUE`, nullable, `00282:74`), **not** by
   deleting the row: the inbound STOP is itself a 10DLC artifact and must
   survive even if the retry never comes. `index.ts` already passes
   `result.status` straight into the `Response` (`:43`), so no change there.
4. The **START** branch is deliberately left answering 200 on a failed read: it
   grants fewer studios, which leaves a standing refusal standing — the
   fail-closed direction. It now at least logs, through the same two helpers.
   `studiosHoldingPhone()`'s own `failed` is likewise left as the log-and-
   continue the reviewer describes as correct R-AM discipline: its seats are
   covered phone-globally by `optOutAllForPhone()` and caught by
   `orgHasOptedOutParty`.

**Evidence.** Three new cases (two failures + the clean control). The
record-read case runs the full round trip: denied read → 500 +
`opt_out_incomplete`, party rows still `opted_out`, the inbound row's
`twilio_sid` released to NULL — then the *same MessageSid* is replayed against a
healthy client and both records, including the **seatless** `org-beta` one, come
back `opted_out`.

```
a STOP whose consent-record read fails is not acknowledged, and the retry completes it ... ok
a STOP whose party read fails is not acknowledged either ... ok
a STOP with every read clean still answers Twilio 200 ... ok

sms-inbound STOP: refusing to acknowledge — the refusal was not fully recorded {
  phone: "+15551110063",
  partiesReadFailed: true,
  recordReadFailed: false,
  consentWriteFailed: false
}
```

---

## Gates

```
$ deno check --config supabase/functions/deno.json \
    supabase/functions/sms-inbound/pipeline.ts supabase/functions/_shared/sms.ts
Check supabase/functions/sms-inbound/pipeline.ts
Check supabase/functions/_shared/sms.ts

$ deno test --config supabase/functions/deno.json --no-check -A \
    supabase/functions/_tests/sms-inbound.test.ts supabase/functions/_shared/sms.test.ts
ok | 78 passed | 0 failed          # was 71 before this cycle (+7 new cases)

$ deno test --config supabase/functions/deno.json --no-check -A \
    supabase/functions/_tests/ supabase/functions/_shared/
FAILED | 701 passed | 1 failed
  # the one failure is ./supabase/functions/_tests/stripe-rail.test.ts:
  #   "error: (in promise) Error: supabaseKey is required."
  # — the local-stack harness that _tests/run.sh exports keys for. Pre-existing
  #   and unrelated: it fails identically with none of this cycle's files loaded.

$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
…34. an email refusal is recoverable by a fresh recorded consent and an SMS one is not (r6 R6-M3): passed
NOTICE:  All W1a assertions passed.        # 36 notices, block 34 last
ROLLBACK

$ git diff --stat
 supabase/functions/_shared/sms.test.ts        |  88 ++++++++++++
 supabase/functions/_shared/sms.ts             |  15 +-
 supabase/functions/_tests/sms-inbound.test.ts | 196 ++++++++++++++++++++++++++
 supabase/functions/sms-inbound/pipeline.ts    | 158 ++++++++++++++++++---
 4 files changed, 434 insertions(+), 23 deletions(-)
```

No migration, seed, grant or generated type changed, so
`generate-legacy-grants.py`, `db:generate` and a reset were not run — nothing
this cycle touched can move them.
