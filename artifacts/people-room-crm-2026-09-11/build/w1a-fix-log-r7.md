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
