# W2 · lane D — fix round against `d-review.md`

Branch `daily-return/w2-d`. One new commit, `b096364ce`, on top of the four the review read.
Every finding is answered below: D-1 changed in code (with a red→green proof), D-2 and D-3 rebutted
with evidence and left for Fable's ruling, D-4 and D-5 confirmed as already-flagged with no change.

| # | Severity | Disposition |
|---|---|---|
| D-1 | MAJOR / blocking | **Fixed** — `b096364ce`, migration + test |
| D-2 | MEDIUM / major | **Rebutted, escalated** — the code implements ruling 2's own words; the inversion is one predicate and is pre-written below. Fable's or Kody's call, not a lane's |
| D-3 | MINOR / major | **Rebutted** — and the one gap the reviewer named ("did not re-read `00387:1092-1213`") is closed here by reading it, with the refusal conditions quoted verbatim |
| D-4 | MINOR | **Confirmed, no change** — a retention policy for Kody; column existence now verified directly |
| D-5 | MINOR / informational | **No change** — the seed regen stands, per the reviewer's own "no independent objection" |

---

## D-1 — FIXED. `b096364ce`

The reviewer is right, and the defect reproduces exactly as described.

**Red, before the fix.** The new assertions run against the function as it stood on `5aa5e517b`:

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/auth/account_purge_test.sql
psql:supabase/tests/auth/account_purge_test.sql:364: ERROR:  a retry must MERGE into the journal,
  not overwrite it: the room count reads <absent>
CONTEXT:  PL/pgSQL function inline_code_block line 181 at ASSERT
```

`<absent>` — not a wrong number, *no key at all*. The second pass deleted nothing, so `v_deleted`
carried no keys, and `jsonb_build_object('deleted', v_deleted, …)` replaced the standing tally with
`{}`. The review's reading of the branch was exact.

**The change** (`supabase/migrations/00538_client_account_anonymize.sql`, §4 of the function body).
The open row's `detached` is now read alongside its id, and the UPDATE branch merges into it:

```sql
  SELECT id, COALESCE(detached, '{}'::jsonb)
    INTO v_purge, v_prior
    FROM public.client_account_purges
   WHERE user_id = p_user_id AND auth_deleted_at IS NULL
   ORDER BY purged_at DESC
   LIMIT 1;
  …
  ELSE
    -- counts summed per table, so a row created between the two calls and swept
    -- by the second is ADDED to the tally rather than replacing it
    SELECT COALESCE(jsonb_object_agg(g.tbl, g.n), '{}'::jsonb) INTO v_merged
      FROM (SELECT e.key AS tbl, sum(e.value::bigint) AS n
              FROM (SELECT key, value FROM jsonb_each_text(
                      CASE WHEN jsonb_typeof(v_prior->'deleted') = 'object'
                           THEN v_prior->'deleted' ELSE '{}'::jsonb END)
                    UNION ALL
                    SELECT key, value FROM jsonb_each_text(v_deleted)) e
             GROUP BY e.key) g;

    SELECT COALESCE(array_agg(DISTINCT s.u), '{}'::uuid[]) INTO v_threads_all
      FROM (SELECT x::uuid AS u
              FROM jsonb_array_elements_text(
                     CASE WHEN jsonb_typeof(v_prior->'threads_deleted') = 'array'
                          THEN v_prior->'threads_deleted' ELSE '[]'::jsonb END) AS x
            UNION ALL
            SELECT unnest(v_threads)) s;

    -- v_prior || … keeps any key an earlier lineage wrote that this one does not.
    UPDATE public.client_account_purges
       SET detached = v_prior || jsonb_build_object(
             'tombstoned_profile', to_jsonb(p_user_id),
             'deleted',            v_merged,
             'threads_deleted',    to_jsonb(v_threads_all)),
           purged_at = now()
     WHERE id = v_purge;
```

Three deliberate choices beyond the review's suggested shape:

- **Sum, don't `||`.** A plain `v_prior->'deleted' || v_deleted` would be right for the pure-retry
  case (0 keys to add) but wrong for the real one: if the client's device writes a room between the
  failed detach and the retry, the second sweep deletes 1 and `||` would report `1` where `2` were
  actually removed. Summing reports the truth of the whole closure. (C5: the number is a real count
  of real deletions, not a last-writer-wins snapshot.)
- **Union the thread ids**, deduplicated — the ids are evidence, and losing the first pass's is the
  same defect one field over.
- **`v_prior || …`** rather than a fresh object, so a row written by an earlier function lineage
  (00536's `detached` shape carried per-table id arrays, not counts) keeps whatever keys this
  version does not write.

**Green, after the fix**, and the merge is not a tautology — an ad-hoc probe proves the sum, not just
the survival:

```
$ psql … -f supabase/tests/auth/account_purge_test.sql
NOTICE:  account_purge_test: ALL ASSERTIONS PASSED

$ psql … -f <ad-hoc: purge, insert a new room, purge again>
NOTICE:  merge-sum-check: PASSED (rooms tally 1 -> 2 across two passes)
```

**Test coverage for the gap the review named.** `account_purge_test.sql` §9 previously proved the
*row* was reused; it now proves the *evidence in the row* survives the reuse:

```sql
  SELECT p.detached INTO v_detached FROM public.client_account_purges p WHERE p.id = v_purge;
  ASSERT v_detached->'deleted'->>'public.rooms' = '1',
    'a retry must MERGE into the journal, not overwrite it: the room count reads '
      || COALESCE(v_detached->'deleted'->>'public.rooms', '<absent>');
  ASSERT v_detached->'deleted'->>'public.saved_items' = '1', …
  ASSERT v_detached->'deleted'->>'public.comms_threads' = '2', …
  ASSERT jsonb_array_length(v_detached->'threads_deleted') = 2, …
  ASSERT v_detached->'tombstoned_profile' = to_jsonb(u_client), …
```

The migration banner and the function's `COMMENT` both now say "merging into that row rather than
overwriting it", so the next reader of the file learns the constraint from the file.

**One incidental defect caught by the re-run, not by the review:** the first draft of the amended
`COMMENT ON FUNCTION` contained an unescaped apostrophe (`the first pass's tally`) inside the
single-quoted literal, which broke the file at `psql` parse time (`ERROR: syntax error at or near
"s"`). Fixed to `pass''s` before the commit; `supabase db reset` replays the file clean (below).

---

## D-2 — rebutted and escalated, unchanged. The ruling says what the code does.

The review is factually right on every point: `DELETE FROM public.comms_threads WHERE created_by =
p_user_id` is unconditional, `comms_thread_participants` and `comms_messages` cascade from it
(`00101_comms_tables.sql:59,91`), and the designer's messages in a client-started thread go with it.

Why the code is not being changed in this fix round:

1. **Ruling 2 names it explicitly.** Fable's W1b ruling, verbatim: *"delete only client-owned
   artefacts (rooms, scans, saved items, **threads the client started**)"*. The predicate in 00538
   is that clause, transcribed. Narrowing it here would mean a lane quietly overruling a written
   ruling on its own authority — the opposite of what the honesty bar asks for, and the reviewer
   agrees on the disposition: *"Needs an explicit ruling from Fable/Kody before this reaches
   production."* This is that escalation, made for the second time (d-notes §3) and now with the
   review's confirmation attached.
2. **Nothing has shipped.** 00538 is on a lane branch; it has not been pushed to Strata. The window
   to invert it is open until the wave merges and Kody ships.
3. **The inversion is one predicate and is already written.** Say the word and it is one commit:

```sql
-- delete only the threads nobody else is left in (00536's prior behaviour)
DELETE FROM public.comms_threads t
 WHERE t.created_by = p_user_id
   AND NOT EXISTS (SELECT 1 FROM public.comms_thread_participants p
                    WHERE p.thread_id = t.id AND p.profile_id <> p_user_id AND p.left_at IS NULL);
```

   Its cost, stated so the choice is informed: the shared thread then *survives* an erasure with the
   leaver's `comms_thread_participants` row still in it. That row names the tombstone rather than the
   person (the profile row is anonymized before this step runs), and the messages the client wrote in
   that thread stay readable to the designer — i.e. the narrower rule trades "the designer keeps her
   conversation" for "the erased person's words stay on Patina's database". Both are defensible;
   only one of them is an erasure policy Kody has signed.

**Recommendation to Fable, offered not taken:** for an App Store 5.1.1(v) erasure the narrower rule
is the harder one to defend, because the client's own messages survive it. If the goal is that the
designer keeps her side of the conversation *and* the person is erased, the shape neither option
gives is a third one — delete the leaver's `comms_messages` and keep the thread — which is a bigger
change than one predicate and would need its own ruling. Flagging the option; not building it.

---

## D-3 — rebutted, and the review's own open question closed by reading the file

The reviewer flagged this as CONFIRMED-as-a-deviation / PLAUSIBLE-as-correct, explicitly noting the
one thing not re-verified: *"I did not re-read `00387:1092-1213` myself in full to independently
re-verify F6's exact refusal condition."* Read now, quoted verbatim from
`supabase/migrations/00387_project_proposal_authority_boundaries.sql`:

```sql
CREATE OR REPLACE FUNCTION public.set_document_client(
  p_engagement_kind text,
  p_target_id uuid,
  p_client_id uuid
)                                                              -- :1092
…
  v_designer uuid := auth.uid();                               -- :1103
…
  IF v_designer IS NULL THEN
    RAISE EXCEPTION 'set_document_client requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';                -- :1109-1112
…
  IF p_engagement_kind NOT IN ('project', 'proposal') THEN
    RAISE EXCEPTION 'unknown engagement kind %', p_engagement_kind
      USING ERRCODE = 'check_violation';                       -- :1114-1117
…
  IF NOT FOUND OR v_target_designer IS DISTINCT FROM v_designer THEN
    RAISE EXCEPTION 'no % owned by you with id %', …
      USING ERRCODE = 'insufficient_privilege';                -- :1134-1137
…
  IF p_engagement_kind = 'proposal' AND v_proposal_status <> 'draft' THEN
    RAISE EXCEPTION 'proposal client identity may only change while draft'
      USING ERRCODE = 'check_violation';                       -- :1139-1142
```

Four independent refusals stand between a service-role purge and this function, and each is fatal on
its own:

- **`auth.uid()` is NULL** for a SECURITY DEFINER call made by the `delete-account` edge function's
  service-role connection. First branch, immediate `insufficient_privilege`.
- Even with a JWT, `v_target_designer IS DISTINCT FROM v_designer` refuses anyone but the owning
  designer — and an erasure is initiated by the *client*, never by her.
- **Any non-draft proposal is refused outright**, and a closing account is precisely the one that has
  sent and accepted proposals.
- **Three of the five tables the brief names cannot be addressed at all**: `p_engagement_kind` is
  constrained to `'project'` and `'proposal'`. There is no `set_document_client` path to `invoices`,
  `client_decisions` or the `designer_clients` roster. (A fifth blocker for completeness: with
  `p_client_id` non-NULL the function then requires an existing `designer_clients` row joining that
  designer to that client — so re-pointing to a *separate* tombstone profile would first need a
  roster row minted for the tombstone.)

And the deviation is a deviation in mechanism only, not in outcome. Ruling 2 asks that designer-owned
rows end up naming a tombstone rather than a person. They do: `proposals.client_id`,
`projects.client_id`, `invoices.client_id`, `designer_clients.client_id` and `comms_threads.created_by`
all reference `profiles(id)`, the profile row survives GoTrue's soft delete, and step 1 of the
function replaces its PII. The row they point at *becomes* the tombstone; there is no second id to
re-point to, so the write the brief described has no destination. What is avoided by not writing it
is real: `grep -c 'DISABLE TRIGGER' supabase/migrations/00538_*.sql` → `0`, where 00536 took
ACCESS EXCLUSIVE on five tables portal-wide for the length of one homeowner's closure (review M-D5).

Unchanged, and flagged for ratification exactly as the reviewer asks — a knowing accept, not a
silent pass.

---

## D-4 — confirmed, unchanged, still Kody's retention question

The reviewer marked this PLAUSIBLE, having taken the column citation on faith. Verified directly
against the live database rather than a banner:

```
$ psql … -c "select column_name from information_schema.columns
             where table_schema='public' and table_name='designer_clients'
               and column_name in ('client_name','client_email') order by 1"
 client_email
 client_name
(2 rows)
```

Both columns exist, both are untouched by 00538, and the inconsistency the reviewer describes is
real: after a closure a designer's document views read "Former client" from `profiles` while her CRM
roster still reads the person's name and address. That is a policy choice between "erase the person
from Patina" and "erase the person from the designer's own book", and ruling 2 scoped the tombstone
to `profiles`. Named for Kody in d-notes §4 and in the migration banner; not decided by a lane.

## D-5 — no change

`supabase/seed/00-legacy-grants.sql` stays regenerated. The reviewer's own verdict — "Not a defect —
correct per project convention … No independent objection" — matches the standing offer in d-notes
§5: revert it if the steward would rather regenerate at integration.

---

## Gate, re-run after the fix

```
$ supabase db reset
  {"target":"local","version":"","message":"Reset local database."}      ← clean replay through 00538

$ ./scripts/run-sql-tests.sh
  total: 132 · green: 110 · expected-fail: 22 · unexpected-fail: 0 · effective-green 132/132
  PASS supabase/tests/auth/account_purge_test.sql
  PASS supabase/tests/rooms/house_on_today_test.sql

$ deno test --config supabase/functions/deno.json --allow-all \
    supabase/functions/delete-account/handler.test.ts
  ok | 12 passed | 0 failed (28ms)

$ ls -1 supabase/migrations | tail -3
  00536_client_side_server_gaps.sql
  00537_house_on_today.sql
  00538_client_account_anonymize.sql        ← no collision; W5 keeps 00539

$ git diff --stat 5aa5e517b..HEAD -- supabase/
  supabase/migrations/00538_client_account_anonymize.sql | 45 +++++++++++++++++---
  supabase/tests/auth/account_purge_test.sql             | 23 ++++++++++-
```

`packages/supabase/src/database.types.ts` is untouched by this round — the fix changes a function
body, not a table shape, so there is nothing to regenerate.
